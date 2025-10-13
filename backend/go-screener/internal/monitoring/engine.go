package monitoring

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/vyx/go-screener/internal/analysis"
	"github.com/vyx/go-screener/internal/eventbus"
	"github.com/vyx/go-screener/pkg/types"
)

// Engine manages monitoring of signals and triggers reanalysis
type Engine struct {
	config       *Config
	registry     *Registry
	analysisEng  AnalysisEngine // Interface for analysis operations
	eventBus     *eventbus.EventBus
	supabase     SupabaseClient // Interface for database operations
	binance      BinanceClient  // Interface for market data

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// AnalysisEngine interface for queuing analysis
type AnalysisEngine interface {
	QueueAnalysis(req *analysis.AnalysisRequest) error
}

// SupabaseClient interface for database operations
type SupabaseClient interface {
	LoadActiveMonitors(ctx context.Context) ([]*MonitoringState, error)
	SaveMonitoringState(ctx context.Context, state *MonitoringState) error
	UpdateSignalStatus(ctx context.Context, signalID string, status string) error
	GetTrader(ctx context.Context, traderID string) (*types.Trader, error)
}

// BinanceClient interface for market data
type BinanceClient interface {
	GetKlines(ctx context.Context, symbol, interval string, limit int) ([]types.Kline, error)
	GetTicker(ctx context.Context, symbol string) (*types.SimplifiedTicker, error)
}

// NewEngine creates a new monitoring engine
func NewEngine(
	config *Config,
	analysisEng AnalysisEngine,
	eventBus *eventbus.EventBus,
	supabase SupabaseClient,
	binance BinanceClient,
) *Engine {
	if config == nil {
		config = DefaultConfig()
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Engine{
		config:      config,
		registry:    NewRegistry(),
		analysisEng: analysisEng,
		eventBus:    eventBus,
		supabase:    supabase,
		binance:     binance,
		ctx:         ctx,
		cancel:      cancel,
	}
}

// Start initializes the monitoring engine
func (e *Engine) Start() error {
	log.Printf("[MonitoringEngine] Starting...")

	// Load active monitors from database on startup
	if e.config.LoadOnStartup {
		if err := e.loadActiveMonitors(); err != nil {
			log.Printf("[MonitoringEngine] Warning: Failed to load monitors: %v", err)
			// Continue anyway - not fatal
		}
	}

	// Subscribe to candle events
	candleCh := e.eventBus.SubscribeCandles()

	// Start candle event handler
	e.wg.Add(1)
	go e.candleEventLoop(candleCh)

	// Start periodic cleanup of inactive monitors
	e.wg.Add(1)
	go e.cleanupLoop()

	log.Printf("[MonitoringEngine] ✅ Started with %d active monitors",
		e.registry.CountActive())

	return nil
}

// Stop gracefully shuts down the monitoring engine
func (e *Engine) Stop() error {
	log.Printf("[MonitoringEngine] Shutting down...")

	// Cancel context to stop all goroutines
	e.cancel()

	// Wait for all goroutines to finish
	e.wg.Wait()

	log.Printf("[MonitoringEngine] ✅ Stopped successfully")
	return nil
}

// AddMonitor adds a signal to monitoring
func (e *Engine) AddMonitor(monitor *MonitoringState) error {
	// Set max reanalyses from config if not set
	if monitor.MaxReanalyses == 0 {
		monitor.MaxReanalyses = e.config.MaxReanalyses
	}

	// Add to registry
	if err := e.registry.Add(monitor); err != nil {
		return fmt.Errorf("add to registry: %w", err)
	}

	// Persist to database
	if err := e.supabase.SaveMonitoringState(e.ctx, monitor); err != nil {
		log.Printf("[MonitoringEngine] Warning: Failed to save monitor to DB: %v", err)
		// Don't fail - monitor is in memory
	}

	return nil
}

// loadActiveMonitors loads active monitors from database on startup
func (e *Engine) loadActiveMonitors() error {
	log.Printf("[MonitoringEngine] Loading active monitors from database...")

	monitors, err := e.supabase.LoadActiveMonitors(e.ctx)
	if err != nil {
		return fmt.Errorf("load from database: %w", err)
	}

	for _, monitor := range monitors {
		if err := e.registry.Add(monitor); err != nil {
			log.Printf("[MonitoringEngine] Warning: Failed to add monitor %s: %v",
				monitor.SignalID, err)
			continue
		}
	}

	log.Printf("[MonitoringEngine] Loaded %d active monitors", len(monitors))
	return nil
}

// candleEventLoop processes candle events and triggers reanalysis
func (e *Engine) candleEventLoop(candleCh <-chan *eventbus.CandleEvent) {
	defer e.wg.Done()

	log.Printf("[MonitoringEngine] Candle event loop started")

	for {
		select {
		case <-e.ctx.Done():
			log.Printf("[MonitoringEngine] Candle event loop stopped")
			return

		case event, ok := <-candleCh:
			if !ok {
				log.Printf("[MonitoringEngine] Candle channel closed")
				return
			}

			e.handleCandleEvent(event)
		}
	}
}

// handleCandleEvent processes a single candle event
func (e *Engine) handleCandleEvent(event *eventbus.CandleEvent) {
	// Find monitors matching this interval
	// Note: We use wildcard symbol (*) to match all symbols
	monitors := e.registry.GetActive()

	matched := 0
	for _, monitor := range monitors {
		// Match by interval only (executor already filtered by symbol)
		if monitor.Interval == event.Interval {
			matched++

			// Check if we should reanalyze this monitor
			if e.shouldReanalyze(monitor) {
				// Reanalyze in goroutine to avoid blocking
				go e.reanalyzeSignal(monitor)
			}
		}
	}

	if matched > 0 {
		log.Printf("[MonitoringEngine] 📊 Candle %s: matched %d monitors",
			event.Interval, matched)
	}
}

// shouldReanalyze determines if a monitor should be reanalyzed
func (e *Engine) shouldReanalyze(monitor *MonitoringState) bool {
	// Check if max reanalyses reached
	if monitor.ReanalysisCount >= monitor.MaxReanalyses {
		log.Printf("[MonitoringEngine] Signal %s expired (max reanalyses: %d)",
			monitor.SignalID, monitor.MaxReanalyses)
		e.expireMonitor(monitor.SignalID)
		return false
	}

	// Check minimum time since last reanalysis
	if e.config.ReanalysisInterval > 0 {
		timeSince := time.Since(monitor.LastReanalysisAt)
		if timeSince < e.config.ReanalysisInterval {
			return false
		}
	}

	// All checks passed
	return true
}

// reanalyzeSignal triggers reanalysis of a monitored signal
func (e *Engine) reanalyzeSignal(monitor *MonitoringState) {
	log.Printf("[MonitoringEngine] Reanalyzing signal %s (%s/%s, count: %d/%d)",
		monitor.SignalID, monitor.Symbol, monitor.Interval,
		monitor.ReanalysisCount+1, monitor.MaxReanalyses)

	// Fetch latest market data
	marketData, err := e.fetchMarketData(monitor.Symbol, monitor.Interval)
	if err != nil {
		log.Printf("[MonitoringEngine] Error fetching market data: %v", err)
		return
	}

	// Fetch trader config
	trader, err := e.supabase.GetTrader(e.ctx, monitor.TraderID)
	if err != nil {
		log.Printf("[MonitoringEngine] Error fetching trader: %v", err)
		return
	}

	// Queue for analysis
	req := &analysis.AnalysisRequest{
		SignalID:     monitor.SignalID,
		TraderID:     monitor.TraderID,
		UserID:       monitor.UserID,
		Symbol:       monitor.Symbol,
		Interval:     monitor.Interval,
		MarketData:   marketData,
		Trader:       trader,
		IsReanalysis: true,
		QueuedAt:     time.Now(),
	}

	if err := e.analysisEng.QueueAnalysis(req); err != nil {
		log.Printf("[MonitoringEngine] Error queueing analysis: %v", err)
		return
	}

	// Update monitor state
	monitor.LastReanalysisAt = time.Now()
	monitor.ReanalysisCount++

	if err := e.registry.Update(monitor); err != nil {
		log.Printf("[MonitoringEngine] Error updating registry: %v", err)
	}

	// Persist to database
	if err := e.supabase.SaveMonitoringState(e.ctx, monitor); err != nil {
		log.Printf("[MonitoringEngine] Warning: Failed to save monitor state: %v", err)
	}
}

// fetchMarketData retrieves current market data for a symbol
func (e *Engine) fetchMarketData(symbol, interval string) (*types.MarketData, error) {
	ctx, cancel := context.WithTimeout(e.ctx, 10*time.Second)
	defer cancel()

	// Fetch ticker
	ticker, err := e.binance.GetTicker(ctx, symbol)
	if err != nil {
		return nil, fmt.Errorf("get ticker: %w", err)
	}

	// Fetch klines (100 bars default for reanalysis)
	klines, err := e.binance.GetKlines(ctx, symbol, interval, 100)
	if err != nil {
		return nil, fmt.Errorf("get klines: %w", err)
	}

	marketData := &types.MarketData{
		Symbol:    symbol,
		Timestamp: time.Now(),
		Ticker:    ticker,
		Klines:    map[string][]types.Kline{interval: klines},
	}

	return marketData, nil
}

// expireMonitor marks a monitor as expired after max reanalyses
func (e *Engine) expireMonitor(signalID string) {
	log.Printf("[MonitoringEngine] Expiring signal %s", signalID)

	// Deactivate in registry
	if err := e.registry.Deactivate(signalID); err != nil {
		log.Printf("[MonitoringEngine] Error deactivating monitor: %v", err)
	}

	// Update signal status to expired
	if err := e.supabase.UpdateSignalStatus(e.ctx, signalID, "expired"); err != nil {
		log.Printf("[MonitoringEngine] Error updating signal status: %v", err)
	}
}

// cleanupLoop periodically removes old inactive monitors
func (e *Engine) cleanupLoop() {
	defer e.wg.Done()

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-e.ctx.Done():
			return

		case <-ticker.C:
			// Remove inactive monitors older than 24 hours
			e.registry.Cleanup(e.ctx, 24*time.Hour)
		}
	}
}

// GetMonitor retrieves a monitor by signal ID
func (e *Engine) GetMonitor(signalID string) (*MonitoringState, bool) {
	return e.registry.Get(signalID)
}

// GetActiveCount returns the number of active monitors
func (e *Engine) GetActiveCount() int {
	return e.registry.CountActive()
}
