# Indicator Visualization with Go Backend - Analysis & Solutions

**Created:** 2025-01-05
**Status:** Architecture Decision

## Problem Statement

The frontend used to display technical indicators on candlestick charts when signals were clicked. This functionality was lost during migration from browser-based signal generation to the Go backend.

**Current State:**
- ✅ Go backend calculates indicators perfectly (7 indicators implemented)
- ✅ Frontend has robust chart visualization (Chart.js with multi-panel support)
- ❌ Indicator data is NOT persisted - calculated then discarded
- ❌ No way to retrieve indicator values for historical signals

## Architecture Analysis

### Go Backend Signal Generation Flow

```
Candle Close Event → Event Bus → Trader Executor
    ↓
Filter Execution (Yaegi interpreter)
    ↓
Indicators Calculated (MA, EMA, RSI, MACD, BB, VWAP, Stochastic)
    ↓
Filter Returns true/false
    ↓
IF TRUE: Create Signal Record
    - ✅ Stored: id, symbol, price, volume, timestamp
    - ❌ LOST: All indicator values and series data
```

**Key Files:**
- `backend/go-screener/pkg/indicators/indicators.go` - 7 indicators with full historical series
- `backend/go-screener/internal/screener/event_handler.go:218-257` - Signal creation
- `backend/go-screener/pkg/types/types.go:114-128` - Signal struct (no indicator fields)

### Frontend Chart Visualization Capabilities

The frontend has a sophisticated indicator rendering system:

**Features:**
- Web Worker-based parallel calculations
- Multi-panel layout (price + up to 4 indicator panels)
- Synchronized zoom/pan across panels
- Custom indicator configuration system
- Support for multi-line indicators (Bollinger Bands, MACD)

**Key Files:**
- `apps/app/components/ChartDisplay.tsx` - Main chart rendering
- `apps/app/hooks/useIndicatorWorker.ts` - Parallel calculations
- `apps/app/workers/indicatorWorker.ts` - Dynamic function execution
- `apps/app/utils/chartHelpers.ts` - Dataset creation

**Expected Data Structure:**
```typescript
interface IndicatorDataPoint {
  x: number;      // timestamp
  y: number;      // primary value
  y2?: number;    // secondary (e.g., Bollinger upper)
  y3?: number;    // tertiary (e.g., Bollinger lower)
  y4?: number;    // quaternary
  color?: string;
}
```

### Database Schema

**signals table:**
```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY,
  trader_id UUID REFERENCES traders(id),
  symbol TEXT,
  interval TEXT,
  timestamp TIMESTAMPTZ,
  price_at_signal FLOAT8,
  volume_at_signal FLOAT8,
  -- NO INDICATOR DATA FIELDS
);
```

**signal_analyses table:**
```sql
CREATE TABLE signal_analyses (
  id UUID PRIMARY KEY,
  signal_id UUID REFERENCES signals(id),
  technical_indicators JSONB,  -- Only populated during AI analysis (Elite tier)
  -- ...
);
```

## Solution Options

### ⭐ Option 1: Store Indicators with Signals (RECOMMENDED)

**Approach:** Add `indicator_data JSONB` column to signals table, populate during signal generation.

**Implementation:**

1. **Database Migration:**
```sql
ALTER TABLE signals ADD COLUMN indicator_data JSONB;
CREATE INDEX idx_signals_indicator_data ON signals USING gin(indicator_data);
```

2. **Go Backend Changes:**

File: `backend/go-screener/pkg/types/types.go`
```go
type Signal struct {
    // ... existing fields ...
    IndicatorData map[string]interface{} `json:"indicator_data,omitempty"`
}
```

File: `backend/go-screener/internal/screener/event_handler.go`
```go
func (h *EventHandler) executeTrader(trader *types.Trader, candle *types.Candle) {
    // ... existing filter execution ...

    if matched {
        // BEFORE discarding scope, extract indicator values
        indicatorData := make(map[string]interface{})

        for _, indConfig := range trader.Filter.Indicators {
            if value, exists := scope["indicator_"+indConfig.ID]; exists {
                indicatorData[indConfig.ID] = value
            }
        }

        signal := &types.Signal{
            // ... existing fields ...
            IndicatorData: indicatorData,
        }

        h.db.CreateSignal(ctx, signal)
    }
}
```

3. **Frontend Changes:**

File: `apps/app/src/abstractions/interfaces.ts`
```typescript
interface SignalLifecycle {
    // ... existing fields ...
    indicatorData?: Record<string, IndicatorDataPoint[]>;
}
```

File: `apps/app/components/ChartDisplay.tsx`
```typescript
// When signal is selected, pass indicator data directly to chart
<ChartDisplay
    symbol={selectedSignal.symbol}
    klines={klines}
    indicators={selectedSignal.indicatorData || []}  // ← Use stored data
    interval={selectedSignal.interval}
/>
```

**Pros:**
- ✅ Zero latency - data immediately available
- ✅ Accurate - exact values at signal generation time
- ✅ No recalculation needed
- ✅ Best UX - instant chart display
- ✅ Works for all signals (not just analyzed ones)

**Cons:**
- ⚠️ Increases storage (~5-10KB per signal for typical indicators)
- ⚠️ Requires schema migration
- ⚠️ Need to update all signal creation paths

