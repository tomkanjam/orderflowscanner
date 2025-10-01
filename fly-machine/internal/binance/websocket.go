package binance

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/trader-machine/internal/storage"
)

const (
	binanceWSURL = "wss://stream.binance.com:9443/stream"
)

// WSManager manages Binance WebSocket connections
type WSManager struct {
	conn        *websocket.Conn
	klineStore  *storage.KlineStore
	tickerStore map[string]map[string]interface{} // symbol -> ticker data
	symbols     []string
	timeframes  []string
	mu          sync.RWMutex
	reconnectCh chan struct{}
	stopCh      chan struct{}
	connected   bool
}

// NewWSManager creates a new WebSocket manager
func NewWSManager(klineStore *storage.KlineStore, symbols, timeframes []string) *WSManager {
	return &WSManager{
		klineStore:  klineStore,
		tickerStore: make(map[string]map[string]interface{}),
		symbols:     symbols,
		timeframes:  timeframes,
		reconnectCh: make(chan struct{}, 1),
		stopCh:      make(chan struct{}),
		connected:   false,
	}
}

// Connect establishes WebSocket connection to Binance
func (wm *WSManager) Connect() error {
	streams := wm.buildStreamNames()
	url := fmt.Sprintf("%s?streams=%s", binanceWSURL, strings.Join(streams, "/"))

	log.Info().
		Str("url", url).
		Int("stream_count", len(streams)).
		Msg("Connecting to Binance WebSocket")

	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return fmt.Errorf("failed to dial websocket: %w", err)
	}

	wm.mu.Lock()
	wm.conn = conn
	wm.connected = true
	wm.mu.Unlock()

	go wm.handleMessages()
	go wm.heartbeat()

	log.Info().Msg("Connected to Binance WebSocket")

	return nil
}

// buildStreamNames constructs stream subscription list
func (wm *WSManager) buildStreamNames() []string {
	streams := []string{}

	for _, symbol := range wm.symbols {
		symbolLower := strings.ToLower(symbol)

		// Add ticker stream
		streams = append(streams, fmt.Sprintf("%s@ticker", symbolLower))

		// Add kline streams for each timeframe
		for _, timeframe := range wm.timeframes {
			streams = append(streams, fmt.Sprintf("%s@kline_%s", symbolLower, timeframe))
		}
	}

	return streams
}

// handleMessages processes incoming WebSocket messages
func (wm *WSManager) handleMessages() {
	for {
		select {
		case <-wm.stopCh:
			log.Info().Msg("Stopping message handler")
			return
		default:
			var msg map[string]interface{}
			err := wm.conn.ReadJSON(&msg)
			if err != nil {
				log.Error().Err(err).Msg("WebSocket read error")
				wm.mu.Lock()
				wm.connected = false
				wm.mu.Unlock()

				// Trigger reconnect
				select {
				case wm.reconnectCh <- struct{}{}:
				default:
				}
				return
			}

			// Parse message
			if data, ok := msg["data"].(map[string]interface{}); ok {
				eventType, _ := data["e"].(string)

				switch eventType {
				case "kline":
					wm.handleKlineUpdate(data)
				case "24hrTicker":
					wm.handleTickerUpdate(data)
				}
			}
		}
	}
}

// handleKlineUpdate processes kline updates
func (wm *WSManager) handleKlineUpdate(data map[string]interface{}) {
	k, ok := data["k"].(map[string]interface{})
	if !ok {
		return
	}

	symbol, _ := k["s"].(string)
	timeframe, _ := k["i"].(string)

	kline := []interface{}{
		k["t"],  // Open time
		k["o"],  // Open
		k["h"],  // High
		k["l"],  // Low
		k["c"],  // Close
		k["v"],  // Volume
		k["T"],  // Close time
		k["q"],  // Quote asset volume
		k["n"],  // Number of trades
		k["V"],  // Taker buy base asset volume
		k["Q"],  // Taker buy quote asset volume
	}

	wm.klineStore.Update(symbol, timeframe, kline)
}

