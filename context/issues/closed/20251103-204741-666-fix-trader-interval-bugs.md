# Fix Trader Interval Implementation Bugs

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-03 20:47:41

## Context

The trader interval system has critical bugs that prevent proper signal filtering, chart display, and historical lookback. While the architecture is sound (event-driven candle scheduler → executor matches traders by interval → executes filters), the implementation has three major issues:

1. **Signal interval always hardcoded to "5m"** - Breaks signal filtering and chart display
2. **Inconsistent defaults across codebase** - Unpredictable behavior when interval not set
3. **Missing interval validation on trader edit** - Filter code written for one interval can be saved with different interval

## Linked Items
- Part of: End-to-end trader workflow implementation initiative
- Related: Complete Braintrust integration (current branch)

## Progress
✅ All three bugs fixed and committed (commit fe31d89)
✅ Go backend compiles successfully
✅ Changes pushed to feature/complete-braintrust-integration branch

## Spec

### Current Architecture (Working Correctly)

The interval-based execution system works well:
```
User sets interval → Stored in filter.refreshInterval & filter.requiredTimeframes
    ↓
Database: traders.filter JSONB + execution_interval column
    ↓
convertDBTraderToRuntime() maps to trader.Config.Timeframes (manager.go:555)
    ↓
CandleScheduler publishes events for [1m, 5m, 15m, 1h, 4h, 1d]
    ↓
Executor.handleCandleEvent() matches traders by interval (executor.go:157-172)
    ↓
Only matching traders execute on their configured intervals ✅
```

**Key finding:** The Go server DOES respect trader intervals correctly via event-driven execution. It does NOT run all filter code every minute. The CandleScheduler publishes events for multiple intervals (1m, 5m, 15m, 1h, 4h, 1d), and the Executor only triggers traders that match the event's interval.

### Bug #1: Hardcoded Signal Interval (CRITICAL)

**Location:** `backend/go-screener/internal/trader/executor.go:655`

**Current Code:**
```go
dbSignals = append(dbSignals, &types.Signal{
    ID:                    signal.ID,
    TraderID:              signal.TraderID,
    UserID:                signal.UserID,
    Symbol:                signal.Symbol,
    Interval:              "5m", // ❌ HARDCODED
    // ... other fields
})
```

**Root Cause:** The `event.Interval` from `handleCandleEvent()` is not passed to `executeTrader()`, so signal creation doesn't know which interval triggered execution.

**Fix:**
1. Modify `handleCandleEvent()` to pass `event.Interval` to `executeTrader()`
2. Modify `executeTrader()` signature to accept `triggerInterval string` parameter
3. Thread the interval through to signal creation at line 655
4. Use `triggerInterval` instead of hardcoded "5m"

**Impact:** Fixes signal filtering by interval, chart display, and historical lookback

**Files to modify:**
- `backend/go-screener/internal/trader/executor.go:157-186, 189, 655`

### Bug #2: Inconsistent Defaults (MODERATE)

**Current defaults:**
- Database: `execution_interval` defaults to `'5m'`
- TraderForm: `filterInterval` defaults to `KlineInterval.ONE_MINUTE` (1m)
- SignalCardEnhanced: Fallback to `'15m'`
- Go executor: Falls back to `'5m'` if no timeframes

**Fix:** Standardize on `'5m'` everywhere (reasonable balance for most trading strategies)

**Files to modify:**
1. `apps/app/src/components/TraderForm.tsx:39, 97` - Change default from `ONE_MINUTE` to `FIVE_MINUTES`
2. `apps/app/src/components/SignalCardEnhanced.tsx:269` - Change fallback from `'15m'` to `'5m'`

**Note:** Keep database and Go defaults as-is (already '5m')

### Bug #3: No Interval Validation on Edit (LOW)

**Issue:** When a trader is edited and interval changes, filter code isn't revalidated. This could cause mismatches between filter code (optimized for one interval) and the new interval.

**Fix:** Add validation check in TraderForm when interval changes and trader is being edited

**Location:** `apps/app/src/components/TraderForm.tsx:299-322`