**Effort Estimate:** 4-6 hours
**Storage Impact:** ~10MB per 1000 signals (negligible)

---

### Option 2: Recalculate Indicators in Frontend

**Approach:** Duplicate indicator logic in TypeScript, calculate when chart is displayed.

**Implementation:**

1. Port Go indicator functions to TypeScript
2. When signal is clicked, fetch klines and calculate
3. Display on chart

**Pros:**
- ✅ No backend changes
- ✅ No storage overhead

**Cons:**
- ❌ Duplicate logic (Go + TypeScript)
- ❌ Maintenance nightmare (2 implementations)
- ❌ Risk of inconsistencies
- ❌ Frontend performance overhead
- ❌ Not showing exact values at signal time

**Effort Estimate:** 8-12 hours (porting + testing)

---

### Option 3: On-Demand API Endpoint

**Approach:** Create Go API endpoint that calculates indicators for any symbol/interval/timerange.

**Implementation:**

```go
// GET /api/v1/indicators/calculate?symbol=BTCUSDT&interval=5m&from=...&to=...
func (s *Server) handleCalculateIndicators(w http.ResponseWriter, r *http.Request) {
    // Fetch klines from Binance
    // Calculate indicators
    // Return indicator data points
}
```

**Pros:**
- ✅ Single source of truth
- ✅ No storage overhead

**Cons:**
- ❌ Latency on every chart view (Binance API call + calculation)
- ❌ Server load for frequent requests
- ❌ Complex caching needed
- ❌ Rate limiting concerns

**Effort Estimate:** 6-8 hours

---

### Option 4: Store in signal_analyses Table

**Approach:** Use existing `technical_indicators` JSONB field in signal_analyses.

**Pros:**
- ✅ Field already exists

**Cons:**
- ❌ Only for analyzed signals (Elite tier only)
- ❌ Analysis happens asynchronously (not immediate)
- ❌ Incomplete solution (most signals won't have data)
- ❌ Analysis may not calculate all chart indicators

**Not Recommended**

---

## Recommendation: Option 1

**Store indicator data with signals during generation.**

### Why Option 1?

1. **Best UX:** Instant chart display with zero waiting
2. **Accurate:** Shows exact values that triggered the signal
3. **Scalable:** Works for all users and all signals
4. **Maintainable:** Single calculation point (Go backend)
5. **Storage Cost:** Negligible (~10MB per 1000 signals)

### Implementation Phases

**Phase 1: Database (30 min)**
- Add `indicator_data JSONB` column
- Create GIN index for JSONB queries
- Migration tested on dev environment

**Phase 2: Go Backend (2-3 hours)**
- Update Signal struct
- Modify signal creation to capture indicator values
- Update database insert/query functions
- Add indicator data to API responses

**Phase 3: Frontend (1-2 hours)**
- Update SignalLifecycle interface
- Modify ChartDisplay to accept stored indicator data
- Update signal selection handlers
- Test visualization with real data

**Phase 4: Testing (1 hour)**
- Verify indicator data is stored correctly
- Verify charts render with stored data
- Performance testing (query times with JSONB)
- E2E test: create signal → view chart

### Data Structure Example

```json
{
  "signal_id": "abc-123",
  "symbol": "BTCUSDT",
  "indicator_data": {
    "rsi_14": {
      "type": "line",
      "points": [
        {"x": 1704470400000, "y": 45.2},
        {"x": 1704470700000, "y": 48.7},
        {"x": 1704471000000, "y": 52.1}
      ]
    },
    "bb_20_2": {
      "type": "multi_line",
      "points": [
        {"x": 1704470400000, "y": 43500, "y2": 44000, "y3": 43000},
        {"x": 1704470700000, "y": 43600, "y2": 44100, "y3": 43100}
      ]
    },
    "ema_9": {
      "type": "line",
      "points": [
        {"x": 1704470400000, "y": 43450},
        {"x": 1704470700000, "y": 43520}
      ]
    }
  }
}
```

### Storage Analysis

**Typical indicator storage:**
- RSI (1 line, 150 points): ~1.5KB
- MACD (3 lines, 150 points): ~4.5KB
- Bollinger Bands (3 lines, 150 points): ~4.5KB
- EMA/MA (1 line, 150 points): ~1.5KB

**Total per signal:** ~5-10KB (worst case)

**Scale:**
- 1,000 signals = 10MB
- 10,000 signals = 100MB
- 100,000 signals = 1GB

For a typical trading app, this is negligible compared to the value of instant chart visualization.

### Alternative: Compression

If storage becomes a concern, JSONB supports compression automatically, or we can:
- Store only last 50-100 data points (not full 150)
- Use float32 instead of float64 in JSON
- Compress older signals (>7 days) and decompress on demand

## Next Steps

1. **Get user approval** on Option 1 approach
2. **Create implementation issue** in `context/issues/open/`
3. **Implement Phase 1-4** with testing
4. **Document** indicator data format for future developers

## References

- Go Indicators: `backend/go-screener/pkg/indicators/indicators.go`
- Signal Generation: `backend/go-screener/internal/screener/event_handler.go`
- Frontend Charts: `apps/app/components/ChartDisplay.tsx`
- Database Schema: `supabase/migrations/`
