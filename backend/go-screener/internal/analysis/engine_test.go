package analysis

import (
	"context"
	"testing"
	"time"

	"github.com/vyx/go-screener/pkg/types"
)

// TestNewEngine tests engine creation
func TestNewEngine(t *testing.T) {
	config := DefaultConfig()
	config.OpenRouterAPIKey = "test-key"

	engine, err := NewEngine(config, nil)
	if err != nil {
		t.Fatalf("Failed to create engine: %v", err)
	}

	if engine == nil {
		t.Fatal("Engine is nil")
	}

	if engine.config != config {
		t.Error("Config not set correctly")
	}

	if engine.calculator == nil {
		t.Error("Calculator not initialized")
	}

	if engine.prompter == nil {
		t.Error("Prompter not initialized")
	}

	if engine.openRouter == nil {
		t.Error("OpenRouter client not initialized")
	}
}

// TestQueueAnalysis tests queuing analysis requests
func TestQueueAnalysis(t *testing.T) {
	config := DefaultConfig()
	config.OpenRouterAPIKey = "test-key"
	config.QueueSize = 10

	engine, err := NewEngine(config, nil)
	if err != nil {
		t.Fatalf("Failed to create engine: %v", err)
	}

	req := &AnalysisRequest{
		SignalID: "test-signal-1",
		TraderID: "test-trader-1",
		UserID:   "test-user-1",
		Symbol:   "BTCUSDT",
		Interval: "5m",
	}

	// Queue should succeed
	err = engine.QueueAnalysis(req)
	if err != nil {
		t.Errorf("Failed to queue analysis: %v", err)
	}

	// Check queue depth
	if engine.GetQueueDepth() != 1 {
		t.Errorf("Expected queue depth 1, got %d", engine.GetQueueDepth())
	}

	// Queue more to test capacity
	for i := 0; i < config.QueueSize; i++ {
		req := &AnalysisRequest{
			SignalID: string(rune('a' + i)),
		}
		_ = engine.QueueAnalysis(req)
	}

	// Should be at capacity
	if engine.GetQueueDepth() != engine.GetQueueCapacity() {
		t.Logf("Queue at capacity: %d/%d", engine.GetQueueDepth(), engine.GetQueueCapacity())
	}
}

// TestCalculatorWithRealData tests indicator calculation with sample data
func TestCalculatorWithRealData(t *testing.T) {
	calculator := NewCalculator(100)

	// Create sample klines
	klines := make([]types.Kline, 50)
	for i := range klines {
		klines[i] = types.Kline{
			OpenTime: int64(i * 60000),
			Open:     50000.0 + float64(i)*10,
			High:     50100.0 + float64(i)*10,
			Low:      49900.0 + float64(i)*10,
			Close:    50050.0 + float64(i)*10,
			Volume:   1000.0 + float64(i),
		}
	}

	// Create trader with RSI indicator
	trader := &types.Trader{
		Filter: types.TraderFilter{
			Indicators: []types.IndicatorConfig{
				{
					Name: "RSI",
					Params: map[string]interface{}{
						"period": 14.0,
					},
				},
			},
		},
	}

	req := &AnalysisRequest{
		Trader: trader,
		Interval: "5m",
		MarketData: &types.MarketData{
			Klines: map[string][]types.Kline{
				"5m": klines,
			},
		},
	}

	indicators, err := calculator.CalculateIndicators(req)
	if err != nil {
		t.Fatalf("Failed to calculate indicators: %v", err)
	}

	if len(indicators) != 1 {
		t.Errorf("Expected 1 indicator, got %d", len(indicators))
	}

	rsi, ok := indicators["RSI"]
	if !ok {
		t.Error("RSI not calculated")
	}

	t.Logf("RSI calculated: %+v", rsi)
}

