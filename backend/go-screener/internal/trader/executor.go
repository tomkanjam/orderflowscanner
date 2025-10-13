package trader

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/vyx/go-screener/internal/analysis"
	"github.com/vyx/go-screener/internal/eventbus"
	"github.com/vyx/go-screener/pkg/binance"
	"github.com/vyx/go-screener/pkg/supabase"
	"github.com/vyx/go-screener/pkg/types"
	"github.com/vyx/go-screener/pkg/yaegi"
)

// Executor runs trader filter code and generates signals
// EVENT-DRIVEN: Subscribes to candle events instead of timer-based execution
type Executor struct {
	yaegi        *yaegi.Executor
	binance      *binance.Client
	supabase     *supabase.Client
	analysisEng  AnalysisEngine
	eventBus     *eventbus.EventBus

	ctx          context.Context
	cancel       context.CancelFunc
	wg           sync.WaitGroup

	// Active traders
	traders      map[string]*Trader // traderID -> trader
	tradersMu    sync.RWMutex
}

// AnalysisEngine interface for queueing analysis
type AnalysisEngine interface {
	QueueAnalysis(req *analysis.AnalysisRequest) error
}

// NewExecutor creates a new trader executor
func NewExecutor(
	yaegi *yaegi.Executor,
	binance *binance.Client,
	supabase *supabase.Client,
	analysisEng AnalysisEngine,
	eventBus *eventbus.EventBus,
) *Executor {
	ctx, cancel := context.WithCancel(context.Background())

	return &Executor{
		yaegi:       yaegi,
		binance:     binance,
		supabase:    supabase,
		analysisEng: analysisEng,
		eventBus:    eventBus,
		ctx:         ctx,
		cancel:      cancel,
		traders:     make(map[string]*Trader),
	}
}

// Start starts the executor's event loop
func (e *Executor) Start() error {
	log.Printf("[Executor] Starting event-driven executor...")

	// Subscribe to candle events
	candleCh := e.eventBus.SubscribeCandles()

	// Start candle event handler
	e.wg.Add(1)
	go e.candleEventLoop(candleCh)

	log.Printf("[Executor] ✅ Executor started")
	return nil
}

// Stop stops the executor
func (e *Executor) Stop() error {
	log.Printf("[Executor] Shutting down...")

	// Cancel context to stop all goroutines
	e.cancel()

	// Wait for all goroutines to finish
	e.wg.Wait()

	log.Printf("[Executor] ✅ Stopped successfully")
	return nil
}

// AddTrader adds a trader to the executor
// The trader will be triggered on matching candle events
func (e *Executor) AddTrader(trader *Trader) error {
	// Validate trader configuration
	if trader.Config == nil {
		return fmt.Errorf("trader config is nil")
	}

	if trader.Config.FilterCode == "" {
		return fmt.Errorf("trader filter code is empty")
	}

	// Validate filter code before adding
	if err := e.yaegi.ValidateCode(trader.Config.FilterCode); err != nil {
		return fmt.Errorf("invalid filter code: %w", err)
	}

	// Add to active traders
	e.tradersMu.Lock()
	e.traders[trader.ID] = trader
	e.tradersMu.Unlock()

	log.Printf("[Executor] Added trader %s", trader.ID)
	return nil
}

// RemoveTrader removes a trader from the executor
func (e *Executor) RemoveTrader(traderID string) {
	e.tradersMu.Lock()
	delete(e.traders, traderID)
	e.tradersMu.Unlock()

	log.Printf("[Executor] Removed trader %s", traderID)
}

// candleEventLoop processes candle events and triggers traders
func (e *Executor) candleEventLoop(candleCh <-chan *eventbus.CandleEvent) {
	defer e.wg.Done()

	log.Printf("[Executor] Candle event loop started")

	for {
		select {
		case <-e.ctx.Done():
			log.Printf("[Executor] Candle event loop stopped")
			return

		case event, ok := <-candleCh:
			if !ok {
				log.Printf("[Executor] Candle channel closed")
				return
			}

			e.handleCandleEvent(event)
		}
	}
}

// handleCandleEvent processes a single candle event
func (e *Executor) handleCandleEvent(event *eventbus.CandleEvent) {
	// Find traders matching this interval
	e.tradersMu.RLock()
	matchingTraders := make([]*Trader, 0)
	for _, trader := range e.traders {
		// Match traders that use this interval
		if trader.Config.Timeframes != nil {
			for _, tf := range trader.Config.Timeframes {
				if tf == event.Interval {
					matchingTraders = append(matchingTraders, trader)
					break
				}
			}
		}
	}
	e.tradersMu.RUnlock()

	if len(matchingTraders) == 0 {
		return
	}

	log.Printf("[Executor] 📊 Candle %s: matched %d traders",
		event.Interval, len(matchingTraders))

	// Execute each matching trader
	for _, trader := range matchingTraders {
		// Execute in goroutine to avoid blocking
		go e.executeTrader(trader)
	}
}

