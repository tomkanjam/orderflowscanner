package monitoring

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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

	// Subscribe to candle CLOSE events (not candle open)
	candleCloseCh := e.eventBus.SubscribeCandleClose()

	// Start candle close event handler
	e.wg.Add(1)
	go e.candleCloseEventLoop(candleCloseCh)

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

// candleCloseEventLoop processes candle close events and triggers reanalysis
func (e *Engine) candleCloseEventLoop(candleCloseCh <-chan *eventbus.CandleCloseEvent) {
	defer e.wg.Done()

	log.Printf("[MonitoringEngine] Candle close event loop started")

	for {
		select {
		case <-e.ctx.Done():
			log.Printf("[MonitoringEngine] Candle close event loop stopped")
			return

		case event, ok := <-candleCloseCh:
			if !ok {
				log.Printf("[MonitoringEngine] Candle close channel closed")
				return
			}

			e.handleCandleCloseEvent(event)
		}
	}
}

// handleCandleCloseEvent processes a single candle close event
func (e *Engine) handleCandleCloseEvent(event *eventbus.CandleCloseEvent) {
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

// reanalyzeSignal triggers reanalysis of a monitored signal via llm-proxy
func (e *Engine) reanalyzeSignal(monitor *MonitoringState) {
	log.Printf("[MonitoringEngine] Reanalyzing signal %s (%s/%s, count: %d/%d)",
		monitor.SignalID, monitor.Symbol, monitor.Interval,
		monitor.ReanalysisCount+1, monitor.MaxReanalyses)

	// Fetch trader strategy from database
	strategy, err := e.fetchTraderStrategy(monitor.TraderID)
	if err != nil {
		log.Printf("[MonitoringEngine] Error fetching trader strategy: %v", err)
		return
	}

	// Get latest ticker price
	ticker, err := e.binance.GetTicker(e.ctx, monitor.Symbol)
	if err != nil {
		log.Printf("[MonitoringEngine] Error fetching ticker: %v", err)
		return
	}

	// Call llm-proxy directly (same as database trigger does)
	if err := e.callLLMProxy(monitor, strategy, ticker.LastPrice); err != nil {
		log.Printf("[MonitoringEngine] Error calling llm-proxy: %v", err)
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

// fetchTraderStrategy fetches trader strategy JSONB from database
func (e *Engine) fetchTraderStrategy(traderID string) (interface{}, error) {
	baseURL := e.config.SupabaseURL
	url := fmt.Sprintf("%s/rest/v1/traders?id=eq.%s&select=strategy", baseURL, traderID)

	req, err := http.NewRequestWithContext(e.ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("apikey", e.config.SupabaseServiceKey)
	req.Header.Set("Authorization", "Bearer "+e.config.SupabaseServiceKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("supabase API error: %s - %s", resp.Status, string(body))
	}

	var traders []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&traders); err != nil {
		return nil, fmt.Errorf("failed to decode trader: %w", err)
	}

	if len(traders) == 0 {
		return nil, fmt.Errorf("trader not found: %s", traderID)
	}

	strategy, ok := traders[0]["strategy"]
	if !ok {
		return nil, fmt.Errorf("trader has no strategy field")
	}

	return strategy, nil
}

// callLLMProxy makes HTTP call to llm-proxy Edge Function for signal analysis
func (e *Engine) callLLMProxy(monitor *MonitoringState, strategy interface{}, currentPrice float64) error {
	// Build llm-proxy endpoint URL
	edgeFunctionURL := e.config.SupabaseURL + "/functions/v1/llm-proxy"

	// Build request payload matching database trigger format
	payload := map[string]interface{}{
		"operation": "analyze-signal",
		"params": map[string]interface{}{
			"signalId":  monitor.SignalID,
			"symbol":    monitor.Symbol,
			"traderId":  monitor.TraderID,
			"userId":    monitor.UserID,
			"timestamp": time.Now().Unix(),
			"price":     currentPrice,
			"strategy":  strategy, // Full strategy JSONB object
		},
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	// Create HTTP request
	req, err := http.NewRequestWithContext(e.ctx, "POST", edgeFunctionURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers (service role authentication)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+e.config.SupabaseServiceKey)
	req.Header.Set("x-trigger-source", "monitoring-engine")
	req.Header.Set("x-correlation-id", monitor.SignalID)

	// Execute request
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	// Check response status
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("llm-proxy error: %s - %s", resp.Status, string(body))
	}

	log.Printf("[MonitoringEngine] ✅ llm-proxy analysis completed for signal %s", monitor.SignalID)
	return nil
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
