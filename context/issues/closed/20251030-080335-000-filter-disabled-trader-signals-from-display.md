# Filter Disabled Trader Signals from Main Display

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-30 08:03:35

## Context

When a non-logged-in user disables a built-in trader via the toggle in the UI, the trader's signals continue to appear in the main signals table. The expected behavior is that disabled traders' signals should be hidden from the default view unless the user explicitly clicks on that trader's card to view only its signals.

The trader enable/disable state management is working correctly (stored in localStorage, properly calculated via `getEffectiveEnabled()`), but the signal display layer doesn't respect this state when showing signals.

## Linked Items

- Part of: End-to-end trader workflow implementation initiative
- Related: `20251030-074721-000-fix-built-in-signals-rls-and-ownership.md` (RLS policies fix)

## Progress

✅ **COMPLETED** - Implementation successful, all tests passing

## Completion

**Closed:** 2025-10-30 08:47:00
**Outcome:** Success
**Commits:** cb23679

### Implementation Summary

Successfully fixed signal filtering to respect trader enabled/disabled state:

**Code Changes:**
1. **`TraderSignalsTable.tsx:73`** - Filter trader IDs by enabled state before fetching
2. **`TraderSignalsTable.tsx:187-203`** - Filter signals by trader enabled state in display

**Testing Results:**
✅ Disable trader → signals disappear (0 active)
✅ Click disabled trader card → signals appear (100 active)
✅ Clear filter → signals disappear again (0 active)
✅ Re-enable trader → signals appear (114 active)
✅ Smooth transitions, no flickering
✅ State persists across page refreshes

**Performance:**
- Reduced database queries by excluding disabled traders
- Efficient in-memory filtering with proper memoization
- No unnecessary re-renders

**Impact:**
- Users can now effectively manage which trader signals they see
- Explicit selection (clicking trader card) overrides disabled state
- Clean, predictable UX that matches user expectations

## Spec

### Root Cause Analysis

Two critical gaps identified in `TraderSignalsTable.tsx`:

**Gap #1: Signal Fetching (Line 73)**
```typescript
// CURRENT: Passes ALL trader IDs, including disabled
const traderIds = useMemo(() => traders.map(t => t.id), [traders]);

const { loadMore } = useInfiniteSignals({
  traderIds,  // <-- Fetches signals from disabled traders
  batchSize: 50
});
```

**Gap #2: Signal Display (Lines 178-183)**
```typescript
// CURRENT: Shows ALL signals when no trader selected
const sortedSignals = useMemo(() => {
  const filteredSignals = selectedTraderId
    ? signals.filter(s => s.traderId === selectedTraderId)
    : signals;  // <-- No enabled state check

  return [...filteredSignals].sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime()
  );
}, [signals, selectedTraderId]);
```

### Why Trader State Isn't Checked

**Current data flow:**
1. `traderManager.getEffectiveEnabled()` correctly calculates enabled state ✓
2. `App.tsx` applies effective enabled state to traders array ✓
3. `TraderSignalsTable` receives `traders` prop with correct `enabled` field ✓
4. **BUG**: Signal fetching/filtering doesn't use `traders[].enabled` field ❌

**The `traders` prop structure:**
```typescript
interface Trader {
  id: string;
  name: string;
  enabled: boolean;  // <-- Already available, just not used!
  isBuiltIn: boolean;
  // ... other fields
}
```

### Expected Behavior

**Default View (no trader selected):**
- Show signals ONLY from enabled traders
- Disabled traders' signals should be hidden

**Trader Card Clicked:**
- Show signals ONLY from that specific trader
- Works regardless of enabled/disabled state
- Allows user to explicitly view disabled trader's signals

**Visual Flow:**

```
┌─────────────────────────────────────────────────────────┐
│ Sidebar                                                 │
│                                                         │
│  ☑ RSI Oversold Bounce (enabled)                      │
│  ☐ Three Red Candles Short (disabled by user)         │
│  ☑ Volume Spike Detector (enabled)                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Main Signals Table                                      │
│                                                         │
│  Default View:                                          │
│  - Show RSI Oversold Bounce signals  ✓                │
│  - Hide Three Red Candles Short signals  ✓            │
│  - Show Volume Spike Detector signals  ✓              │
│                                                         │
│  Click "Three Red Candles Short" card:                  │
│  - Show ONLY Three Red Candles Short signals  ✓       │
│  - Override disabled state for explicit selection      │
└─────────────────────────────────────────────────────────┘
```

---

### Implementation Plan

**File:** `apps/app/src/components/TraderSignalsTable.tsx`