// executeTrader executes a single trader's filter
func (e *Executor) executeTrader(trader *Trader) {
	// Recover from panics to prevent crashing
	defer func() {
		if r := recover(); r != nil {
			err := fmt.Errorf("panic in trader %s: %v", trader.ID, r)
			log.Printf("[Executor] %v", err)
			_ = trader.SetError(err)
		}
	}()

	// Update last run timestamp
	trader.UpdateLastRunAt()

	// Get symbols to screen
	symbols, err := e.getSymbolsToScreen(trader)
	if err != nil {
		log.Printf("[Executor] Failed to get symbols for trader %s: %v", trader.ID, err)
		_ = trader.SetError(err)
		return
	}

	// Get timeframes from config (default to 5m if not specified)
	timeframes := trader.Config.Timeframes
	if len(timeframes) == 0 {
		timeframes = []string{"5m"}
	}

	// Fetch kline data for all symbols and timeframes
	klineData, err := e.fetchKlineData(symbols, timeframes)
	if err != nil {
		log.Printf("[Executor] Failed to fetch kline data for trader %s: %v", trader.ID, err)
		_ = trader.SetError(err)
		return
	}

	// Execute filter for each symbol
	signals := make([]Signal, 0)

	for _, symbol := range symbols {
		// Check context cancellation
		select {
		case <-e.ctx.Done():
			return
		default:
		}

		// Get ticker data
		ticker, err := e.binance.GetTicker(e.ctx, symbol)
		if err != nil {
			log.Printf("[Executor] Failed to fetch ticker for %s: %v", symbol, err)
			continue
		}

		// Ticker is already in simplified format
		simplifiedTicker := ticker

		// Prepare market data with klines map
		klinesMap := make(map[string][]types.Kline)
		for _, tf := range timeframes {
			if klines, ok := klineData[symbol][tf]; ok {
				klinesMap[tf] = klines
			}
		}

		marketData := &types.MarketData{
			Symbol:    symbol,
			Ticker:    simplifiedTicker,
			Klines:    klinesMap,
			Timestamp: time.Now(),
		}

		// Execute filter with timeout
		timeout := trader.Config.TimeoutPerRun
		if timeout <= 0 {
			timeout = 5 * time.Second // Default: 5 seconds
		}

		matches, err := e.yaegi.ExecuteFilterWithTimeout(trader.Config.FilterCode, marketData, timeout)
		if err != nil {
			log.Printf("[Executor] Filter execution failed for %s: %v", symbol, err)
			continue
		}

		// If matches, create signal
		if matches {
			signal := Signal{
				ID:          fmt.Sprintf("%s-%s-%d", trader.ID, symbol, time.Now().Unix()),
				TraderID:    trader.ID,
				UserID:      trader.UserID,
				Symbol:      symbol,
				TriggeredAt: time.Now(),
				Price:       simplifiedTicker.LastPrice,
				Volume:      simplifiedTicker.QuoteVolume,
				Metadata:    make(map[string]interface{}),
				CreatedAt:   time.Now(),
			}

			signals = append(signals, signal)

			// Check signal limit
			if trader.Config.MaxSignalsPerRun > 0 && len(signals) >= trader.Config.MaxSignalsPerRun {
				break
			}
		}
	}

	// Process signals: save to DB and queue for analysis
	if len(signals) > 0 {
		// Save signals to database
		if err := e.saveSignals(signals); err != nil {
			log.Printf("[Executor] Failed to save signals for trader %s: %v", trader.ID, err)
			_ = trader.SetError(err)
			return
		}

		// Queue signals for analysis
		if err := e.queueSignalsForAnalysis(trader, signals); err != nil {
			log.Printf("[Executor] Failed to queue signals for analysis: %v", err)
			// Don't return - signals are saved, analysis queue is best-effort
		}

		// Update trader signal count
		trader.IncrementSignalCount(int64(len(signals)))

		log.Printf("[Executor] Trader %s generated %d signals", trader.ID, len(signals))
	}
}

