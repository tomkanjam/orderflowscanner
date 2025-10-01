package filter

import (
	"context"
	"fmt"
	"reflect"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
	"github.com/yourusername/aitrader-tui/internal/errors"
	"github.com/yourusername/aitrader-tui/internal/types"
)

const (
	// Execution limits
	maxExecutionTime = 5 * time.Second
	maxConcurrent    = 10
)

// Executor executes trader filter code using Yaegi interpreter
type Executor struct {
	mu            sync.RWMutex
	interpreters  map[string]*interp.Interpreter // traderID -> interpreter
	semaphore     chan struct{}                  // Limits concurrent executions
	ctx           context.Context
	cancel        context.CancelFunc
}

// NewExecutor creates a new filter executor
func NewExecutor() *Executor {
	ctx, cancel := context.WithCancel(context.Background())

	return &Executor{
		interpreters: make(map[string]*interp.Interpreter),
		semaphore:    make(chan struct{}, maxConcurrent),
		ctx:          ctx,
		cancel:       cancel,
	}
}

// Stop stops the executor
func (e *Executor) Stop() error {
	e.cancel()
	return nil
}

// CompileFilter compiles a trader's filter code
func (e *Executor) CompileFilter(trader *types.Trader) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	log.Info().Str("trader_id", trader.ID).Msg("Compiling filter code")

	// Create new interpreter
	i := interp.New(interp.Options{})

	// Import standard library
	if err := i.Use(stdlib.Symbols); err != nil {
		return errors.NewTraderError(trader.ID, "import_stdlib", err)
	}

	// Import our custom symbols (helper functions)
	if err := i.Use(getHelperSymbols()); err != nil {
		return errors.NewTraderError(trader.ID, "import_helpers", err)
	}

	// Compile the filter code
	_, err := i.Eval(trader.Filter.Code)
	if err != nil {
		return errors.NewTraderError(trader.ID, "compile", err)
	}

	// Store interpreter
	e.interpreters[trader.ID] = i

	log.Info().Str("trader_id", trader.ID).Msg("Filter compiled successfully")

	return nil
}

// ExecuteFilter executes a trader's filter against market data
func (e *Executor) ExecuteFilter(trader *types.Trader, marketData *types.MarketDataSnapshot) (*types.FilterExecutionResult, error) {
	startTime := time.Now()

	// Acquire semaphore
	select {
	case e.semaphore <- struct{}{}:
		defer func() { <-e.semaphore }()
	case <-e.ctx.Done():
		return nil, errors.ErrEngineShutdown
	}

	// Get interpreter
	e.mu.RLock()
	i, exists := e.interpreters[trader.ID]
	e.mu.RUnlock()

	if !exists {
		// Try to compile
		if err := e.CompileFilter(trader); err != nil {
			return nil, err
		}
		e.mu.RLock()
		i = e.interpreters[trader.ID]
		e.mu.RUnlock()
	}

	// Create execution context with timeout
	ctx, cancel := context.WithTimeout(e.ctx, maxExecutionTime)
	defer cancel()

	// Execute filter for each symbol
	matches := make([]string, 0)
	errorsEncountered := make([]string, 0)

	// Channel for results
	type result struct {
		symbol string
		match  bool
		err    error
	}
	resultChan := make(chan result, len(marketData.Symbols))

	// Execute in parallel with goroutines
	var wg sync.WaitGroup
	for _, symbol := range marketData.Symbols {
		wg.Add(1)
		go func(sym string) {
			defer wg.Done()

			// Check if context is cancelled
			select {
			case <-ctx.Done():
				resultChan <- result{symbol: sym, err: ctx.Err()}
				return
			default:
			}

			// Get ticker data for this symbol
			ticker := marketData.Tickers[sym]
			if ticker == nil {
				resultChan <- result{symbol: sym, err: fmt.Errorf("no ticker data")}
				return
			}

			// Get kline data for required timeframes
			symbolKlines := marketData.Klines[sym]

			// Execute filter function
			match, err := e.executeFilterCode(i, trader, ticker, symbolKlines)
			resultChan <- result{symbol: sym, match: match, err: err}
		}(symbol)
	}

	// Wait for all goroutines
	go func() {
		wg.Wait()
		close(resultChan)
	}()

	// Collect results
	for res := range resultChan {
		if res.err != nil {
			errorsEncountered = append(errorsEncountered, fmt.Sprintf("%s: %v", res.symbol, res.err))
		} else if res.match {
			matches = append(matches, res.symbol)
		}
	}

	duration := time.Since(startTime)

	log.Info().
		Str("trader_id", trader.ID).
		Int("matches", len(matches)).
		Int("errors", len(errorsEncountered)).
		Dur("duration", duration).
		Msg("Filter executed")

	return &types.FilterExecutionResult{
		TraderID:   trader.ID,
		Matches:    matches,
		Errors:     errorsEncountered,
		ExecutedAt: startTime,
		Duration:   duration,
		MarketData: marketData,
	}, nil
}

