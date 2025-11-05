# Indicator Data Flow: Current vs. Needed

## Current Data Flow (Status Quo)

```
FILTER EXECUTION PHASE
======================
Market Data (Klines + Ticker)
  ↓
Filter Code Execution (Yaegi)
  ↓
Signal Generated ✓
  ↓
Signal Saved to DB ✓
  (Only: ID, Symbol, Interval, Price, Volume, Timestamp)


ANALYSIS PHASE (Async)
======================
Signal from DB
  ↓
Fetch Klines & Ticker Again
  ↓
Calculate Indicators
  ↓
Format for AI Prompt
  ↓
Call OpenRouter API
  ↓
Indicators Stored in Memory Only ✗
  (Not saved, not accessible to frontend)
```

---

## Problem: Indicator Data Loss

### What Happens Now

1. **Signal generation**: Filter code runs, indicators COULD be calculated
2. **Signal save**: Only basic signal data persisted (no indicators)
3. **Analysis**: Indicators recalculated from scratch
4. **Frontend**: No indicator data available for chart visualization

### What Frontend Needs

- Indicator values at the exact moment signal was generated
- Full series history (250 RSI values, 250 MACD values, etc.)
- Ability to show: "Price was here, RSI was 28, MACD was positive"
- No recalculation needed - instant display

---

## Three Solutions Compared

### Option 1: Frontend Recalculation

```
Frontend loads signal
  ↓
Fetches klines for symbol/interval
  ↓
JavaScript calculates indicators
  ↓
Displays on chart
```

**Pros:**
- No backend changes needed
- Data always fresh
- Uses existing indicator.js code

**Cons:**
- Slow (200+ candles × 7 indicators = thousands of calculations)
- Duplicates calculation logic
- Different results if JS != Go implementations differ
- User waits for recalc every time they view a signal

**Timing:** ~2-3 seconds per signal

---

### Option 2: On-Demand Endpoint

```
Frontend loads signal
  ↓
Calls GET /api/v1/indicators/BTCUSDT/5m
  ↓
Go backend calculates indicators
  ↓
Returns series data
  ↓
Frontend displays on chart
```

**Pros:**
- Uses fast Go calculations
- No redundant data storage
- Reusable endpoint

**Cons:**
- Extra API call per signal
- Different calculation than when signal was generated
- Rate limiting issues with many signals

**Timing:** ~500ms per API call

---

### Option 3: Store with Signal (Recommended)

```
Signal Generation
  ├─ Filter code executes
  ├─ Signal matches
  └─ Calculate indicators WHILE we have data
      ├─ MA, EMA, RSI, MACD, BB, VWAP, Stochastic
      └─ Store as: signal.indicator_data = JSON

Signal Saved to DB
  ├─ ID, Symbol, Interval, Price, Volume ✓
  └─ IndicatorData (JSON) ✓

Frontend
  ├─ Fetches signal
  ├─ Has all indicator data
  └─ Instant chart display ✓
```

**Pros:**
- One-time calculation (no recalc)
- Accurate (calculated at signal time)
- Fast (no extra calls)
- Persistent (always available)
- Exact data that drove the signal

**Cons:**
- Requires schema change
- Slightly larger DB records
- Need to handle indicator calculation in executor

**Timing:** 0ms (data already included in response)

---

## Implementation Breakdown: Option 3

### Changes Needed

#### 1. Database Schema
```sql
ALTER TABLE signals ADD COLUMN indicator_data JSONB;
```

#### 2. Go Type Change
```go
type Signal struct {
    // ... existing fields
    IndicatorData json.RawMessage `json:"indicator_data"`
}
```

#### 3. Executor Logic
```go
// In processSymbol(), after signal is created:
if signal != nil {
    // Calculate indicators while we have MarketData
    indicators := calculateIndicators(marketData, trader)
    
    // Store as JSON
    indicatorJSON, _ := json.Marshal(indicators)
    signal.Metadata["indicators"] = string(indicatorJSON)
}

// Then in saveSignals():
signal.IndicatorData = []byte(signal.Metadata["indicators"].(string))
```

#### 4. API Response
```go
type SignalResponse struct {
    types.Signal
    Indicators map[string]interface{} `json:"indicators,omitempty"`
}
```

#### 5. Frontend Usage
```typescript
const signal = await fetchSignal(signalId);
// signal.indicator_data already contains:
// {
//   "RSI": { "value": 28.5, "series": [45.2, 44.8, ...] },
//   "MACD": { "macd": 0.15, "signal": 0.12, "histogram": 0.03, ... },
//   "MA50": { "value": 45600, "series": [45500, 45550, ...] }
// }

chart.addIndicator('RSI', signal.indicator_data.RSI.series);
chart.addIndicator('MACD', signal.indicator_data.MACD);
```

---

## Effort Estimate

### Option 1 (Frontend Recalc)
- Effort: 2-3 hours (implement in TypeScript)
- Risk: Medium (calculation differences)
- Performance: Slow (each load = 2-3s wait)

### Option 2 (On-Demand Endpoint)
- Effort: 1-2 hours (add Go endpoint)
- Risk: Low (uses existing code)
- Performance: Medium (extra API call)

### Option 3 (Store with Signal)
- Effort: 2-4 hours (schema + logic + migration)
- Risk: Low (all on backend)
- Performance: Best (instant load)

---

## Recommendation

**Use Option 3** for production implementation because:

1. **Performance**: Instant display, no recalculation
2. **Accuracy**: Indicators match exactly what was calculated at signal time
3. **Simplicity**: Frontend gets everything in one response
4. **Scalability**: No extra API calls or recalculation overhead
5. **Data Integrity**: No version mismatches between Go and frontend calculations

---

## Data Structure Comparison

### Current Signal (DB)
```json
{
  "id": "sig_123",
  "trader_id": "trader_456",
  "symbol": "BTCUSDT",
  "interval": "5m",
  "timestamp": "2025-11-05T10:30:00Z",
  "price_at_signal": 45600.50,
  "volume_at_signal": 1250.5
}
```

### Enhanced Signal with Indicators
```json
{
  "id": "sig_123",
  "trader_id": "trader_456",
  "symbol": "BTCUSDT",
  "interval": "5m",
  "timestamp": "2025-11-05T10:30:00Z",
  "price_at_signal": 45600.50,
  "volume_at_signal": 1250.5,
  "indicator_data": {
    "RSI": {
      "value": 28.5,
      "series": [45.2, 44.8, 42.3, ..., 28.5],
      "period": 14
    },
    "MACD": {
      "macd": 0.1543,
      "signal": 0.1289,
      "histogram": 0.0254,
      "macdSeries": [...],
      "signalSeries": [...],
      "histogramSeries": [...]
    },
    "MA50": {
      "value": 45432.10,
      "series": [45500, 45520, ..., 45432.10],
      "period": 50
    },
    "BollingerBands": {
      "upper": 46200,
      "middle": 45600,
      "lower": 45000,
      "period": 20,
      "stdDev": 2.0
    }
  }
}
```

---

## Next Action Items

1. **Decision**: Confirm Option 3 approach
2. **Schema**: Create migration for indicator_data column
3. **Code**: Modify executor to calculate and store indicators
4. **Testing**: Verify indicator accuracy matches analysis engine
5. **Frontend**: Build chart component to consume indicator data
