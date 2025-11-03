package analysis

import (
	"time"

	"github.com/vyx/go-screener/pkg/openrouter"
	"github.com/vyx/go-screener/pkg/types"
)

// AnalysisRequest represents a request to analyze a trading signal
type AnalysisRequest struct {
	SignalID     string
	TraderID     string
	UserID       string
	Symbol       string
	Interval     string
	MarketData   *types.MarketData
	Trader       *types.Trader
	IsReanalysis bool
	QueuedAt     time.Time
}

// AnalysisResult extends openrouter.AnalysisResult with additional metadata
type AnalysisResult struct {
	*openrouter.AnalysisResult
	SignalID          string
	TraderID          string
	UserID            string
	ModelUsed         string
	TokensUsed        int
	LatencyMs         int64
	CalculatedIndicators map[string]interface{}
}

// CalculatedIndicator represents a calculated indicator value
type CalculatedIndicator struct {
	Name    string
	Value   interface{} // Can be float64, []float64, or complex types
	History []float64   // Recent history for AI context
}

// Config holds analysis engine configuration
type Config struct {
	// OpenRouter configuration
	OpenRouterAPIKey string
	DefaultModel     string
	Temperature      float64
	MaxTokens        int

	// Braintrust configuration
	BraintrustAPIKey   string
	BraintrustProjectID string

	// Queue configuration
	QueueSize      int
	WorkerCount    int
	MaxConcurrent  int // Max concurrent OpenRouter calls
	RequestTimeout time.Duration

	// Analysis configuration
	DefaultKlineLimit int // Default bars of history for AI
}

// DefaultConfig returns default analysis engine configuration
func DefaultConfig() *Config {
	return &Config{
		DefaultModel:      "google/gemini-2.5-flash",
		Temperature:       0.2, // Low for consistent analysis
		MaxTokens:         4000,
		QueueSize:         1000,
		WorkerCount:       10,
		MaxConcurrent:     10,
		RequestTimeout:    30 * time.Second,
		DefaultKlineLimit: 100,
	}
}
