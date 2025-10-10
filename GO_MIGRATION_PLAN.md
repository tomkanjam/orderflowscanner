# Go Migration Plan - Frontend to Backend Integration

## Overview

To complete the Golang backend migration, we need to update the LLM prompts and frontend to generate and execute **Go code** instead of JavaScript. This document outlines all required changes.

## Current State

### ✅ Completed
- Golang backend with REST API (`backend/go-screener/`)
- Yaegi interpreter for Go code execution
- Technical indicators in Go
- Binance and Supabase clients
- Docker and Fly.io configuration

### ❌ Remaining Work
- LLM prompts still generate JavaScript code
- Frontend still expects JavaScript filter code
- Built-in traders are in JavaScript format
- No Go code examples in prompts

## Required Changes

### 1. Update LLM Prompts (High Priority)

**Files to modify:**
- `apps/app/src/scripts/seedPrompts.ts`

**Changes needed:**

#### A. Filter Code Instructions
Replace JavaScript-specific instructions with Go equivalents:

**Before** (JavaScript):
```javascript
const klines = timeframes['5m'];
const rsi = helpers.getLatestRSI(klines, 14);
return *rsi < 30;
```

**After** (Go):
```go
klines5m := data.Klines["5m"]
if len(klines5m) < 14 {
    return false
}

rsi := indicators.GetLatestRSI(klines5m, 14)
if rsi == nil {
    return false
}

return *rsi < 30.0
```

#### B. Helper Functions List
Update function signatures to Go:
- `helpers.calculateMA()` → `indicators.CalculateMA()`
- `helpers.getLatestRSI()` → `indicators.GetLatestRSI()`
- Return types: `number | null` → `*float64`
- Arrays: `(number | null)[]` → `[]float64`

#### C. Function Parameters
**JavaScript:**
```javascript
(ticker, timeframes, helpers, hvnNodes)
```

**Go:**
```go
func evaluate(data *types.MarketData) bool {
    // data.Ticker
    // data.Klines["5m"]
    // indicators package functions
}
```

### 2. Create Go Code Examples

**Add to prompts:**

```go
// Example 1: RSI Oversold
klines5m := data.Klines["5m"]
if len(klines5m) < 50 {
    return false
}

rsi := indicators.GetLatestRSI(klines5m, 14)
if rsi == nil {
    return false
}

return *rsi < 30.0

// Example 2: MACD Crossover
klines1h := data.Klines["1h"]
if len(klines1h) < 50 {
    return false
}

macd := indicators.GetLatestMACD(klines1h, 12, 26, 9)
if macd == nil {
    return false
}

return macd.Histogram > 0 && macd.MACD > macd.Signal

// Example 3: Multi-timeframe
klines1m := data.Klines["1m"]
klines5m := data.Klines["5m"]

if len(klines1m) < 30 || len(klines5m) < 30 {
    return false
}

rsi1m := indicators.GetLatestRSI(klines1m, 14)
rsi5m := indicators.GetLatestRSI(klines5m, 14)

if rsi1m == nil || rsi5m == nil {
    return false
}

return *rsi1m < 30 && *rsi5m < 30

// Example 4: Volume Spike
klines := data.Klines["5m"]
if len(klines) < 20 {
    return false
}

avgVol := indicators.CalculateAvgVolume(klines, 20)
if avgVol == nil {
    return false
}

currentVol := klines[len(klines)-1].Volume
return currentVol > *avgVol * 1.5
```

### 3. Frontend Changes

#### A. Update TraderForm Component
**File:** `apps/app/src/components/TraderForm.tsx` (or similar)

**Changes:**
1. Update code editor syntax highlighting from `javascript` to `go`
2. Update validation to check Go syntax
3. Update example code snippets to Go
4. Add import for Go syntax highlighter if using CodeMirror/Monaco

#### B. Add Go Syntax Validation
**New utility:** `apps/app/src/utils/goCodeValidator.ts`

```typescript
export async function validateGoCode(code: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  // Call backend validation endpoint
  const response = await fetch('/api/v1/validate-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });

  return response.json();
}
```

#### C. Update Signal Execution
**File:** `apps/app/src/services/signalExecutor.ts` (or similar)

**Before:** Execute JavaScript in browser
```typescript
const fn = new Function('ticker', 'timeframes', 'helpers', code);
return fn(ticker, timeframes, helpers);
```

**After:** Send to backend for execution
```typescript
const response = await fetch('/api/v1/execute-filter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    code,
    marketData: {
      symbol,
      ticker,
      klines: timeframesData
    }
  })
});

const { matched } = await response.json();
return matched;
```

### 4. Convert Built-in Traders

**Files:**
- Database seed scripts
- Any hardcoded trader definitions

**Example conversions:**

#### Before (JavaScript):
```javascript
{
  name: "RSI Oversold",
  filter: {
    code: `
      const klines = timeframes['5m'];
      const rsi = helpers.getLatestRSI(klines, 14);
      return rsi && rsi < 30;
    `
  }
}
```

