# Filter Prompt Audit - Identifying Bloat

**Current Stats:**
- 29,096 characters
- ~7,274 tokens
- Multiple redundant sections

## Bloat Analysis

### 1. **Indicator Functions Section (BIGGEST BLOAT - 40% of prompt)**

**Current approach:** Each indicator gets:
- Function signature
- Full explanation
- Nil checking example
- "Example Pattern" with complete code
- Repetitive warnings about nil checks

**Problem:**
- Repeats nil checking pattern 9+ times
- "Example Pattern" adds ~100 lines of redundant code
- Most indicators follow same pattern - doesn't need to be repeated

**Solution:** Condense to:
```markdown
## Available Indicators

| Function | Returns | Nil Check Required |
|----------|---------|-------------------|
| `indicators.CalculateMA(klines, period)` | `*float64` | Yes |
| `indicators.CalculateMASeries(klines, period)` | `[]float64` | No (check len) |
| `indicators.GetLatestRSI(klines, period)` | `*float64` | Yes |
| ... | ... | ... |

**Pattern for pointer returns:**
```go
rsi := indicators.GetLatestRSI(klines, 14)
if rsi == nil { return types.BuildSimpleSignalResult(false) }
// Use *rsi to dereference
```

**Pattern for series returns:**
```go
series := indicators.CalculateMASeries(klines, 20)
if len(series) == 0 { return types.BuildSimpleSignalResult(false) }
```
```

**Savings:** ~5,000 characters (~1,250 tokens)

---

### 2. **Complete Examples (TOO MANY)**

**Current:** 4 complete examples
- Example 1: Simple Single Condition
- Example 2: Multiple Conditions
- Example 3: Multi-Timeframe
- Example 4: Complex Pattern

**Problem:** Each example is 30-50 lines. Total ~150 lines of redundant code.

**Solution:** Keep 2 examples max:
1. **Simple case** (RSI oversold)
2. **Complex case** (Multiple indicators + multi-timeframe)

**Savings:** ~2,000 characters (~500 tokens)

---

### 3. **Redundant Explanations**

**Duplicated across multiple sections:**
- Nil checking explained 5+ times
- Helper function usage explained 3+ times
- "CRITICAL" and "IMPORTANT" warnings repeated excessively
- Go vs JavaScript differences mentioned multiple times

**Examples of redundancy:**
```
Section 5: "CRITICAL: Use these helper functions..."
Section 10: "Nil Checking (MANDATORY)"
Section 12: "ALWAYS check for nil before dereferencing"
```

All saying the same thing.

**Solution:** Consolidate into one "Critical Patterns" section

**Savings:** ~2,000 characters (~500 tokens)

---

### 4. **Over-Explained Concepts**

**Ticker Data Access:**
```markdown
**Current:**
**Ticker Data** (24hr summary):
```go
// Access ticker fields directly (already float64, no parsing needed!)
currentPrice := data.Ticker.LastPrice
priceChange := data.Ticker.PriceChangePercent
volume24h := data.Ticker.QuoteVolume
```

**Streamlined:**
```go
data.Ticker.LastPrice          // Current price
data.Ticker.PriceChangePercent // 24hr change %
data.Ticker.QuoteVolume        // 24hr volume
```
```

Same for Kline access, struct field access, etc.

**Savings:** ~1,500 characters (~375 tokens)

---

### 5. **Verbose Helper Function Docs**

**Current:** Full docstrings + examples for each helper
**Problem:** Models don't need docstring-style documentation

**Solution:**
```markdown
**Helper Functions (MANDATORY):**
```go
types.BuildSignalResult(matched, klines, indicators, reasoning) // Complete result
types.BuildIndicatorData(value, series, params)                  // Indicator data
types.BuildSimpleSignalResult(matched)                          // Simple matched/not-matched
types.TrimWarmupZeros(series)                                   // Remove leading zeros
types.ToInterfaceSlice([]float64)                               // Convert to []interface{}
```
```

**Savings:** ~1,000 characters (~250 tokens)

---

### 6. **Unnecessary Sections**

**Can be removed entirely:**
- "Progress Comments" (5 lines) - Nice to have, not critical
- "Default Timeframe" (2 lines) - Obvious from context
- "Final Reminder" (10 lines) - Repeats earlier instructions
- Multiple "⚠️ CRITICAL DIFFERENCES" callouts

**Savings:** ~800 characters (~200 tokens)

---

## Total Potential Savings

| Section | Characters | Tokens |
|---------|-----------|--------|
| Indicator Functions | 5,000 | 1,250 |
| Complete Examples | 2,000 | 500 |
| Redundant Explanations | 2,000 | 500 |
| Over-Explained Concepts | 1,500 | 375 |
| Verbose Helper Docs | 1,000 | 250 |
| Unnecessary Sections | 800 | 200 |
| **TOTAL** | **12,300** | **3,075** |

**Result:** 29,096 → ~16,800 characters (~4,200 tokens)

**Reduction:** 42% smaller, 42% fewer tokens

---

## What to Keep (Critical for Correctness)

### 1. **Type System**
- MarketData structure
- SignalResult structure
- IndicatorData structure

### 2. **Critical Patterns**
- Return `*types.SignalResult`, NOT bool
- Always check nil before dereferencing pointers
- Always check length before array access
- Use helper functions (BuildSignalResult, etc.)
- Trim warmup zeros from indicator series
- **Align indicator series with klines length** (NEW - prevents chart bug)

### 3. **API Reference**
- Indicator functions table (concise)
- Helper functions list (concise)
- One example per pattern

### 4. **Performance Rules**
- Size limits (enforced by helpers)
- Efficient kline selection (last 50-100)

### 5. **Common Mistakes**
- Nil checks required for pointer returns
- Use `len(klines)` not `klines.length`
- Access fields by name not index
- Dereference pointers with `*`

---

## Recommended Structure (Compact)

```markdown
# Go Filter Code Generation

## Task
Generate Go function body that returns `*types.SignalResult` from trading conditions.

## Types (Essential API)
[MarketData, SignalResult, IndicatorData - CONDENSED]

## Helper Functions (MANDATORY)
[Concise list with signatures]

## Indicator Functions
[Table format - function, return type, nil check required]

## Critical Patterns
1. Nil checking
2. Alignment (klines ↔ indicators)
3. Warmup zero trimming
4. Helper usage

## Examples (2 maximum)
1. Simple: RSI oversold
2. Complex: Multi-indicator + multi-timeframe

## Rules Checklist
[Condensed list of DO/DON'T]
```

---

## Next Steps

1. Review this audit
2. Approve streamlining approach
3. Create compact version of prompt
4. Test with LLM to ensure quality isn't degraded
5. Measure token reduction
6. Deploy to Supabase (and later Braintrust)
