package trader

import (
	"context"
	"fmt"
	"log"
	"runtime"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/vyx/go-screener/internal/analysis"
	"github.com/vyx/go-screener/internal/eventbus"
	"github.com/vyx/go-screener/pkg/binance"
	"github.com/vyx/go-screener/pkg/cache"
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
	cache        *cache.KlineCache // WebSocket-fed kline cache

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
	cache *cache.KlineCache,
) *Executor {
	ctx, cancel := context.WithCancel(context.Background())

	return &Executor{
		yaegi:       yaegi,
		binance:     binance,
		supabase:    supabase,
		analysisEng: analysisEng,
		eventBus:    eventBus,
		cache:       cache,
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
		go e.executeTrader(trader, event.Interval)
	}
}

// executeTrader executes a single trader's filter
func (e *Executor) executeTrader(trader *Trader, triggerInterval string) {
	log.Printf("[Executor] 🎯 DEBUG: Executing trader %s (has fixes: UUID+nil+klineData) on interval %s", trader.ID, triggerInterval)

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

	log.Printf("[Executor] 🔍 Step 1: Getting symbols for trader %s", trader.ID)
	// Get symbols to screen
	symbols, err := e.getSymbolsToScreen(trader)
	if err != nil {
		log.Printf("[Executor] Failed to get symbols for trader %s: %v", trader.ID, err)
		_ = trader.SetError(err)
		return
	}
	log.Printf("[Executor] 🔍 Step 1 complete: Got %d symbols", len(symbols))

	// Get timeframes from config (default to 5m if not specified)
	timeframes := trader.Config.Timeframes
	if len(timeframes) == 0 {
		timeframes = []string{"5m"}
	}
	log.Printf("[Executor] 🔍 Step 2: Fetching kline data for %d symbols, %d timeframes", len(symbols), len(timeframes))

	// Fetch kline data for all symbols and timeframes
	klineData, err := e.fetchKlineData(symbols, timeframes)
	if err != nil {
		log.Printf("[Executor] Failed to fetch kline data for trader %s: %v", trader.ID, err)
		_ = trader.SetError(err)
		return
	}
	log.Printf("[Executor] 🔍 Step 2 complete: Fetched kline data for %d symbols", len(klineData))

	// Batch fetch ticker data for all symbols
	log.Printf("[Executor] 🔍 Step 2.5: Batch fetching ticker data for %d symbols", len(symbols))
	tickerData, err := e.binance.GetMultipleTickers(e.ctx, symbols)
	if err != nil {
		log.Printf("[Executor] Failed to fetch ticker data for trader %s: %v", trader.ID, err)
		_ = trader.SetError(err)
		return
	}
	log.Printf("[Executor] 🔍 Step 2.5 complete: Fetched ticker data for %d symbols", len(tickerData))

	// Execute filter for each symbol in parallel using worker pool
	log.Printf("[Executor] 🔍 Step 3: Starting parallel filter execution with worker pool")

	numWorkers := runtime.NumCPU()
	log.Printf("[Executor] 🔍 Using %d workers (CPU cores)", numWorkers)

	// Create channels for work distribution
	symbolCh := make(chan string, len(symbols))
	signalCh := make(chan *Signal, len(symbols))
	errorCh := make(chan error, len(symbols))

	// Context for workers
	workerCtx, workerCancel := context.WithCancel(e.ctx)
	defer workerCancel()

	// Start worker pool
	var wg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()

			for symbol := range symbolCh {
				// Check context cancellation
				select {
				case <-workerCtx.Done():
					return
				default:
				}

				log.Printf("[Executor] Worker %d processing symbol %s", workerID, symbol)

				// Process symbol
				signal, err := e.processSymbol(workerCtx, symbol, trader, klineData, tickerData, timeframes, triggerInterval)
				if err != nil {
					log.Printf("[Executor] Worker %d: Error processing %s: %v", workerID, symbol, err)
					errorCh <- err
					continue
				}

				// Send signal if matched
				if signal != nil {
					log.Printf("[Executor] Worker %d: Signal generated for %s", workerID, symbol)
					signalCh <- signal
				}
			}
		}(i)
	}

	// Feed symbols to workers
	go func() {
		for _, symbol := range symbols {
			symbolCh <- symbol
		}
		close(symbolCh)
	}()

	// Collect results in a separate goroutine
	go func() {
		wg.Wait()
		close(signalCh)
		close(errorCh)
	}()

	// Collect signals with limit checking
	signals := make([]Signal, 0)
	maxSignals := trader.Config.MaxSignalsPerRun
	if maxSignals <= 0 {
		maxSignals = len(symbols) // No limit
	}

	for signal := range signalCh {
		if signal != nil {
			signals = append(signals, *signal)

			// Check signal limit
			if len(signals) >= maxSignals {
				log.Printf("[Executor] Signal limit reached (%d), canceling workers", maxSignals)
				workerCancel() // Cancel all workers

				// Drain remaining signals to prevent goroutine leak
				go func() {
					for range signalCh {
					}
				}()
				break
			}
		}
	}

	log.Printf("[Executor] 🔍 Step 4: Parallel processing complete, generated %d signals", len(signals))

	// Process signals: save to DB and queue for analysis
	log.Printf("[Executor] 🔍 Step 4.1: Checking signal count: %d", len(signals))
	if len(signals) > 0 {
		log.Printf("[Executor] 🔍 Step 5: Saving %d signals to database", len(signals))
		log.Printf("[Executor] 🔍 Step 5.1: Calling saveSignals function...")
		// Save signals to database
		if err := e.saveSignals(signals); err != nil {
			log.Printf("[Executor] Failed to save signals for trader %s: %v", trader.ID, err)
			_ = trader.SetError(err)
			return
		}
		log.Printf("[Executor] 🔍 Step 5 complete: Signals saved successfully")

		log.Printf("[Executor] 🔍 Step 6: Queueing signals for analysis...")
		// Queue signals for analysis
		if err := e.queueSignalsForAnalysis(trader, signals); err != nil {
			log.Printf("[Executor] Failed to queue signals for analysis: %v", err)
			// Don't return - signals are saved, analysis queue is best-effort
		}
		log.Printf("[Executor] 🔍 Step 6 complete: Analysis queuing complete")

		log.Printf("[Executor] 🔍 Step 7: Updating trader signal count...")
		// Update trader signal count
		trader.IncrementSignalCount(int64(len(signals)))
		log.Printf("[Executor] 🔍 Step 7 complete: Signal count updated")

		log.Printf("[Executor] Trader %s generated %d signals", trader.ID, len(signals))
	}
}

