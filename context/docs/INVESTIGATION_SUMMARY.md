# Go Backend Signal Architecture Investigation - Summary

**Investigation Date**: November 5, 2025  
**Investigation Scope**: Signal generation, filter execution, indicator calculation, data flow to frontend  
**Status**: Complete with recommendations

---

## Investigation Questions & Answers

### Q1: Where and how are signals generated in the Go backend?

**Answer:**
Signals are generated through an **event-driven architecture**:

1. **WebSocket Feed** → Market data updates from Binance
2. **Event Bus** → Publishes candle close events when new candles complete
3. **Trader Executor** → Matches traders to candle events based on timeframe
4. **Worker Pool** → Processes symbols in parallel (one worker per CPU core)
5. **Filter Execution** → Runs trader's Go code via Yaegi interpreter
6. **Signal Creation** → If filter returns true, create signal object

**Key Files:**
- `/backend/go-screener/internal/trader/executor.go` (Lines 156-360)
  - `handleCandleEvent()`: Matches traders to intervals
  - `executeTrader()`: Orchestrates execution
  - `processSymbol()`: Runs filter code per symbol

**Performance:**
- Signals generated in real-time (sub-second latency)
- Parallel processing: 100 symbols × 6 workers = 600 checks/sec

---

### Q2: What data structure is returned when signals are generated?

**Answer:**
Signals use the `types.Signal` struct:

```go
type Signal struct {
    ID                    string    // UUID
    TraderID              string    // Which trader generated it
    UserID                *string   // NULL for built-in traders
    Symbol                string    // e.g., "BTCUSDT"
    Interval              string    // e.g., "5m"
    Timestamp             time.Time // When signal triggered
    PriceAtSignal         float64   // Spot price at trigger
    ChangePercentAtSignal float64   // 24h % change
    VolumeAtSignal        float64   // Quote volume
    Count                 int       // Dedupe counter
    Source                string    // "browser" or "cloud"
    MachineID             *string   // Optional machine ID
}
```

**File:** `/backend/go-screener/pkg/types/types.go` (Lines 114-128)

**When Returned:**
- `executeTrader()` returns array of `Signal` objects (Line 368)
- `ExecutionResult.Signals` field contains generated signals
- Signals immediately saved to Supabase

---

### Q3: How are indicators calculated in Go?

**Answer:**
Indicators are calculated asynchronously during signal analysis:

**When:** After signal saved to DB, queued for analysis  
**Where:** `calculator.CalculateIndicators()` (Line 24 of calculator.go)  
**Process:**
1. Get indicator configs from trader's filter
2. Fetch klines for the signal's interval
3. Calculate each indicator (7 types supported)
4. Return as `map[string]interface{}`

**Supported Indicators:**
- MA/SMA, EMA (with series)
- RSI (with series)
- MACD (macd + signal + histogram + series)
- Bollinger Bands (upper/middle/lower + series)
- VWAP (single value)
- Stochastic (K & D values)

**Example Output:**
```go
map[string]interface{}{
    "RSI": map[string]interface{}{
        "value": 28.5,
        "series": []float64{45.2, 44.8, 42.3, ...},
        "period": 14,
    },
    "MACD": map[string]interface{}{
        "macd": 0.1543,
        "signal": 0.1289,
        "histogram": 0.0254,
        // plus 3 series fields
    },
}
```

**Files:**
- `/backend/go-screener/internal/analysis/calculator.go` (Lines 24-303)
- `/backend/go-screener/pkg/indicators/helpers.go` (Lines 1-456)

---

### Q4: Are indicator values stored or just used for filtering?

**Answer:**
**Indicators are NOT stored in the database.**

**Current Usage:**
- Calculated during signal analysis (not during filter execution)
- Used to build AI analysis prompt (prompter.go Line 40)
- Formatted as readable text for OpenRouter API
- Discarded after analysis (not persisted)

**Why NOT Stored:**
1. **Performance**: Every signal would require 250+ indicator calculations
2. **Storage**: Multiplying signals × indicators × series length = massive DB overhead
3. **Timing**: Indicators calculated asynchronously, after signal saved
4. **Current Need**: Only needed for AI analysis, which is one-time

**Critical Finding:**
> Indicators exist only in-memory during analysis. There is **no way to retrieve indicator values** for a past signal from the database.

---

### Q5: What is the API endpoint that returns signals to the frontend?

**Answer:**
**The main signal endpoints are NOT fully implemented:**

**Implemented:**
- `POST /api/v1/traders/{id}/execute-immediate` (Line 220 of server.go)
  - Executes trader immediately and returns `ExecutionResult`
  - Returns generated signals with basic fields
  - **Does NOT include indicators**

**Not Implemented:**
- `GET /api/v1/signals` (Line 204)
  - Returns error: "Not implemented" (Line 505)
  - Would fetch signals from database

**Signal Response Structure:**
```go
type ExecutionResult struct {
    TraderID       string    `json:"traderId"`
    Timestamp      time.Time `json:"timestamp"`
    TotalSymbols   int       `json:"totalSymbols"`
    MatchCount     int       `json:"matchCount"`
    Signals        []Signal  `json:"signals"`      // NO indicators
    ExecutionTime  int64     `json:"executionTimeMs"`
    CacheHits      int       `json:"cacheHits"`
    CacheMisses    int       `json:"cacheMisses"`
}
```

**Files:**
- `/backend/go-screener/internal/server/server.go` (Lines 203-506)
- `/backend/go-screener/internal/server/trader_handlers.go` (Lines 206-247)

---

