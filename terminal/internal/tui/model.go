package tui

import (
	"time"

	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

// Panel types
const (
	PanelMarket = iota
	PanelTraders
	PanelSignals
	PanelPositions
	PanelAI
	PanelLogs
)

// Model represents the TUI application state
type Model struct {
	// Dimensions
	width  int
	height int

	// UI Components
	marketTable    table.Model
	tradersTable   table.Model
	signalsTable   table.Model
	positionsTable table.Model
	logsViewport   viewport.Model
	aiViewport     viewport.Model

	// State
	focusedPanel   int
	activeTab      string
	authenticated  bool
	userEmail      string
	balance        float64
	totalPNL       float64
	totalPNLPct    float64

	// Data
	markets   []MarketData
	traders   []TraderData
	signals   []SignalData
	positions []PositionData
	logs      []LogEntry
	aiMessage string

	// Config
	refreshRate time.Duration
	showHelp    bool
	quitting    bool
}

// Market data
type MarketData struct {
	Symbol       string
	Price        float64
	Change24h    float64
	ChangePct24h float64
	Volume24h    float64
	Sparkline    string
}

// Trader data
type TraderData struct {
	ID           string
	Name         string
	Status       string
	Interval     string
	SignalsCount int
	LastCheck    time.Time
}

// Signal data
type SignalData struct {
	ID         string
	Symbol     string
	Status     string
	EntryPrice float64
	CurrentPrice float64
	Confidence int
	AIReasoning string
	CreatedAt  time.Time
}

// Position data
type PositionData struct {
	ID         string
	Symbol     string
	Side       string
	EntryPrice float64
	CurrentPrice float64
	Size       float64
	PNL        float64
	PNLPct     float64
	StopLoss   float64
	TakeProfit float64
	Sparkline  string
	OpenedAt   time.Time
}

// Log entry
type LogEntry struct {
	Time    time.Time
	Level   string
	Message string
}

// Messages
type tickMsg time.Time
type wsUpdateMsg struct {
	symbol string
	price  float64
	change float64
}
type signalTriggeredMsg struct {
	signal SignalData
}
type aiAnalysisMsg struct {
	signalID string
	analysis string
}
type tradeExecutedMsg struct {
	position PositionData
}

// Initialize the model
func New() Model {
	m := Model{
		refreshRate: 100 * time.Millisecond,
		activeTab:   "dashboard",
		focusedPanel: PanelMarket,

		// Mock data for initial display
		markets: []MarketData{
			{Symbol: "BTCUSDT", Price: 43250, Change24h: 980, ChangePct24h: 2.3, Volume24h: 2.3e9, Sparkline: "▂▃▅▇█▇▅▃▂"},
			{Symbol: "ETHUSDT", Price: 2340, Change24h: -19, ChangePct24h: -0.8, Volume24h: 890e6, Sparkline: "▃▅▇▅▃▂▂▃▅"},
			{Symbol: "SOLUSDT", Price: 102, Change24h: 4.95, ChangePct24h: 5.1, Volume24h: 320e6, Sparkline: "▂▂▃▅▇█▇▅▃"},
		},

		traders: []TraderData{
			{ID: "1", Name: "RSI Divergence", Status: "active", Interval: "5m", SignalsCount: 12, LastCheck: time.Now().Add(-30 * time.Second)},
			{ID: "2", Name: "MACD Crossover", Status: "active", Interval: "15m", SignalsCount: 8, LastCheck: time.Now().Add(-1 * time.Minute)},
			{ID: "3", Name: "Volume Spike", Status: "active", Interval: "1m", SignalsCount: 24, LastCheck: time.Now().Add(-10 * time.Second)},
			{ID: "4", Name: "Bollinger Squeeze", Status: "active", Interval: "1h", SignalsCount: 3, LastCheck: time.Now().Add(-5 * time.Minute)},
			{ID: "5", Name: "Smart Money Flow", Status: "inactive", Interval: "4h", SignalsCount: 1, LastCheck: time.Now().Add(-2 * time.Hour)},
		},

		signals: []SignalData{
			{ID: "s1", Symbol: "ETHUSDT", Status: "watching", EntryPrice: 2350, CurrentPrice: 2340, Confidence: 78, AIReasoning: "Strong RSI divergence detected", CreatedAt: time.Now().Add(-5 * time.Minute)},
			{ID: "s2", Symbol: "SOLUSDT", Status: "position_open", EntryPrice: 100, CurrentPrice: 102, Confidence: 85, AIReasoning: "Bullish volume breakout", CreatedAt: time.Now().Add(-15 * time.Minute)},
			{ID: "s3", Symbol: "ADAUSDT", Status: "position_open", EntryPrice: 0.41, CurrentPrice: 0.42, Confidence: 72, AIReasoning: "MACD crossover confirmed", CreatedAt: time.Now().Add(-30 * time.Minute)},
			{ID: "s4", Symbol: "BTCUSDT", Status: "closed", EntryPrice: 42500, CurrentPrice: 43250, Confidence: 90, AIReasoning: "Target reached", CreatedAt: time.Now().Add(-2 * time.Hour)},
		},

		positions: []PositionData{
			{ID: "p1", Symbol: "BTCUSDT", Side: "LONG", EntryPrice: 42000, CurrentPrice: 43250, Size: 0.5, PNL: 625, PNLPct: 3.0, StopLoss: 41200, TakeProfit: 45000, Sparkline: "▃▅▇█▇▅▃▂", OpenedAt: time.Now().Add(-3 * time.Hour)},
			{ID: "p2", Symbol: "SOLUSDT", Side: "SHORT", EntryPrice: 105, CurrentPrice: 102, Size: 50, PNL: 150, PNLPct: 2.9, StopLoss: 108, TakeProfit: 98, Sparkline: "▇▅▃▂▂▃▅", OpenedAt: time.Now().Add(-1 * time.Hour)},
			{ID: "p3", Symbol: "ADAUSDT", Side: "LONG", EntryPrice: 0.41, CurrentPrice: 0.42, Size: 1000, PNL: 10, PNLPct: 2.4, StopLoss: 0.39, TakeProfit: 0.45, Sparkline: "▂▃▄▅▆▇", OpenedAt: time.Now().Add(-30 * time.Minute)},
		},

		logs: []LogEntry{
			{Time: time.Now().Add(-5 * time.Second), Level: "WS", Message: "Price update: BTCUSDT $43,250 (+2.3%)"},
			{Time: time.Now().Add(-10 * time.Second), Level: "EXEC", Message: "Position opened: ADAUSDT LONG @ $0.41"},
			{Time: time.Now().Add(-15 * time.Second), Level: "AI", Message: "✓ Decision: WATCH - Wait for confirmation"},
			{Time: time.Now().Add(-16 * time.Second), Level: "AI", Message: "Analyzing ETHUSDT market conditions..."},
			{Time: time.Now().Add(-17 * time.Second), Level: "INFO", Message: "Signal triggered: ETHUSDT RSI < 30"},
		},

		aiMessage: `ETHUSDT showing strong RSI divergence on 4h timeframe. Price made lower low at $2,320 but RSI made higher low at 32. Classic bullish reversal pattern. Volume decreasing on down moves (accumulation).

Recommendation: WATCH mode. Enter long on break above $2,360 with stop-loss at $2,320 (1.7% risk). Target $2,450 for 3.8% gain.

Confidence: ███████████████░░░ 78%

[Gemini Flash 2.0 • 1.2s response time]`,

		balance: 50000,
		totalPNL: 785,
		totalPNLPct: 1.57,
		userEmail: "elite@trader.com",
		authenticated: true,
	}

	// Initialize tables
	m.marketTable = m.createMarketTable()
	m.tradersTable = m.createTradersTable()
	m.signalsTable = m.createSignalsTable()
	m.positionsTable = m.createPositionsTable()

	return m
}

// Init implements tea.Model
func (m Model) Init() tea.Cmd {
	return tea.Batch(
		tickCmd(),
	)
}

// Tick command
func tickCmd() tea.Cmd {
	return tea.Tick(100*time.Millisecond, func(t time.Time) tea.Msg {
		return tickMsg(t)
	})
}