// TestPrompterFormatting tests prompt building
func TestPrompterFormatting(t *testing.T) {
	prompter := NewPrompter()

	trader := &types.Trader{
		Filter: types.TraderFilter{
			Description: []string{"Buy when RSI < 30"},
		},
	}

	req := &AnalysisRequest{
		Trader:   trader,
		Symbol:   "BTCUSDT",
		Interval: "5m",
		MarketData: &types.MarketData{
			Ticker: &types.SimplifiedTicker{
				LastPrice:          50000.0,
				PriceChangePercent: 2.5,
				QuoteVolume:        1500000000.0,
			},
			Klines: map[string][]types.Kline{
				"5m": {
					{Open: 49900, High: 50100, Low: 49800, Close: 50000, Volume: 100},
					{Open: 50000, High: 50200, Low: 49900, Close: 50100, Volume: 120},
				},
			},
		},
	}

	indicators := map[string]interface{}{
		"RSI": map[string]interface{}{
			"value": 28.5,
			"period": 14,
		},
	}

	prompt, err := prompter.BuildAnalysisPrompt(req, indicators)
	if err != nil {
		t.Fatalf("Failed to build prompt: %v", err)
	}

	if prompt == "" {
		t.Error("Prompt is empty")
	}

	// Check that prompt contains key elements
	expectedStrings := []string{
		"STRATEGY:",
		"Buy when RSI < 30",
		"SYMBOL: BTCUSDT",
		"CURRENT PRICE:",
		"TECHNICAL INDICATORS:",
		"RSI",
	}

	for _, expected := range expectedStrings {
		if !contains(prompt, expected) {
			t.Errorf("Prompt missing expected string: %s", expected)
		}
	}

	t.Logf("Generated prompt:\n%s", prompt)
}

// TestEngineStartStop tests engine lifecycle
func TestEngineStartStop(t *testing.T) {
	config := DefaultConfig()
	config.OpenRouterAPIKey = "test-key"
	config.WorkerCount = 2

	engine, err := NewEngine(config, nil)
	if err != nil {
		t.Fatalf("Failed to create engine: %v", err)
	}

	// Start engine
	err = engine.Start()
	if err != nil {
		t.Fatalf("Failed to start engine: %v", err)
	}

	// Let it run briefly
	time.Sleep(100 * time.Millisecond)

	// Stop engine
	err = engine.Stop()
	if err != nil {
		t.Fatalf("Failed to stop engine: %v", err)
	}
}

// TestEngineWithTimeout tests context cancellation
func TestEngineWithTimeout(t *testing.T) {
	config := DefaultConfig()
	config.OpenRouterAPIKey = "test-key"
	config.WorkerCount = 1

	engine, err := NewEngine(config, nil)
	if err != nil {
		t.Fatalf("Failed to create engine: %v", err)
	}

	// Start engine
	err = engine.Start()
	if err != nil {
		t.Fatalf("Failed to start engine: %v", err)
	}

	// Create context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()

	// Wait for context to expire
	<-ctx.Done()

	// Stop engine
	err = engine.Stop()
	if err != nil {
		t.Fatalf("Failed to stop engine: %v", err)
	}
}

// Helper function
func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > len(substr) && findSubstring(s, substr))
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

// Benchmark tests
func BenchmarkCalculateIndicators(b *testing.B) {
	calculator := NewCalculator(100)

	klines := make([]types.Kline, 250)
	for i := range klines {
		klines[i] = types.Kline{
			Close:  50000.0 + float64(i),
			Volume: 1000.0,
		}
	}

	trader := &types.Trader{
		Filter: types.TraderFilter{
			Indicators: []types.IndicatorConfig{
				{Name: "RSI", Params: map[string]interface{}{"period": 14.0}},
				{Name: "MACD", Params: map[string]interface{}{"shortPeriod": 12.0, "longPeriod": 26.0, "signalPeriod": 9.0}},
			},
		},
	}

	req := &AnalysisRequest{
		Trader:   trader,
		Interval: "5m",
		MarketData: &types.MarketData{
			Klines: map[string][]types.Kline{"5m": klines},
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = calculator.CalculateIndicators(req)
	}
}

func BenchmarkBuildPrompt(b *testing.B) {
	prompter := NewPrompter()

	req := &AnalysisRequest{
		Trader: &types.Trader{
			Filter: types.TraderFilter{
				Description: []string{"Test strategy"},
			},
		},
		Symbol:   "BTCUSDT",
		Interval: "5m",
		MarketData: &types.MarketData{
			Ticker: &types.SimplifiedTicker{
				LastPrice:          50000.0,
				PriceChangePercent: 2.5,
				QuoteVolume:        1000000.0,
			},
			Klines: map[string][]types.Kline{
				"5m": make([]types.Kline, 10),
			},
		},
	}

	indicators := map[string]interface{}{
		"RSI": 50.0,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = prompter.BuildAnalysisPrompt(req, indicators)
	}
}
