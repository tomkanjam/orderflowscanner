package openrouter

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// ParseAnalysisResult parses AI response content into an AnalysisResult
// Handles both clean JSON and markdown-wrapped JSON
func ParseAnalysisResult(content string) (*AnalysisResult, error) {
	// Try to extract JSON from markdown code blocks if present
	jsonStr := extractJSON(content)

	// Parse JSON
	var result AnalysisResult
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		return nil, fmt.Errorf("failed to parse JSON: %w (content: %s)", err, jsonStr)
	}

	// Validate the result
	if err := result.Validate(); err != nil {
		return nil, fmt.Errorf("invalid analysis result: %w", err)
	}

	return &result, nil
}

// extractJSON attempts to extract JSON from markdown code blocks or returns the content as-is
func extractJSON(content string) string {
	// Remove leading/trailing whitespace
	content = strings.TrimSpace(content)

	// Try to find JSON in markdown code blocks (```json ... ```)
	jsonBlockRegex := regexp.MustCompile("(?s)```(?:json)?\\s*\\n?(.*?)\\n?```")
	matches := jsonBlockRegex.FindStringSubmatch(content)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}

	// Try to find JSON in code blocks without language specifier (``` ... ```)
	codeBlockRegex := regexp.MustCompile("(?s)```\\s*\\n?(.*?)\\n?```")
	matches = codeBlockRegex.FindStringSubmatch(content)
	if len(matches) > 1 {
		return strings.TrimSpace(matches[1])
	}

	// If content starts with { and ends with }, assume it's already JSON
	if strings.HasPrefix(content, "{") && strings.HasSuffix(content, "}") {
		return content
	}

	// Last resort: try to find JSON object in the content
	startIdx := strings.Index(content, "{")
	endIdx := strings.LastIndex(content, "}")
	if startIdx != -1 && endIdx != -1 && endIdx > startIdx {
		return content[startIdx : endIdx+1]
	}

	// Return as-is and let JSON parser handle the error
	return content
}

// ValidateAndSanitize validates and sanitizes an analysis result
// This applies business rules and ensures data integrity
func ValidateAndSanitize(result *AnalysisResult) error {
	// Sanitize confidence to reasonable bounds BEFORE validation
	if result.Confidence > 1.0 {
		result.Confidence = 1.0
	}
	if result.Confidence < 0.0 {
		result.Confidence = 0.0
	}

	// Basic validation
	if err := result.Validate(); err != nil {
		return err
	}

	// For enter decisions, validate risk management parameters
	if result.ShouldEnterTrade() {
		// Ensure stop loss is below entry (for longs)
		if result.StopLoss != nil && result.EntryPrice != nil {
			if *result.StopLoss >= *result.EntryPrice {
				return fmt.Errorf("stop loss (%.8f) must be below entry price (%.8f)",
					*result.StopLoss, *result.EntryPrice)
			}

			// Calculate stop loss percentage
			stopLossPct := (*result.EntryPrice - *result.StopLoss) / *result.EntryPrice * 100
			if stopLossPct > 10 {
				return fmt.Errorf("stop loss too wide (%.2f%%), maximum 10%%", stopLossPct)
			}
		}

		// Validate take profit targets
		if result.TakeProfit1 != nil && result.EntryPrice != nil {
			if *result.TakeProfit1 <= *result.EntryPrice {
				return fmt.Errorf("take profit 1 (%.8f) must be above entry price (%.8f)",
					*result.TakeProfit1, *result.EntryPrice)
			}
		}

		if result.TakeProfit2 != nil && result.TakeProfit1 != nil {
			if *result.TakeProfit2 <= *result.TakeProfit1 {
				return fmt.Errorf("take profit 2 (%.8f) must be above take profit 1 (%.8f)",
					*result.TakeProfit2, *result.TakeProfit1)
			}
		}

		// Validate risk/reward ratio
		if result.RiskRewardRatio != nil && *result.RiskRewardRatio < 1.0 {
			return fmt.Errorf("risk/reward ratio too low (%.2f), minimum 1.0", *result.RiskRewardRatio)
		}

		// Sanitize position size
		if result.PositionSizePct > 10 {
			result.PositionSizePct = 10 // Cap at 10% for safety
		}
		if result.PositionSizePct < 0.1 {
			result.PositionSizePct = 0.1 // Minimum 0.1%
		}
	}

	return nil
}

// FormatAnalysisForLog formats an analysis result for logging
func FormatAnalysisForLog(result *AnalysisResult) string {
	var sb strings.Builder

	sb.WriteString(fmt.Sprintf("Decision: %s (Confidence: %.2f)\n", result.Decision, result.Confidence))
	sb.WriteString(fmt.Sprintf("Reasoning: %s\n", result.Reasoning))

	if result.ShouldEnterTrade() {
		if result.EntryPrice != nil {
			sb.WriteString(fmt.Sprintf("Entry: $%.8f\n", *result.EntryPrice))
		}
		if result.StopLoss != nil {
			sb.WriteString(fmt.Sprintf("Stop Loss: $%.8f\n", *result.StopLoss))
		}
		if result.TakeProfit1 != nil {
			sb.WriteString(fmt.Sprintf("TP1: $%.8f\n", *result.TakeProfit1))
		}
		if result.TakeProfit2 != nil {
			sb.WriteString(fmt.Sprintf("TP2: $%.8f\n", *result.TakeProfit2))
		}
		sb.WriteString(fmt.Sprintf("Position Size: %.2f%%\n", result.PositionSizePct))
		if result.RiskRewardRatio != nil {
			sb.WriteString(fmt.Sprintf("Risk/Reward: %.2f:1\n", *result.RiskRewardRatio))
		}
		sb.WriteString(fmt.Sprintf("Timeframe: %s\n", result.Timeframe))
	}

	if result.ChangesObserved != "" {
		sb.WriteString(fmt.Sprintf("Changes: %s\n", result.ChangesObserved))
	}

	return sb.String()
}

// ExtractDecisionStats extracts decision statistics from a batch of results
func ExtractDecisionStats(results []*AnalysisResult) map[string]int {
	stats := map[string]int{
		DecisionEnter:              0,
		DecisionReject:             0,
		DecisionWait:               0,
		DecisionContinueMonitoring: 0,
	}

	for _, result := range results {
		if result != nil {
			stats[result.Decision]++
		}
	}

	return stats
}
