package screener

import (
	"context"
	"fmt"
	"time"

	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"

	"github.com/yourusername/go-screener/pkg/indicators"
	"github.com/yourusername/go-screener/pkg/types"
)

// SeriesExecutor handles execution of series code for indicator data generation
type SeriesExecutor struct {
	timeout time.Duration
}

// NewSeriesExecutor creates a new series executor with the specified timeout
func NewSeriesExecutor(timeout time.Duration) *SeriesExecutor {
	return &SeriesExecutor{
		timeout: timeout,
	}
}

// ExecuteSeriesCode runs the series code and returns indicator data for visualization
// Returns a map where keys are indicator IDs and values are arrays of data points
func (se *SeriesExecutor) ExecuteSeriesCode(
	ctx context.Context,
	seriesCode string,
	data *types.MarketData,
) (map[string]interface{}, error) {
	// Create timeout context
	ctx, cancel := context.WithTimeout(ctx, se.timeout)
	defer cancel()

	// Create Yaegi interpreter
	i := interp.New(interp.Options{})

	// Import standard library
	if err := i.Use(stdlib.Symbols); err != nil {
		return nil, fmt.Errorf("failed to import stdlib: %w", err)
	}

	// Import indicators package
	if err := i.Use(indicators.Symbols); err != nil {
		return nil, fmt.Errorf("failed to import indicators: %w", err)
	}

	// Import types package
	if err := i.Use(types.Symbols); err != nil {
		return nil, fmt.Errorf("failed to import types: %w", err)
	}

	// Wrap series code in function
	fullCode := fmt.Sprintf(`
package main

import (
	"github.com/yourusername/go-screener/pkg/indicators"
	"github.com/yourusername/go-screener/pkg/types"
)

func calculateSeries(data *types.MarketData) map[string]interface{} {
%s
}
`, seriesCode)

	// Evaluate code
	if _, err := i.Eval(fullCode); err != nil {
		return nil, fmt.Errorf("failed to evaluate series code: %w", err)
	}

	// Get the function
	v, err := i.Eval("calculateSeries")
	if err != nil {
		return nil, fmt.Errorf("failed to get calculateSeries function: %w", err)
	}

	// Type assert to function
	fn, ok := v.Interface().(func(*types.MarketData) map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("calculateSeries is not the correct type")
	}

	// Execute with timeout
	resultChan := make(chan map[string]interface{}, 1)
	errChan := make(chan error, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				errChan <- fmt.Errorf("panic in series code: %v", r)
			}
		}()

		result := fn(data)
		resultChan <- result
	}()

	select {
	case result := <-resultChan:
		return result, nil
	case err := <-errChan:
		return nil, err
	case <-ctx.Done():
		return nil, fmt.Errorf("series code execution timeout")
	}
}

// ValidateSeriesOutput checks if series data has correct format
func (se *SeriesExecutor) ValidateSeriesOutput(
	output map[string]interface{},
	expectedIndicators []string,
) error {
	if output == nil || len(output) == 0 {
		return fmt.Errorf("series output is empty")
	}

	// Check all expected indicators are present
	for _, indID := range expectedIndicators {
		if _, exists := output[indID]; !exists {
			return fmt.Errorf("missing indicator: %s", indID)
		}
	}

	// Validate each indicator's data format
	for key, value := range output {
		// Try to type assert to slice
		dataPoints, ok := value.([]interface{})
		if !ok {
			return fmt.Errorf("indicator %s: invalid data format, expected []interface{}", key)
		}

		// Check data points have required fields
		for i, point := range dataPoints {
			pointMap, ok := point.(map[string]interface{})
			if !ok {
				return fmt.Errorf("indicator %s, point %d: not a map", key, i)
			}

			if _, hasX := pointMap["x"]; !hasX {
				return fmt.Errorf("indicator %s, point %d: missing 'x' field", key, i)
			}
			if _, hasY := pointMap["y"]; !hasY {
				return fmt.Errorf("indicator %s, point %d: missing 'y' field", key, i)
			}
		}
	}

	return nil
}
