package helpers

import (
	"testing"
	"time"
)

func TestGenerateID(t *testing.T) {
	id1 := GenerateID("test", 16)
	id2 := GenerateID("test", 16)

	if id1 == id2 {
		t.Error("Expected unique IDs")
	}

	if len(id1) < 5 {
		t.Errorf("Expected ID to have reasonable length, got %d", len(id1))
	}
}

func TestParseFloat(t *testing.T) {
	tests := []struct {
		input    string
		expected float64
		hasError bool
	}{
		{"123.45", 123.45, false},
		{"0.5", 0.5, false},
		{"", 0, false},
		{"invalid", 0, true},
	}

	for _, tt := range tests {
		result, err := ParseFloat(tt.input)

		if tt.hasError && err == nil {
			t.Errorf("Expected error for input %s", tt.input)
		}

		if !tt.hasError && err != nil {
			t.Errorf("Unexpected error for input %s: %v", tt.input, err)
		}

		if !tt.hasError && result != tt.expected {
			t.Errorf("ParseFloat(%s) = %f, want %f", tt.input, result, tt.expected)
		}
	}
}

func TestCalculatePnL(t *testing.T) {
	tests := []struct {
		name         string
		entryPrice   float64
		currentPrice float64
		quantity     float64
		isLong       bool
		expected     float64
	}{
		{"Long profit", 100.0, 110.0, 1.0, true, 10.0},
		{"Long loss", 100.0, 90.0, 1.0, true, -10.0},
		{"Short profit", 100.0, 90.0, 1.0, false, 10.0},
		{"Short loss", 100.0, 110.0, 1.0, false, -10.0},
		{"Multiple quantity", 100.0, 110.0, 2.0, true, 20.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CalculatePnL(tt.entryPrice, tt.currentPrice, tt.quantity, tt.isLong)
			if result != tt.expected {
				t.Errorf("CalculatePnL() = %f, want %f", result, tt.expected)
			}
		})
	}
}

func TestCalculatePnLPercent(t *testing.T) {
	tests := []struct {
		name         string
		entryPrice   float64
		currentPrice float64
		isLong       bool
		expected     float64
	}{
		{"Long 10% profit", 100.0, 110.0, true, 10.0},
		{"Long 10% loss", 100.0, 90.0, true, -10.0},
		{"Short 10% profit", 100.0, 90.0, false, 10.0},
		{"Short 10% loss", 100.0, 110.0, false, -10.0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CalculatePnLPercent(tt.entryPrice, tt.currentPrice, tt.isLong)
			if result != tt.expected {
				t.Errorf("CalculatePnLPercent() = %f, want %f", result, tt.expected)
			}
		})
	}
}

func TestShouldTriggerStopLoss(t *testing.T) {
	tests := []struct {
		name         string
		currentPrice float64
		stopLoss     float64
		isLong       bool
		expected     bool
	}{
		{"Long stop loss triggered", 95.0, 100.0, true, true},
		{"Long stop loss not triggered", 105.0, 100.0, true, false},
		{"Short stop loss triggered", 105.0, 100.0, false, true},
		{"Short stop loss not triggered", 95.0, 100.0, false, false},
		{"No stop loss", 95.0, 0, true, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ShouldTriggerStopLoss(tt.currentPrice, tt.stopLoss, tt.isLong)
			if result != tt.expected {
				t.Errorf("ShouldTriggerStopLoss() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestShouldTriggerTakeProfit(t *testing.T) {
	tests := []struct {
		name         string
		currentPrice float64
		takeProfit   float64
		isLong       bool
		expected     bool
	}{
		{"Long take profit triggered", 105.0, 100.0, true, true},
		{"Long take profit not triggered", 95.0, 100.0, true, false},
		{"Short take profit triggered", 95.0, 100.0, false, true},
		{"Short take profit not triggered", 105.0, 100.0, false, false},
		{"No take profit", 105.0, 0, true, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ShouldTriggerTakeProfit(tt.currentPrice, tt.takeProfit, tt.isLong)
			if result != tt.expected {
				t.Errorf("ShouldTriggerTakeProfit() = %v, want %v", result, tt.expected)
			}
		})
	}
}

func TestValidateSymbol(t *testing.T) {
	tests := []struct {
		symbol   string
		expected bool
	}{
		{"BTCUSDT", true},
		{"ETHUSDT", true},
		{"BTC", false},
		{"USDT", false},
		{"", false},
	}

	for _, tt := range tests {
		result := ValidateSymbol(tt.symbol)
		if result != tt.expected {
			t.Errorf("ValidateSymbol(%s) = %v, want %v", tt.symbol, result, tt.expected)
		}
	}
}

func TestValidatePrice(t *testing.T) {
	tests := []struct {
		price    float64
		expected bool
	}{
		{100.0, true},
		{0.1, true},
		{0, false},
		{-10, false},
	}

	for _, tt := range tests {
		result := ValidatePrice(tt.price)
		if result != tt.expected {
			t.Errorf("ValidatePrice(%f) = %v, want %v", tt.price, result, tt.expected)
		}
	}
}

func TestExponentialBackoff(t *testing.T) {
	baseDelay := 1 * time.Second

	tests := []struct {
		attempt  int
		minDelay time.Duration
		maxDelay time.Duration
	}{
		{0, 1 * time.Second, 1 * time.Second},
		{1, 2 * time.Second, 2 * time.Second},
		{2, 4 * time.Second, 4 * time.Second},
		{3, 8 * time.Second, 8 * time.Second},
	}

	for _, tt := range tests {
		result := ExponentialBackoff(tt.attempt, baseDelay)
		if result < tt.minDelay || result > tt.maxDelay {
			t.Errorf("ExponentialBackoff(%d) = %v, want between %v and %v",
				tt.attempt, result, tt.minDelay, tt.maxDelay)
		}
	}
}

func TestMinMaxFloat(t *testing.T) {
	if MinFloat(5.0, 10.0) != 5.0 {
		t.Error("MinFloat(5.0, 10.0) should return 5.0")
	}

	if MaxFloat(5.0, 10.0) != 10.0 {
		t.Error("MaxFloat(5.0, 10.0) should return 10.0")
	}
}

func TestCalculateNextCheckTime(t *testing.T) {
	before := time.Now()
	result := CalculateNextCheckTime(300) // 5 minutes
	after := time.Now().Add(6 * time.Minute)

	if result.Before(before) || result.After(after) {
		t.Error("CalculateNextCheckTime should return time in the future")
	}
}
