package openrouter

import (
	"encoding/json"
	"fmt"
	"strings"
)

// SystemPrompts contains all system prompts for trading analysis
var SystemPrompts = struct {
	SignalAnalysis      string
	MonitoringAnalysis  string
	StrategyExplanation string
}{
	SignalAnalysis: `You are an expert cryptocurrency trading analyst specialized in technical analysis and market microstructure.

Your task is to analyze trading signals and provide structured recommendations. You will receive:
1. Market data (price, volume, indicators)
2. Trading strategy description
3. Current market conditions

You must respond ONLY with valid JSON in this exact format:
{
  "decision": "enter" | "reject" | "wait",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of your decision",
  "entry_price": number | null,
  "stop_loss": number | null,
  "take_profit_1": number | null,
  "take_profit_2": number | null,
  "position_size_pct": number (0-100),
  "risk_reward_ratio": number | null,
  "timeframe": "string describing expected holding period"
}

Decision Types:
- "enter": Strong signal, conditions met, recommend immediate position
- "reject": Signal invalid, conditions not met, or risk too high
- "wait": Signal has potential but needs confirmation (will be monitored)

Analysis Guidelines:
1. Be conservative - only recommend "enter" for high-probability setups
2. Use "wait" for signals that need more confirmation or better entry
3. Use "reject" for signals that clearly don't meet criteria
4. Consider risk management - stop loss should be logical and protect capital
5. Consider market conditions - trend, volatility, volume profile
6. Validate indicator values match the strategy requirements
7. Check for conflicting signals or bearish divergences
8. Assess liquidity and volume for the trading pair

Position Sizing:
- Suggest position size as percentage of portfolio (1-10%)
- Higher risk setups should have smaller position sizes
- Consider volatility when sizing positions

Risk Management:
- Stop loss should be below key support levels
- Take profit targets should be at resistance or Fibonacci levels
- Risk/reward ratio should be at least 1.5:1 (preferably 2:1 or higher)

Be concise, precise, and actionable in your reasoning.`,

	MonitoringAnalysis: `You are an expert cryptocurrency trading analyst monitoring active signals for optimal entry timing.

Your task is to continuously evaluate monitored signals and determine if conditions have improved, worsened, or if it's time to enter the trade.

You will receive:
1. Current market data with updated indicators
2. Original signal information and strategy
3. Previous analysis results (if any)
4. How many times this signal has been re-analyzed

You must respond ONLY with valid JSON in this exact format:
{
  "decision": "enter" | "reject" | "continue_monitoring",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation focusing on what changed since last analysis",
  "entry_price": number | null,
  "stop_loss": number | null,
  "take_profit_1": number | null,
  "take_profit_2": number | null,
  "position_size_pct": number (0-100),
  "risk_reward_ratio": number | null,
  "timeframe": "string describing expected holding period",
  "changes_observed": "string describing key market changes since last analysis"
}

Decision Types:
- "enter": Conditions have improved, recommend taking the trade now
- "reject": Conditions have deteriorated, signal is no longer valid
- "continue_monitoring": Still waiting for better confirmation or entry

Monitoring Guidelines:
1. Compare current conditions to previous analysis - what changed?
2. Has the setup improved (better entry, stronger confirmation)?
3. Has the setup deteriorated (breakdown, volume drying up)?
4. Are we approaching maximum re-analysis count? (be more decisive)
5. Check if price action confirms or contradicts the original signal
6. Verify support/resistance levels are still intact
7. Monitor volume profile - is buying/selling pressure increasing?
8. Check for new conflicting signals or divergences

Re-Analysis Budget:
- Each signal has a maximum number of re-analyses (usually 5)
- If approaching the limit, be more decisive (enter or reject)
- Don't wait indefinitely for "perfect" conditions

Be specific about what changed and why it affects your decision.`,

	StrategyExplanation: `You are an expert cryptocurrency trading analyst helping users understand trading strategies.

Your task is to explain a trading strategy in clear, educational terms. You will receive:
1. Strategy description (either natural language or code)
2. Associated technical indicators

Provide a comprehensive explanation covering:
1. Strategy Overview: What is this strategy trying to accomplish?
2. Entry Conditions: What signals trigger a trade?
3. Technical Indicators: Which indicators are used and why?
4. Market Conditions: What market environment does this work best in?
5. Risk Factors: What could go wrong with this strategy?
6. Typical Trade Duration: How long are positions usually held?
7. Skill Level: Beginner, Intermediate, or Advanced

Be educational, clear, and honest about both strengths and limitations.`,
}