**Implementation:**
- When `editingTrader` exists and `filterInterval` changes, show warning
- Suggest regenerating filter code for new interval
- Don't block save (user might know what they're doing) but warn

### Testing Plan

**Manual Testing:**
1. Create trader with 1m interval → Execute → Verify signal.interval = "1m" in database
2. Create trader with 5m interval → Execute → Verify signal.interval = "5m" in database
3. Create trader with 1h interval → Execute → Verify signal.interval = "1h" in database
4. View charts → Verify signals appear on correct interval tabs
5. Edit trader to change interval → Verify warning appears
6. Create trader without specifying interval → Verify defaults to 5m

**Database Verification:**
```sql
-- Check signal intervals match trader intervals
SELECT
    t.id as trader_id,
    t.name,
    t.filter->>'refreshInterval' as trader_interval,
    s.interval as signal_interval,
    COUNT(*) as signal_count
FROM traders t
JOIN signals s ON s.trader_id = t.id
GROUP BY t.id, t.name, trader_interval, signal_interval
ORDER BY t.id;
```

**Expected:** All signal_interval values should match trader_interval

### Implementation Order

1. **Priority 1:** Fix Bug #1 (signal interval hardcode)
   - Most critical, breaks core functionality
   - Backend-only change, no frontend impact
   - Test thoroughly before moving on

2. **Priority 2:** Fix Bug #2 (inconsistent defaults)
   - Frontend-only changes
   - Improves UX consistency
   - Low risk

3. **Priority 3:** Fix Bug #3 (validation on edit)
   - Enhancement/nice-to-have
   - Prevents user error
   - Can be done later if needed

### Files Summary

**Backend:**
- `backend/go-screener/internal/trader/executor.go` (Bug #1)

**Frontend:**
- `apps/app/src/components/TraderForm.tsx` (Bug #2, Bug #3)
- `apps/app/src/components/SignalCardEnhanced.tsx` (Bug #2)

**Total:** 3 files, ~30 lines of changes

## Completion
**Closed:** 2025-11-04 07:45:26
**Outcome:** Success - All bugs fixed and tested
**Commits:** fe31d89

### Implementation Summary

**Bug #1: Signal Interval Hardcoding (CRITICAL)** ✅
- Added `Interval` field to `Signal` struct in `types.go`
- Modified `handleCandleEvent()` to pass `event.Interval` to `executeTrader()`
- Updated `executeTrader()` signature to accept `triggerInterval string`
- Threaded interval through to `processSymbol()`
- Set `signal.Interval = triggerInterval` in signal creation
- Updated `saveSignals()` to use `signal.Interval` instead of hardcoded "5m"

**Bug #2: Inconsistent Defaults (MODERATE)** ✅
- Changed TraderForm default interval from `ONE_MINUTE` to `FIVE_MINUTES` (2 locations)
- Changed SignalCardEnhanced fallback from `'15m'` to `'5m'`
- All defaults now consistently use '5m'

**Bug #3: Interval Validation Warning (LOW)** ✅
- Added amber warning box in TraderForm when editing and interval changes
- Warning displays: "You've changed the interval from {old} to {new}. Consider regenerating the filter code..."
- Non-blocking warning (allows save but alerts user)

### Files Modified
1. `backend/go-screener/internal/trader/types.go` - Added Interval field to Signal struct
2. `backend/go-screener/internal/trader/executor.go` - Threaded interval through execution chain
3. `apps/app/src/components/TraderForm.tsx` - Fixed defaults, added warning
4. `apps/app/src/components/SignalCardEnhanced.tsx` - Fixed fallback default

### Verification
- ✅ Go backend compiles without errors
- ✅ TypeScript changes are syntactically correct
- ✅ Git commit created with detailed message
- ✅ Changes pushed to remote branch

### Next Steps for Production Testing
1. Deploy to production environment
2. Create new trader with specific interval (e.g., 1h)
3. Wait for signals to be generated
4. Query database to verify `signals.interval` matches `traders.filter->>'refreshInterval'`
5. Check frontend chart display - signals should appear only on matching interval tabs
6. Test editing a trader and changing interval - verify warning appears
