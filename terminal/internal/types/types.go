package types

import (
	"time"
)

// Ticker represents real-time price data from Binance
type Ticker struct {
	Symbol          string  `json:"symbol"`
	PriceChange     string  `json:"priceChange"`
	PriceChangePercent string `json:"priceChangePercent"`
	WeightedAvgPrice string `json:"weightedAvgPrice"`
	PrevClosePrice  string  `json:"prevClosePrice"`
	LastPrice       string  `json:"lastPrice"`
	LastQty         string  `json:"lastQty"`
	BidPrice        string  `json:"bidPrice"`
	BidQty          string  `json:"bidQty"`
	AskPrice        string  `json:"askPrice"`
	AskQty          string  `json:"askQty"`
	OpenPrice       string  `json:"openPrice"`
	HighPrice       string  `json:"highPrice"`
	LowPrice        string  `json:"lowPrice"`
	Volume          string  `json:"volume"`
	QuoteVolume     string  `json:"quoteVolume"`
	OpenTime        int64   `json:"openTime"`
	CloseTime       int64   `json:"closeTime"`
	FirstID         int64   `json:"firstId"`
	LastID          int64   `json:"lastId"`
	Count           int64   `json:"count"`
}

// Kline represents candlestick data
type Kline struct {
	OpenTime                 int64   `json:"openTime"`
	Open                     string  `json:"open"`
	High                     string  `json:"high"`
	Low                      string  `json:"low"`
	Close                    string  `json:"close"`
	Volume                   string  `json:"volume"`
	CloseTime                int64   `json:"closeTime"`
	QuoteAssetVolume         string  `json:"quoteAssetVolume"`
	NumberOfTrades           int64   `json:"numberOfTrades"`
	TakerBuyBaseAssetVolume  string  `json:"takerBuyBaseAssetVolume"`
	TakerBuyQuoteAssetVolume string  `json:"takerBuyQuoteAssetVolume"`
}

// MarketDataSnapshot represents a point-in-time view of market data
type MarketDataSnapshot struct {
	Tickers   map[string]*Ticker              `json:"tickers"`   // symbol -> ticker
	Klines    map[string]map[string][]*Kline  `json:"klines"`    // symbol -> interval -> klines
	Symbols   []string                        `json:"symbols"`
	Timestamp int64                           `json:"timestamp"`
}

// TraderFilter represents the filter configuration for a trader
type TraderFilter struct {
	Code         string            `json:"code"`         // Go code to execute
	Indicators   []string          `json:"indicators"`   // List of required indicators
	Timeframes   []string          `json:"timeframes"`   // Required timeframes (e.g., "1h", "4h")
	Description  string            `json:"description"`  // Human-readable description
	Parameters   map[string]string `json:"parameters"`   // Custom parameters
}

// Trader represents an AI trading strategy
type Trader struct {
	ID               string        `json:"id"`
	UserID           string        `json:"user_id"`
	Name             string        `json:"name"`
	Description      string        `json:"description"`
	Filter           TraderFilter  `json:"filter"`
	CheckIntervalSec int           `json:"check_interval_sec"` // How often to run the filter
	Active           bool          `json:"active"`
	CreatedAt        time.Time     `json:"created_at"`
	UpdatedAt        time.Time     `json:"updated_at"`
}

// SignalStatus represents the lifecycle state of a signal
type SignalStatus string

const (
	SignalStatusWatching  SignalStatus = "watching"
	SignalStatusReady     SignalStatus = "ready"
	SignalStatusEntered   SignalStatus = "entered"
	SignalStatusAbandoned SignalStatus = "abandoned"
	SignalStatusExited    SignalStatus = "exited"
)