// ExecutionResult holds the result of immediate trader execution
type ExecutionResult struct {
	TraderID       string    `json:"traderId"`
	Timestamp      time.Time `json:"timestamp"`
	TotalSymbols   int       `json:"totalSymbols"`
	MatchCount     int       `json:"matchCount"`
	Signals        []Signal  `json:"signals"`
	ExecutionTime  int64     `json:"executionTimeMs"`
	CacheHits      int       `json:"cacheHits"`
	CacheMisses    int       `json:"cacheMisses"`
}

// ExecuteImmediate executes a trader immediately using cached candle data
// This is used for immediate signal generation after trader creation
func (e *Executor) ExecuteImmediate(traderID string) (*ExecutionResult, error) {
	startTime := time.Now()
	log.Printf("[Executor] ExecuteImmediate: Starting immediate execution for trader %s", traderID)

	// Get trader from registry or load from DB
	e.tradersMu.RLock()
	trader, exists := e.traders[traderID]
	e.tradersMu.RUnlock()

	if !exists {
		log.Printf("[Executor] ExecuteImmediate: Trader %s not in registry, loading from DB", traderID)
		// Try to load from database via manager
		// For now, return error - trader should be loaded by manager before calling this
		return nil, fmt.Errorf("trader %s not found in executor registry", traderID)
	}

	log.Printf("[Executor] ExecuteImmediate: Trader %s found, fetching symbols", traderID)

	// Get symbols to screen
	symbols, err := e.getSymbolsToScreen(trader)
	if err != nil {
		return nil, fmt.Errorf("failed to get symbols: %w", err)
	}
	log.Printf("[Executor] ExecuteImmediate: Got %d symbols", len(symbols))

	// Get timeframes from config
	timeframes := trader.Config.Timeframes
	if len(timeframes) == 0 {
		timeframes = []string{"5m"}
	}
	log.Printf("[Executor] ExecuteImmediate: Fetching kline data for %d timeframes", len(timeframes))

	// Fetch kline data (uses cache when available)
	klineData, err := e.fetchKlineData(symbols, timeframes)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch kline data: %w", err)
	}
	log.Printf("[Executor] ExecuteImmediate: Fetched kline data for %d symbols", len(klineData))

	// Batch fetch ticker data
	log.Printf("[Executor] ExecuteImmediate: Fetching ticker data")
	tickerData, err := e.binance.GetMultipleTickers(e.ctx, symbols)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch ticker data: %w", err)
	}
	log.Printf("[Executor] ExecuteImmediate: Fetched ticker data for %d symbols", len(tickerData))

	// Execute filter for each symbol in parallel
	log.Printf("[Executor] ExecuteImmediate: Starting parallel filter execution")

	// Use first timeframe as trigger interval (same logic as event-driven execution)
	triggerInterval := timeframes[0]
	if triggerInterval == "" {
		triggerInterval = "5m" // Fallback
	}
	log.Printf("[Executor] ExecuteImmediate: Using trigger interval %s", triggerInterval)

	numWorkers := runtime.NumCPU()
	symbolCh := make(chan string, len(symbols))
	signalCh := make(chan *Signal, len(symbols))
	errorCh := make(chan error, len(symbols))

	workerCtx, workerCancel := context.WithCancel(e.ctx)
	defer workerCancel()

	var wg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for symbol := range symbolCh {
				select {
				case <-workerCtx.Done():
					return
				default:
				}

				// Process symbol using existing method
				signal, err := e.processSymbol(workerCtx, symbol, trader, klineData, tickerData, timeframes, triggerInterval)
				if err != nil {
					errorCh <- err
					continue
				}

				if signal != nil {
					signalCh <- signal
				}
			}
		}(i)
	}

	// Send symbols to workers
	for _, symbol := range symbols {
		symbolCh <- symbol
	}
	close(symbolCh)

	// Wait for all workers to complete
	wg.Wait()
	close(signalCh)
	close(errorCh)

	// Collect signals
	signals := make([]Signal, 0)
	for signal := range signalCh {
		signals = append(signals, *signal)
	}
	log.Printf("[Executor] ExecuteImmediate: Generated %d signals", len(signals))

	// Save signals to database (triggers AI analysis via DB trigger)
	if len(signals) > 0 {
		log.Printf("[Executor] ExecuteImmediate: Saving %d signals to database", len(signals))
		if err := e.saveSignals(signals); err != nil {
			return nil, fmt.Errorf("failed to save signals: %w", err)
		}
		log.Printf("[Executor] ExecuteImmediate: Signals saved successfully")
	}

	executionTime := time.Since(startTime).Milliseconds()
	log.Printf("[Executor] ExecuteImmediate: Completed in %dms", executionTime)

	// Return execution result
	return &ExecutionResult{
		TraderID:      traderID,
		Timestamp:     startTime,
		TotalSymbols:  len(symbols),
		MatchCount:    len(signals),
		Signals:       signals,
		ExecutionTime: executionTime,
		CacheHits:     0, // TODO: Track cache hits if needed
		CacheMisses:   0, // TODO: Track cache misses if needed
	}, nil
}

