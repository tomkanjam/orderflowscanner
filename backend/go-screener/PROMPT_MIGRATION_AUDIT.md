# Prompt Migration Audit: JavaScript → Go

**Date**: 2025-10-10
**Objective**: Convert all trader generation prompts from JavaScript to Go
**Status**: Planning Phase

---

## Executive Summary

Three prompts involved in trader generation need to be converted:
1. `regenerate-filter` (CRITICAL) - Generates executable filter code
2. `generate-trader-metadata` (IMPORTANT) - Generates trader metadata including indicator configs
3. `generate-trader` (LEGACY?) - All-in-one prompt, possibly unused

---

## Prompt #1: `regenerate-filter`

### Current Purpose
Converts human-readable conditions into JavaScript function body that executes in browser worker.

### Migration Complexity: **HIGH**
- Complete syntax transformation required
- Helper function signatures must be mapped to Go package
- Data structure access patterns completely different
- Type handling (string→float64 parsing, null→nil pointers)

### Key Changes Required

#### 1. **Language Declaration**
**Current**: "You are an AI assistant that converts human-readable trading conditions into **JavaScript code**."
**New**: "You are an AI assistant that converts human-readable trading conditions into **Go code**."

#### 2. **Function Signature**
**Current**: `(ticker, timeframes, helpers, hvnNodes)` returns boolean
**New**: `Filter(data MarketData)` returns boolean - receives single struct parameter

#### 3. **Data Access Patterns**

| JavaScript | Go |
|------------|-----|
| `ticker.P` (string) | `data.Ticker.PriceChangePercent` (float64) |
| `ticker.c` (string) | `data.Ticker.LastPrice` (float64) |
| `ticker.q` (string) | `data.Ticker.QuoteVolume` (float64) |
| `timeframes['5m']` (object) | `data.Klines["5m"]` ([]types.Kline) |
| `klines[i][0]` (number, openTime) | `klines[i].OpenTime` (int64) |
| `klines[i][1]` (string, open) | `klines[i].Open` (float64) |
| `klines[i][2]` (string, high) | `klines[i].High` (float64) |
| `klines[i][3]` (string, low) | `klines[i].Low` (float64) |
| `klines[i][4]` (string, close) | `klines[i].Close` (float64) |
| `klines[i][5]` (string, volume) | `klines[i].Volume` (float64) |

#### 4. **Syntax Conversions**

| JavaScript | Go |
|------------|-----|
| `const klines = timeframes['5m']` | `klines := data.Klines["5m"]` |
| `const lastClose = parseFloat(klines[klines.length - 1][4])` | `lastClose := klines[len(klines)-1].Close` |
| `if (!klines ‖‖ klines.length < 50)` | `if klines == nil ‖‖ len(klines) < 50` |
| `return false` | `return false` (same) |
| `// Comment` | `// Comment` (same) |

#### 5. **Helper Functions - NEEDS COMPLETE AUDIT**

**JavaScript**: `helpers.functionName(args)`
**Go**: `indicators.FunctionName(args)`

Example mappings needed:
- `helpers.getLatestRSI(klines, 14)` → `indicators.GetLatestRSI(klines, 14)` → Returns `*float64`
- `helpers.calculateMA(klines, period)` → `indicators.CalculateMA(klines, period)` → Returns `*float64`
- `helpers.calculateRSI(klines, 14)` → `indicators.CalculateRSI(klines, 14)` → Returns `[]*float64`

**CRITICAL**: Need to check **all 35 helper functions** for:
- Exact Go function names (case, spelling)
- Parameter types and order
- Return types (pointer vs value, error handling)
- Nil check patterns

#### 6. **Null/Nil Handling**

**JavaScript**:
```javascript
const rsi = helpers.getLatestRSI(klines, 14);
if (!rsi) return false;
```

**Go**:
```go
rsi := indicators.GetLatestRSI(klines, 14)
if rsi == nil {
    return false
}
```

#### 7. **Array/Slice Operations**

**JavaScript**: `.length`, `.map()`, `.filter()`, spread operators
**Go**: `len()`, for loops, manual iteration

#### 8. **Example Transformation**

**JavaScript Input**:
```javascript
const klines = timeframes['15m'];
if (!klines || klines.length < 50) return false;

const rsi = helpers.getLatestRSI(klines, 14);
const sma50 = helpers.calculateMA(klines, 50);
const avgVolume = helpers.calculateAvgVolume(klines, 20);
const currentVolume = parseFloat(klines[klines.length - 1][5]);
const lastClose = parseFloat(klines[klines.length - 1][4]);

if (!rsi || !sma50 || !avgVolume) return false;

return rsi < 30 && lastClose > sma50 && currentVolume > avgVolume * 1.5;
```

**Go Output**:
```go
klines := data.Klines["15m"]
if klines == nil || len(klines) < 50 {
    return false
}

rsi := indicators.GetLatestRSI(klines, 14)
sma50 := indicators.CalculateMA(klines, 50)
avgVolume := indicators.CalculateAvgVolume(klines, 20)
lastKline := klines[len(klines)-1]
currentVolume := lastKline.Volume
lastClose := lastKline.Close

if rsi == nil || sma50 == nil || avgVolume == nil {
    return false
}

return *rsi < 30 && lastClose > *sma50 && currentVolume > (*avgVolume * 1.5)
```

**Note**: Pointer dereferencing with `*` when comparing pointer values.

---

## Prompt #2: `generate-trader-metadata`

### Current Purpose
Step 1 of trader generation. Creates:
- Suggested name
- Description
- Filter conditions (human-readable)
- Strategy instructions
- **Indicator configurations** (for chart display)
- Risk parameters

### Migration Complexity: **MEDIUM**