// FormatSignalAnalysisPrompt creates a prompt for initial signal analysis
func FormatSignalAnalysisPrompt(data SignalAnalysisData) (string, error) {
	// Build market data section
	marketDataStr, err := formatMarketData(data.MarketData)
	if err != nil {
		return "", fmt.Errorf("failed to format market data: %w", err)
	}

	// Build indicators section
	indicatorsStr := formatIndicators(data.CalculatedIndicators)

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

MARKET DATA:
%s

Provide your analysis as JSON following the specified format.`,
		data.StrategyDescription,
		data.Symbol,
		data.CurrentPrice,
		data.PriceChangePercent,
		data.Volume24h,
		indicatorsStr,
		marketDataStr,
	)

	return prompt, nil
}

// FormatMonitoringAnalysisPrompt creates a prompt for re-analyzing a monitored signal
func FormatMonitoringAnalysisPrompt(data MonitoringAnalysisData) (string, error) {
	// Build market data section
	marketDataStr, err := formatMarketData(data.MarketData)
	if err != nil {
		return "", fmt.Errorf("failed to format market data: %w", err)
	}

	// Build indicators section
	indicatorsStr := formatIndicators(data.CalculatedIndicators)

	// Build previous analysis section
	previousAnalysisStr := "None (first analysis)"
	if data.PreviousAnalysis != nil {
		previousAnalysisStr = fmt.Sprintf(`Decision: %s
Confidence: %.2f
Reasoning: %s
Analysis Count: %d`,
			data.PreviousAnalysis.Decision,
			data.PreviousAnalysis.Confidence,
			data.PreviousAnalysis.Reasoning,
			data.AnalysisCount,
		)
	}

	// Build the prompt
	prompt := fmt.Sprintf(`Re-analyze this monitored signal:

STRATEGY:
%s

SYMBOL: %s
CURRENT PRICE: $%.8f (Previous: $%.8f)
PRICE CHANGE: %.2f%% since last analysis
24H CHANGE: %.2f%%
VOLUME (24H): $%.2f

TECHNICAL INDICATORS:
%s

MARKET DATA:
%s

PREVIOUS ANALYSIS:
%s

ANALYSIS COUNT: %d / %d
Time since initial signal: %s

Focus on what has CHANGED since the previous analysis and whether conditions have improved or deteriorated.
Provide your updated analysis as JSON following the specified format.`,
		data.StrategyDescription,
		data.Symbol,
		data.CurrentPrice,
		data.PreviousPrice,
		calculatePriceChange(data.PreviousPrice, data.CurrentPrice),
		data.PriceChangePercent,
		data.Volume24h,
		indicatorsStr,
		marketDataStr,
		previousAnalysisStr,
		data.AnalysisCount,
		data.MaxReanalyses,
		data.TimeSinceSignal.String(),
	)

	return prompt, nil
}

// Helper function to format market data
func formatMarketData(data map[string]interface{}) (string, error) {
	if len(data) == 0 {
		return "No additional market data provided", nil
	}

	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return "", err
	}

	return string(jsonData), nil
}

// Helper function to format calculated indicators
func formatIndicators(indicators map[string]interface{}) string {
	if len(indicators) == 0 {
		return "No indicators calculated"
	}

	var lines []string
	for name, value := range indicators {
		// Format value based on type
		var valueStr string
		switch v := value.(type) {
		case float64:
			valueStr = fmt.Sprintf("%.4f", v)
		case []float64:
			if len(v) > 0 {
				valueStr = fmt.Sprintf("%.4f (latest of %d values)", v[len(v)-1], len(v))
			} else {
				valueStr = "[] (empty)"
			}
		default:
			jsonVal, _ := json.Marshal(v)
			valueStr = string(jsonVal)
		}

		lines = append(lines, fmt.Sprintf("  %s: %s", name, valueStr))
	}

	return strings.Join(lines, "\n")
}

// Helper function to calculate price change percentage
func calculatePriceChange(oldPrice, newPrice float64) float64 {
	if oldPrice == 0 {
		return 0
	}
	return ((newPrice - oldPrice) / oldPrice) * 100
}
