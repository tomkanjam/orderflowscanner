package timer

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/rs/zerolog/log"
	"golang.org/x/sync/errgroup"
	"github.com/yourusername/trader-machine/internal/database"
	"github.com/yourusername/trader-machine/internal/executor"
	"github.com/yourusername/trader-machine/internal/storage"
	"github.com/yourusername/trader-machine/internal/types"
)

// Manager manages timers for all traders
type Manager struct {
	db            *database.Client
	klineStore    *storage.KlineStore
	wsManager     interface{} // WebSocket manager for ticker data
	executors     map[string]*executor.SignalExecutor
	timers        map[string]*time.Ticker
	stopChannels  map[string]chan struct{}
	analyzeSignal func(context.Context, string, string, types.MarketData) (*types.Decision, error)
	mu            sync.RWMutex
}

// NewManager creates a new timer manager
func NewManager(db *database.Client, klineStore *storage.KlineStore, wsManager interface{}, analyzeSignalFunc func(context.Context, string, string, types.MarketData) (*types.Decision, error)) *Manager {
	return &Manager{
		db:            db,
		klineStore:    klineStore,
		wsManager:     wsManager,
		executors:     make(map[string]*executor.SignalExecutor),
		timers:        make(map[string]*time.Ticker),
		stopChannels:  make(map[string]chan struct{}),
		analyzeSignal: analyzeSignalFunc,
	}
}

// AddTrader adds a trader with its signal executor
func (tm *Manager) AddTrader(trader *types.Trader, exec *executor.SignalExecutor) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	interval, err := parseInterval(trader.CheckInterval)
	if err != nil {
		return err
	}

	ticker := time.NewTicker(interval)
	stopCh := make(chan struct{})

	tm.executors[trader.ID] = exec
	tm.timers[trader.ID] = ticker
	tm.stopChannels[trader.ID] = stopCh

	go tm.run(trader, ticker, stopCh)

	log.Info().
		Str("trader_id", trader.ID).
		Str("interval", trader.CheckInterval).
		Msg("Trader timer started")

	return nil
}

// RemoveTrader removes a trader and stops its timer
func (tm *Manager) RemoveTrader(traderID string) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	if ticker, ok := tm.timers[traderID]; ok {
		ticker.Stop()
	}

	if stopCh, ok := tm.stopChannels[traderID]; ok {
		close(stopCh)
	}

	delete(tm.executors, traderID)
	delete(tm.timers, traderID)
	delete(tm.stopChannels, traderID)

	log.Info().
		Str("trader_id", traderID).
		Msg("Trader timer stopped")
}

// StopAll stops all timers
func (tm *Manager) StopAll() {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	for _, ticker := range tm.timers {
		ticker.Stop()
	}

	for _, stopCh := range tm.stopChannels {
		close(stopCh)
	}

	log.Info().Msg("All trader timers stopped")
}

// run executes signal checks on timer intervals
func (tm *Manager) run(trader *types.Trader, ticker *time.Ticker, stopCh chan struct{}) {
	for {
		select {
		case <-ticker.C:
			tm.executeSignalCheck(trader)
		case <-stopCh:
			return
		}
	}
}

// executeSignalCheck runs signal code for all symbols
func (tm *Manager) executeSignalCheck(trader *types.Trader) {
	startTime := time.Now()
	log.Info().
		Time("timestamp", startTime).
		Str("trader_id", trader.ID).
		Msg("Starting signal check")

	tm.mu.RLock()
	exec := tm.executors[trader.ID]
	tm.mu.RUnlock()

	if exec == nil {
		log.Error().Str("trader_id", trader.ID).Msg("Executor not found")
		return
	}

	// Get symbols to check
	symbols := trader.Symbols
	if len(symbols) == 0 {
		symbols = tm.klineStore.GetSymbols()
	}

	// Execute in parallel for all symbols
	g := new(errgroup.Group)
	for _, symbol := range symbols {
		symbol := symbol // Capture for goroutine
		g.Go(func() error {
			return tm.checkSymbol(trader, exec, symbol)
		})
	}

	if err := g.Wait(); err != nil {
		log.Error().Err(err).Str("trader_id", trader.ID).Msg("Signal check errors occurred")
	}

	log.Info().
		Time("timestamp", time.Now()).
		Str("trader_id", trader.ID).
		Dur("duration", time.Since(startTime)).
		Msg("Signal check completed")
}

// checkSymbol checks if signal matches for a symbol
func (tm *Manager) checkSymbol(trader *types.Trader, exec *executor.SignalExecutor, symbol string) error {
	// Get ticker data (placeholder - would get from wsManager)
	ticker := map[string]interface{}{
		"lastPrice": "50000",
		"volume24h": "1000",
	}

	// Get klines for required timeframes
	klines := make(map[string][][]interface{})
	for _, tf := range trader.Timeframes {
		klines[tf] = tm.klineStore.Get(symbol, tf, 500)
	}

	// Run signal check
	matches, err := exec.CheckSignal(symbol, ticker, klines)
	if err != nil {
		log.Error().
			Err(err).
			Str("trader_id", trader.ID).
			Str("symbol", symbol).
			Msg("Signal check failed")
		return err
	}

	if !matches {
		return nil
	}

	// Signal triggered!
	log.Info().
		Time("timestamp", time.Now()).
		Str("trader_id", trader.ID).
		Str("symbol", symbol).
		Msg("Signal triggered")

	// Create signal record
	signal := &types.Signal{
		ID:           uuid.New().String(),
		TraderID:     trader.ID,
		UserID:       trader.UserID,
		Symbol:       symbol,
		Timestamp:    time.Now(),
		Status:       "new",
		TriggerPrice: 50000, // Would parse from ticker
	}

	if err := tm.db.CreateSignal(context.Background(), signal); err != nil {
		return fmt.Errorf("failed to save signal: %w", err)
	}

	// Call Gemini for analysis
	marketData := types.MarketData{
		Symbol:     symbol,
		Timestamp:  time.Now().Unix(),
		Ticker:     ticker,
		Klines:     klines,
		Indicators: make(map[string]interface{}), // Would calculate indicators
	}

	decision, err := tm.analyzeSignal(context.Background(), trader.ID, signal.ID, marketData)
	if err != nil {
		log.Error().Err(err).Msg("Failed to analyze signal")
		return err
	}

	log.Info().
		Time("timestamp", time.Now()).
		Str("signal_id", signal.ID).
		Str("decision", decision.Decision).
		Msg("Analysis completed")

	// Process decision would happen here (handled by main orchestrator)

	return nil
}

// parseInterval converts interval string to duration
func parseInterval(interval string) (time.Duration, error) {
	if strings.HasSuffix(interval, "_close") {
		// Candle close intervals - use base interval
		tf := strings.TrimSuffix(interval, "_close")
		return parseInterval(tf)
	}

	// Parse duration string
	switch interval {
	case "1s":
		return time.Second, nil
	case "5s":
		return 5 * time.Second, nil
	case "1m":
		return time.Minute, nil
	case "5m":
		return 5 * time.Minute, nil
	case "15m":
		return 15 * time.Minute, nil
	case "1h":
		return time.Hour, nil
	default:
		return time.Minute, fmt.Errorf("unknown interval: %s", interval)
	}
}
