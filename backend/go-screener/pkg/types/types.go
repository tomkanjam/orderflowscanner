package types

import "time"

// Kline represents a single candlestick
// Format from Binance: [openTime, open, high, low, close, volume, closeTime, quoteAssetVolume, numberOfTrades, takerBuyBaseAssetVolume, takerBuyQuoteAssetVolume, ignore]
type Kline struct {
	OpenTime                 int64   `json:"openTime"`
	Open                     float64 `json:"open"`
	High                     float64 `json:"high"`
	Low                      float64 `json:"low"`
	Close                    float64 `json:"close"`
	Volume                   float64 `json:"volume"`
	CloseTime                int64   `json:"closeTime"`
	QuoteAssetVolume         float64 `json:"quoteAssetVolume"`
	NumberOfTrades           int     `json:"numberOfTrades"`
	TakerBuyBaseAssetVolume  float64 `json:"takerBuyBaseAssetVolume"`
	TakerBuyQuoteAssetVolume float64 `json:"takerBuyQuoteAssetVolume"`
}

// Ticker represents real-time price data from Binance
type Ticker struct {
	Symbol             string  `json:"s"` // Symbol
	PriceChangePercent string  `json:"P"` // Price change percent
	LastPrice          string  `json:"c"` // Last price
	QuoteVolume        string  `json:"q"` // Total traded quote asset volume
	EventTime          int64   `json:"E"` // Event time
	BidPrice           string  `json:"b"` // Best bid price
	AskPrice           string  `json:"a"` // Best ask price
	OpenPrice          string  `json:"o"` // Open price
	HighPrice          string  `json:"h"` // High price
	LowPrice           string  `json:"l"` // Low price
}

// Trader represents a custom trading signal/strategy
type Trader struct {
	ID          string                `json:"id"`
	UserID      string                `json:"userId"`
	Name        string                `json:"name"`
	Description string                `json:"description"`
	IsBuiltIn   bool                  `json:"isBuiltIn"`
	IsVisible   bool                  `json:"isVisible"`
	Filter      TraderFilter          `json:"filter"`
	CreatedAt   time.Time             `json:"createdAt"`
	UpdatedAt   time.Time             `json:"updatedAt"`
	Preferences *TraderPreferences    `json:"preferences,omitempty"`
}

// TraderFilter contains the executable code and metadata for a trader
type TraderFilter struct {
	Code                string               `json:"code"`                // Go code to execute
	Description         []string             `json:"description"`         // Human-readable description
	Indicators          []IndicatorConfig    `json:"indicators"`          // Indicators to calculate for visualization
	RequiredTimeframes  []string             `json:"requiredTimeframes"`  // Required timeframes (e.g., ["5m", "1h"])
}

// IndicatorConfig defines a technical indicator for chart visualization
type IndicatorConfig struct {
	ID       string                 `json:"id"`       // Unique identifier
	Name     string                 `json:"name"`     // Display name
	Type     string                 `json:"type"`     // "line", "bar", "candlestick"
	Panel    bool                   `json:"panel"`    // true = separate panel, false = overlay
	Params   map[string]interface{} `json:"params"`   // Indicator parameters (e.g., period, stdDev)
	Style    IndicatorStyle         `json:"style"`    // Visual styling
}

// IndicatorStyle defines visual properties for indicators
type IndicatorStyle struct {
	Color     interface{} `json:"color"`     // String or []string for multi-line
	FillColor *string     `json:"fillColor"` // For area fills
	LineWidth *float64    `json:"lineWidth"`
}

// TraderPreferences stores user-specific preferences for a trader
type TraderPreferences struct {
	TraderID        string    `json:"traderId"`
	NotifyOnTrigger bool      `json:"notifyOnTrigger"`
	AutoTrade       bool      `json:"autoTrade"`
	MaxPositions    *int      `json:"maxPositions"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// Signal represents a triggered trading signal
type Signal struct {
	ID                    string    `json:"id"`
	TraderID              string    `json:"traderId"`
	UserID                string    `json:"userId"`
	Symbol                string    `json:"symbol"`
	Interval              string    `json:"interval"`
	Timestamp             time.Time `json:"timestamp"`
	PriceAtSignal         float64   `json:"priceAtSignal"`
	ChangePercentAtSignal float64   `json:"changePercentAtSignal"`
	VolumeAtSignal        float64   `json:"volumeAtSignal"`
	Count                 int       `json:"count"` // Dedupe count
	Source                string    `json:"source"` // "browser" or "cloud"
	MachineID             *string   `json:"machineId,omitempty"`
}

// MarketData contains all data needed for signal evaluation
// This is the simplified format that the frontend sends
type MarketData struct {
	Symbol    string                `json:"symbol"`
	Ticker    *SimplifiedTicker     `json:"ticker"`
	Klines    map[string][]Kline    `json:"klines"` // Key is interval (e.g., "5m", "1h")
	Timestamp time.Time             `json:"timestamp"`
}

// SimplifiedTicker is the format used by the API (numbers instead of strings)
// The frontend sends this format for easier JavaScript handling
type SimplifiedTicker struct {
	LastPrice          float64 `json:"lastPrice"`
	PriceChangePercent float64 `json:"priceChangePercent"`
	QuoteVolume        float64 `json:"quoteVolume"`
}

// HealthStatus represents the health check response
type HealthStatus struct {
	Status    string    `json:"status"`
	Timestamp time.Time `json:"timestamp"`
	Version   string    `json:"version"`
	Uptime    float64   `json:"uptime"` // seconds
}

// ErrorResponse represents an API error
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
	Code    int    `json:"code"`
}

// WebSocketMessage represents messages sent to the frontend
type WebSocketMessage struct {
	Type      string      `json:"type"` // "signal", "status", "error"
	Timestamp time.Time   `json:"timestamp"`
	Data      interface{} `json:"data"`
}

// KlineInterval represents supported timeframes
type KlineInterval string

const (
	Interval1m  KlineInterval = "1m"
	Interval5m  KlineInterval = "5m"
	Interval15m KlineInterval = "15m"
	Interval1h  KlineInterval = "1h"
	Interval4h  KlineInterval = "4h"
	Interval1d  KlineInterval = "1d"
)

// SubscriptionTier represents user subscription levels
type SubscriptionTier string

const (
	TierAnonymous SubscriptionTier = "ANONYMOUS"
	TierFree      SubscriptionTier = "FREE"
	TierPro       SubscriptionTier = "PRO"
	TierElite     SubscriptionTier = "ELITE"
)

// User represents an authenticated user
type User struct {
	ID               string           `json:"id"`
	Email            string           `json:"email"`
	SubscriptionTier SubscriptionTier `json:"subscriptionTier"`
	CreatedAt        time.Time        `json:"createdAt"`
}