// queueSignalsForAnalysis queues signals for AI analysis
func (e *Executor) queueSignalsForAnalysis(trader *Trader, signals []Signal) error {
	log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Starting with %d signals", len(signals))
	log.Printf("[Executor] 🔍 queueSignalsForAnalysis: e.analysisEng = %v (nil check)", e.analysisEng == nil)

	// Skip if analysis engine is not configured
	if e.analysisEng == nil {
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Analysis engine is nil, skipping")
		return nil
	}

	log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Creating trader record...")
	// TODO: Fetch full trader record from database when supabase client supports it
	// For now, we'll create a minimal trader record from the trader struct
	traderRecord := &types.Trader{
		ID:     trader.ID,
		UserID: trader.UserID,
		Name:   trader.Name,
		// Filter config will be nil - analysis engine should handle this
	}
	log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Trader record created")

	log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Looping through %d signals...", len(signals))
	for i, signal := range signals {
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Processing signal %d/%d: %s", i+1, len(signals), signal.Symbol)
		// Fetch market data for analysis
		// Get timeframes from config
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: trader.Config = %v (nil check)", trader.Config == nil)
		var timeframes []string
		if trader.Config != nil {
			timeframes = trader.Config.Timeframes
		}
		if len(timeframes) == 0 {
			timeframes = []string{"5m"}
		}
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Using timeframes: %v", timeframes)

		// Fetch klines for this symbol
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Fetching klines for %s...", signal.Symbol)
		klinesMap := make(map[string][]types.Kline)
		for j, tf := range timeframes {
			log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Fetching kline %d/%d for %s (%s)...", j+1, len(timeframes), signal.Symbol, tf)

			// Try cache first (instant!)
			klines, err := e.cache.Get(signal.Symbol, tf, 100)
			if err != nil {
				// Cache miss - fallback to REST API
				log.Printf("[Executor] Cache miss for %s@%s in queueSignalsForAnalysis, falling back to REST", signal.Symbol, tf)
				klines, err = e.binance.GetKlines(e.ctx, signal.Symbol, tf, 100)
				if err != nil {
					log.Printf("[Executor] Failed to fetch klines for %s@%s: %v", signal.Symbol, tf, err)
					continue
				}
			}
			log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Fetched %d klines for %s (%s)", len(klines), signal.Symbol, tf)
			klinesMap[tf] = klines
		}
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Klines fetched successfully")

		// Fetch ticker
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Fetching ticker for %s...", signal.Symbol)
		simplifiedTicker, err := e.binance.GetTicker(e.ctx, signal.Symbol)
		if err != nil {
			log.Printf("[Executor] Failed to fetch ticker for %s: %v", signal.Symbol, err)
			continue
		}
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Ticker fetched successfully")

		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Creating marketData struct...")
		marketData := &types.MarketData{
			Symbol:    signal.Symbol,
			Ticker:    simplifiedTicker,
			Klines:    klinesMap,
			Timestamp: time.Now(),
		}
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: marketData created successfully")

		// Queue for analysis
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Creating analysis request...")
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: trader = %v (nil check)", trader == nil)
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: traderRecord = %v (nil check)", traderRecord == nil)
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: signal.ID = %s", signal.ID)
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: trader.ID = %s", trader.ID)
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: trader.UserID = %s", trader.UserID)

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
		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Analysis request created successfully")

		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: Calling QueueAnalysis...")

		// Protect against panics inside analysisEngine
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("[Executor] QueueAnalysis panicked for signal %s: %v", signal.ID, r)
				}
			}()

			if err := e.analysisEng.QueueAnalysis(req); err != nil {
				log.Printf("[Executor] Failed to queue signal %s for analysis: %v", signal.ID, err)
			}
		}()

		log.Printf("[Executor] 🔍 queueSignalsForAnalysis: QueueAnalysis completed successfully")
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
		// Try to get klines from cache first (instant!)
		cacheHits := 0
		cacheMisses := 0

		for _, symbol := range symbols {
			klines, err := e.cache.Get(symbol, timeframe, limit)
			if err != nil {
				// Cache miss - fallback to REST API
				cacheMisses++
				log.Printf("[Executor] Cache miss for %s@%s, falling back to REST", symbol, timeframe)

				klines, err = e.binance.GetKlines(e.ctx, symbol, timeframe, limit)
				if err != nil {
					log.Printf("[Executor] Failed to fetch klines for %s@%s: %v", symbol, timeframe, err)
					continue
				}
			} else {
				cacheHits++
			}

			if _, exists := result[symbol]; !exists {
				result[symbol] = make(map[string][]types.Kline)
			}
			result[symbol][timeframe] = klines
		}

		log.Printf("[Executor] Kline fetch for %s: %d cache hits, %d cache misses", timeframe, cacheHits, cacheMisses)
	}

	return result, nil
}

