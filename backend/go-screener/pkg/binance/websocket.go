package binance

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/vyx/go-screener/internal/eventbus"
	"github.com/vyx/go-screener/pkg/cache"
	"github.com/vyx/go-screener/pkg/types"
)

// WSClient handles WebSocket connections to Binance for kline streams
// Uses a single connection with combined streams for all symbol+interval pairs
type WSClient struct {
	wsURL              string
	conn               *websocket.Conn
	mu                 sync.RWMutex
	cache              *cache.KlineCache
	eventBus           *eventbus.EventBus
	symbols            []string
	intervals          []string
	ctx                context.Context
	cancel             context.CancelFunc
	reconnectCh        chan struct{}
	doneCh             chan struct{}
	isConnected        bool
	lastClosedCandles  map[string]int64  // key: "BTCUSDT-1m", value: closeTime (deduplication)
	lastClosedMu       sync.RWMutex
}

// KlineEvent represents a Binance kline WebSocket event
type KlineEvent struct {
	EventType string `json:"e"`
	EventTime int64  `json:"E"`
	Symbol    string `json:"s"`
	Kline     struct {
		StartTime            int64  `json:"t"`
		CloseTime            int64  `json:"T"`
		Symbol               string `json:"s"`
		Interval             string `json:"i"`
		FirstTradeID         int64  `json:"f"`
		LastTradeID          int64  `json:"L"`
		Open                 string `json:"o"`
		Close                string `json:"c"`
		High                 string `json:"h"`
		Low                  string `json:"l"`
		Volume               string `json:"v"`
		TradeCount           int    `json:"n"`
		IsClosed             bool   `json:"x"`
		QuoteVolume          string `json:"q"`
		TakerBuyBaseVolume   string `json:"V"`
		TakerBuyQuoteVolume  string `json:"Q"`
		Ignore               string `json:"B"`
	} `json:"k"`
}

// StreamMessage wraps the kline event from combined streams
type StreamMessage struct {
	Stream string      `json:"stream"`
	Data   KlineEvent  `json:"data"`
}

// NewWSClient creates a new WebSocket client for Binance kline streams
func NewWSClient(wsURL string, cache *cache.KlineCache, eventBus *eventbus.EventBus) *WSClient {
	ctx, cancel := context.WithCancel(context.Background())

	return &WSClient{
		wsURL:             wsURL,
		cache:             cache,
		eventBus:          eventBus,
		ctx:               ctx,
		cancel:            cancel,
		reconnectCh:       make(chan struct{}, 1),
		doneCh:            make(chan struct{}),
		lastClosedCandles: make(map[string]int64),
	}
}

// Connect establishes WebSocket connection and subscribes to kline streams
func (w *WSClient) Connect(symbols []string, intervals []string) error {
	w.mu.Lock()
	w.symbols = symbols
	w.intervals = intervals
	w.mu.Unlock()

	// Build stream names for all symbol+interval combinations
	streams := make([]string, 0, len(symbols)*len(intervals))
	for _, symbol := range symbols {
		for _, interval := range intervals {
			// Convert to lowercase for Binance WebSocket
			stream := fmt.Sprintf("%s@kline_%s", strings.ToLower(symbol), interval)
			streams = append(streams, stream)
		}
	}

	// Build WebSocket URL with combined streams
	streamParam := strings.Join(streams, "/")
	url := fmt.Sprintf("%s/stream?streams=%s", w.wsURL, streamParam)

	log.Printf("[WSClient] Connecting to WebSocket...")
	log.Printf("[WSClient] Subscribing to %d symbols × %d intervals = %d streams", len(symbols), len(intervals), len(streams))

	// Connect
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return fmt.Errorf("failed to connect to WebSocket: %w", err)
	}

	w.mu.Lock()
	w.conn = conn
	w.isConnected = true
	w.mu.Unlock()

	log.Printf("[WSClient] Connected successfully")

	// Start message handler in goroutine
	go w.handleMessages()

	// Start reconnection handler
	go w.reconnectHandler()

	return nil
}

// handleMessages processes incoming WebSocket messages
func (w *WSClient) handleMessages() {
	defer func() {
		w.mu.Lock()
		w.isConnected = false
		w.mu.Unlock()
		close(w.doneCh)
	}()

	for {
		select {
		case <-w.ctx.Done():
			return
		default:
			w.mu.RLock()
			conn := w.conn
			w.mu.RUnlock()

			if conn == nil {
				time.Sleep(1 * time.Second)
				continue
			}

			// Read message
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Printf("[WSClient] Error reading message: %v", err)
				w.triggerReconnect()
				return
			}

			// Parse and handle kline event
			if err := w.handleKlineEvent(message); err != nil {
				log.Printf("[WSClient] Error handling kline event: %v", err)
			}
		}
	}
}

