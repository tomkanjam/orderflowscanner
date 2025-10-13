package eventbus

import "time"

// CandleEvent represents a candle open event
type CandleEvent struct {
	Symbol   string    // "*" for wildcard (all symbols)
	Interval string    // "1m", "5m", "15m", "1h", etc.
	OpenTime time.Time // When this candle opened
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
	EventTypeSignalCreated EventType = "signal_created"
	EventTypeSignalUpdated EventType = "signal_updated"
)