// executeFilterCode executes the filter code for a single symbol
func (e *Executor) executeFilterCode(i *interp.Interpreter, trader *types.Trader, ticker *types.Ticker, klines map[string][]*types.Kline) (bool, error) {
	// Get the filter function
	filterFunc, err := i.Eval("filter")
	if err != nil {
		return false, fmt.Errorf("filter function not found: %w", err)
	}

	// Call the function with ticker and klines
	fn := filterFunc.Interface()
	if fn == nil {
		return false, fmt.Errorf("filter function is nil")
	}

	// Use reflection to call the function
	fnValue := reflect.ValueOf(fn)
	if fnValue.Kind() != reflect.Func {
		return false, fmt.Errorf("filter is not a function")
	}

	// Prepare arguments
	tickerValue := reflect.ValueOf(ticker)
	klinesValue := reflect.ValueOf(klines)

	// Call function
	results := fnValue.Call([]reflect.Value{tickerValue, klinesValue})
	if len(results) != 2 {
		return false, fmt.Errorf("filter function must return (bool, error)")
	}

	// Extract results
	matchValue := results[0]
	errValue := results[1]

	// Check error
	if !errValue.IsNil() {
		return false, errValue.Interface().(error)
	}

	// Return match result
	return matchValue.Bool(), nil
}

// RemoveFilter removes a compiled filter
func (e *Executor) RemoveFilter(traderID string) {
	e.mu.Lock()
	defer e.mu.Unlock()

	delete(e.interpreters, traderID)

	log.Info().Str("trader_id", traderID).Msg("Filter removed")
}

// getHelperSymbols returns helper functions for filter code
func getHelperSymbols() map[string]map[string]reflect.Value {
	symbols := make(map[string]map[string]reflect.Value)

	// Add helper package
	helpers := make(map[string]reflect.Value)

	// ParseFloat helper
	helpers["ParseFloat"] = reflect.ValueOf(func(s string) float64 {
		var result float64
		fmt.Sscanf(s, "%f", &result)
		return result
	})

	// CalculateSMA helper
	helpers["CalculateSMA"] = reflect.ValueOf(func(klines []*types.Kline, period int) float64 {
		if len(klines) < period {
			return 0
		}

		sum := 0.0
		for i := len(klines) - period; i < len(klines); i++ {
			close := 0.0
			fmt.Sscanf(klines[i].Close, "%f", &close)
			sum += close
		}

		return sum / float64(period)
	})

	// CalculateEMA helper
	helpers["CalculateEMA"] = reflect.ValueOf(func(klines []*types.Kline, period int) float64 {
		if len(klines) < period {
			return 0
		}

		multiplier := 2.0 / float64(period+1)

		// Start with SMA
		sum := 0.0
		for i := 0; i < period; i++ {
			close := 0.0
			fmt.Sscanf(klines[i].Close, "%f", &close)
			sum += close
		}
		ema := sum / float64(period)

		// Calculate EMA
		for i := period; i < len(klines); i++ {
			close := 0.0
			fmt.Sscanf(klines[i].Close, "%f", &close)
			ema = (close-ema)*multiplier + ema
		}

		return ema
	})

	// CalculateRSI helper
	helpers["CalculateRSI"] = reflect.ValueOf(func(klines []*types.Kline, period int) float64 {
		if len(klines) < period+1 {
			return 50.0
		}

		gains := 0.0
		losses := 0.0

		for i := len(klines) - period; i < len(klines); i++ {
			if i == 0 {
				continue
			}

			prevClose := 0.0
			fmt.Sscanf(klines[i-1].Close, "%f", &prevClose)

			currentClose := 0.0
			fmt.Sscanf(klines[i].Close, "%f", &currentClose)

			change := currentClose - prevClose
			if change > 0 {
				gains += change
			} else {
				losses += -change
			}
		}

		avgGain := gains / float64(period)
		avgLoss := losses / float64(period)

		if avgLoss == 0 {
			return 100.0
		}

		rs := avgGain / avgLoss
		rsi := 100.0 - (100.0 / (1.0 + rs))

		return rsi
	})

	// GetVolume helper
	helpers["GetVolume"] = reflect.ValueOf(func(ticker *types.Ticker) float64 {
		volume := 0.0
		fmt.Sscanf(ticker.Volume, "%f", &volume)
		return volume
	})

	// GetPriceChange helper
	helpers["GetPriceChange"] = reflect.ValueOf(func(ticker *types.Ticker) float64 {
		change := 0.0
		fmt.Sscanf(ticker.PriceChangePercent, "%f", &change)
		return change
	})

	symbols["helpers"] = helpers

	return symbols
}
