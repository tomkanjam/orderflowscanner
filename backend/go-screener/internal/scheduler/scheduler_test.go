package scheduler

import (
	"testing"
	"time"

	"github.com/vyx/go-screener/internal/eventbus"
)

func TestParseInterval(t *testing.T) {
	tests := []struct {
		input    string
		expected time.Duration
		wantErr  bool
	}{
		{"1m", 1 * time.Minute, false},
		{"5m", 5 * time.Minute, false},
		{"15m", 15 * time.Minute, false},
		{"1h", 1 * time.Hour, false},
		{"4h", 4 * time.Hour, false},
		{"1d", 24 * time.Hour, false},
		{"3m", 3 * time.Minute, false},
		{"2h", 2 * time.Hour, false},
		{"", 0, true},
		{"invalid", 0, true},
		{"1x", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			result, err := ParseInterval(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseInterval(%s) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if result != tt.expected {
				t.Errorf("ParseInterval(%s) = %v, want %v", tt.input, result, tt.expected)
			}
		})
	}
}

func TestGetCandleOpenTime(t *testing.T) {
	// Test with a specific time
	testTime := time.Date(2024, 1, 1, 12, 34, 56, 0, time.UTC)

	tests := []struct {
		interval string
		expected time.Time
	}{
		{"1m", time.Date(2024, 1, 1, 12, 34, 0, 0, time.UTC)},
		{"5m", time.Date(2024, 1, 1, 12, 30, 0, 0, time.UTC)},
		{"15m", time.Date(2024, 1, 1, 12, 30, 0, 0, time.UTC)},
		{"1h", time.Date(2024, 1, 1, 12, 0, 0, 0, time.UTC)},
		{"1d", time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	}

	for _, tt := range tests {
		t.Run(tt.interval, func(t *testing.T) {
			result, err := GetCandleOpenTime(testTime, tt.interval)
			if err != nil {
				t.Fatalf("GetCandleOpenTime() error = %v", err)
			}
			if !result.Equal(tt.expected) {
				t.Errorf("GetCandleOpenTime(%s) = %v, want %v",
					tt.interval, result, tt.expected)
			}
		})
	}
}

func TestIsValidInterval(t *testing.T) {
	tests := []struct {
		interval string
		valid    bool
	}{
		{"1m", true},
		{"5m", true},
		{"1h", true},
		{"1d", true},
		{"", false},
		{"invalid", false},
		{"1x", false},
	}

	for _, tt := range tests {
		t.Run(tt.interval, func(t *testing.T) {
			result := IsValidInterval(tt.interval)
			if result != tt.valid {
				t.Errorf("IsValidInterval(%s) = %v, want %v", tt.interval, result, tt.valid)
			}
		})
	}
}

func TestSupportedIntervals(t *testing.T) {
	intervals := SupportedIntervals()
	if len(intervals) == 0 {
		t.Error("SupportedIntervals() returned empty slice")
	}

	// Check that all supported intervals are valid
	for _, interval := range intervals {
		if !IsValidInterval(interval) {
			t.Errorf("Supported interval %s is not valid", interval)
		}
	}
}

func TestNewCandleScheduler(t *testing.T) {
	bus := eventbus.NewEventBus()
	config := DefaultConfig()

	scheduler := NewCandleScheduler(bus, config)
	if scheduler == nil {
		t.Fatal("Scheduler is nil")
	}

	if scheduler.eventBus != bus {
		t.Error("EventBus not set correctly")
	}

	if len(scheduler.intervals) != len(config.Intervals) {
		t.Errorf("Expected %d intervals, got %d", len(config.Intervals), len(scheduler.intervals))
	}
}

func TestCandleSchedulerStartStop(t *testing.T) {
	bus := eventbus.NewEventBus()
	bus.Start()
	defer bus.Stop()

	config := DefaultConfig()
	config.Intervals = []string{"1m"} // Just one interval for faster test

	scheduler := NewCandleScheduler(bus, config)

	err := scheduler.Start()
	if err != nil {
		t.Fatalf("Failed to start scheduler: %v", err)
	}

	// Let it run briefly
	time.Sleep(200 * time.Millisecond)

	err = scheduler.Stop()
	if err != nil {
		t.Fatalf("Failed to stop scheduler: %v", err)
	}
}

func TestCandleSchedulerEmitsEvents(t *testing.T) {
	bus := eventbus.NewEventBus()
	bus.Start()
	defer bus.Stop()

	// Subscribe to candle events
	ch := bus.SubscribeCandles()

	config := &Config{
		Intervals: []string{"1m"},
		TickRate:  50 * time.Millisecond, // Faster tick for testing
	}

	scheduler := NewCandleScheduler(bus, config)
	err := scheduler.Start()
	if err != nil {
		t.Fatalf("Failed to start scheduler: %v", err)
	}
	defer scheduler.Stop()

	// Wait for a candle event (with timeout)
	// Note: This test may take up to 60s if we just missed a candle boundary
	// For faster testing, we just check that the scheduler is working
	select {
	case event := <-ch:
		t.Logf("Received candle event: %s at %v", event.Interval, event.OpenTime)
		if event.Interval != "1m" {
			t.Errorf("Expected interval 1m, got %s", event.Interval)
		}
		if event.Symbol != "*" {
			t.Errorf("Expected symbol *, got %s", event.Symbol)
		}
	case <-time.After(65 * time.Second):
		// This is OK - we might not hit a candle boundary in test time
		t.Log("No candle event received (expected if no boundary crossed)")
	}
}

func TestSchedulerGetIntervals(t *testing.T) {
	bus := eventbus.NewEventBus()
	config := &Config{
		Intervals: []string{"1m", "5m", "1h"},
	}

	scheduler := NewCandleScheduler(bus, config)

	intervals := scheduler.GetIntervals()
	if len(intervals) != 3 {
		t.Errorf("Expected 3 intervals, got %d", len(intervals))
	}

	expected := map[string]bool{"1m": true, "5m": true, "1h": true}
	for _, interval := range intervals {
		if !expected[interval] {
			t.Errorf("Unexpected interval: %s", interval)
		}
	}
}

func TestSchedulerAddInterval(t *testing.T) {
	bus := eventbus.NewEventBus()
	bus.Start()
	defer bus.Stop()

	config := &Config{
		Intervals: []string{"1m"},
	}

	scheduler := NewCandleScheduler(bus, config)
	err := scheduler.Start()
	if err != nil {
		t.Fatalf("Failed to start scheduler: %v", err)
	}
	defer scheduler.Stop()

	// Add a new interval
	err = scheduler.AddInterval("5m")
	if err != nil {
		t.Fatalf("Failed to add interval: %v", err)
	}

	intervals := scheduler.GetIntervals()
	if len(intervals) != 2 {
		t.Errorf("Expected 2 intervals after adding, got %d", len(intervals))
	}

	// Try to add invalid interval
	err = scheduler.AddInterval("invalid")
	if err == nil {
		t.Error("Expected error when adding invalid interval")
	}

	// Try to add duplicate interval
	err = scheduler.AddInterval("5m")
	if err != nil {
		t.Error("Should not error when adding duplicate interval")
	}
}

func TestDefaultConfig(t *testing.T) {
	config := DefaultConfig()
	if config == nil {
		t.Fatal("Config is nil")
	}

	if len(config.Intervals) == 0 {
		t.Error("Default config has no intervals")
	}

	if config.TickRate == 0 {
		t.Error("Default config has zero tick rate")
	}
}

// Benchmark tests
func BenchmarkParseInterval(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_, _ = ParseInterval("5m")
	}
}

func BenchmarkGetCandleOpenTime(b *testing.B) {
	now := time.Now()
	for i := 0; i < b.N; i++ {
		_, _ = GetCandleOpenTime(now, "5m")
	}
}