#### After (Go):
```go
{
  name: "RSI Oversold",
  filter: {
    code: `
      klines := data.Klines["5m"]
      if len(klines) < 14 {
        return false
      }

      rsi := indicators.GetLatestRSI(klines, 14)
      if rsi == nil {
        return false
      }

      return *rsi < 30.0
    `
  }
}
```

### 5. API Integration

#### Backend Endpoints (Already Implemented ✅)
```
POST /api/v1/execute-filter    # Execute Go code
POST /api/v1/validate-code     # Validate Go syntax
```

#### Frontend API Client (New)
```typescript
// apps/app/src/api/goBackend.ts
export class GoBackendClient {
  constructor(private baseURL: string) {}

  async executeFilter(code: string, marketData: MarketData): Promise<boolean> {
    const response = await fetch(`${this.baseURL}/api/v1/execute-filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, marketData })
    });

    if (!response.ok) {
      throw new Error(`Filter execution failed: ${response.statusText}`);
    }

    const { matched } = await response.json();
    return matched;
  }

  async validateCode(code: string): Promise<{ valid: boolean; error?: string }> {
    const response = await fetch(`${this.baseURL}/api/v1/validate-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });

    return response.json();
  }
}
```

### 6. Migration Strategy

#### Phase 1: Prompt Updates (1-2 hours)
1. Update `seedPrompts.ts` with Go syntax
2. Replace JavaScript examples with Go examples
3. Update helper function list to match Go package
4. Test prompt generation with Gemini

#### Phase 2: Frontend Integration (2-3 hours)
1. Create Go backend API client
2. Update TraderForm to use Go syntax
3. Add Go code validation
4. Update signal execution to use backend
5. Test creating new traders

#### Phase 3: Built-in Trader Migration (1-2 hours)
1. Convert existing JavaScript traders to Go
2. Update database seed scripts
3. Test all built-in traders
4. Verify signals trigger correctly

#### Phase 4: Testing & Documentation (1 hour)
1. End-to-end testing
2. Update user documentation
3. Create migration guide for existing custom traders
4. Performance testing

### 7. Key Differences: JavaScript vs Go

| Feature | JavaScript | Go |
|---------|-----------|-----|
| Variable declaration | `const x = 5` | `x := 5` |
| Null checks | `if (x)` | `if x != nil` |
| Array length | `arr.length` | `len(arr)` |
| Map access | `obj['key']` | `map["key"]` |
| Pointer deref | N/A | `*ptr` |
| Type assertion | N/A | `value.(*Type)` |
| Boolean ops | `&&`, `\|\|` | `&&`, `\|\|` (same) |
| Return | `return value` | `return value` (same) |
| Functions | `helpers.func()` | `indicators.Func()` |
| Comments | `//` and `/* */` | `//` and `/* */` (same) |

### 8. Testing Checklist

- [ ] Prompt generates valid Go code
- [ ] Backend validates Go code correctly
- [ ] Backend executes Go code safely (Yaegi)
- [ ] Frontend sends correct API requests
- [ ] Signal detection works end-to-end
- [ ] Error messages are user-friendly
- [ ] Performance is acceptable (< 5s per filter)
- [ ] All built-in traders work
- [ ] Custom trader creation works
- [ ] Multi-timeframe strategies work

### 9. Rollout Plan

#### Development
1. Update prompts on dev branch
2. Test with sample strategies
3. Convert 2-3 built-in traders as proof-of-concept

#### Staging
1. Deploy Go backend
2. Update frontend to use backend
3. Full regression testing
4. Performance testing with 100+ symbols

#### Production
1. Deploy backend first (API available but unused)
2. Deploy frontend with feature flag
3. Gradual rollout (10% → 50% → 100%)
4. Monitor error rates and performance
5. Keep JavaScript execution as fallback for 1 week

### 10. Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM generates invalid Go | High | Strict validation, good examples in prompt |
| Performance degradation | Medium | Yaegi pooling, caching, timeouts |
| Backend unavailable | High | Fallback to browser execution (temporary) |
| Breaking existing traders | High | Phased rollout, migration script |
| User confusion | Medium | Clear documentation, in-app guides |

### 11. Success Metrics

- ✅ All new traders generate valid Go code
- ✅ Signal detection latency < 2 seconds
- ✅ 0 JavaScript execution errors
- ✅ 100% of built-in traders migrated
- ✅ Backend uptime > 99.9%
- ✅ Positive user feedback

## Next Steps

1. **Review this plan** with the team
2. **Update the prompts** (`seedPrompts.ts`)
3. **Create API client** for frontend-backend communication
4. **Convert 1-2 traders** as proof-of-concept
5. **End-to-end test** the flow

## Timeline Estimate

- **Prompts:** 2 hours
- **Frontend integration:** 3 hours
- **Trader migration:** 2 hours
- **Testing:** 2 hours
- **Total:** ~9 hours

---

**Status:** Planning Complete
**Next Action:** Begin prompt updates