#### Fix #1: Filter Trader IDs Before Fetching (Line 73)

**Current:**
```typescript
const traderIds = useMemo(() => traders.map(t => t.id), [traders]);
```

**Fixed:**
```typescript
const traderIds = useMemo(() => {
  // When a specific trader is selected, fetch only that trader's signals
  // (even if disabled, to support explicit viewing)
  if (selectedTraderId) {
    return [selectedTraderId];
  }

  // Default view: only fetch signals from enabled traders
  return traders.filter(t => t.enabled).map(t => t.id);
}, [traders, selectedTraderId]);
```

**Rationale:**
- Reduces unnecessary data fetching from database
- Respects user's disable preference immediately
- Still allows explicit viewing when trader card clicked

#### Fix #2: Filter Signals in Display (Lines 178-183)

**Current:**
```typescript
const sortedSignals = useMemo(() => {
  const filteredSignals = selectedTraderId
    ? signals.filter(s => s.traderId === selectedTraderId)
    : signals;  // <-- Shows all signals

  return [...filteredSignals].sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime()
  );
}, [signals, selectedTraderId]);
```

**Fixed:**
```typescript
const sortedSignals = useMemo(() => {
  let filteredSignals: TraderSignal[];

  if (selectedTraderId) {
    // Explicit trader selection: show only that trader's signals
    // (works regardless of enabled state)
    filteredSignals = signals.filter(s => s.traderId === selectedTraderId);
  } else {
    // Default view: filter out signals from disabled traders
    filteredSignals = signals.filter(s => {
      const trader = traders.find(t => t.id === s.traderId);
      return trader?.enabled !== false;
    });
  }

  return [...filteredSignals].sort((a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime()
  );
}, [signals, selectedTraderId, traders]);
```

**Rationale:**
- Provides defense-in-depth: filters at display level even if fetching includes disabled
- Handles edge case where signals from recently-disabled traders are still in memory
- Maintains explicit selection behavior

---

### Testing Plan

#### Manual Testing Steps

**Setup:**
1. Open app as non-logged-in user
2. Verify at least 2 built-in traders are enabled by default
3. Note the signals showing in the main table

**Test Case 1: Disable Trader**
1. Disable "Three Red Candles Short" trader via toggle
2. **Expected:** Signals from that trader disappear from main table
3. **Expected:** Other enabled traders' signals still show
4. Refresh page
5. **Expected:** Disabled state persists (localStorage)
6. **Expected:** Signals remain hidden

