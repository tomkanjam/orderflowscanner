package types

import (
	"time"
)

// Trader represents a trading strategy configuration
type Trader struct {
	ID                  string   `json:"id"`
	UserID              string   `json:"user_id"`
	Name                string   `json:"name"`
	Description         string   `json:"description"`
	SignalCode          string   `json:"signal_code"`
	AIInstructions      string   `json:"ai_instructions"`
	Timeframes          []string `json:"timeframes"`
	CheckInterval       string   `json:"check_interval"`
	ReanalysisInterval  string   `json:"reanalysis_interval"`
	Symbols             []string `json:"symbols"`
	Status              string   `json:"status"`
	ErrorMessage        string   `json:"error_message"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

// Signal represents a triggered trading signal
type Signal struct {
	ID           string    `json:"id"`
	TraderID     string    `json:"trader_id"`
	UserID       string    `json:"user_id"`
	Symbol       string    `json:"symbol"`
	Timestamp    time.Time `json:"timestamp"`
	Status       string    `json:"status"` // new, watching, position_open, closed
	TriggerPrice float64   `json:"trigger_price"`
	CurrentPrice float64   `json:"current_price"`
	ClosedAt     *time.Time
	CloseReason  string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Position represents an open or closed trading position
type Position struct {
	ID                 string                 `json:"id"`
	SignalID           string                 `json:"signal_id"`
	UserID             string                 `json:"user_id"`
	Symbol             string                 `json:"symbol"`
	Side               string                 `json:"side"` // long, short
	EntryPrice         float64                `json:"entry_price"`
	Size               float64                `json:"size"`
	StopLoss           float64                `json:"stop_loss"`
	StopLossOrderID    int64                  `json:"stop_loss_order_id"`
	TakeProfit         float64                `json:"take_profit"`
	TakeProfitOrderID  int64                  `json:"take_profit_order_id"`
	Status             string                 `json:"status"` // open, closed
	ExitPrice          float64                `json:"exit_price"`
	PNL                float64                `json:"pnl"`
	PNLPercent         float64                `json:"pnl_percent"`
	OpenedAt           time.Time              `json:"opened_at"`
	ClosedAt           *time.Time
	CloseReason        string
	Metadata           map[string]interface{} `json:"metadata"` // For trailing stop and other configs
}

// PositionStatus represents a position with current market data
type PositionStatus struct {
	Position          Position `json:"position"`
	CurrentPrice      float64  `json:"current_price"`
	CurrentPNL        float64  `json:"current_pnl"`
	CurrentPNLPercent float64  `json:"current_pnl_percent"`
}

// Trade represents a single trade execution
type Trade struct {
	ID             string    `json:"id"`
	PositionID     string    `json:"position_id"`
	UserID         string    `json:"user_id"`
	Type           string    `json:"type"` // paper, real
	Side           string    `json:"side"` // BUY, SELL
	Symbol         string    `json:"symbol"`
	Price          float64   `json:"price"`
	Quantity       float64   `json:"quantity"`
	Status         string    `json:"status"` // pending, filled, cancelled, failed
	BinanceOrderID int64     `json:"binance_order_id"`
	ErrorMessage   string    `json:"error_message"`
	ExecutedAt     time.Time `json:"executed_at"`
}

// Decision represents an AI trading decision
type Decision struct {
	Decision   string                 `json:"decision"`
	Reasoning  string                 `json:"reasoning"`
	Confidence int                    `json:"confidence"`
	Metadata   map[string]interface{} `json:"metadata"`
}

// MarketData represents market data sent to Gemini for analysis
type MarketData struct {
	Symbol     string                            `json:"symbol"`
	Timestamp  int64                             `json:"timestamp"`
	Ticker     map[string]interface{}            `json:"ticker"`
	Klines     map[string][][]interface{}        `json:"klines"`
	Indicators map[string]interface{}            `json:"indicators"`
}

// Ticker represents current market ticker data
type Ticker struct {
	LastPrice       string
	Volume24h       string
	PriceChange24h  string
	High24h         string
	Low24h          string
}

// Kline represents a candlestick data point
type Kline []interface{}

// AnalysisRequest is sent to Supabase Edge Function
type AnalysisRequest struct {
	TraderID   string     `json:"traderId"`
	SignalID   string     `json:"signalId"`
	MarketData MarketData `json:"marketData"`
}

// AnalysisResponse is received from Supabase Edge Function
type AnalysisResponse struct {
	Success  bool     `json:"success"`
	Analysis Decision `json:"analysis"`
	Error    string   `json:"error"`
}

// HealthStatus represents machine health information
type HealthStatus struct {
	Status             string    `json:"status"`
	Version            string    `json:"version"`
	Uptime             float64   `json:"uptime"`
	ActiveTraders      int       `json:"activeTraders"`
	OpenPositions      int       `json:"openPositions"`
	WebSocketConnected bool      `json:"websocketConnected"`
	LastKlineUpdate    time.Time `json:"lastKlineUpdate"`
	MemoryUsageMB      uint64    `json:"memoryUsageMB"`
}

// Config represents application configuration
type Config struct {
	UserID            string
	SupabaseURL       string
	SupabaseAnonKey   string
	MachineID         string
	Version           string
	DatabaseURL       string
	LogLevel          string
	PaperTradingOnly  bool
	BinanceAPIKey     string
	BinanceSecretKey  string
}