// processSymbol processes a single symbol through the filter
// Returns a signal if the filter matches, nil otherwise
func (e *Executor) processSymbol(ctx context.Context, symbol string, trader *Trader, klineData map[string]map[string][]types.Kline, tickerData map[string]*types.SimplifiedTicker, timeframes []string, triggerInterval string) (*Signal, error) {
	// Check context cancellation
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Get ticker data from pre-fetched map
	ticker, ok := tickerData[symbol]
	if !ok {
		return nil, fmt.Errorf("ticker data not found for symbol %s", symbol)
	}

	// Defensive nil check
	if ticker == nil {
		return nil, fmt.Errorf("ticker is nil for symbol %s", symbol)
	}

	// Prepare market data with klines map
	klinesMap := make(map[string][]types.Kline)
	if symbolData, symbolExists := klineData[symbol]; symbolExists {
		for _, tf := range timeframes {
			if klines, ok := symbolData[tf]; ok {
				klinesMap[tf] = klines
			}
		}
	}

	marketData := &types.MarketData{
		Symbol:    symbol,
		Ticker:    ticker,
		Klines:    klinesMap,
		Timestamp: time.Now(),
	}

	// Execute filter with timeout
	timeout := trader.Config.TimeoutPerRun
	if timeout <= 0 {
		timeout = 1 * time.Second // Default: 1 second
	}

	matches, err := e.yaegi.ExecuteFilterWithTimeout(trader.Config.FilterCode, marketData, timeout)
	if err != nil {
		return nil, fmt.Errorf("filter execution failed: %w", err)
	}

	// If matches, create signal
	if matches {
		signal := &Signal{
			ID:          uuid.New().String(),
			TraderID:    trader.ID,
			UserID:      trader.UserID,
			Symbol:      symbol,
			Interval:    triggerInterval,
			TriggeredAt: time.Now(),
			Price:       ticker.LastPrice,
			Volume:      ticker.QuoteVolume,
			Metadata:    make(map[string]interface{}),
			CreatedAt:   time.Now(),
		}
		return signal, nil
	}

	return nil, nil
}

