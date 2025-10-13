package monitoring

import "time"

// MonitoringState tracks signals being watched for entry opportunities
type MonitoringState struct {
	SignalID  string `json:"signal_id"`
	TraderID  string `json:"trader_id"`
	UserID    string `json:"user_id"`
	Symbol    string `json:"symbol"`
	Interval  string `json:"interval"`

	// Monitoring lifecycle
	MonitoringStarted time.Time `json:"monitoring_started"`
	LastReanalysisAt  time.Time `json:"last_reanalysis_at"`
	ReanalysisCount   int       `json:"reanalysis_count"`
	MaxReanalyses     int       `json:"max_reanalyses"` // Auto-expire after N

	// Latest analysis decision
	LastDecision   string  `json:"last_decision"`
	LastConfidence float64 `json:"last_confidence"`

	IsActive  bool      `json:"is_active"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Config holds monitoring engine configuration
type Config struct {
	MaxReanalyses      int           // Default max reanalyses before expiry (5)
	ReanalysisInterval time.Duration // Minimum time between reanalyses (1 candle)
	LoadOnStartup      bool          // Load active monitors from DB on startup
}

// DefaultConfig returns default monitoring configuration
func DefaultConfig() *Config {
	return &Config{
		MaxReanalyses:      5,
		ReanalysisInterval: 0, // No minimum - reanalyze every candle
		LoadOnStartup:      true,
	}
}
