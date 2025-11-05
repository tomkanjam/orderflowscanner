# Go Backend: Series Code Execution

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-01-05 12:58:47

## Context

Implement series code execution in the Go backend. When a filter matches (returns true), execute the series code to generate indicator data and store it with the signal.

## Linked Items

- Part of: `context/issues/open/20251105-125847-001-PROJECT-custom-indicator-visualization.md`
- Depends on: `context/issues/open/20251105-125847-003-database-schema-indicator-storage.md`

## Progress

Pending - will start after database schema changes are complete.

## Spec

### Architecture

```
Candle Close Event
    ↓
Execute Filter Code (existing)
    ↓
Returns true?
    ↓ YES
Execute Series Code (NEW)
    ↓
Get map[string]interface{} with indicator data
    ↓
Store in signals.indicator_data
    ↓
Return signal to frontend
```

### Code Changes Required

#### 1. Update Types (`pkg/types/types.go`)

Add SeriesCode to TraderFilter:
```go
type TraderFilter struct {
    Code                string               `json:"code"`                // Filter code (bool)
    SeriesCode          string               `json:"seriesCode"`          // NEW: Series code (map)
    Description         []string             `json:"description"`
    Indicators          []IndicatorConfig    `json:"indicators"`
    RequiredTimeframes  []string             `json:"requiredTimeframes"`
}
```

Add IndicatorData to Signal:
```go
type Signal struct {
    ID                    string                 `json:"id"`
    TraderID              string                 `json:"trader_id"`
    Symbol                string                 `json:"symbol"`
    // ... existing fields ...
    IndicatorData         map[string]interface{} `json:"indicator_data,omitempty"` // NEW
}
```

#### 2. Create Series Executor (`internal/screener/series_executor.go`)

New file for series code execution:

```go
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

type SeriesExecutor struct {
    timeout time.Duration
}

func NewSeriesExecutor(timeout time.Duration) *SeriesExecutor {
    return &SeriesExecutor{
        timeout: timeout,
    }
}

// ExecuteSeriesCode runs the series code and returns indicator data
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
    // Check all expected indicators are present
    for _, indID := range expectedIndicators {
        if _, exists := output[indID]; !exists {
            return fmt.Errorf("missing indicator: %s", indID)
        }
    }

    // Validate each indicator's data format
    for key, value := range output {
        dataPoints, ok := value.([]map[string]interface{})
        if !ok {
            return fmt.Errorf("indicator %s: invalid data format, expected []map[string]interface{}", key)
        }

        // Check data points have required fields
        for i, point := range dataPoints {
            if _, hasX := point["x"]; !hasX {
                return fmt.Errorf("indicator %s, point %d: missing 'x' field", key, i)
            }
            if _, hasY := point["y"]; !hasY {
                return fmt.Errorf("indicator %s, point %d: missing 'y' field", key, i)
            }
        }
    }

    return nil
}
```

#### 3. Integrate into Event Handler (`internal/screener/event_handler.go`)

Modify signal creation to execute series code:

```go
func (h *EventHandler) executeTrader(trader *types.Trader, candle *types.Candle) {
    // ... existing filter execution ...

    if matched {
        // NEW: Execute series code if available
        var indicatorData map[string]interface{}

        if trader.Filter.SeriesCode != "" {
            ctx := context.Background()
            data, err := h.seriesExecutor.ExecuteSeriesCode(ctx, trader.Filter.SeriesCode, marketData)

            if err != nil {
                h.logger.Error("series code execution failed",
                    "trader_id", trader.ID,
                    "symbol", candle.Symbol,
                    "error", err,
                )
                // Continue with signal creation (graceful degradation)
            } else {
                // Validate output
                expectedIndicators := make([]string, len(trader.Filter.Indicators))
                for i, ind := range trader.Filter.Indicators {
                    expectedIndicators[i] = ind.ID
                }

                if err := h.seriesExecutor.ValidateSeriesOutput(data, expectedIndicators); err != nil {
                    h.logger.Warn("series output validation failed",
                        "trader_id", trader.ID,
                        "error", err,
                    )
                } else {
                    indicatorData = data
                }
            }
        }

        // Create signal with indicator data
        signal := &types.Signal{
            ID:                    uuid.New().String(),
            TraderID:              trader.ID,
            UserID:                trader.UserID,
            Symbol:                candle.Symbol,
            Interval:              candle.Interval,
            Timestamp:             time.Now(),
            PriceAtSignal:         candle.Close,
            ChangePercentAtSignal: /* calculate */,
            VolumeAtSignal:        candle.Volume,
            IndicatorData:         indicatorData, // NEW
        }

        h.db.CreateSignal(ctx, signal)
    }
}
```

#### 4. Update Database Client (`internal/database/client.go`)

Add indicator_data to INSERT statement:

```go
func (c *Client) CreateSignal(ctx context.Context, signal *types.Signal) error {
    query := `
        INSERT INTO signals (
            id, trader_id, user_id, symbol, interval,
            timestamp, price_at_signal, volume_at_signal,
            indicator_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `

    _, err := c.db.ExecContext(ctx, query,
        signal.ID,
        signal.TraderID,
        signal.UserID,
        signal.Symbol,
        signal.Interval,
        signal.Timestamp,
        signal.PriceAtSignal,
        signal.VolumeAtSignal,
        signal.IndicatorData, // NEW
    )

    return err
}
```

Add indicator_data to SELECT queries:

```go
func (c *Client) GetSignalsByTrader(ctx context.Context, traderID string) ([]*types.Signal, error) {
    query := `
        SELECT
            id, trader_id, symbol, interval, timestamp,
            price_at_signal, volume_at_signal, indicator_data
        FROM signals
        WHERE trader_id = $1
        ORDER BY timestamp DESC
    `

    // ... scan including indicator_data ...
}
```

#### 5. Update API Responses (`internal/api/handlers.go`)

Ensure indicator_data is included in JSON responses:

```go
func (h *Handler) GetSignals(w http.ResponseWriter, r *http.Request) {
    signals, err := h.db.GetSignals(ctx)
    // ...

    // indicator_data automatically serialized by encoding/json
    json.NewEncoder(w).Encode(signals)
}
```

### Error Handling Strategy

1. **Series code execution fails**:
   - Log error
   - Continue creating signal without indicator_data
   - Frontend shows chart without indicators (graceful degradation)

2. **Series code timeout** (default 5s):
   - Cancel execution
   - Log timeout error
   - Create signal without indicator_data

3. **Invalid series output**:
   - Log validation errors
   - Don't store invalid data
   - Create signal without indicator_data

### Performance Considerations

1. **Execution timeout**: 5 seconds (configurable)
2. **Memory**: Series code limited by Yaegi interpreter overhead
3. **Concurrency**: Series execution in worker pool (same as filter execution)
4. **Caching**: Not needed (only runs on signal trigger, low frequency)

### Testing Strategy

1. Unit tests for SeriesExecutor
2. Test with various indicator types (single-line, multi-line)
3. Test error handling (timeout, panic, invalid output)
4. Integration test: filter + series execution
5. Load test: measure overhead

## Implementation Steps

1. Update types.go with new fields
2. Create series_executor.go
3. Add series executor to event handler
4. Update database client for indicator_data
5. Test with sample traders
6. Verify API responses include indicator_data

## Completion Criteria

1. ✅ SeriesExecutor implemented
2. ✅ Integrated into event handler
3. ✅ indicator_data stored in database
4. ✅ API responses include indicator_data
5. ✅ Error handling works (graceful degradation)
6. ✅ Unit tests pass
7. ✅ Integration tests pass