// saveSignals saves signals to the database using batch insert
func (e *Executor) saveSignals(signals []Signal) error {
	log.Printf("[Executor] Saving %d signals in batch", len(signals))

	// Convert to types.Signal slice
	dbSignals := make([]*types.Signal, 0, len(signals))
	for _, signal := range signals {
		// Handle user_id: use nil for built-in traders (user_id="system"), otherwise use actual UUID
		var userID *string
		if signal.UserID != "" && signal.UserID != "system" {
			userID = &signal.UserID
		}

		dbSignals = append(dbSignals, &types.Signal{
			ID:                    signal.ID,
			TraderID:              signal.TraderID,
			UserID:                userID, // NULL for built-in traders
			Symbol:                signal.Symbol,
			Interval:              signal.Interval, // Use the actual trigger interval
			Timestamp:             signal.TriggeredAt,
			PriceAtSignal:         signal.Price,
			ChangePercentAtSignal: 0, // Will be calculated from ticker data
			VolumeAtSignal:        signal.Volume,
			Count:                 1,
			Source:                "cloud",
			MachineID:             nil,
		})
	}

	// Single batch insert
	if err := e.supabase.CreateSignalsBatch(e.ctx, dbSignals); err != nil {
		return fmt.Errorf("failed to save signals batch: %w", err)
	}

	log.Printf("[Executor] Successfully saved %d signals in batch", len(dbSignals))
	return nil
}

// parseFloat parses a string to float64
func parseFloat(s string) (float64, error) {
	var f float64
	_, err := fmt.Sscanf(s, "%f", &f)
	return f, err
}
