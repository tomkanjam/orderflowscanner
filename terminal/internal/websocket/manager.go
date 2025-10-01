package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
	"github.com/yourusername/aitrader-tui/internal/errors"
	"github.com/yourusername/aitrader-tui/internal/helpers"
	"github.com/yourusername/aitrader-tui/internal/types"
)

const (
	// Binance WebSocket URLs
	binanceWSBaseURL = "wss://stream.binance.com:9443"

	// Connection settings
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = 54 * time.Second // Must be less than pongWait
	maxReconnects  = 5
	reconnectDelay = 5 * time.Second
)

// Manager handles Binance WebSocket connections
type Manager struct {
	mu              sync.RWMutex
	ctx             context.Context
	cancel          context.CancelFunc

	// Market data
	tickers         map[string]*types.Ticker
	klines          map[string]map[string][]*types.Kline // symbol -> interval -> klines

	// Subscriptions
	tickerSymbols   []string
	klineSymbols    map[string][]string // symbol -> intervals

	// Connections
	tickerConn      *websocket.Conn
	klineConns      map[string]*websocket.Conn // symbol -> connection

	// Event channels
	eventChan       chan *types.WebSocketEvent

	// State
	running         bool
	reconnectCount  int
	lastUpdate      time.Time

	wg              sync.WaitGroup
}

// NewManager creates a new WebSocket manager
func NewManager() *Manager {
	ctx, cancel := context.WithCancel(context.Background())

	return &Manager{
		ctx:           ctx,
		cancel:        cancel,
		tickers:       make(map[string]*types.Ticker),
		klines:        make(map[string]map[string][]*types.Kline),
		klineSymbols:  make(map[string][]string),
		klineConns:    make(map[string]*websocket.Conn),
		eventChan:     make(chan *types.WebSocketEvent, 1000),
		running:       false,
	}
}

// Start starts the WebSocket manager
func (m *Manager) Start() error {
	m.mu.Lock()
	if m.running {
		m.mu.Unlock()
		return fmt.Errorf("manager already running")
	}
	m.running = true
	m.mu.Unlock()

	log.Info().Msg("Starting WebSocket manager")

	return nil
}

// Stop stops the WebSocket manager
func (m *Manager) Stop() error {
	m.mu.Lock()
	if !m.running {
		m.mu.Unlock()
		return nil
	}
	m.running = false
	m.mu.Unlock()

	log.Info().Msg("Stopping WebSocket manager")

	// Cancel context
	m.cancel()

	// Close connections
	if m.tickerConn != nil {
		m.tickerConn.Close()
	}

	for _, conn := range m.klineConns {
		if conn != nil {
			conn.Close()
		}
	}

	// Wait for goroutines
	m.wg.Wait()

	// Close event channel
	close(m.eventChan)

	log.Info().Msg("WebSocket manager stopped")

	return nil
}

// SubscribeTickers subscribes to ticker updates for specified symbols
func (m *Manager) SubscribeTickers(symbols []string) error {
	m.mu.Lock()
	m.tickerSymbols = symbols
	m.mu.Unlock()

	if len(symbols) == 0 {
		return fmt.Errorf("no symbols provided")
	}

	log.Info().Int("count", len(symbols)).Msg("Subscribing to tickers")

	// Build stream URL
	streams := make([]string, len(symbols))
	for i, symbol := range symbols {
		streams[i] = strings.ToLower(symbol) + "@ticker"
	}
	streamURL := fmt.Sprintf("%s/stream?streams=%s", binanceWSBaseURL, strings.Join(streams, "/"))

	// Connect
	return m.connectTickers(streamURL)
}

// SubscribeKlines subscribes to kline updates for a symbol and intervals
func (m *Manager) SubscribeKlines(symbol string, intervals []string) error {
	m.mu.Lock()
	m.klineSymbols[symbol] = intervals

	// Initialize kline storage for this symbol
	if _, exists := m.klines[symbol]; !exists {
		m.klines[symbol] = make(map[string][]*types.Kline)
	}
	for _, interval := range intervals {
		if _, exists := m.klines[symbol][interval]; !exists {
			m.klines[symbol][interval] = make([]*types.Kline, 0, 250)
		}
	}
	m.mu.Unlock()

	log.Info().Str("symbol", symbol).Strs("intervals", intervals).Msg("Subscribing to klines")

	// Build stream URL
	streams := make([]string, len(intervals))
	for i, interval := range intervals {
		streams[i] = strings.ToLower(symbol) + "@kline_" + interval
	}
	streamURL := fmt.Sprintf("%s/stream?streams=%s", binanceWSBaseURL, strings.Join(streams, "/"))

	// Connect
	return m.connectKlines(symbol, streamURL)
}

