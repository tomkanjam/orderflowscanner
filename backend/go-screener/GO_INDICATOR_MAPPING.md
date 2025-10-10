# JavaScript → Go Indicator Function Mapping

**Generated**: 2025-10-10
**Purpose**: Complete reference for LLM prompt migration from JavaScript to Go

---

## Summary

**Total JavaScript Functions**: 35
**Implemented in Go**: 16 ✅
**Missing/Need Implementation**: 19 ❌

---

## IMPLEMENTED FUNCTIONS ✅

### 1. Moving Averages

| JavaScript | Go | Return Type | Notes |
|------------|-----|-------------|-------|
| `helpers.calculateMA(klines, period)` | `indicators.CalculateMA(klines, period)` | `*float64` | Latest value only |
| `helpers.calculateMASeries(klines, period)` | `indicators.CalculateMASeries(klines, period)` | `[]float64` | Full series |
| `helpers.getLatestEMA(klines, period)` | `indicators.CalculateEMA(klines, period)` | `*float64` | ⚠️ Different name! |
| `helpers.calculateEMASeries(klines, period)` | `indicators.CalculateEMASeries(klines, period)` | `[]float64` | Full series |

**Example**:
```javascript
// JavaScript
const sma = helpers.calculateMA(klines, 50);
if (!sma) return false;
return lastClose > sma;
```

```go
// Go
sma := indicators.CalculateMA(klines, 50)
if sma == nil {
    return false
}
return lastClose > *sma
```

---

### 2. RSI (Relative Strength Index)

| JavaScript | Go | Return Type | Notes |
|------------|-----|-------------|-------|
| `helpers.calculateRSI(klines, period)` | `indicators.CalculateRSI(klines, period)` | `*RSIResult` | Returns struct with `.Values []float64` |
| `helpers.getLatestRSI(klines, period)` | `indicators.GetLatestRSI(klines, period)` | `*float64` | Single value |

**Example**:
```javascript
// JavaScript
const rsi = helpers.getLatestRSI(klines, 14);
if (!rsi || rsi > 70) return false;
```

```go
// Go
rsi := indicators.GetLatestRSI(klines, 14)
if rsi == nil || *rsi > 70 {
    return false
}
```

---

### 3. MACD

| JavaScript | Go | Return Type | Notes |
|------------|-----|-------------|-------|
| `helpers.calculateMACDValues(klines, 12, 26, 9)` | `indicators.CalculateMACD(klines, 12, 26, 9)` | `*MACDResult` | Struct: `.MACD`, `.Signal`, `.Histogram` (all `[]float64`) |
| `helpers.getLatestMACD(klines, 12, 26, 9)` | `indicators.GetLatestMACD(klines, 12, 26, 9)` | `*struct{MACD, Signal, Histogram float64}` | Anonymous struct |

**Example**:
```javascript
// JavaScript
const macd = helpers.getLatestMACD(klines, 12, 26, 9);
if (!macd || macd.histogram <= 0) return false;
```

```go
// Go
macd := indicators.GetLatestMACD(klines, 12, 26, 9)
if macd == nil || macd.Histogram <= 0 {
    return false
}
```

---

### 4. Bollinger Bands

| JavaScript | Go | Return Type | Notes |
|------------|-----|-------------|-------|
| `helpers.calculateBollingerBands(klines, 20, 2)` | `indicators.CalculateBollingerBands(klines, 20, 2.0)` | `*BollingerBandsResult` | Struct: `.Upper`, `.Middle`, `.Lower` (all `[]float64`) |
| `helpers.getLatestBollingerBands(klines, 20, 2)` | `indicators.GetLatestBollingerBands(klines, 20, 2.0)` | `*struct{Upper, Middle, Lower float64}` | Anonymous struct |

**Example**:
```javascript
// JavaScript
const bb = helpers.getLatestBollingerBands(klines, 20, 2);
if (!bb) return false;
return lastClose < bb.lower;
```

```go
// Go
bb := indicators.GetLatestBollingerBands(klines, 20, 2.0)
if bb == nil {
    return false
}
return lastClose < bb.Lower
```

---

### 5. Volume

| JavaScript | Go | Return Type | Notes |
|------------|-----|-------------|-------|
| `helpers.calculateAvgVolume(klines, period)` | `indicators.CalculateAvgVolume(klines, period)` | `*float64` | Average volume |

**Example**:
```javascript
// JavaScript
const avgVol = helpers.calculateAvgVolume(klines, 20);
const currentVol = parseFloat(klines[klines.length - 1][5]);
return currentVol > avgVol * 1.5;
```

```go
// Go
avgVol := indicators.CalculateAvgVolume(klines, 20)
currentVol := klines[len(klines)-1].Volume
if avgVol == nil {
    return false
}
return currentVol > (*avgVol * 1.5)
```

---

### 6. High/Low