// queueSignalsForAnalysis queues signals for AI analysis
func (e *Executor) queueSignalsForAnalysis(trader *Trader, signals []Signal) error {
	// TODO: Fetch full trader record from database when supabase client supports it
	// For now, we'll create a minimal trader record from the trader struct
	traderRecord := &types.Trader{
		ID:     trader.ID,
		UserID: trader.UserID,
		Name:   trader.Name,
		// Filter config will be nil - analysis engine should handle this
	}

	for _, signal := range signals {
		// Fetch market data for analysis
		// Get timeframes from config
		timeframes := trader.Config.Timeframes
		if len(timeframes) == 0 {
			timeframes = []string{"5m"}
		}

		// Fetch klines for this symbol
		klinesMap := make(map[string][]types.Kline)
		for _, tf := range timeframes {
			klines, err := e.binance.GetKlines(e.ctx, signal.Symbol, tf, 100)
			if err != nil {
				log.Printf("[Executor] Failed to fetch klines for %s: %v", signal.Symbol, err)
				continue
			}
			klinesMap[tf] = klines
		}

		// Fetch ticker
		simplifiedTicker, err := e.binance.GetTicker(e.ctx, signal.Symbol)
		if err != nil {
			log.Printf("[Executor] Failed to fetch ticker for %s: %v", signal.Symbol, err)
			continue
		}

		marketData := &types.MarketData{
			Symbol:    signal.Symbol,
			Ticker:    simplifiedTicker,
			Klines:    klinesMap,
			Timestamp: time.Now(),
		}

		// Queue for analysis
		req := &analysis.AnalysisRequest{
			SignalID:     signal.ID,
			TraderID:     trader.ID,
			UserID:       trader.UserID,
			Symbol:       signal.Symbol,
			Interval:     timeframes[0], // Primary interval
			MarketData:   marketData,
			Trader:       traderRecord,
			IsReanalysis: false,
			QueuedAt:     time.Now(),
		}

		if err := e.analysisEng.QueueAnalysis(req); err != nil {
			log.Printf("[Executor] Failed to queue signal %s for analysis: %v", signal.ID, err)
			// Continue with other signals
		}
	}

	return nil
}

// getSymbolsToScreen returns the list of symbols to screen
func (e *Executor) getSymbolsToScreen(trader *Trader) ([]string, error) {
	// If symbols are configured, use those
	if len(trader.Config.Symbols) > 0 {
		return trader.Config.Symbols, nil
	}

	// Otherwise, get top symbols by volume
	symbolCount := 100 // Default
	minVolume := 100000.0 // Default: 100k USDT volume

	symbols, err := e.binance.GetTopSymbols(e.ctx, symbolCount, minVolume)
	if err != nil {
		return nil, err
	}

	return symbols, nil
}

// fetchKlineData fetches kline data for symbols and timeframes
func (e *Executor) fetchKlineData(symbols []string, timeframes []string) (map[string]map[string][]types.Kline, error) {
	result := make(map[string]map[string][]types.Kline)

	// Default kline limit
	limit := 250

	for _, timeframe := range timeframes {
		// Fetch klines for all symbols concurrently
		klineMap, err := e.binance.GetMultipleKlines(e.ctx, symbols, timeframe, limit)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch klines for timeframe %s: %w", timeframe, err)
		}

		// Organize by symbol
		for symbol, klines := range klineMap {
			if _, exists := result[symbol]; !exists {
				result[symbol] = make(map[string][]types.Kline)
			}
			result[symbol][timeframe] = klines
		}
	}

	return result, nil
}

// saveSignals saves signals to the database
func (e *Executor) saveSignals(signals []Signal) error {
	// Convert to types.Signal and save
	for _, signal := range signals {
		dbSignal := &types.Signal{
			ID:                    signal.ID,
			TraderID:              signal.TraderID,
			UserID:                signal.UserID,
			Symbol:                signal.Symbol,
			Interval:              "5m", // Default interval
			Timestamp:             signal.TriggeredAt,
			PriceAtSignal:         signal.Price,
			ChangePercentAtSignal: 0, // Will be calculated from ticker data
			VolumeAtSignal:        signal.Volume,
			Count:                 1,
			Source:                "cloud",
			MachineID:             nil,
		}

		if err := e.supabase.CreateSignal(e.ctx, dbSignal); err != nil {
			// Log error but continue (don't fail entire batch)
			log.Printf("[Executor] Failed to save signal %s: %v", signal.ID, err)
			continue
		}
	}

	return nil
}

// parseFloat parses a string to float64
func parseFloat(s string) (float64, error) {
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	return f, err
}