**Test Case 2: Click Disabled Trader Card**
1. With "Three Red Candles Short" disabled, click its card
2. **Expected:** Main table shows ONLY "Three Red Candles Short" signals
3. **Expected:** Disabled state doesn't prevent explicit viewing
4. Click card again to deselect
5. **Expected:** Returns to default view (disabled trader's signals hidden)

**Test Case 3: Re-enable Trader**
1. Re-enable "Three Red Candles Short" via toggle
2. **Expected:** Signals immediately appear in main table
3. **Expected:** Signals properly sorted with others

**Test Case 4: All Traders Disabled**
1. Disable all built-in traders
2. **Expected:** Main table shows "No signals" state
3. Click any disabled trader card
4. **Expected:** Shows that trader's signals

#### Automated Test Cases

**Unit Tests for TraderSignalsTable:**
```typescript
describe('TraderSignalsTable signal filtering', () => {
  it('should only fetch enabled traders in default view', () => {
    const traders = [
      { id: '1', enabled: true },
      { id: '2', enabled: false },
      { id: '3', enabled: true }
    ];
    const traderIds = getTraderIdsForFetch(traders, null);
    expect(traderIds).toEqual(['1', '3']);
  });

  it('should fetch specific trader even if disabled', () => {
    const traders = [
      { id: '1', enabled: true },
      { id: '2', enabled: false }
    ];
    const traderIds = getTraderIdsForFetch(traders, '2');
    expect(traderIds).toEqual(['2']);
  });

  it('should filter out disabled trader signals in default view', () => {
    const signals = [
      { traderId: '1', symbol: 'BTC' },
      { traderId: '2', symbol: 'ETH' },
      { traderId: '3', symbol: 'SOL' }
    ];
    const traders = [
      { id: '1', enabled: true },
      { id: '2', enabled: false },
      { id: '3', enabled: true }
    ];
    const filtered = filterSignalsByTraderState(signals, traders, null);
    expect(filtered).toHaveLength(2);
    expect(filtered.map(s => s.traderId)).toEqual(['1', '3']);
  });

  it('should show disabled trader signals when explicitly selected', () => {
    const signals = [
      { traderId: '1', symbol: 'BTC' },
      { traderId: '2', symbol: 'ETH' }
    ];
    const traders = [
      { id: '1', enabled: true },
      { id: '2', enabled: false }
    ];
    const filtered = filterSignalsByTraderState(signals, traders, '2');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].traderId).toBe('2');
  });
});
```

---

### Edge Cases

**Edge Case 1: Trader Disabled While Card Selected**
- User selects trader card (signals showing)
- User disables that trader via toggle
- **Expected**: Signals remain visible (explicit selection overrides)
- User deselects card
- **Expected**: Signals disappear (returns to default filtered view)

**Edge Case 2: Signals Arrive After Disable**
- User disables trader
- New signals for that trader arrive via realtime updates
- **Expected**: New signals stored but not displayed
- User clicks trader card
- **Expected**: All signals (including new) appear

**Edge Case 3: localStorage Cleared**
- User disables traders
- localStorage cleared (browser settings/incognito)
- **Expected**: Falls back to `default_enabled` field
- **Expected**: If `default_enabled=true`, signals appear again

**Edge Case 4: Multiple Browser Tabs**
- User disables trader in Tab A
- **Expected**: Tab B receives storage event
- **Expected**: Tab B filters out disabled trader's signals
- **Expected**: Cross-tab synchronization works (already implemented in traderPreferences)

---

### Performance Considerations

**Optimization 1: Memoization**
- Both fixes use `useMemo()` to prevent unnecessary recalculations
- Dependencies properly tracked: `[traders, selectedTraderId]`

**Optimization 2: Reduced Data Fetching**
- Fix #1 reduces database queries by excluding disabled traders
- Fewer trader IDs → smaller query result set
- Network bandwidth savings

**Optimization 3: Client-Side Filter Efficiency**
- Fix #2 filters in-memory signals (fast)
- `Array.find()` on small traders array (typically <20 items)
- Negligible performance impact

---

### Acceptance Criteria

**Functional:**
- [ ] Disabled trader signals do NOT appear in main table (default view)
- [ ] Enabled trader signals DO appear in main table
- [ ] Clicking disabled trader card shows its signals
- [ ] Deselecting trader card hides disabled trader's signals again
- [ ] Toggle disable → signals disappear immediately
- [ ] Toggle enable → signals appear immediately
- [ ] State persists across page refreshes (localStorage)

**Technical:**
- [ ] `traderIds` passed to `useInfiniteSignals()` excludes disabled traders
- [ ] Signal display filtering checks `trader.enabled` field
- [ ] `selectedTraderId` overrides enabled state check
- [ ] Memoization dependencies include `traders` and `selectedTraderId`
- [ ] No unnecessary re-renders

**UX:**
- [ ] No loading flicker when toggling enable/disable
- [ ] Smooth transitions when signals appear/disappear
- [ ] Clear visual feedback that disabled trader is excluded
- [ ] Works for both anonymous and authenticated users

---

### Files to Modify

1. **`apps/app/src/components/TraderSignalsTable.tsx`**
   - Line 73: Filter `traderIds` by enabled state
   - Lines 178-183: Add enabled state check in signal filtering
   - Update useMemo dependencies

---

### Risk Assessment

**Low Risk:**
- Changes isolated to signal display logic
- No database schema changes
- No API changes
- Existing trader selection functionality untouched

**Mitigation:**
- Thorough manual testing of enable/disable flows
- Verify trader card click still works
- Test with multiple traders enabled/disabled
- Confirm localStorage persistence

---

### Related Code References

**Trader State Management:**
- `apps/app/src/services/traderManager.ts:497-511` - `getEffectiveEnabled()`
- `apps/app/src/services/traderPreferences.ts:39-104` - localStorage mgmt
- `apps/app/App.tsx:390-414` - Effective enabled state application

**Signal Fetching:**
- `apps/app/src/services/serverExecutionService.ts:235-286` - `fetchRecentSignals()`
- `apps/app/src/hooks/useInfiniteSignals.ts:10-59` - Infinite scroll hook

**Signal Display:**
- `apps/app/src/components/TraderSignalsTable.tsx:41-236` - Main component
- `apps/app/src/components/TraderSignalsTable.tsx:178-183` - Current filtering logic

**Trader Selection:**
- `apps/app/components/Sidebar.tsx:44-45` - Selection state management
- `apps/app/components/MainContent.tsx:137` - Passes selectedTraderId
- `apps/app/src/components/TraderList.tsx:221` - Click handler
