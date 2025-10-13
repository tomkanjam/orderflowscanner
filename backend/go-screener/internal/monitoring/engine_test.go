package monitoring

import (
	"context"
	"testing"
	"time"

	"github.com/vyx/go-screener/internal/analysis"
	"github.com/vyx/go-screener/internal/eventbus"
	"github.com/vyx/go-screener/pkg/types"
)

// Mock implementations for testing

type mockSupabaseClient struct {
	monitors       []*MonitoringState
	savedMonitors  []*MonitoringState
	updatedSignals map[string]string
	traders        map[string]*types.Trader
}

func (m *mockSupabaseClient) LoadActiveMonitors(ctx context.Context) ([]*MonitoringState, error) {
	return m.monitors, nil
}

func (m *mockSupabaseClient) SaveMonitoringState(ctx context.Context, state *MonitoringState) error {
	m.savedMonitors = append(m.savedMonitors, state)
	return nil
}

func (m *mockSupabaseClient) UpdateSignalStatus(ctx context.Context, signalID string, status string) error {
	if m.updatedSignals == nil {
		m.updatedSignals = make(map[string]string)
	}
	m.updatedSignals[signalID] = status
	return nil
}

func (m *mockSupabaseClient) GetTrader(ctx context.Context, traderID string) (*types.Trader, error) {
	if trader, ok := m.traders[traderID]; ok {
		return trader, nil
	}
	return &types.Trader{ID: traderID}, nil
}

type mockBinanceClient struct{}

func (m *mockBinanceClient) GetKlines(ctx context.Context, symbol, interval string, limit int) ([]types.Kline, error) {
	klines := make([]types.Kline, limit)
	for i := 0; i < limit; i++ {
		klines[i] = types.Kline{
			OpenTime:  time.Now().Add(-time.Duration(limit-i) * time.Minute).UnixMilli(),
			Open:      43000.0,
			High:      43100.0,
			Low:       42900.0,
			Close:     43050.0,
			Volume:    100.0,
			CloseTime: time.Now().Add(-time.Duration(limit-i-1) * time.Minute).UnixMilli(),
		}
	}
	return klines, nil
}

func (m *mockBinanceClient) GetTicker(ctx context.Context, symbol string) (*types.SimplifiedTicker, error) {
	return &types.SimplifiedTicker{
		LastPrice:          43050.0,
		PriceChangePercent: 2.5,
		QuoteVolume:        1000000.0,
	}, nil
}

func TestNewEngine(t *testing.T) {
	bus := eventbus.NewEventBus()
	analysisEng := &analysis.Engine{} // Mock
	supabase := &mockSupabaseClient{}
	binance := &mockBinanceClient{}

	engine := NewEngine(nil, analysisEng, bus, supabase, binance)
	if engine == nil {
		t.Fatal("Engine is nil")
	}

	if engine.config == nil {
		t.Error("Config not set")
	}
	if engine.registry == nil {
		t.Error("Registry not initialized")
	}
}

func TestEngineStartStop(t *testing.T) {
	bus := eventbus.NewEventBus()
	bus.Start()
	defer bus.Stop()

	analysisEng := &analysis.Engine{}
	supabase := &mockSupabaseClient{}
	binance := &mockBinanceClient{}

	config := DefaultConfig()
	config.LoadOnStartup = false // Skip DB load for test

	engine := NewEngine(config, analysisEng, bus, supabase, binance)

	err := engine.Start()
	if err != nil {
		t.Fatalf("Failed to start engine: %v", err)
	}

	// Let it run briefly
	time.Sleep(100 * time.Millisecond)

	err = engine.Stop()
	if err != nil {
		t.Fatalf("Failed to stop engine: %v", err)
	}
}

func TestEngineAddMonitor(t *testing.T) {
	bus := eventbus.NewEventBus()
	analysisEng := &analysis.Engine{}
	supabase := &mockSupabaseClient{}
	binance := &mockBinanceClient{}

	engine := NewEngine(nil, analysisEng, bus, supabase, binance)

	monitor := &MonitoringState{
		SignalID: "signal-123",
		TraderID: "trader-456",
		UserID:   "user-789",
		Symbol:   "BTCUSDT",
		Interval: "5m",
	}

	err := engine.AddMonitor(monitor)
	if err != nil {
		t.Fatalf("Failed to add monitor: %v", err)
	}

	// Verify added to registry
	if engine.GetActiveCount() != 1 {
		t.Errorf("Expected 1 active monitor, got %d", engine.GetActiveCount())
	}

	// Verify saved to DB
	if len(supabase.savedMonitors) != 1 {
		t.Errorf("Expected 1 saved monitor, got %d", len(supabase.savedMonitors))
	}

	// Verify max reanalyses set from config
	if monitor.MaxReanalyses != 5 {
		t.Errorf("Expected max reanalyses 5, got %d", monitor.MaxReanalyses)
	}
}

func TestEngineLoadActiveMonitors(t *testing.T) {
	bus := eventbus.NewEventBus()
	analysisEng := &analysis.Engine{}
	supabase := &mockSupabaseClient{
		monitors: []*MonitoringState{
			{SignalID: "signal-1", Symbol: "BTCUSDT", Interval: "5m"},
			{SignalID: "signal-2", Symbol: "ETHUSDT", Interval: "1h"},
		},
	}
	binance := &mockBinanceClient{}

	config := DefaultConfig()
	config.LoadOnStartup = true

	engine := NewEngine(config, analysisEng, bus, supabase, binance)

	err := engine.Start()
	if err != nil {
		t.Fatalf("Failed to start: %v", err)
	}
	defer engine.Stop()

	// Verify monitors loaded
	if engine.GetActiveCount() != 2 {
		t.Errorf("Expected 2 active monitors, got %d", engine.GetActiveCount())
	}
}

