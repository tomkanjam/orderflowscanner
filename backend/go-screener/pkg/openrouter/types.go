package openrouter

import (
	"fmt"
	"time"
)

// SignalAnalysisData contains data for initial signal analysis
type SignalAnalysisData struct {
	StrategyDescription  string
	Symbol               string
	CurrentPrice         float64
	PriceChangePercent   float64
	Volume24h            float64
	CalculatedIndicators map[string]interface{} // Indicator values calculated from trader config
	MarketData           map[string]interface{} // Additional market context (klines, etc.)
}

// MonitoringAnalysisData contains data for re-analyzing a monitored signal
type MonitoringAnalysisData struct {
	StrategyDescription  string
	Symbol               string
	CurrentPrice         float64
	PreviousPrice        float64 // Price at last analysis
	PriceChangePercent   float64
	Volume24h            float64
	CalculatedIndicators map[string]interface{}
	MarketData           map[string]interface{}
	PreviousAnalysis     *AnalysisResult // Previous analysis result
	AnalysisCount        int             // How many times we've analyzed this signal
	MaxReanalyses        int             // Maximum allowed reanalyses
	TimeSinceSignal      time.Duration   // Time elapsed since initial signal
}

// AnalysisResult represents the structured response from AI analysis
type AnalysisResult struct {
	Decision         string   `json:"decision"` // "enter", "reject", "wait", "continue_monitoring"
	Confidence       float64  `json:"confidence"`
	Reasoning        string   `json:"reasoning"`
	EntryPrice       *float64 `json:"entry_price"`
	StopLoss         *float64 `json:"stop_loss"`
	TakeProfit1      *float64 `json:"take_profit_1"`
	TakeProfit2      *float64 `json:"take_profit_2"`
	PositionSizePct  float64  `json:"position_size_pct"`
	RiskRewardRatio  *float64 `json:"risk_reward_ratio"`
	Timeframe        string   `json:"timeframe"`
	ChangesObserved  string   `json:"changes_observed,omitempty"`  // For monitoring only
}

// Decision type constants
const (
	DecisionEnter              = "enter"
	DecisionReject             = "reject"
	DecisionWait               = "wait"
	DecisionContinueMonitoring = "continue_monitoring"
)

// IsValidDecision checks if a decision string is valid
func IsValidDecision(decision string) bool {
	switch decision {
	case DecisionEnter, DecisionReject, DecisionWait, DecisionContinueMonitoring:
		return true
	default:
		return false
	}
}

// ShouldEnterTrade returns true if the decision recommends entering a trade
func (r *AnalysisResult) ShouldEnterTrade() bool {
	return r.Decision == DecisionEnter
}

// ShouldReject returns true if the decision recommends rejecting the signal
func (r *AnalysisResult) ShouldReject() bool {
	return r.Decision == DecisionReject
}

// ShouldMonitor returns true if the decision recommends monitoring (wait or continue_monitoring)
func (r *AnalysisResult) ShouldMonitor() bool {
	return r.Decision == DecisionWait || r.Decision == DecisionContinueMonitoring
}

// Validate checks if the analysis result is valid
func (r *AnalysisResult) Validate() error {
	if !IsValidDecision(r.Decision) {
		return fmt.Errorf("invalid decision: %s", r.Decision)
	}

	if r.Confidence < 0 || r.Confidence > 1 {
		return fmt.Errorf("confidence must be between 0 and 1, got: %.2f", r.Confidence)
	}

	if r.Reasoning == "" {
		return fmt.Errorf("reasoning cannot be empty")
	}

	// If entering trade, must have entry price and risk management
	if r.ShouldEnterTrade() {
		if r.EntryPrice == nil || *r.EntryPrice <= 0 {
			return fmt.Errorf("entry_price required for 'enter' decision")
		}
		if r.StopLoss == nil || *r.StopLoss <= 0 {
			return fmt.Errorf("stop_loss required for 'enter' decision")
		}
		if r.PositionSizePct <= 0 || r.PositionSizePct > 100 {
			return fmt.Errorf("position_size_pct must be between 0 and 100, got: %.2f", r.PositionSizePct)
		}
	}

	return nil
}