This prompt generates **metadata only**, not executable code. The indicator `calculateFunction` fields contain JavaScript, but these are for **frontend chart rendering**, not backend execution.

### Key Decision Point

**CRITICAL QUESTION**: Do indicator `calculateFunction` fields need to be converted to Go?

**Answer**: **NO** - These functions run in the browser for chart visualization. They will continue to use JavaScript even when the main filter uses Go.

### Changes Required

#### 1. **Update References to Filter Language**
Change any text that says "JavaScript" to clarify that the actual filter will be Go, but indicators remain JavaScript for browser rendering.

#### 2. **Keep Indicator Examples As-Is**
All indicator examples can remain JavaScript because they execute in the browser.

#### 3. **Update Strategy Instructions Context**
Strategy instructions are consumed by AI analysis, not by filter code. These can reference Go patterns if helpful, but aren't critical to change.

### Verdict: **MINIMAL CHANGES**
This prompt primarily needs minor text updates to clarify the Go backend, but core content stays the same.

---

## Prompt #3: `generate-trader` (Legacy?)

### Current Purpose
All-in-one prompt that generates complete trader system in one shot.

### Usage Check Needed
Need to verify if this prompt is actually used in current codebase, or if it's been replaced by the two-step process (metadata → filter).

**From geminiService.ts review**: The `generateTrader()` function uses the two-step process:
1. `generateTraderMetadata()` → Uses `generate-trader-metadata`
2. `generateFilterCode()` → Uses `regenerate-filter`

**Verdict**: `generate-trader` prompt appears to be **LEGACY/UNUSED**.

### Recommendation
- Audit codebase to confirm it's not used
- If unused, mark as deprecated or delete
- If used, apply same changes as `regenerate-filter`

---

## Migration Priority

### Phase 1: Critical (Blocks Testing)
1. ✅ Create Go types (MarketData, SimplifiedTicker, Kline) - **DONE**
2. ✅ Update backend to accept SimplifiedTicker - **DONE**
3. ⚠️ **Audit all 35 Go indicator functions** - signatures, returns, nil handling
4. ⚠️ **Create complete JavaScript→Go helper mapping table**
5. ⚠️ **Update `regenerate-filter` prompt with Go syntax**
6. ⚠️ **Test Go code generation with simple condition**

### Phase 2: Enhancement
7. Update `generate-trader-metadata` text references
8. Verify `generate-trader` is unused, deprecate if so
9. Create Go code examples library for common patterns
10. Add Go-specific error handling patterns to prompts

---

## Helper Function Audit Checklist

Need to verify each of the 35 helper functions:

### Moving Averages
- [ ] CalculateMA → Check return type
- [ ] CalculateMASeries → Check return type
- [ ] CalculateEMA → Check if exists
- [ ] CalculateEMASeries → Check return type
- [ ] GetLatestEMA → Check return type

### RSI
- [ ] CalculateRSI → Check return type (series)
- [ ] GetLatestRSI → Check return type (single value)
- [ ] DetectRSIDivergence → May not exist in Go yet?

### MACD
- [ ] CalculateMACD → Check struct return format
- [ ] CalculateMACDValues → Check struct return format
- [ ] GetLatestMACD → Check struct return format

### Bollinger Bands
- [ ] CalculateBollingerBands → Check struct return format
- [ ] GetLatestBollingerBands → Check struct return format

### Volume
- [ ] CalculateAvgVolume → Check return type
- [ ] CalculateVWAP → Check return type
- [ ] CalculateVWAPSeries → Check return type
- [ ] CalculateVWAPBands → Check struct return format
- [ ] GetLatestVWAP → Check return type
- [ ] GetLatestVWAPBands → Check struct return format

### High/Low
- [ ] GetHighestHigh → Check return type
- [ ] GetLowestLow → Check return type

### Stochastic
- [ ] CalculateStochastic → Check struct return format
- [ ] CalculateStochRSI → Check if exists, return format
- [ ] GetLatestStochRSI → Check if exists, return format

### Patterns
- [ ] DetectEngulfingPattern → Check if exists, return format
- [ ] DetectGenericDivergence → Check if exists

### Volume Nodes (HVN)
- [ ] CalculateHighVolumeNodes → Likely doesn't exist in Go yet
- [ ] IsNearHVN → Likely doesn't exist in Go yet
- [ ] GetClosestHVN → Likely doesn't exist in Go yet
- [ ] CountHVNInRange → Likely doesn't exist in Go yet
- [ ] ClearHVNCache → Not needed in Go

### Other
- [ ] CalculatePVISeries → Check if exists
- [ ] GetLatestPVI → Check if exists
- [ ] CalculateADX → Check if exists

---

## Next Steps

1. **Complete indicator audit** (check all 35 functions in Go codebase)
2. **Create helper mapping table** (JS function → Go function with exact signatures)
3. **Draft new `regenerate-filter-go` prompt** with all Go examples
4. **Test generation** with simple condition
5. **Iterate** based on results
6. **Deploy** when stable

---

## Risk Assessment

### High Risk
- Missing indicator functions in Go backend
- Incorrect pointer handling in prompts
- Type conversion edge cases
- Multi-timeframe complexity

### Medium Risk
- Prompt too verbose or unclear
- AI generates invalid Go syntax
- Nil check patterns incorrect

### Low Risk
- Function naming mismatches (easy to fix)
- Comment style differences
- Import statement handling

---

## Success Criteria

- [ ] AI generates syntactically valid Go code
- [ ] Generated code compiles in Yaegi
- [ ] Generated code executes correctly with test data
- [ ] All helper functions map correctly
- [ ] Nil/error handling is correct
- [ ] Multi-timeframe examples work
- [ ] Generated code matches quality of hand-written Go