func TestEngineShouldReanalyze(t *testing.T) {
	bus := eventbus.NewEventBus()
	analysisEng := &analysis.Engine{}
	supabase := &mockSupabaseClient{}
	binance := &mockBinanceClient{}

	config := DefaultConfig()
	engine := NewEngine(config, analysisEng, bus, supabase, binance)

	// Test: Monitor below max reanalyses
	monitor := &MonitoringState{
		SignalID:        "signal-1",
		ReanalysisCount: 3,
		MaxReanalyses:   5,
		LastReanalysisAt: time.Now().Add(-2 * time.Minute),
	}

	if !engine.shouldReanalyze(monitor) {
		t.Error("Should reanalyze when below max count")
	}

	// Test: Monitor at max reanalyses
	monitor.ReanalysisCount = 5

	if engine.shouldReanalyze(monitor) {
		t.Error("Should not reanalyze when at max count")
	}

	// Verify expired
	if monitor.IsActive {
		t.Error("Monitor should be deactivated after max reanalyses")
	}
}

func TestEngineHandleCandleEvent(t *testing.T) {
	bus := eventbus.NewEventBus()
	bus.Start()
	defer bus.Stop()

	// Create mock analysis engine that tracks queued requests
	queuedRequests := make(chan *analysis.AnalysisRequest, 10)
	analysisEng := &mockAnalysisEngine{queue: queuedRequests}

	supabase := &mockSupabaseClient{
		traders: map[string]*types.Trader{
			"trader-1": {ID: "trader-1"},
		},
	}
	binance := &mockBinanceClient{}

	config := DefaultConfig()
	config.LoadOnStartup = false

	engine := NewEngine(config, analysisEng, bus, supabase, binance)
	engine.Start()
	defer engine.Stop()

	// Add monitor
	monitor := &MonitoringState{
		SignalID:      "signal-1",
		TraderID:      "trader-1",
		Symbol:        "BTCUSDT",
		Interval:      "5m",
		MaxReanalyses: 5,
	}
	engine.AddMonitor(monitor)

	// Publish candle event
	event := &eventbus.CandleEvent{
		Symbol:   "*",
		Interval: "5m",
		OpenTime: time.Now(),
	}
	bus.PublishCandleEvent(event)

	// Wait for reanalysis to be queued
	select {
	case req := <-queuedRequests:
		if req.SignalID != "signal-1" {
			t.Errorf("Expected signal-1, got %s", req.SignalID)
		}
		if !req.IsReanalysis {
			t.Error("Expected IsReanalysis=true")
		}
	case <-time.After(2 * time.Second):
		t.Error("Timeout waiting for reanalysis")
	}

	// Verify reanalysis count incremented
	retrieved, ok := engine.GetMonitor("signal-1")
	if !ok {
		t.Fatal("Monitor not found")
	}
	if retrieved.ReanalysisCount != 1 {
		t.Errorf("Expected reanalysis count 1, got %d", retrieved.ReanalysisCount)
	}
}

func TestEngineHandleCandleEventDifferentInterval(t *testing.T) {
	bus := eventbus.NewEventBus()
	bus.Start()
	defer bus.Stop()

	queuedRequests := make(chan *analysis.AnalysisRequest, 10)
	analysisEng := &mockAnalysisEngine{queue: queuedRequests}

	supabase := &mockSupabaseClient{
		traders: map[string]*types.Trader{
			"trader-1": {ID: "trader-1"},
		},
	}
	binance := &mockBinanceClient{}

	config := DefaultConfig()
	config.LoadOnStartup = false

	engine := NewEngine(config, analysisEng, bus, supabase, binance)
	engine.Start()
	defer engine.Stop()

	// Add 5m monitor
	monitor := &MonitoringState{
		SignalID:      "signal-1",
		TraderID:      "trader-1",
		Symbol:        "BTCUSDT",
		Interval:      "5m",
		MaxReanalyses: 5,
	}
	engine.AddMonitor(monitor)

	// Publish 1h candle event (different interval)
	event := &eventbus.CandleEvent{
		Symbol:   "*",
		Interval: "1h",
		OpenTime: time.Now(),
	}
	bus.PublishCandleEvent(event)

	// Should not trigger reanalysis
	select {
	case <-queuedRequests:
		t.Error("Should not reanalyze for different interval")
	case <-time.After(500 * time.Millisecond):
		// Expected timeout
	}
}

func TestEngineExpireMonitor(t *testing.T) {
	bus := eventbus.NewEventBus()
	analysisEng := &mockAnalysisEngine{}
	supabase := &mockSupabaseClient{}
	binance := &mockBinanceClient{}

	engine := NewEngine(nil, analysisEng, bus, supabase, binance)

	monitor := &MonitoringState{
		SignalID: "signal-123",
	}
	engine.AddMonitor(monitor)

	// Expire
	engine.expireMonitor("signal-123")

	// Verify deactivated
	retrieved, ok := engine.GetMonitor("signal-123")
	if !ok {
		t.Fatal("Monitor not found")
	}
	if retrieved.IsActive {
		t.Error("Monitor should be inactive")
	}

	// Verify signal status updated
	if supabase.updatedSignals["signal-123"] != "expired" {
		t.Errorf("Expected status 'expired', got '%s'",
			supabase.updatedSignals["signal-123"])
	}
}

// Mock analysis engine for testing
type mockAnalysisEngine struct {
	queue chan *analysis.AnalysisRequest
}

func (m *mockAnalysisEngine) QueueAnalysis(req *analysis.AnalysisRequest) error {
	if m.queue != nil {
		m.queue <- req
	}
	return nil
}

func (m *mockAnalysisEngine) Start() error {
	return nil
}

func (m *mockAnalysisEngine) Stop() error {
	return nil
}