// GetSnapshot returns a snapshot of current market data
func (m *Manager) GetSnapshot() *types.MarketDataSnapshot {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Deep copy tickers
	tickersCopy := make(map[string]*types.Ticker)
	for k, v := range m.tickers {
		ticker := *v
		tickersCopy[k] = &ticker
	}

	// Deep copy klines
	klinesCopy := make(map[string]map[string][]*types.Kline)
	for symbol, intervals := range m.klines {
		klinesCopy[symbol] = make(map[string][]*types.Kline)
		for interval, klines := range intervals {
			klinesCopy[symbol][interval] = make([]*types.Kline, len(klines))
			for i, k := range klines {
				kline := *k
				klinesCopy[symbol][interval][i] = &kline
			}
		}
	}

	// Get symbols list
	symbols := make([]string, 0, len(m.tickers))
	for symbol := range m.tickers {
		symbols = append(symbols, symbol)
	}

	return &types.MarketDataSnapshot{
		Tickers:   tickersCopy,
		Klines:    klinesCopy,
		Symbols:   symbols,
		Timestamp: time.Now().Unix(),
	}
}

// GetEventChannel returns the event channel
func (m *Manager) GetEventChannel() <-chan *types.WebSocketEvent {
	return m.eventChan
}

// IsConnected returns whether the manager is connected
func (m *Manager) IsConnected() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.tickerConn != nil && m.running
}

// GetStatus returns the current status
func (m *Manager) GetStatus() string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if !m.running {
		return "stopped"
	}
	if m.tickerConn == nil {
		return "disconnected"
	}
	return "connected"
}

// connectTickers connects to ticker stream
func (m *Manager) connectTickers(url string) error {
	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.Dial(url, nil)
	if err != nil {
		return errors.NewWebSocketError("", "connect_tickers", err)
	}

	m.mu.Lock()
	m.tickerConn = conn
	m.reconnectCount = 0
	m.mu.Unlock()

	// Start read pump
	m.wg.Add(1)
	go m.tickerReadPump()

	// Start ping pump
	m.wg.Add(1)
	go m.pingPump(conn, "ticker")

	log.Info().Msg("Ticker WebSocket connected")

	return nil
}

// connectKlines connects to kline stream for a symbol
func (m *Manager) connectKlines(symbol, url string) error {
	dialer := websocket.DefaultDialer
	dialer.HandshakeTimeout = 10 * time.Second

	conn, _, err := dialer.Dial(url, nil)
	if err != nil {
		return errors.NewWebSocketError(symbol, "connect_klines", err)
	}

	m.mu.Lock()
	m.klineConns[symbol] = conn
	m.mu.Unlock()

	// Start read pump
	m.wg.Add(1)
	go m.klineReadPump(symbol)

	// Start ping pump
	m.wg.Add(1)
	go m.pingPump(conn, "kline-"+symbol)

	log.Info().Str("symbol", symbol).Msg("Kline WebSocket connected")

	return nil
}

// tickerReadPump reads ticker messages from WebSocket
func (m *Manager) tickerReadPump() {
	defer m.wg.Done()

	for {
		select {
		case <-m.ctx.Done():
			return
		default:
		}

		m.mu.RLock()
		conn := m.tickerConn
		m.mu.RUnlock()

		if conn == nil {
			return
		}

		conn.SetReadDeadline(time.Now().Add(pongWait))
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Error().Err(err).Msg("Ticker read error")
			m.handleReconnect("ticker", m.tickerSymbols)
			return
		}

		// Parse message
		var msg struct {
			Stream string          `json:"stream"`
			Data   *types.Ticker   `json:"data"`
		}

		if err := json.Unmarshal(message, &msg); err != nil {
			log.Error().Err(err).Msg("Failed to parse ticker message")
			continue
		}

		if msg.Data != nil {
			m.mu.Lock()
			m.tickers[msg.Data.Symbol] = msg.Data
			m.lastUpdate = time.Now()
			m.mu.Unlock()

			// Send event
			select {
			case m.eventChan <- &types.WebSocketEvent{
				Type:      "ticker",
				Symbol:    msg.Data.Symbol,
				Data:      msg.Data,
				Timestamp: time.Now().Unix(),
			}:
			default:
				// Channel full, skip
			}
		}
	}
}

