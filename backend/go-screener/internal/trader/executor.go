package trader

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/vyx/go-screener/pkg/binance"
	"github.com/vyx/go-screener/pkg/supabase"
	"github.com/vyx/go-screener/pkg/types"
	"github.com/vyx/go-screener/pkg/yaegi"
)

// Executor runs trader filter code and generates signals
type Executor struct {
	yaegi    *yaegi.Executor
	binance  *binance.Client
	supabase *supabase.Client
}

// NewExecutor creates a new trader executor
func NewExecutor(yaegi *yaegi.Executor, binance *binance.Client, supabase *supabase.Client) *Executor {
	return &Executor{
		yaegi:    yaegi,
		binance:  binance,
		supabase: supabase,
	}
}

// Start starts the trader's execution loop
// This runs in a goroutine until the context is cancelled
func (e *Executor) Start(ctx context.Context, trader *Trader) error {
	// Validate trader configuration
	if trader.Config == nil {
		return fmt.Errorf("trader config is nil")
	}

	if trader.Config.FilterCode == "" {
		return fmt.Errorf("trader filter code is empty")
	}

	if trader.Config.ScreeningInterval <= 0 {
		trader.Config.ScreeningInterval = 60 * time.Second // Default: 1 minute
	}

	// Validate filter code before starting
	if err := e.yaegi.ValidateCode(trader.Config.FilterCode); err != nil {
		return fmt.Errorf("invalid filter code: %w", err)
	}

	// Start execution loop in goroutine
	go e.executeLoop(ctx, trader)

	return nil
}

// executeLoop runs the trader's filter in a loop
func (e *Executor) executeLoop(ctx context.Context, trader *Trader) {
	// Recover from panics to prevent crashing the server
	defer func() {
		if r := recover(); r != nil {
			err := fmt.Errorf("panic in trader %s: %v", trader.ID, r)
			log.Printf("[Executor] %v", err)
			_ = trader.SetError(err)
		}
	}()

	ticker := time.NewTicker(trader.Config.ScreeningInterval)
	defer ticker.Stop()

	// Run immediately on start
	if err := e.executeSingleRun(ctx, trader); err != nil {
		log.Printf("[Executor] Trader %s initial run failed: %v", trader.ID, err)
		_ = trader.SetError(err)
		return
	}

	// Then run on interval
	for {
		select {
		case <-ctx.Done():
			// Context cancelled, stop execution
			log.Printf("[Executor] Trader %s stopped (context cancelled)", trader.ID)
			return

		case <-ticker.C:
			// Run filter
			if err := e.executeSingleRun(ctx, trader); err != nil {
				log.Printf("[Executor] Trader %s run failed: %v", trader.ID, err)

				// Move to error state and stop
				_ = trader.SetError(err)
				return
			}
		}
	}
}

// executeSingleRun executes the filter once and saves any signals
func (e *Executor) executeSingleRun(ctx context.Context, trader *Trader) error {
	// Update last run timestamp
	trader.UpdateLastRunAt()

	// Get symbols to screen
	symbols, err := e.getSymbolsToScreen(trader)
	if err != nil {
		return fmt.Errorf("failed to get symbols: %w", err)
	}

	// Get timeframes from config (default to 5m if not specified)
	timeframes := trader.Config.Timeframes
	if len(timeframes) == 0 {
		timeframes = []string{"5m"}
	}

	// Fetch kline data for all symbols and timeframes
	klineData, err := e.fetchKlineData(symbols, timeframes)
	if err != nil {
		return fmt.Errorf("failed to fetch kline data: %w", err)
	}

	// Execute filter for each symbol
	signals := make([]Signal, 0)

	for _, symbol := range symbols {
		// Check context cancellation
		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled")
		default:
		}

		// Get ticker data
		ticker, err := e.binance.GetTicker(symbol)
		if err != nil {
			log.Printf("[Executor] Failed to fetch ticker for %s: %v", symbol, err)
			continue
		}

		// Convert ticker to simplified format
		lastPrice, _ := parseFloat(ticker.LastPrice)
		priceChangePercent, _ := parseFloat(ticker.PriceChangePercent)
		quoteVolume, _ := parseFloat(ticker.QuoteVolume)

		simplifiedTicker := &types.SimplifiedTicker{
			LastPrice:          lastPrice,
			PriceChangePercent: priceChangePercent,
			QuoteVolume:        quoteVolume,
		}

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
				Price:       lastPrice,
				Volume:      quoteVolume,
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

	// Save signals to database
	if len(signals) > 0 {
		if err := e.saveSignals(signals); err != nil {
			return fmt.Errorf("failed to save signals: %w", err)
		}

		// Update trader signal count
		trader.IncrementSignalCount(int64(len(signals)))

		log.Printf("[Executor] Trader %s generated %d signals", trader.ID, len(signals))
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

	symbols, err := e.binance.GetTopSymbols(symbolCount, minVolume)
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
		interval := types.KlineInterval(timeframe)

		// Fetch klines for all symbols concurrently
		klineMap, err := e.binance.GetMultipleKlines(symbols, interval, limit)
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

		if err := e.supabase.CreateSignal(dbSignal); err != nil {
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