### Q6: What data is currently included in signal responses?

**Answer:**

**Included in Signal Response:**
- ✓ ID, TraderID, UserID
- ✓ Symbol, Interval
- ✓ TriggeredAt (timestamp)
- ✓ Price (price_at_signal)
- ✓ Volume (volume_at_signal)
- ✓ Metadata (empty map)

**NOT Included:**
- ✗ Indicator values (RSI, MACD, Bollinger Bands, etc.)
- ✗ Kline data (OHLCV)
- ✗ Market context (24h change, volume)
- ✗ Indicator series (historical data)

**Database Signals:**
Saved to Supabase with only:
```
id, trader_id, user_id, symbol, interval, timestamp, 
price_at_signal, change_percent_at_signal, volume_at_signal, 
count, source, machine_id
```

---

## Key Findings

### Finding 1: Indicator Data Loss
Indicators are calculated during analysis but never persisted. This means:
- No way to reconstruct what indicators were at signal time
- Frontend cannot display indicators without recalculating
- Duplicate calculation (once for analysis, again on frontend)

### Finding 2: Event-Driven Architecture is Solid
- Real-time signal generation via WebSocket → Event Bus → Traders
- Parallel execution with worker pool
- Efficient and scalable design
- Only limitation: no indicator storage

### Finding 3: Complete Indicator Support Exists
Go backend has full implementations of:
- 7 indicator types (MA, EMA, RSI, MACD, BB, VWAP, Stochastic)
- Series calculations (historical data)
- Complex multi-line indicators (MACD has 3 series)
- All needed for chart visualization

### Finding 4: Analysis Engine is Separate
- Indicators calculated asynchronously for AI analysis
- Different from filter execution phase
- Uses same kline data but recalculates everything
- Braintrust integration for tracing

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIGNAL GENERATION FLOW                        │
└─────────────────────────────────────────────────────────────────┘

Binance WebSocket
      ↓
  ┌───────────────────┐
  │   Event Bus       │  Broadcasts candle close events
  │                   │
  │  1m, 5m, 15m      │
  │  1h, 4h, 1d       │
  └────────┬──────────┘
           ↓
  ┌──────────────────────────────────────┐
  │   Trader Executor                    │
  │   - Matches traders to intervals     │
  │   - Fetches klines & tickers         │
  │   - Worker pool (N cores)            │
  └────────┬─────────────────────────────┘
           ↓ (Parallel per symbol)
  ┌──────────────────────────────────────┐
  │   processSymbol()                    │
  │   - Build MarketData                 │
  │   - Execute filter code (Yaegi)      │
  │   - If match: create Signal          │
  └────────┬─────────────────────────────┘
           ↓
  ┌──────────────────────────────────────┐
  │   Signal (In-Memory)                 │
  │   - ID, Symbol, Price, Volume        │
  │   - Metadata (empty)                 │
  │   - Indicators NOT included ✗        │
  └────────┬─────────────────────────────┘
           ↓
  ┌──────────────────────────────────────┐
  │   Save to Supabase                   │
  │   - Basic signal fields only         │
  │   - Indicators NOT persisted ✗       │
  └────────┬─────────────────────────────┘
           ↓
  ┌──────────────────────────────────────┐
  │   Queue for Analysis (Async)         │
  │   - Fetch klines again               │
  │   - Calculate indicators             │
  │   - Format for AI prompt             │
  │   - Call OpenRouter                  │
  │   - Indicators stored in memory only │
  └──────────────────────────────────────┘


PROBLEM FOR FRONTEND:
====================
Signal stored in DB → Frontend loads signal → No indicator data available
                                            → Must recalculate on frontend
                                            → Or make separate API call
```

---

## Recommendations for Chart Visualization

### Recommended Approach: Store Indicators with Signal

**Implementation Path:**
1. **Schema**: Add `indicator_data JSONB` column to signals table
2. **Calculation**: Calculate indicators during filter execution (not after)
3. **Storage**: Include in signal before saving to DB
4. **API**: Return indicators in signal response
5. **Frontend**: Receive indicators, display immediately

**Benefits:**
- Zero latency (indicators in signal response)
- Accurate (calculated at signal time, not recalculated)
- No duplicate calculation
- Persistent storage
- No extra API calls

**Effort**: 2-4 hours  
**Database Impact**: Minor (JSONB is efficient)  
**Frontend Impact**: Simple (receive data already included)

---

## Files to Reference for Implementation

| File | Purpose | Critical Lines |
|------|---------|-----------------|
| executor.go | Signal generation | 188-360, 689-755 |
| calculator.go | Indicator calculations | 24-303 |
| prompter.go | Format indicators for AI | 20-225 |
| types.go | Signal struct | 114-128 |
| server.go | API endpoints | 203-506 |
| indicators/helpers.go | Indicator implementations | 1-456 |

---

## Next Steps

1. **Decision**: Confirm storing indicators with signals approach
2. **Design**: Finalize JSONB schema for indicator_data
3. **Implementation**: Modify executor to calculate and store indicators
4. **Testing**: Verify indicator accuracy and DB performance
5. **Frontend**: Build chart component to consume indicator data
6. **Deployment**: Run migration, update API contracts

---

## Conclusion

The Go backend has **all the infrastructure needed** for chart visualization:
- Event-driven signal generation ✓
- Complete indicator calculation suite ✓
- Kline data availability ✓
- AI analysis pipeline ✓

The only gap is **persistence and exposure** of indicator data. Implementing the recommended approach (storing indicators with signals) requires minimal changes but provides maximum value to the frontend and users.