// klineReadPump reads kline messages from WebSocket
func (m *Manager) klineReadPump(symbol string) {
	defer m.wg.Done()

	for {
		select {
		case <-m.ctx.Done():
			return
		default:
		}

		m.mu.RLock()
		conn := m.klineConns[symbol]
		m.mu.RUnlock()

		if conn == nil {
			return
		}

		conn.SetReadDeadline(time.Now().Add(pongWait))
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Error().Err(err).Str("symbol", symbol).Msg("Kline read error")

			m.mu.RLock()
			intervals := m.klineSymbols[symbol]
			m.mu.RUnlock()

			m.handleReconnectKline(symbol, intervals)
			return
		}

		// Parse message
		var msg struct {
			Stream string `json:"stream"`
			Data   struct {
				EventType string       `json:"e"`
				EventTime int64        `json:"E"`
				Symbol    string       `json:"s"`
				Kline     *types.Kline `json:"k"`
			} `json:"data"`
		}

		if err := json.Unmarshal(message, &msg); err != nil {
			log.Error().Err(err).Msg("Failed to parse kline message")
			continue
		}

		if msg.Data.Kline != nil {
			// Extract interval from stream name (e.g., "btcusdt@kline_1h" -> "1h")
			parts := strings.Split(msg.Stream, "_")
			if len(parts) < 2 {
				continue
			}
			interval := parts[1]

			m.mu.Lock()
			// Update or append kline
			klines := m.klines[symbol][interval]
			if len(klines) > 0 && klines[len(klines)-1].OpenTime == msg.Data.Kline.OpenTime {
				// Update existing kline
				klines[len(klines)-1] = msg.Data.Kline
			} else {
				// Append new kline
				klines = append(klines, msg.Data.Kline)
				// Keep only last 250 klines
				if len(klines) > 250 {
					klines = klines[len(klines)-250:]
				}
				m.klines[symbol][interval] = klines
			}
			m.lastUpdate = time.Now()
			m.mu.Unlock()

			// Send event
			select {
			case m.eventChan <- &types.WebSocketEvent{
				Type:      "kline",
				Symbol:    symbol,
				Interval:  interval,
				Data:      msg.Data.Kline,
				Timestamp: time.Now().Unix(),
			}:
			default:
				// Channel full, skip
			}
		}
	}
}

// pingPump sends periodic pings to keep connection alive
func (m *Manager) pingPump(conn *websocket.Conn, connType string) {
	defer m.wg.Done()

	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			return
		case <-ticker.C:
			if err := conn.WriteControl(websocket.PingMessage, []byte{}, time.Now().Add(writeWait)); err != nil {
				log.Error().Err(err).Str("type", connType).Msg("Ping failed")
				return
			}
		}
	}
}

// handleReconnect handles ticker reconnection
func (m *Manager) handleReconnect(connType string, symbols []string) {
	m.mu.Lock()
	if m.reconnectCount >= maxReconnects {
		m.mu.Unlock()
		log.Error().Msg("Max reconnect attempts reached")
		m.sendEvent(&types.WebSocketEvent{
			Type:      "error",
			Error:     "max reconnect attempts reached",
			Timestamp: time.Now().Unix(),
		})
		return
	}
	m.reconnectCount++
	count := m.reconnectCount
	m.mu.Unlock()

	backoff := helpers.ExponentialBackoff(count, reconnectDelay)
	log.Info().Dur("backoff", backoff).Int("attempt", count).Msg("Reconnecting")

	time.Sleep(backoff)

	if err := m.SubscribeTickers(symbols); err != nil {
		log.Error().Err(err).Msg("Reconnect failed")
		m.handleReconnect(connType, symbols)
	}
}

// handleReconnectKline handles kline reconnection for a symbol
func (m *Manager) handleReconnectKline(symbol string, intervals []string) {
	m.mu.Lock()
	if m.reconnectCount >= maxReconnects {
		m.mu.Unlock()
		log.Error().Str("symbol", symbol).Msg("Max reconnect attempts reached")
		return
	}
	m.reconnectCount++
	count := m.reconnectCount
	m.mu.Unlock()

	backoff := helpers.ExponentialBackoff(count, reconnectDelay)
	log.Info().Str("symbol", symbol).Dur("backoff", backoff).Int("attempt", count).Msg("Reconnecting klines")

	time.Sleep(backoff)

	if err := m.SubscribeKlines(symbol, intervals); err != nil {
		log.Error().Err(err).Str("symbol", symbol).Msg("Kline reconnect failed")
		m.handleReconnectKline(symbol, intervals)
	}
}

// sendEvent sends an event to the event channel
func (m *Manager) sendEvent(event *types.WebSocketEvent) {
	select {
	case m.eventChan <- event:
	default:
		// Channel full, drop event
		log.Warn().Msg("Event channel full, dropping event")
	}
}
