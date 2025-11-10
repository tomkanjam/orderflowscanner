package yaegi

import (
	"fmt"
	"reflect"
	"time"

	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
	"github.com/vyx/go-screener/pkg/indicators"
	"github.com/vyx/go-screener/pkg/types"
)

// Executor handles execution of custom Go code using Yaegi
type Executor struct {
	interpreter *interp.Interpreter
}

// NewExecutor creates a new Yaegi executor with pre-loaded symbols
func NewExecutor() (*Executor, error) {
	i := interp.New(interp.Options{})

	// Load standard library
	if err := i.Use(stdlib.Symbols); err != nil {
		return nil, fmt.Errorf("failed to load stdlib: %w", err)
	}

	// Load our custom symbols (types and indicators)
	if err := i.Use(GetCustomSymbols()); err != nil {
		return nil, fmt.Errorf("failed to load custom symbols: %w", err)
	}

	return &Executor{interpreter: i}, nil
}

// ExecuteFilter runs a trader's filter code and returns whether it matches
func (e *Executor) ExecuteFilter(code string, data *types.MarketData) (bool, error) {
	// Create a fresh interpreter for each execution to avoid redeclaration issues
	i := interp.New(interp.Options{})

	// Load standard library
	if err := i.Use(stdlib.Symbols); err != nil {
		return false, fmt.Errorf("failed to load stdlib: %w", err)
	}

	// Load custom symbols
	if err := i.Use(GetCustomSymbols()); err != nil {
		return false, fmt.Errorf("failed to load custom symbols: %w", err)
	}

	// Wrap the code in a function that we can call
	wrappedCode := fmt.Sprintf(`
package main

import (
	"github.com/vyx/go-screener/pkg/types"
	"github.com/vyx/go-screener/pkg/indicators"
)

func evaluate(data *types.MarketData) bool {
	%s
}
`, code)

	// Evaluate the wrapped code
	_, err := i.Eval(wrappedCode)
	if err != nil {
		return false, fmt.Errorf("failed to compile filter code: %w", err)
	}

	// Get the evaluate function
	v, err := i.Eval("evaluate")
	if err != nil {
		return false, fmt.Errorf("failed to get evaluate function: %w", err)
	}

	// Call the function with the data
	fn := v.Interface().(func(*types.MarketData) bool)
	result := fn(data)

	return result, nil
}

// ExecuteFilterWithTimeout runs a filter with a timeout
func (e *Executor) ExecuteFilterWithTimeout(code string, data *types.MarketData, timeout time.Duration) (bool, error) {
	resultChan := make(chan bool, 1)
	errorChan := make(chan error, 1)

	go func() {
		result, err := e.ExecuteFilter(code, data)
		if err != nil {
			errorChan <- err
			return
		}
		resultChan <- result
	}()

	select {
	case result := <-resultChan:
		return result, nil
	case err := <-errorChan:
		return false, err
	case <-time.After(timeout):
		return false, fmt.Errorf("filter execution timed out after %v", timeout)
	}
}

// GetCustomSymbols returns our custom symbols for Yaegi (exported for use in other packages)
func GetCustomSymbols() map[string]map[string]reflect.Value {
	return map[string]map[string]reflect.Value{
		"github.com/vyx/go-screener/pkg/types/types": {
			"Kline":             reflect.ValueOf((*types.Kline)(nil)),
			"Ticker":            reflect.ValueOf((*types.Ticker)(nil)),
			"SimplifiedTicker":  reflect.ValueOf((*types.SimplifiedTicker)(nil)),
			"MarketData":        reflect.ValueOf((*types.MarketData)(nil)),
			"KlineInterval":     reflect.ValueOf((*types.KlineInterval)(nil)),
		},
		"github.com/vyx/go-screener/pkg/indicators/indicators": {
			// Moving Averages
			"CalculateMA":       reflect.ValueOf(indicators.CalculateMA),
			"CalculateMASeries": reflect.ValueOf(indicators.CalculateMASeries),
			"CalculateEMA":      reflect.ValueOf(indicators.CalculateEMA),
			"CalculateEMASeries": reflect.ValueOf(indicators.CalculateEMASeries),

			// RSI
			"CalculateRSI":  reflect.ValueOf(indicators.CalculateRSI),
			"GetLatestRSI":  reflect.ValueOf(indicators.GetLatestRSI),

			// MACD
			"CalculateMACD":  reflect.ValueOf(indicators.CalculateMACD),
			"GetLatestMACD":  reflect.ValueOf(indicators.GetLatestMACD),

			// Bollinger Bands
			"CalculateBollingerBands":  reflect.ValueOf(indicators.CalculateBollingerBands),
			"GetLatestBollingerBands":  reflect.ValueOf(indicators.GetLatestBollingerBands),

			// Volume
			"CalculateAvgVolume": reflect.ValueOf(indicators.CalculateAvgVolume),
			"CalculateVWAP":      reflect.ValueOf(indicators.CalculateVWAP),

			// High/Low
			"GetHighestHigh": reflect.ValueOf(indicators.GetHighestHigh),
			"GetLowestLow":   reflect.ValueOf(indicators.GetLowestLow),

			// Stochastic
			"CalculateStochastic": reflect.ValueOf(indicators.CalculateStochastic),

			// Patterns
			"DetectEngulfingPattern": reflect.ValueOf(indicators.DetectEngulfingPattern),
		},
	}
}

// ValidateCode validates that the code compiles without executing it
func (e *Executor) ValidateCode(code string) error {
	// Create a fresh interpreter for validation
	i := interp.New(interp.Options{})

	// Load standard library
	if err := i.Use(stdlib.Symbols); err != nil {
		return fmt.Errorf("failed to load stdlib: %w", err)
	}

	// Load custom symbols
	if err := i.Use(GetCustomSymbols()); err != nil {
		return fmt.Errorf("failed to load custom symbols: %w", err)
	}

	wrappedCode := fmt.Sprintf(`
package main

import (
	"github.com/vyx/go-screener/pkg/types"
	"github.com/vyx/go-screener/pkg/indicators"
)

func evaluate(data *types.MarketData) bool {
	%s
}
`, code)

	_, err := i.Eval(wrappedCode)
	if err != nil {
		return fmt.Errorf("code validation failed: %w", err)
	}

	return nil
}
