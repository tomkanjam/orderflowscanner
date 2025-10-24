package openrouter

import (
	"fmt"
	"testing"
	"time"
)

func TestDefaultConfig(t *testing.T) {
	apiKey := "test-api-key"
	config := DefaultConfig(apiKey)

	if config.APIKey != apiKey {
		t.Errorf("Expected APIKey %s, got %s", apiKey, config.APIKey)
	}

	if config.Model == "" {
		t.Error("Expected default model to be set")
	}

	if config.MaxRetries <= 0 {
		t.Error("Expected MaxRetries to be positive")
	}

	if config.RetryDelay <= 0 {
		t.Error("Expected RetryDelay to be positive")
	}

	if config.Temperature < 0 || config.Temperature > 2 {
		t.Error("Expected Temperature to be in valid range")
	}

	if config.MaxTokens <= 0 {
		t.Error("Expected MaxTokens to be positive")
	}
}

func TestNewClient(t *testing.T) {
	tests := []struct {
		name      string
		config    *Config
		wantError bool
	}{
		{
			name:      "nil config",
			config:    nil,
			wantError: true,
		},
		{
			name: "empty API key",
			config: &Config{
				APIKey: "",
			},
			wantError: true,
		},
		{
			name: "valid config",
			config: &Config{
				APIKey:      "test-key",
				Model:       "google/gemini-2.0-flash-exp:free",
				MaxRetries:  3,
				RetryDelay:  2 * time.Second,
				Temperature: 0.2,
				MaxTokens:   4000,
			},
			wantError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewClient(tt.config)
			if tt.wantError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}

			if client == nil {
				t.Error("Expected client to be non-nil")
			}
		})
	}
}

func TestAnalysisResultValidation(t *testing.T) {
	tests := []struct {
		name      string
		result    *AnalysisResult
		wantError bool
	}{
		{
			name: "valid enter decision",
			result: &AnalysisResult{
				Decision:        DecisionEnter,
				Confidence:      0.85,
				Reasoning:       "Strong bullish signal with good risk/reward",
				EntryPrice:      floatPtr(50000.0),
				StopLoss:        floatPtr(48000.0),
				TakeProfit1:     floatPtr(55000.0),
				PositionSizePct: 5.0,
				RiskRewardRatio: floatPtr(2.5),
				Timeframe:       "2-3 days",
			},
			wantError: false,
		},
		{
			name: "valid reject decision",
			result: &AnalysisResult{
				Decision:   DecisionReject,
				Confidence: 0.7,
				Reasoning:  "Conflicting signals, bearish divergence detected",
			},
			wantError: false,
		},
		{
			name: "invalid decision",
			result: &AnalysisResult{
				Decision:   "invalid",
				Confidence: 0.8,
				Reasoning:  "Test",
			},
			wantError: true,
		},
		{
			name: "confidence out of range",
			result: &AnalysisResult{
				Decision:   DecisionWait,
				Confidence: 1.5,
				Reasoning:  "Test",
			},
			wantError: true,
		},
		{
			name: "missing reasoning",
			result: &AnalysisResult{
				Decision:   DecisionWait,
				Confidence: 0.8,
				Reasoning:  "",
			},
			wantError: true,
		},
		{
			name: "enter without entry price",
			result: &AnalysisResult{
				Decision:        DecisionEnter,
				Confidence:      0.8,
				Reasoning:       "Test",
				PositionSizePct: 5.0,
			},
			wantError: true,
		},
		{
			name: "enter without stop loss",
			result: &AnalysisResult{
				Decision:        DecisionEnter,
				Confidence:      0.8,
				Reasoning:       "Test",
				EntryPrice:      floatPtr(50000.0),
				PositionSizePct: 5.0,
			},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.result.Validate()
			if tt.wantError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
			}
		})
	}
}

