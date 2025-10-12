package analysis

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/vyx/go-screener/pkg/openrouter"
)

// Prompter builds analysis prompts for OpenRouter
type Prompter struct{}

// NewPrompter creates a new prompt builder
func NewPrompter() *Prompter {
	return &Prompter{}
}

// BuildAnalysisPrompt creates a structured prompt for initial signal analysis
func (p *Prompter) BuildAnalysisPrompt(req *AnalysisRequest, calculatedIndicators map[string]interface{}) (string, error) {
	// Get strategy description
	strategyDesc := ""
	if req.Trader != nil && len(req.Trader.Filter.Description) > 0 {
		strategyDesc = strings.Join(req.Trader.Filter.Description, " ")
	}
	if strategyDesc == "" {
		strategyDesc = "No strategy description provided"
	}

	// Get current market data
	ticker := req.MarketData.Ticker
	if ticker == nil {
		return "", fmt.Errorf("ticker data is nil")
	}

	// Format indicators
	indicatorsStr := p.formatIndicators(calculatedIndicators)

	// Format recent klines (OHLCV data)
	klinesStr := p.formatRecentKlines(req)

	// Build the prompt
	prompt := fmt.Sprintf(`Analyze this trading signal:

STRATEGY:
%s

SYMBOL: %s
CURRENT PRICE: $%.8f
24H CHANGE: %.2f%%
VOLUME (24H): $%.2f

TECHNICAL INDICATORS:
%s

RECENT PRICE ACTION:
%s

Provide your analysis as JSON following the specified format. Focus on:
1. Whether the setup meets the strategy criteria
2. Risk/reward assessment at current price
3. Key support/resistance levels for stop loss and take profit
4. Overall confidence in this trade setup`,
		strategyDesc,
		req.Symbol,
		ticker.LastPrice,
		ticker.PriceChangePercent,
		ticker.QuoteVolume,
		indicatorsStr,
		klinesStr,
	)

	return prompt, nil
}

// BuildMonitoringPrompt creates a prompt for re-analyzing a monitored signal
func (p *Prompter) BuildMonitoringPrompt(
	req *AnalysisRequest,
	calculatedIndicators map[string]interface{},
	previousAnalysis *openrouter.AnalysisResult,
	analysisCount int,
	maxReanalyses int,
) (string, error) {
	// Similar to BuildAnalysisPrompt but includes previous analysis context
	basePrompt, err := p.BuildAnalysisPrompt(req, calculatedIndicators)
	if err != nil {
		return "", err
	}

	// Add monitoring context
	previousStr := "None (first analysis)"
	if previousAnalysis != nil {
		previousStr = fmt.Sprintf(`Decision: %s
Confidence: %.2f
Reasoning: %s
Analysis Count: %d / %d`,
			previousAnalysis.Decision,
			previousAnalysis.Confidence,
			previousAnalysis.Reasoning,
			analysisCount,
			maxReanalyses,
		)
	}

	monitoringPrompt := fmt.Sprintf(`%s

PREVIOUS ANALYSIS:
%s

REANALYSIS COUNT: %d / %d

Since this signal is being monitored, focus on what has CHANGED:
- Has price action confirmed or contradicted the original signal?
- Have indicators improved or deteriorated?
- Are we approaching maximum reanalysis limit? Be more decisive.
- Should we enter NOW, reject the signal, or continue monitoring?`,
		basePrompt,
		previousStr,
		analysisCount,
		maxReanalyses,
	)

	return monitoringPrompt, nil
}

// formatIndicators formats calculated indicators for the prompt
func (p *Prompter) formatIndicators(indicators map[string]interface{}) string {
	if len(indicators) == 0 {
		return "  No indicators calculated (trader configuration may be empty)"
	}

	var lines []string
	for name, value := range indicators {
		formatted := p.formatIndicatorValue(name, value)
		lines = append(lines, fmt.Sprintf("  %s: %s", name, formatted))
	}

	return strings.Join(lines, "\n")
}

// formatIndicatorValue formats a single indicator value for display
func (p *Prompter) formatIndicatorValue(name string, value interface{}) string {
	// Try to extract the latest value from different formats
	switch v := value.(type) {
	case map[string]interface{}:
		// For complex indicators (MACD, BB, etc.)
		return p.formatIndicatorMap(v)
	case float64:
		return fmt.Sprintf("%.4f", v)
	case []float64:
		if len(v) > 0 {
			return fmt.Sprintf("%.4f (latest of %d values)", v[len(v)-1], len(v))
		}
		return "[] (empty)"
	default:
		// Fallback to JSON encoding
		jsonVal, _ := json.Marshal(v)
		return string(jsonVal)
	}
}

// formatIndicatorMap formats a map-based indicator value
func (p *Prompter) formatIndicatorMap(m map[string]interface{}) string {
	var parts []string

	// Common keys to look for
	keys := []string{"value", "macd", "signal", "histogram", "upper", "middle", "lower", "k", "d"}
	for _, key := range keys {
		if val, ok := m[key]; ok {
			if fval, ok := val.(float64); ok {
				parts = append(parts, fmt.Sprintf("%s=%.4f", key, fval))
			}
		}
	}

	if len(parts) > 0 {
		return strings.Join(parts, ", ")
	}

	// Fallback to JSON
	jsonVal, _ := json.Marshal(m)
	return string(jsonVal)
}

// formatRecentKlines formats recent price action for the prompt
func (p *Prompter) formatRecentKlines(req *AnalysisRequest) string {
	klines, ok := req.MarketData.Klines[req.Interval]
	if !ok || len(klines) == 0 {
		return "  No kline data available"
	}

	// Show last 5 candles
	count := 5
	if len(klines) < count {
		count = len(klines)
	}

	recentKlines := klines[len(klines)-count:]
	var lines []string

	lines = append(lines, fmt.Sprintf("  Last %d candles (%s interval):", count, req.Interval))
	for i, kline := range recentKlines {
		direction := "→"
		if kline.Close > kline.Open {
			direction = "↑"
		} else if kline.Close < kline.Open {
			direction = "↓"
		}

		lines = append(lines, fmt.Sprintf("    [%d] O:%.2f H:%.2f L:%.2f C:%.2f %s V:%.0f",
			i+1,
			kline.Open,
			kline.High,
			kline.Low,
			kline.Close,
			direction,
			kline.Volume,
		))
	}

	return strings.Join(lines, "\n")
}
