# Custom Indicator Visualization Solution

**Created:** 2025-01-05
**Status:** Architecture Design

## Problem Reframed

Users can create **completely novel indicators** that don't exist in any standard library:
- Stochastic RSI
- Custom momentum formulas
- Volume-weighted divergence metrics
- Multi-timeframe composite indicators
- Any mathematical transformation of price/volume data

**The Go backend calculates these custom indicators during filter execution, but the values are discarded.**

The frontend needs these calculated values to visualize the indicators on charts.

## Key Insight: The Filter Already Calculates Everything

When a user describes a filter like:
> "Alert me when Stochastic RSI K line crosses below 20"

The LLM generates Go code that:
1. ✅ Loads kline data
2. ✅ Calculates RSI series (14 periods)
3. ✅ Applies Stochastic calculation to RSI values
4. ✅ Checks if K < 20
5. ❌ **Discards all intermediate values** (RSI series, K line, D line)

**We need to extract and persist these intermediate calculations.**

## Solution Architecture

### Option A: Dual Code Generation (RECOMMENDED)

Generate **two pieces of code** from the same prompt:

1. **Filter Code** (existing): Returns `true/false` for signal matching
2. **Series Code** (new): Returns indicator data series for visualization

Both use the same calculation logic, but serve different purposes.

#### Modified Response Format

```json
{
  "filterCode": "string (returns bool)",
  "seriesCode": "string (returns map[string]interface{})",
  "requiredTimeframes": ["5m", "15m"],
  "indicators": [
    {
      "id": "stoch_rsi_k",
      "name": "Stochastic RSI %K",
      "type": "line",
      "panel": true,
      "params": {"rsi_period": 14, "stoch_period": 14}
    },
    {
      "id": "stoch_rsi_d",
      "name": "Stochastic RSI %D",
      "type": "line",
      "panel": true,
      "params": {"period": 3}
    }
  ]
}
```

#### Filter Code (Existing)

```go
func evaluate(data *types.MarketData) bool {
    klines := data.Klines["15m"]
    if len(klines) < 100 {
        return false
    }

    // Calculate Stochastic RSI K
    stochRSI_K := calculateStochRSI_K(klines, 14, 14)
    if stochRSI_K == nil {
        return false
    }

    return *stochRSI_K < 20.0
}
```

#### Series Code (New)

```go
func calculateSeries(data *types.MarketData) map[string]interface{} {
    result := make(map[string]interface{})

    klines := data.Klines["15m"]
    if len(klines) < 100 {
        return result
    }

    // Calculate RSI series (first 14 periods)
    rsiSeries := make([]map[string]interface{}, 0)
    for i := 14; i < len(klines); i++ {
        rsi := calculateRSI(klines[:i+1], 14)
        rsiSeries = append(rsiSeries, map[string]interface{}{
            "x": klines[i].OpenTime,
            "y": rsi,
        })
    }

    // Calculate Stochastic RSI K and D lines
    stochK := make([]map[string]interface{}, 0)
    stochD := make([]map[string]interface{}, 0)

    for i := 28; i < len(klines); i++ {  // Need 14 RSI values for stoch
        k := calculateStochRSI_K(klines[:i+1], 14, 14)
        d := calculateStochRSI_D(klines[:i+1], 14, 14, 3)

        stochK = append(stochK, map[string]interface{}{
            "x": klines[i].OpenTime,
            "y": k,
        })
        stochD = append(stochD, map[string]interface{}{
            "x": klines[i].OpenTime,
            "y": d,
        })
    }

    result["stoch_rsi_k"] = stochK
    result["stoch_rsi_d"] = stochD

    return result
}
```

### Execution Flow

```
User creates filter with custom indicator
    ↓
LLM generates filterCode + seriesCode
    ↓
Backend stores both in traders table
    ↓
When candle closes:
    → Execute filterCode → true/false
    → If true: Execute seriesCode → indicator data
    ↓
Store signal with indicator_data JSONB
    ↓
Frontend fetches signal with indicators
    ↓
Chart renders immediately
```