func TestExtractJSON(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "clean JSON",
			input:    `{"decision": "enter"}`,
			expected: `{"decision": "enter"}`,
		},
		{
			name: "markdown code block with json",
			input: "```json\n{\"decision\": \"enter\"}\n```",
			expected: `{"decision": "enter"}`,
		},
		{
			name: "markdown code block without language",
			input: "```\n{\"decision\": \"enter\"}\n```",
			expected: `{"decision": "enter"}`,
		},
		{
			name:     "JSON with surrounding text",
			input:    "Here's the analysis:\n{\"decision\": \"enter\"}\nHope this helps!",
			expected: `{"decision": "enter"}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractJSON(tt.input)
			if result != tt.expected {
				t.Errorf("Expected %q, got %q", tt.expected, result)
			}
		})
	}
}

func TestParseAnalysisResult(t *testing.T) {
	tests := []struct {
		name      string
		content   string
		wantError bool
	}{
		{
			name: "valid JSON",
			content: `{
				"decision": "enter",
				"confidence": 0.85,
				"reasoning": "Strong signal",
				"entry_price": 50000,
				"stop_loss": 48000,
				"take_profit_1": 55000,
				"position_size_pct": 5,
				"risk_reward_ratio": 2.5,
				"timeframe": "2-3 days"
			}`,
			wantError: false,
		},
		{
			name: "JSON in markdown",
			content: "```json\n" + `{
				"decision": "reject",
				"confidence": 0.7,
				"reasoning": "Bearish divergence"
			}` + "\n```",
			wantError: false,
		},
		{
			name:      "invalid JSON",
			content:   `{"decision": invalid}`,
			wantError: true,
		},
		{
			name: "valid JSON but invalid decision",
			content: `{
				"decision": "invalid_decision",
				"confidence": 0.8,
				"reasoning": "Test"
			}`,
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := ParseAnalysisResult(tt.content)
			if tt.wantError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if result == nil {
					t.Error("Expected result to be non-nil")
				}
			}
		})
	}
}

func TestValidateAndSanitize(t *testing.T) {
	tests := []struct {
		name      string
		result    *AnalysisResult
		wantError bool
		checkFunc func(*AnalysisResult) error
	}{
		{
			name: "sanitize confidence above 1",
			result: &AnalysisResult{
				Decision:   DecisionWait,
				Confidence: 1.5,
				Reasoning:  "Test",
			},
			wantError: false,
			checkFunc: func(r *AnalysisResult) error {
				if r.Confidence != 1.0 {
					return fmt.Errorf("Expected confidence to be capped at 1.0, got %.2f", r.Confidence)
				}
				return nil
			},
		},
		{
			name: "sanitize position size too large",
			result: &AnalysisResult{
				Decision:        DecisionEnter,
				Confidence:      0.85,
				Reasoning:       "Test",
				EntryPrice:      floatPtr(50000.0),
				StopLoss:        floatPtr(48000.0),
				PositionSizePct: 15.0,
			},
			wantError: false,
			checkFunc: func(r *AnalysisResult) error {
				if r.PositionSizePct != 10.0 {
					return fmt.Errorf("Expected position size to be capped at 10%%, got %.2f", r.PositionSizePct)
				}
				return nil
			},
		},
		{
			name: "stop loss above entry",
			result: &AnalysisResult{
				Decision:        DecisionEnter,
				Confidence:      0.85,
				Reasoning:       "Test",
				EntryPrice:      floatPtr(50000.0),
				StopLoss:        floatPtr(51000.0), // Invalid: above entry
				PositionSizePct: 5.0,
			},
			wantError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateAndSanitize(tt.result)
			if tt.wantError {
				if err == nil {
					t.Error("Expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("Unexpected error: %v", err)
				}
				if tt.checkFunc != nil {
					if err := tt.checkFunc(tt.result); err != nil {
						t.Error(err)
					}
				}
			}
		})
	}
}

// Helper function to create float64 pointer
func floatPtr(f float64) *float64 {
	return &f
}

// Benchmark tests
func BenchmarkParseAnalysisResult(b *testing.B) {
	content := `{
		"decision": "enter",
		"confidence": 0.85,
		"reasoning": "Strong bullish signal with good risk/reward",
		"entry_price": 50000,
		"stop_loss": 48000,
		"take_profit_1": 55000,
		"position_size_pct": 5,
		"risk_reward_ratio": 2.5,
		"timeframe": "2-3 days"
	}`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = ParseAnalysisResult(content)
	}
}

func BenchmarkValidateAndSanitize(b *testing.B) {
	result := &AnalysisResult{
		Decision:        DecisionEnter,
		Confidence:      0.85,
		Reasoning:       "Strong bullish signal",
		EntryPrice:      floatPtr(50000.0),
		StopLoss:        floatPtr(48000.0),
		TakeProfit1:     floatPtr(55000.0),
		PositionSizePct: 5.0,
		RiskRewardRatio: floatPtr(2.5),
		Timeframe:       "2-3 days",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = ValidateAndSanitize(result)
	}
}