| JavaScript | Go | Return Type | Notes |
|------------|-----|-------------|-------|
| `helpers.getHighestHigh(klines, period)` | `indicators.GetHighestHigh(klines, period)` | `*float64` | Highest high over period |
| `helpers.getLowestLow(klines, period)` | `indicators.GetLowestLow(klines, period)` | `*float64` | Lowest low over period |

**Example**:
```javascript
// JavaScript
const highestHigh = helpers.getHighestHigh(klines, 30);
const currentPrice = parseFloat(klines[klines.length - 1][4]);
return currentPrice > highestHigh;
```

```go
// Go
highestHigh := indicators.GetHighestHigh(klines, 30)
currentPrice := klines[len(klines)-1].Close
if highestHigh == nil {
    return false
}
return currentPrice > *highestHigh
```

---

### 7. VWAP (Basic)

| JavaScript | Go | Return Type | Notes |
|------------|-----|-------------|-------|
| `helpers.calculateVWAP(klines)` | `indicators.CalculateVWAP(klines)` | `float64` | ⚠️ NOT a pointer! Returns direct value |

**Example**:
```javascript
// JavaScript
const vwap = helpers.calculateVWAP(klines);
return lastClose > vwap;
```

```go
// Go
vwap := indicators.CalculateVWAP(klines)
return lastClose > vwap
```

---

### 8. Stochastic Oscillator

| JavaScript | Go | Return Type | Notes |
|------------|-----|-------------|-------|
| `helpers.calculateStochastic(klines, 14, 3, 3)` | `indicators.CalculateStochastic(klines, 14, 3)` | `*StochasticResult` | ⚠️ Only 2 periods! Struct: `.K`, `.D` |

**Example**:
```javascript
// JavaScript
const stoch = helpers.calculateStochastic(klines, 14, 3, 3);
return stoch.k < 20;
```

```go
// Go
stoch := indicators.CalculateStochastic(klines, 14, 3)
if stoch == nil {
    return false
}
return stoch.K < 20
```

---

### 9. Pattern Detection

| JavaScript | Go | Return Type | Notes |
|------------|-----|-------------|-------|
| `helpers.detectEngulfingPattern(klines)` | `indicators.DetectEngulfingPattern(klines)` | `string` | Returns `"bullish"`, `"bearish"`, or `""` (empty string) |

**Example**:
```javascript
// JavaScript
const pattern = helpers.detectEngulfingPattern(klines);
return pattern === 'bullish';
```

```go
// Go
pattern := indicators.DetectEngulfingPattern(klines)
return pattern == "bullish"
```

---

## MISSING FUNCTIONS ❌

These functions are referenced in JavaScript prompts but **DO NOT EXIST** in the Go backend yet:

### Missing - Critical (Used frequently)

1. ❌ `helpers.calculateStochRSI(klines, 14, 14, 3, 3)` → **No Go equivalent**
2. ❌ `helpers.getLatestStochRSI(klines, 14, 14, 3, 3)` → **No Go equivalent**
3. ❌ `helpers.calculateVWAPSeries(klines, anchorPeriod?)` → **No Go equivalent**
4. ❌ `helpers.getLatestVWAP(klines, anchorPeriod?)` → **No Go equivalent** (only CalculateVWAP exists)
5. ❌ `helpers.calculateVWAPBands(klines, anchorPeriod?, stdDev)` → **No Go equivalent**
6. ❌ `helpers.getLatestVWAPBands(klines, anchorPeriod?, stdDev)` → **No Go equivalent**

### Missing - Medium Priority

7. ❌ `helpers.detectRSIDivergence(klines, 14, 30, 5)` → **No Go equivalent**
8. ❌ `helpers.detectGenericDivergence(series1, series2, 30, 5)` → **No Go equivalent**
9. ❌ `helpers.calculatePVISeries(klines, 1000)` → **No Go equivalent**
10. ❌ `helpers.getLatestPVI(klines, 1000)` → **No Go equivalent**
11. ❌ `helpers.calculateADX(klines, 14)` → **No Go equivalent**

### Missing - Low Priority (HVN - Complex feature)

12. ❌ `helpers.calculateHighVolumeNodes(klines, options)` → **No Go equivalent**
13. ❌ `helpers.isNearHVN(price, hvnNodes, 0.5)` → **No Go equivalent**
14. ❌ `helpers.getClosestHVN(price, hvnNodes, 'both')` → **No Go equivalent**
15. ❌ `helpers.countHVNInRange(low, high, hvnNodes)` → **No Go equivalent**
16. ❌ `helpers.clearHVNCache(cacheKey?)` → **Not needed in Go**

### Missing - Utility Functions

17. ❌ `helpers.calculateEMA(values, period)` → **No Go equivalent** (operates on []float64, not klines)
18. ❌ `helpers.calculateSMA(values, period)` → **No Go equivalent** (operates on []float64, not klines)
19. ❌ `helpers.calculateMACD(closes, 12, 26, 9)` → **No Go equivalent** (operates on []float64, not klines)

---