// handleTickerUpdate processes 24hr ticker updates
func (wm *WSManager) handleTickerUpdate(data map[string]interface{}) {
	symbol, ok := data["s"].(string)
	if !ok {
		return
	}

	wm.mu.Lock()
	wm.tickerStore[symbol] = map[string]interface{}{
		"lastPrice":       data["c"],
		"volume24h":       data["v"],
		"priceChange24h":  data["p"],
		"high24h":         data["h"],
		"low24h":          data["l"],
	}
	wm.mu.Unlock()
}

// GetTicker returns current ticker data for a symbol
func (wm *WSManager) GetTicker(symbol string) map[string]interface{} {
	wm.mu.RLock()
	defer wm.mu.RUnlock()

	if ticker, ok := wm.tickerStore[symbol]; ok {
		return ticker
	}

	return nil
}

// heartbeat sends periodic pings to keep connection alive
func (wm *WSManager) heartbeat() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-wm.stopCh:
			return
		case <-ticker.C:
			wm.mu.RLock()
			conn := wm.conn
			wm.mu.RUnlock()

			if conn != nil {
				err := conn.WriteMessage(websocket.PingMessage, []byte{})
				if err != nil {
					log.Error().Err(err).Msg("Failed to send ping")
				}
			}
		}
	}
}

// Reconnect attempts to re-establish the connection
func (wm *WSManager) Reconnect() {
	maxRetries := 10
	backoff := 1 * time.Second

	for i := 0; i < maxRetries; i++ {
		log.Info().
			Int("attempt", i+1).
			Int("max_retries", maxRetries).
			Msg("Reconnecting to Binance")

		err := wm.Connect()
		if err == nil {
			log.Info().Msg("Reconnected successfully")
			return
		}

		log.Error().
			Err(err).
			Dur("backoff", backoff).
			Msg("Reconnection failed, retrying...")

		time.Sleep(backoff)
		backoff *= 2
	}

	log.Fatal().Msg("Failed to reconnect after maximum retries")
}

// StartReconnectLoop monitors for disconnections and reconnects
func (wm *WSManager) StartReconnectLoop() {
	for {
		select {
		case <-wm.stopCh:
			return
		case <-wm.reconnectCh:
			wm.Reconnect()
		}
	}
}

// IsConnected returns connection status
func (wm *WSManager) IsConnected() bool {
	wm.mu.RLock()
	defer wm.mu.RUnlock()
	return wm.connected
}

// Close closes the WebSocket connection
func (wm *WSManager) Close() error {
	close(wm.stopCh)

	wm.mu.Lock()
	defer wm.mu.Unlock()

	if wm.conn != nil {
		err := wm.conn.Close()
		wm.connected = false
		log.Info().Msg("WebSocket connection closed")
		return err
	}

	return nil
}

// UpdateSymbols updates the list of symbols to subscribe to
func (wm *WSManager) UpdateSymbols(symbols []string) error {
	wm.symbols = symbols

	// Close and reconnect with new symbol list
	if err := wm.Close(); err != nil {
		log.Error().Err(err).Msg("Failed to close connection")
	}

	time.Sleep(1 * time.Second)

	return wm.Connect()
}

// UpdateTimeframes updates the list of timeframes to subscribe to
func (wm *WSManager) UpdateTimeframes(timeframes []string) error {
	wm.timeframes = timeframes

	// Close and reconnect with new timeframe list
	if err := wm.Close(); err != nil {
		log.Error().Err(err).Msg("Failed to close connection")
	}

	time.Sleep(1 * time.Second)

	return wm.Connect()
}

// GetLastUpdate returns the timestamp of the last kline update
func (wm *WSManager) GetLastUpdate() time.Time {
	return wm.klineStore.GetLastUpdate()
}