// Signal represents a trading opportunity identified by a trader
type Signal struct {
	ID              string       `json:"id"`
	TraderID        string       `json:"trader_id"`
	UserID          string       `json:"user_id"`
	Symbol          string       `json:"symbol"`
	Status          SignalStatus `json:"status"`
	Confidence      int          `json:"confidence"`      // 0-100
	EntryPrice      float64      `json:"entry_price"`
	CurrentPrice    float64      `json:"current_price"`
	StopLoss        float64      `json:"stop_loss"`
	TakeProfit      float64      `json:"take_profit"`
	Analysis        string       `json:"analysis"`        // AI-generated analysis
	Reasoning       string       `json:"reasoning"`       // Why this signal was generated
	LastCheckTime   time.Time    `json:"last_check_time"`
	NextCheckTime   time.Time    `json:"next_check_time"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
	EnteredAt       *time.Time   `json:"entered_at,omitempty"`
	ExitedAt        *time.Time   `json:"exited_at,omitempty"`
}

// PositionSide represents the direction of a position
type PositionSide string

const (
	PositionSideLong  PositionSide = "LONG"
	PositionSideShort PositionSide = "SHORT"
)

// PositionStatus represents the state of a position
type PositionStatus string

const (
	PositionStatusOpen   PositionStatus = "open"
	PositionStatusClosed PositionStatus = "closed"
)

// Position represents an active or closed trading position
type Position struct {
	ID              string         `json:"id"`
	SignalID        string         `json:"signal_id"`
	TraderID        string         `json:"trader_id"`
	UserID          string         `json:"user_id"`
	Symbol          string         `json:"symbol"`
	Side            PositionSide   `json:"side"`
	Status          PositionStatus `json:"status"`
	EntryPrice      float64        `json:"entry_price"`
	ExitPrice       float64        `json:"exit_price,omitempty"`
	Quantity        float64        `json:"quantity"`
	StopLoss        float64        `json:"stop_loss"`
	TakeProfit      float64        `json:"take_profit"`
	CurrentPrice    float64        `json:"current_price"`
	UnrealizedPnL   float64        `json:"unrealized_pnl"`
	RealizedPnL     float64        `json:"realized_pnl,omitempty"`
	PnLPercent      float64        `json:"pnl_percent"`
	OrderID         string         `json:"order_id,omitempty"`       // Binance order ID
	IsPaperTrade    bool           `json:"is_paper_trade"`
	EnteredAt       time.Time      `json:"entered_at"`
	ClosedAt        *time.Time     `json:"closed_at,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

// Order represents a trade order (for paper trading or real trading)
type Order struct {
	ID          string    `json:"id"`
	PositionID  string    `json:"position_id"`
	UserID      string    `json:"user_id"`
	Symbol      string    `json:"symbol"`
	Side        string    `json:"side"`        // BUY or SELL
	Type        string    `json:"type"`        // MARKET, LIMIT
	Quantity    float64   `json:"quantity"`
	Price       float64   `json:"price"`
	Status      string    `json:"status"`      // NEW, FILLED, CANCELED
	BinanceID   string    `json:"binance_id,omitempty"` // Real order ID from Binance
	IsPaperTrade bool     `json:"is_paper_trade"`
	CreatedAt   time.Time `json:"created_at"`
	FilledAt    *time.Time `json:"filled_at,omitempty"`
}

// Balance represents account balance (for paper trading or real account)
type Balance struct {
	UserID          string    `json:"user_id"`
	Asset           string    `json:"asset"`         // e.g., "USDT"
	Free            float64   `json:"free"`          // Available balance
	Locked          float64   `json:"locked"`        // In open orders
	Total           float64   `json:"total"`         // Free + Locked
	IsPaperTrade    bool      `json:"is_paper_trade"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// TimerCheck represents a scheduled check for a trader
type TimerCheck struct {
	TraderID      string    `json:"trader_id"`
	NextCheckTime time.Time `json:"next_check_time"`
	IntervalSec   int       `json:"interval_sec"`
}

// FilterExecutionResult represents the result of executing a filter
type FilterExecutionResult struct {
	TraderID    string                 `json:"trader_id"`
	Matches     []string               `json:"matches"`      // Symbols that matched
	Errors      []string               `json:"errors"`       // Errors encountered
	ExecutedAt  time.Time              `json:"executed_at"`
	Duration    time.Duration          `json:"duration"`
	MarketData  *MarketDataSnapshot    `json:"market_data,omitempty"`
}

// WebSocketEvent represents an event from the WebSocket manager
type WebSocketEvent struct {
	Type      string      `json:"type"`       // "ticker", "kline", "error", "reconnect"
	Symbol    string      `json:"symbol"`
	Interval  string      `json:"interval,omitempty"` // For kline events
	Data      interface{} `json:"data"`
	Timestamp int64       `json:"timestamp"`
	Error     string      `json:"error,omitempty"`
}

// EngineStatus represents the current state of the trading engine
type EngineStatus struct {
	Running           bool                 `json:"running"`
	StartedAt         time.Time            `json:"started_at,omitempty"`
	ActiveTraders     int                  `json:"active_traders"`
	ActiveSignals     int                  `json:"active_signals"`
	OpenPositions     int                  `json:"open_positions"`
	PaperTradingMode  bool                 `json:"paper_trading_mode"`
	WebSocketStatus   string               `json:"websocket_status"`
	LastMarketUpdate  time.Time            `json:"last_market_update,omitempty"`
	SymbolsTracked    int                  `json:"symbols_tracked"`
	TotalPnL          float64              `json:"total_pnl"`
	Components        map[string]string    `json:"components"` // component -> status
}