### Database Schema

**traders table:**
```sql
ALTER TABLE traders ADD COLUMN series_code TEXT;
```

**signals table:**
```sql
ALTER TABLE signals ADD COLUMN indicator_data JSONB;
CREATE INDEX idx_signals_indicator_data ON signals USING gin(indicator_data);
```

### Prompt Modifications

Add to the filter generation prompt:

```markdown
## Output Format

Return a JSON object with BOTH filter and series code:

{
  "filterCode": "// Boolean evaluation logic",
  "seriesCode": "// Returns map[string]interface{} with indicator data",
  "requiredTimeframes": ["5m"],
  "indicators": [
    {
      "id": "unique_id",
      "name": "Display Name",
      "type": "line" | "bar",
      "panel": true | false,
      "params": { /* indicator parameters */ }
    }
  ]
}

### filterCode Requirements

- Returns `bool` (true for signal match)
- Efficient - only calculates what's needed for the condition
- Same as current implementation

### seriesCode Requirements

- Returns `map[string]interface{}`
- Each key is an indicator ID matching the indicators array
- Each value is a slice of data points: `[]map[string]interface{}`
- Data point format: `{"x": timestamp, "y": value, "y2": optional, ...}`
- Include last 150 data points (or less if not enough klines)
- Only calculate for the primary timeframe (first in requiredTimeframes)

### seriesCode Example Structure

func calculateSeries(data *types.MarketData) map[string]interface{} {
    result := make(map[string]interface{})

    klines := data.Klines["{{klineInterval}}"]
    if len(klines) < REQUIRED_PERIOD {
        return result
    }

    // Calculate indicator series
    indicatorData := make([]map[string]interface{}, 0)

    // Get last 150 points or all available
    startIdx := len(klines) - 150
    if startIdx < REQUIRED_PERIOD {
        startIdx = REQUIRED_PERIOD
    }

    for i := startIdx; i < len(klines); i++ {
        value := calculateIndicatorValue(klines[:i+1])
        indicatorData = append(indicatorData, map[string]interface{}{
            "x": klines[i].OpenTime,
            "y": value,
        })
    }

    result["indicator_id"] = indicatorData
    return result
}

### Multi-Line Indicators

For indicators with multiple lines (Bollinger Bands, MACD, Stochastic):

indicatorData = append(indicatorData, map[string]interface{}{
    "x": timestamp,
    "y": upperBand,
    "y2": middleBand,
    "y3": lowerBand,
})

### indicators Array

Describe each calculated indicator:

{
  "id": "bb_20_2",           // Unique ID (matches seriesCode key)
  "name": "Bollinger Bands", // Display name
  "type": "line",            // "line" or "bar"
  "panel": false,            // false = overlay on price, true = separate panel
  "params": {                // Parameters used
    "period": 20,
    "stdDev": 2
  }
}
```

### Example: Complete Response

User request: "Stochastic RSI K below 20"