## PHASE 1: Immediate Action (Use Existing Functions Only)

### Strategy for Phase 1
Generate prompts that **ONLY use the 16 implemented functions**. This lets us test the system immediately without implementing new indicators.

### Supported Patterns for Phase 1

**Price Action**:
- Price above/below MA (SMA, EMA)
- Price above/below Bollinger Bands
- Price vs VWAP
- Breakout (highest high / lowest low)
- Engulfing patterns

**Momentum**:
- RSI overbought/oversold
- MACD crossovers, histogram
- Stochastic overbought/oversold

**Volume**:
- Volume vs average
- Volume spikes

### Example Prompts That Will Work

✅ "RSI below 30 and price above 50 EMA"
✅ "Price breaks above 20-period high with volume spike"
✅ "MACD histogram turns positive and price above VWAP"
✅ "Bullish engulfing pattern with RSI below 40"
✅ "Price touches lower Bollinger Band"

### Prompts That Won't Work (Missing Indicators)

❌ "StochRSI below 20" (needs CalculateStochRSI)
❌ "Price above daily VWAP with bands" (needs CalculateVWAPBands)
❌ "RSI divergence detected" (needs DetectRSIDivergence)
❌ "ADX above 25" (needs CalculateADX)

---

## PHASE 2: Implement Missing Functions

### Priority 1: StochRSI (Most requested)
```go
func CalculateStochRSI(klines []types.Kline, rsiPeriod, stochPeriod, kPeriod, dPeriod int) []StochRSIResult
func GetLatestStochRSI(klines []types.Kline, rsiPeriod, stochPeriod, kPeriod, dPeriod int) *StochRSIResult

type StochRSIResult struct {
    K float64
    D float64
}
```

### Priority 2: VWAP Series
```go
func CalculateVWAPSeries(klines []types.Kline, anchorPeriod int) []float64
func GetLatestVWAPWithAnchor(klines []types.Kline, anchorPeriod int) *float64
func CalculateVWAPBands(klines []types.Kline, anchorPeriod int, stdDevMult float64) *VWAPBandsResult
func GetLatestVWAPBands(klines []types.Kline, anchorPeriod int, stdDevMult float64) *struct{VWAP, Upper, Lower float64}
```

### Priority 3: Utility Functions (for advanced users)
```go
func CalculateEMAFromValues(values []float64, period int) []float64
func CalculateSMAFromValues(values []float64, period int) float64
func CalculateMACDFromCloses(closes []float64, short, long, signal int) MACDResult
```

### Priority 4: Advanced
- ADX
- PVI
- Divergence detection
- HVN calculations

---

## MIGRATION PLAN

### Step 1: Create Phase 1 Prompt (Use Only Existing Functions)
- Update `regenerate-filter` → `regenerate-filter-go`
- Include ONLY the 16 implemented functions
- Add comprehensive Go syntax examples
- Test with simple conditions

### Step 2: Test End-to-End
- Generate Go code via AI
- Verify compilation in Yaegi
- Execute with test market data
- Validate results

### Step 3: Implement Missing Functions
- Start with StochRSI (most requested)
- Add VWAP series
- Expand as needed

### Step 4: Update Prompt for Full Feature Set
- Add newly implemented functions
- Expand examples
- Support advanced patterns

---

## Go-Specific Patterns for Prompts

### Nil Checking Pattern
```go
// Always check for nil before dereferencing
rsi := indicators.GetLatestRSI(klines, 14)
if rsi == nil {
    return false
}
// Use *rsi to dereference
return *rsi < 30
```

### Multi-Condition Pattern
```go
// Combine multiple indicators
rsi := indicators.GetLatestRSI(klines, 14)
sma := indicators.CalculateMA(klines, 50)
currentPrice := klines[len(klines)-1].Close

// Check all for nil
if rsi == nil || sma == nil {
    return false
}

// Dereference and compare
return *rsi < 30 && currentPrice > *sma
```

### Accessing Kline Fields
```go
// Direct struct access (no parseFloat needed!)
lastKline := klines[len(klines)-1]
lastClose := lastKline.Close
lastVolume := lastKline.Volume
lastHigh := lastKline.High
```

### Timeframe Access
```go
// Access different timeframes
klines1m := data.Klines["1m"]
klines5m := data.Klines["5m"]

// Check both exist
if klines1m == nil || len(klines1m) < 50 {
    return false
}
if klines5m == nil || len(klines5m) < 50 {
    return false
}
```

---

## Next Actions

1. ✅ Create `regenerate-filter-go` prompt with Phase 1 functions only
2. ⏳ Test AI generation with simple patterns
3. ⏳ Verify execution in Go backend
4. ⏳ Implement StochRSI (Priority 1 missing function)
5. ⏳ Expand prompt as new functions are added

---

**Status**: Ready to create Phase 1 Go prompt
**Blocker**: None (can proceed with existing 16 functions)
**Risk**: Users may request unsupported indicators → Graceful fallback needed
