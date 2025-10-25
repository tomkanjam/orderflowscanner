package eventbus

import (
	"time"

	"github.com/vyx/go-screener/pkg/types"
)

// CandleEvent represents a candle open event
type CandleEvent struct {
	Symbol   string    // "*" for wildcard (all symbols)
	Interval string    // "1m", "5m", "15m", "1h", etc.
	OpenTime time.Time // When this candle opened
}

// CandleCloseEvent represents a candle close event from WebSocket
type CandleCloseEvent struct {
	Symbol    string      // The trading pair (e.g., "BTCUSDT")
	Interval  string      // The timeframe (e.g., "1m", "5m", "1h")
	Kline     types.Kline // The complete closed candle
	CloseTime time.Time   // When the candle closed
}

// SignalEvent represents a signal creation/update event from PostgreSQL
type SignalEvent struct {
	SignalID  string
	TraderID  string
	UserID    string
	Symbol    string
	Interval  string
	EventType string // "created", "updated"
	Timestamp time.Time
}

// EventType represents different event types in the system
type EventType string

const (
	EventTypeCandleOpen   EventType = "candle_open"
	EventTypeCandleClose  EventType = "candle_close"
	EventTypeSignalCreated EventType = "signal_created"
	EventTypeSignalUpdated EventType = "signal_updated"
)