```json
{
  "filterCode": "klines := data.Klines[\"15m\"]\nif len(klines) < 100 {\n    return false\n}\n\n// Calculate RSI series\nrsiPeriod := 14\nrsiValues := make([]float64, 0)\n\nfor i := rsiPeriod; i < len(klines); i++ {\n    gains := 0.0\n    losses := 0.0\n    \n    for j := i - rsiPeriod + 1; j <= i; j++ {\n        change := klines[j].Close - klines[j-1].Close\n        if change > 0 {\n            gains += change\n        } else {\n            losses += -change\n        }\n    }\n    \n    avgGain := gains / float64(rsiPeriod)\n    avgLoss := losses / float64(rsiPeriod)\n    \n    if avgLoss == 0 {\n        rsiValues = append(rsiValues, 100.0)\n    } else {\n        rs := avgGain / avgLoss\n        rsi := 100.0 - (100.0 / (1.0 + rs))\n        rsiValues = append(rsiValues, rsi)\n    }\n}\n\n// Apply Stochastic to RSI\nif len(rsiValues) < 14 {\n    return false\n}\n\nlastRSI := rsiValues[len(rsiValues)-1]\nminRSI := rsiValues[len(rsiValues)-14]\nmaxRSI := minRSI\n\nfor i := len(rsiValues) - 14; i < len(rsiValues); i++ {\n    if rsiValues[i] < minRSI {\n        minRSI = rsiValues[i]\n    }\n    if rsiValues[i] > maxRSI {\n        maxRSI = rsiValues[i]\n    }\n}\n\nstochRSI := 0.0\nif maxRSI != minRSI {\n    stochRSI = (lastRSI - minRSI) / (maxRSI - minRSI) * 100.0\n}\n\nreturn stochRSI < 20.0",

  "seriesCode": "result := make(map[string]interface{})\n\nklines := data.Klines[\"15m\"]\nif len(klines) < 100 {\n    return result\n}\n\n// Calculate RSI series\nrsiPeriod := 14\nrsiValues := make([]float64, 0)\n\nfor i := rsiPeriod; i < len(klines); i++ {\n    gains := 0.0\n    losses := 0.0\n    \n    for j := i - rsiPeriod + 1; j <= i; j++ {\n        change := klines[j].Close - klines[j-1].Close\n        if change > 0 {\n            gains += change\n        } else {\n            losses += -change\n        }\n    }\n    \n    avgGain := gains / float64(rsiPeriod)\n    avgLoss := losses / float64(rsiPeriod)\n    \n    if avgLoss == 0 {\n        rsiValues = append(rsiValues, 100.0)\n    } else {\n        rs := avgGain / avgLoss\n        rsi := 100.0 - (100.0 / (1.0 + rs))\n        rsiValues = append(rsiValues, rsi)\n    }\n}\n\n// Calculate Stochastic RSI K and D\nstochPeriod := 14\nkData := make([]map[string]interface{}, 0)\ndData := make([]map[string]interface{}, 0)\n\nstartIdx := len(klines) - 150\nif startIdx < rsiPeriod + stochPeriod {\n    startIdx = rsiPeriod + stochPeriod\n}\n\nkValues := make([]float64, 0)\n\nfor i := startIdx; i < len(klines); i++ {\n    rsiIdx := i - rsiPeriod\n    if rsiIdx < stochPeriod - 1 {\n        continue\n    }\n    \n    // Get RSI range for this period\n    minRSI := rsiValues[rsiIdx]\n    maxRSI := minRSI\n    \n    for j := rsiIdx - stochPeriod + 1; j <= rsiIdx; j++ {\n        if rsiValues[j] < minRSI {\n            minRSI = rsiValues[j]\n        }\n        if rsiValues[j] > maxRSI {\n            maxRSI = rsiValues[j]\n        }\n    }\n    \n    // Calculate K\n    k := 0.0\n    if maxRSI != minRSI {\n        k = (rsiValues[rsiIdx] - minRSI) / (maxRSI - minRSI) * 100.0\n    }\n    \n    kValues = append(kValues, k)\n    \n    kData = append(kData, map[string]interface{}{\n        \"x\": klines[i].OpenTime,\n        \"y\": k,\n    })\n    \n    // Calculate D (3-period SMA of K)\n    if len(kValues) >= 3 {\n        d := (kValues[len(kValues)-1] + kValues[len(kValues)-2] + kValues[len(kValues)-3]) / 3.0\n        dData = append(dData, map[string]interface{}{\n            \"x\": klines[i].OpenTime,\n            \"y\": d,\n        })\n    }\n}\n\nresult[\"stoch_rsi_k\"] = kData\nresult[\"stoch_rsi_d\"] = dData\n\nreturn result",

  "requiredTimeframes": ["15m"],
  "indicators": [
    {
      "id": "stoch_rsi_k",
      "name": "Stochastic RSI %K",
      "type": "line",
      "panel": true,
      "params": {
        "rsi_period": 14,
        "stoch_period": 14
      }
    },
    {
      "id": "stoch_rsi_d",
      "name": "Stochastic RSI %D",
      "type": "line",
      "panel": true,
      "params": {
        "smoothing_period": 3
      }
    }
  ]
}
```

