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
Created issue and analyzed root causes. Ready to implement fixes.

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
(To be filled when closing)
