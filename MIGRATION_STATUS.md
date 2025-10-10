# Go Migration Status

## Completed ✅

### 1. Golang Backend (Complete)
- ✅ Full REST API with Yaegi interpreter
- ✅ All technical indicators implemented
- ✅ `/api/v1/execute-filter` endpoint
- ✅ `/api/v1/validate-code` endpoint
- ✅ Supabase integration
- ✅ Docker + Fly.io deployment ready
- ✅ Comprehensive tests (68.4% coverage)

**Location**: `backend/go-screener/`

### 2. LLM Prompts (Complete)
- ✅ Updated all prompts to generate Go code
- ✅ Changed `helpers.func()` → `indicators.Func()`
- ✅ Added Go syntax examples with nil checking
- ✅ Updated function signatures and types
- ✅ 5 prompts updated:
  - `filter-and-chart-config`
  - `regenerate-filter`
  - `generate-trader`
  - `generate-trader-metadata`
  - Analysis prompts unchanged (no code generation)

**Location**: `apps/app/src/scripts/seedPrompts.ts`

### 3. API Client (Complete)
- ✅ Created `GoBackendClient` class
- ✅ `executeFilter()` method with timeout
- ✅ `validateCode()` method
- ✅ Health check endpoint
- ✅ Environment variable `VITE_GO_BACKEND_URL`

**Location**: `apps/app/src/api/goBackendClient.ts`

## Remaining Work ⚠️

### 1. Built-in Traders Migration
**Status**: Not Started
**Effort**: 2-3 hours

All built-in traders currently have JavaScript filter code. They need to be converted to Go.

**Files to Update**:
- Database: `traders` table filter code
- Seed scripts if any

**Example Conversion**:
```javascript
// Before (JS)
const klines = timeframes['5m'];
const rsi = helpers.getLatestRSI(klines, 14);
return rsi && rsi < 30;
```

```go
// After (Go)
klines := data.Klines["5m"]
if len(klines) < 14 {
    return false
}

rsi := indicators.GetLatestRSI(klines, 14)
if rsi == nil {
    return false
}

return *rsi < 30.0
```

### 2. Worker Integration
**Status**: Not Started
**Effort**: 4-6 hours

**Challenge**: Workers currently execute JavaScript with `new Function()` for real-time filtering.

**Two Approaches**:

#### Option A: Hybrid Model (Recommended)
- Keep workers for JavaScript traders (backward compatibility)
- New Go traders call backend API for execution
- Workers check trader type and route accordingly

**Pros**:
- Gradual migration
- Backward compatible
- Existing users unaffected

**Cons**:
- More complex code
- Two execution paths

#### Option B: Full Backend Migration
- Remove all workers
- Stream all filtering from backend
- Backend maintains WebSocket connections

**Pros**:
- Cleaner architecture
- Centralized execution
- Better for scaling

**Cons**:
- Breaking change for existing traders
- Requires backend WebSocket support
- Migration script needed for all users

**Recommendation**: Start with **Option A** (hybrid), then migrate to **Option B** over time.

### 3. Frontend Integration Points

#### A. TraderForm Validation
**Status**: Not Started
**File**: `apps/app/src/components/TraderForm.tsx`

- Update to call `goBackendClient.validateCode()` instead of local validation
- Show Go-specific errors
- Update code editor syntax highlighting to Go (optional)

#### B. Signal Execution Hook
**Status**: Not Started
**Files**:
- `apps/app/src/hooks/useSignalLifecycle.ts`
- `apps/app/src/implementations/browser/browserScreenerEngine.ts`

- Add logic to detect Go vs JavaScript traders
- Route Go traders to backend API
- Keep JavaScript traders in browser

### 4. Database Migration Script
**Status**: Not Started
**Effort**: 1-2 hours

Create a migration script that:
1. Identifies all traders with JavaScript code
2. Converts them to Go using the LLM
3. Validates the Go code via backend
4. Updates the database