## Implementation Plan

### Phase 1: Prompt Engineering (2-3 hours)

1. Update `regenerate-filter-go` prompt in Braintrust
2. Add seriesCode section with examples
3. Add indicators array specification
4. Test with various custom indicators

### Phase 2: Database Schema (30 min)

```sql
-- Add series_code to traders
ALTER TABLE traders ADD COLUMN series_code TEXT;

-- Add indicator_data to signals
ALTER TABLE signals ADD COLUMN indicator_data JSONB;
CREATE INDEX idx_signals_indicator_data ON signals USING gin(indicator_data);
```

### Phase 3: Go Backend (3-4 hours)

1. Update types.go:
   - Add `SeriesCode string` to TraderFilter
   - Add `IndicatorData map[string]interface{}` to Signal

2. Create series executor (similar to filter executor):
   - `executeSeriesCode(seriesCode string, data *types.MarketData)`
   - Returns `map[string]interface{}`

3. Modify signal creation:
   - After filter returns true, execute series code
   - Store indicator_data in signal record

4. Update API responses:
   - Include indicator_data in signal objects

### Phase 4: Frontend (2 hours)

1. Update TypeScript interfaces:
```typescript
interface SignalLifecycle {
    // ... existing fields ...
    indicatorData?: Record<string, IndicatorDataPoint[]>;
}
```

2. Modify ChartDisplay component:
   - Accept indicatorData prop from signal
   - Pass directly to chart (no calculation needed)

3. Update signal selection handlers:
   - Pass signal.indicatorData to ChartDisplay

### Phase 5: Testing (2 hours)

1. Create eval suite with custom indicators:
   - Stochastic RSI
   - ADX
   - Ichimoku
   - Custom momentum formulas

2. Verify:
   - Filter code correctness
   - Series code generates valid data
   - Indicators array matches series keys
   - Chart renders correctly

**Total Effort: 9-11 hours**

## Alternative: Option B (Not Recommended)

**Single Code Path with Side Effects**

Modify filter code to populate a global map during execution:

```go
// Global map for series data (not ideal)
var indicatorSeries = make(map[string]interface{})

func evaluate(data *types.MarketData) bool {
    // Calculate indicator
    stochRSI := calculateStochRSI(...)

    // Store series data as side effect
    indicatorSeries["stoch_rsi"] = seriesData

    return stochRSI < 20.0
}
```

**Cons:**
- Global state (not thread-safe without locking)
- Mixes concerns (filtering + data collection)
- Hard to reason about
- Error-prone

## Why Option A is Better

1. **Separation of Concerns**
   - Filter code: Fast boolean evaluation
   - Series code: Detailed data collection

2. **Performance**
   - Filter runs on every candle (must be fast)
   - Series only runs when signal is generated (can be slower)

3. **Clarity**
   - Two distinct purposes, two distinct functions
   - Easy to understand and maintain

4. **Flexibility**
   - Can optimize each independently
   - Can skip series calculation if not needed

5. **Testing**
   - Can test filter logic separately from visualization logic
   - Evals can verify both outputs independently

## Next Steps

1. ✅ Get approval on Option A approach
2. Create implementation issue
3. Update Braintrust prompt with new format
4. Implement backend changes
5. Test with custom indicators
6. Update frontend
7. E2E testing

## Open Questions

1. **Performance:** Series code could be expensive for complex indicators. Should we:
   - Limit to 150 data points (current plan)
   - Offload to worker pool
   - Cache series calculations

2. **Storage:** Typical indicator data ~5-10KB per signal. For high-volume traders:
   - Consider compression
   - Archive old signals to cold storage
   - Implement TTL on indicator_data

3. **Validation:** How to validate series code output?
   - Check data point format
   - Verify timestamps match klines
   - Validate indicator IDs match

4. **Fallback:** If series code fails:
   - Still create signal (indicator visualization fails gracefully)
   - Log error for debugging
   - Or: Block signal creation?
