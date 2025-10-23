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
	"github.com/vyx/go-screener/pkg/cache"
	"github.com/vyx/go-screener/pkg/types"
)

// WSClient handles WebSocket connections to Binance for kline streams
type WSClient struct {
	wsURL       string
	conn        *websocket.Conn
	mu          sync.RWMutex
	cache       *cache.KlineCache
	symbols     []string
	interval    string
	ctx         context.Context
	cancel      context.CancelFunc
	reconnectCh chan struct{}
	doneCh      chan struct{}
	isConnected bool
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
func NewWSClient(wsURL string, cache *cache.KlineCache) *WSClient {
	ctx, cancel := context.WithCancel(context.Background())

	return &WSClient{
		wsURL:       wsURL,
		cache:       cache,
		ctx:         ctx,
		cancel:      cancel,
		reconnectCh: make(chan struct{}, 1),
		doneCh:      make(chan struct{}),
	}
}

// Connect establishes WebSocket connection and subscribes to kline streams
func (w *WSClient) Connect(symbols []string, interval string) error {
	w.mu.Lock()
	w.symbols = symbols
	w.interval = interval
	w.mu.Unlock()

	// Build stream names
	streams := make([]string, len(symbols))
	for i, symbol := range symbols {
		// Convert to lowercase for Binance WebSocket
		streams[i] = fmt.Sprintf("%s@kline_%s", strings.ToLower(symbol), interval)
	}

	// Build WebSocket URL with combined streams
	streamParam := strings.Join(streams, "/")
	url := fmt.Sprintf("%s/stream?streams=%s", w.wsURL, streamParam)

	log.Printf("[WSClient] Connecting to %s", url)
	log.Printf("[WSClient] Subscribing to %d symbols for interval %s", len(symbols), interval)

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

	// Convert to our Kline type
	kline := types.Kline{
		OpenTime:                 event.Kline.StartTime,
		Open:                     parseFloat(event.Kline.Open),
		High:                     parseFloat(event.Kline.High),
		Low:                      parseFloat(event.Kline.Low),
		Close:                    parseFloat(event.Kline.Close),
		Volume:                   parseFloat(event.Kline.Volume),
		CloseTime:                event.Kline.CloseTime,
		QuoteAssetVolume:         parseFloat(event.Kline.QuoteVolume),
		NumberOfTrades:           event.Kline.TradeCount,
		TakerBuyBaseAssetVolume:  parseFloat(event.Kline.TakerBuyBaseVolume),
		TakerBuyQuoteAssetVolume: parseFloat(event.Kline.TakerBuyQuoteVolume),
	}

	// Update cache
	w.cache.Update(event.Symbol, event.Kline.Interval, kline)

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
			interval := w.interval
			w.mu.RUnlock()

			if err := w.Connect(symbols, interval); err != nil {
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
		IsConnected:  w.isConnected,
		SymbolCount:  len(w.symbols),
		Interval:     w.interval,
		CacheStats:   w.cache.Stats(),
	}
}

// WSStats holds WebSocket statistics
type WSStats struct {
	IsConnected  bool
	SymbolCount  int
	Interval     string
	CacheStats   cache.CacheStats
}