**Approach**:
```typescript
// Pseudo-code
async function migrateTraders() {
  const jsTraders = await getAllJavaScriptTraders();

  for (const trader of jsTraders) {
    // Use LLM to convert JS → Go
    const goCode = await convertToGo(trader.filter.code);

    // Validate with backend
    const { valid, error } = await goBackendClient.validateCode(goCode);

    if (valid) {
      // Update database
      await updateTrader(trader.id, { filterCode: goCode, language: 'go' });
    } else {
      console.error(`Failed to migrate trader ${trader.id}:`, error);
    }
  }
}
```

## Deployment Strategy

### Phase 1: Infrastructure Ready (Current)
✅ Go backend deployed to Fly.io
✅ LLM generates Go code for new traders
✅ API client ready

### Phase 2: New Traders Use Go (Next)
- Deploy prompt updates to production
- New traders automatically use Go backend
- Existing JavaScript traders continue working

### Phase 3: Migrate Existing Traders
- Run migration script on existing traders
- Validate all conversions
- Monitor for errors

### Phase 4: Remove JavaScript Support
- Remove worker-based execution
- All traders use Go backend
- Simplify codebase

## Testing Checklist

### Backend Testing
- [ ] Go backend running locally on port 8080
- [ ] Health endpoint responds
- [ ] Execute filter with valid Go code
- [ ] Execute filter with invalid Go code (should error gracefully)
- [ ] Validate code endpoint works
- [ ] Timeout handling works (5s default)

### Frontend Testing
- [ ] Create new trader with LLM
- [ ] Verify generated code is Go, not JavaScript
- [ ] Submit trader (should validate via backend)
- [ ] Trader executes against market data
- [ ] Signals trigger correctly
- [ ] Error messages are clear

### Integration Testing
- [ ] End-to-end: Create trader → Execute → Signal triggers
- [ ] Multi-timeframe strategies work
- [ ] RSI indicator calculations match
- [ ] MACD indicator calculations match
- [ ] Volume analysis works
- [ ] Bollinger Bands work

## Known Issues / Risks

### 1. Backend Availability
**Risk**: If Go backend is down, Go traders stop working
**Mitigation**:
- Implement fallback mechanism
- Add health check before execution
- Show clear error messages

### 2. Network Latency
**Risk**: API calls add latency vs local execution
**Mitigation**:
- Optimize backend response time
- Use connection pooling
- Consider caching for repeated symbols

### 3. Breaking Changes for Users
**Risk**: Existing custom traders might break
**Mitigation**:
- Maintain backward compatibility
- Provide migration tool
- Give users time to migrate

### 4. LLM Code Quality
**Risk**: Generated Go code might have bugs
**Mitigation**:
- Extensive prompt examples
- Backend validation before execution
- User testing phase

## Next Immediate Steps

1. **Convert Built-in Traders** (2-3 hours)
   - Identify all built-in traders in database
   - Convert each to Go manually or with LLM
   - Test each one

2. **Update TraderForm Validation** (1 hour)
   - Call `goBackendClient.validateCode()`
   - Update error messages

3. **Add Language Field to Traders** (30 min)
   - Add `language: 'javascript' | 'go'` field to trader schema
   - Default new traders to 'go'
   - Use field to route execution

4. **Implement Hybrid Execution** (3-4 hours)
   - Update workers to check trader language
   - Route Go traders to backend API
   - Keep JS traders in worker

5. **End-to-End Testing** (2 hours)
   - Test complete flow
   - Fix any issues
   - Document edge cases

## Timeline Estimate

- **Today**: Complete built-in trader conversion, add language field (3-4 hours)
- **Tomorrow**: Implement hybrid execution, testing (5-6 hours)
- **Day 3**: Migration script, documentation (2-3 hours)

**Total**: ~12-14 hours remaining

---

**Status**: 70% Complete
**Last Updated**: 2025-10-10