// handleKlineEvent parses and processes a kline event
func (w *WSClient) handleKlineEvent(message []byte) error {
	var streamMsg StreamMessage
	if err := json.Unmarshal(message, &streamMsg); err != nil {
		return fmt.Errorf("failed to unmarshal stream message: %w", err)
	}

	event := streamMsg.Data

	// Only update cache if kline is closed (complete candle)
	if !event.Kline.IsClosed {
		return nil // Skip incomplete candles
	}

	// Convert to our Kline type with volume enrichment
	volume := parseFloat(event.Kline.Volume)
	buyVolume := parseFloat(event.Kline.TakerBuyBaseVolume)
	sellVolume := volume - buyVolume
	volumeDelta := buyVolume - sellVolume

	kline := types.Kline{
		OpenTime:    event.Kline.StartTime,
		Open:        parseFloat(event.Kline.Open),
		High:        parseFloat(event.Kline.High),
		Low:         parseFloat(event.Kline.Low),
		Close:       parseFloat(event.Kline.Close),
		Volume:      volume,
		BuyVolume:   buyVolume,
		SellVolume:  sellVolume,
		VolumeDelta: volumeDelta,
		QuoteVolume: parseFloat(event.Kline.QuoteVolume),
		Trades:      event.Kline.TradeCount,
		CloseTime:   event.Kline.CloseTime,

		// Legacy fields (internal use only)
		TakerBuyBaseAssetVolume:  buyVolume,
		TakerBuyQuoteAssetVolume: parseFloat(event.Kline.TakerBuyQuoteVolume),
		NumberOfTrades:           event.Kline.TradeCount,
	}

	// Update cache
	w.cache.Update(event.Symbol, event.Kline.Interval, kline)

	// Emit candle close event (with deduplication)
	if w.eventBus != nil {
		key := fmt.Sprintf("%s-%s", event.Symbol, event.Kline.Interval)

		// Check if we already processed this candle
		w.lastClosedMu.RLock()
		lastCloseTime := w.lastClosedCandles[key]
		w.lastClosedMu.RUnlock()

		if lastCloseTime != event.Kline.CloseTime {
			// Update last closed candle time
			w.lastClosedMu.Lock()
			w.lastClosedCandles[key] = event.Kline.CloseTime
			w.lastClosedMu.Unlock()

			// Emit event
			closeTime := time.Unix(event.Kline.CloseTime/1000, 0)
			w.eventBus.PublishCandleCloseEvent(&eventbus.CandleCloseEvent{
				Symbol:    event.Symbol,
				Interval:  event.Kline.Interval,
				Kline:     kline,
				CloseTime: closeTime,
			})

			log.Printf("[WSClient] Candle closed: %s-%s at %s", event.Symbol, event.Kline.Interval, closeTime.Format("15:04:05"))
		}
	}

	return nil
}

// triggerReconnect signals that a reconnection is needed
func (w *WSClient) triggerReconnect() {
	select {
	case w.reconnectCh <- struct{}{}:
	default:
		// Channel already has a reconnect signal
	}
}

// reconnectHandler handles automatic reconnection with exponential backoff
func (w *WSClient) reconnectHandler() {
	backoff := 1 * time.Second
	maxBackoff := 60 * time.Second

	for {
		select {
		case <-w.ctx.Done():
			return
		case <-w.reconnectCh:
			log.Printf("[WSClient] Reconnection triggered, waiting %v", backoff)
			time.Sleep(backoff)

			// Close old connection
			w.mu.Lock()
			if w.conn != nil {
				w.conn.Close()
				w.conn = nil
			}
			w.isConnected = false
			w.mu.Unlock()

			// Attempt to reconnect
			w.mu.RLock()
			symbols := w.symbols
			intervals := w.intervals
			w.mu.RUnlock()

			if err := w.Connect(symbols, intervals); err != nil {
				log.Printf("[WSClient] Reconnection failed: %v", err)

				// Increase backoff
				backoff *= 2
				if backoff > maxBackoff {
					backoff = maxBackoff
				}

				// Trigger another reconnect attempt
				w.triggerReconnect()
			} else {
				log.Printf("[WSClient] Reconnected successfully")
				// Reset backoff on successful connection
				backoff = 1 * time.Second
			}
		}
	}
}

// Close gracefully closes the WebSocket connection
func (w *WSClient) Close() error {
	log.Println("[WSClient] Closing WebSocket connection")

	// Cancel context to stop all goroutines
	w.cancel()

	// Close WebSocket connection
	w.mu.Lock()
	if w.conn != nil {
		err := w.conn.WriteMessage(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""),
		)
		if err != nil {
			log.Printf("[WSClient] Error sending close message: %v", err)
		}
		w.conn.Close()
		w.conn = nil
	}
	w.isConnected = false
	w.mu.Unlock()

	// Wait for message handler to finish
	select {
	case <-w.doneCh:
	case <-time.After(5 * time.Second):
		log.Println("[WSClient] Timeout waiting for message handler to stop")
	}

	log.Println("[WSClient] Closed successfully")
	return nil
}

// IsConnected returns whether the WebSocket is currently connected
func (w *WSClient) IsConnected() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.isConnected
}

// GetStats returns statistics about the WebSocket connection
func (w *WSClient) GetStats() WSStats {
	w.mu.RLock()
	defer w.mu.RUnlock()

	return WSStats{
		IsConnected:   w.isConnected,
		SymbolCount:   len(w.symbols),
		IntervalCount: len(w.intervals),
		Intervals:     w.intervals,
		CacheStats:    w.cache.Stats(),
	}
}

// WSStats holds WebSocket statistics
type WSStats struct {
	IsConnected   bool
	SymbolCount   int
	IntervalCount int
	Intervals     []string
	CacheStats    cache.CacheStats
}
