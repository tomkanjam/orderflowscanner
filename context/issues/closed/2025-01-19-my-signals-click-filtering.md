# My Signals Click Filtering

## Metadata
- **Status:** 🏗️ architecture
- **Created:** 2025-01-19 14:00:00
- **Updated:** 2025-01-19 14:15:00
- **Priority:** Critical
- **Type:** bug
- **Progress:** [███       ] 30%

---

## Idea Review
*Stage: idea | Date: 2025-01-19 14:00:00*

### Original Idea
When I click on a built-in signal card in the sidebar, the results table filters the results and only shows results related to the clicked signal. The same filtering functionality needs to be added to "My Signals" cards.

### Enhanced Concept
Implement consistent click-to-filter behavior across all signal types (built-in and custom) in the crypto trading screener. When a user clicks on any signal card - whether it's a built-in professional signal or a user-created custom signal - the results table should immediately filter to show only the symbols that match that specific signal's criteria. This creates a unified, intuitive experience where all signals behave identically regardless of their origin.

### Target Users
- **Primary:** Pro/Elite tier traders who create custom signals and want quick filtering
- **Secondary:** All users who switch between multiple signals frequently
- **Edge Case:** Power users managing 10+ custom signals who need efficient navigation

### Domain Context
- In crypto trading platforms, rapid signal switching is critical for catching opportunities
- Similar features exist in TradingView (watchlist filtering), Coinigy (alert filtering)
- Traders typically monitor multiple strategies simultaneously and need instant focus switching
- Current asymmetry between built-in and custom signals creates cognitive friction

### Suggestions for Improvement
1. **Visual Feedback:** Add active state styling when a signal is selected for filtering
2. **Keyboard Shortcuts:** Add number keys (1-9) for quick signal switching
3. **Clear Filter Button:** Add explicit "Show All" button when filter is active
4. **Performance Optimization:** Use React.memo to prevent unnecessary re-renders during filtering

### Critical Questions

#### Domain Workflow
1. Should clicking the same signal card again toggle the filter off (deselect)?
   - **Why it matters:** Traders often want to quickly toggle between filtered and full view
   - **Recommendation:** Yes, implement toggle behavior for better UX

#### User Needs
2. Should the filter persist across page refreshes or be session-only?
   - **Why it matters:** Traders may want to maintain context across browser crashes
   - **Recommendation:** Session-only initially, add persistence as enhancement

#### Technical Requirements
3. How should this interact with historical signal results already shown?
   - **Why it matters:** Mixed real-time and historical signals could confuse filtering
   - **Recommendation:** Filter both real-time and historical signals consistently

#### Integration
4. Should the URL update to reflect the active filter (for sharing/bookmarking)?
   - **Why it matters:** Traders often share specific setups with team members
   - **Recommendation:** Nice-to-have for v2, not critical for MVP

#### Performance
5. With 100+ symbols updating in real-time, will filtering cause lag?
   - **Why it matters:** Real-time data can't afford filtering delays
   - **Recommendation:** Use memoization and consider virtual scrolling if needed

### Success Criteria
- [ ] Click on custom signal filters results identically to built-in signals
- [ ] Filter applies in <50ms with no visible lag
- [ ] Visual indicator clearly shows which signal is active
- [ ] Filtering works with both real-time and historical signals

### Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance degradation with many signals | High | Implement efficient filtering with Map lookups |
| State sync issues between components | Medium | Use single source of truth (selectedTraderId) |
| Confusion with multiple filter types | Low | Clear visual indicators and tooltips |

### Recommended Next Steps
1. Answer critical questions above
2. Define MVP scope focusing on click-to-filter parity
3. Create detailed spec with /spec
4. Get engineering review for performance implications

### Priority Assessment
**Urgency:** High (feature parity issue affecting Pro/Elite users)
**Impact:** High (improves core workflow efficiency)
**Effort:** Small (existing pattern to follow)
**Recommendation:** Proceed immediately

---
*[End of idea review. Next: /spec issues/2025-01-19-my-signals-click-filtering.md]*

---

## System Architecture
*Stage: architecture | Date: 2025-01-19 14:15:00*

### Executive Summary
The click-to-filter functionality exists but is blocked by incorrect access tier validation. Custom signals are marked as `accessTier: 'elite'` but Pro users who create them cannot interact with them due to tier mismatch. This is a simple configuration bug, not a missing feature.

### Root Cause Analysis

#### Current Behavior
1. **Built-in signals**: Work correctly - click filters the results table
2. **Custom signals**: Click handler blocked by `canView` check
3. **Access control**: Custom signals default to `accessTier: 'elite'` (line 397, traderManager.ts)
4. **Click guard**: `onClick={() => canView && onSelect?.()}` (line 103, SignalCardEnhanced.tsx)
5. **Result**: Pro users can't click their own signals because Pro < Elite

#### Code Flow
```
User clicks signal → SignalCardEnhanced.onClick
  ↓
canView check (getSignalAccess)
  ↓
Pro user + Elite signal = FALSE
  ↓
Click blocked, no filter applied
```

### System Design

#### Data Models
```typescript
// No new models needed - fix existing logic

// Current incorrect behavior in traderManager.ts
interface TraderFromDB {
  access_tier: AccessTier; // Always 'elite' for custom signals
}

// Should be:
interface TraderFromDB {
  access_tier: AccessTier; // Should match creator's tier or 'anonymous'
}
```

#### Component Architecture
**Modified Components:**
- `traderManager.ts`: Fix access tier assignment for custom signals
- No UI component changes needed - filtering already works

**Component Hierarchy:**
```
App
└── Sidebar
    └── TraderList
        ├── SignalCardEnhanced (Built-in) ✓ Works
        └── SignalCardEnhanced (Custom) ✗ Blocked by canView
```

#### Service Layer
**Modified Services:**
```typescript
// traderManager.ts - Line 397
// CURRENT (BUG):
accessTier: data.access_tier || 'elite',

// FIXED:
accessTier: data.access_tier || 'anonymous', // Allow all to view custom signals
// OR
accessTier: data.created_by ? 'anonymous' : (data.access_tier || 'free'),
```

#### Data Flow
```
1. Signal Selection (Already Works)
   └── SignalCardEnhanced.onSelect
       └── TraderList.onSelectTrader
           └── Sidebar.onSelectedTraderChange
               └── App.setSelectedTraderId
                   └── MainContent.selectedTraderId prop
                       └── TraderSignalsTable filters results

2. Access Check (Needs Fix)
   └── getSignalAccess(signal, userTier)
       ├── signal.accessTier = 'elite' (WRONG for custom)
       ├── userTier = 'pro'
       └── Returns canView = false (BLOCKS CLICK)
```

### Technical Specifications

#### API Contracts
No API changes needed - this is a client-side logic fix.

#### Database Schema
```sql
-- Current schema is correct
-- 'access_tier' column exists and works
-- Just need to set correct value for custom signals
```

### Implementation Guidelines

#### Code Changes Required
```typescript
// Option 1: Simple Fix (traderManager.ts line 397)
accessTier: data.created_by ? 'anonymous' : (data.access_tier || 'free'),

// Option 2: Owner-aware Fix
accessTier: (() => {
  // User's own signals always viewable
  if (data.created_by === currentUserId) return 'anonymous';
  // System signals use defined tier
  if (data.is_built_in) return data.access_tier || 'free';
  // Other users' signals (future sharing feature)
  return data.access_tier || 'anonymous';
})(),

// Option 3: Database Migration
// Update all existing custom signals:
UPDATE traders
SET access_tier = 'anonymous'
WHERE created_by IS NOT NULL;
```

#### Design Patterns
- **Pattern**: Early return for owner check
- **Pattern**: Fail-open for custom signals (default to accessible)

### Security Considerations

#### Authorization
- Custom signals should be viewable by their creators regardless of tier
- Future: Implement proper sharing permissions
- Built-in signals maintain existing tier restrictions

### Testing Strategy

#### Test Scenarios
1. **Pro user creates signal** → Can click to filter
2. **Elite user creates signal** → Can click to filter
3. **Free user views Pro signal list** → Cannot see custom signals section
4. **Built-in signals** → Existing tier logic unchanged

### Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Set custom signals to 'anonymous' tier | Creators should always access their own content | Complex owner-checking logic |
| Fix in traderManager.ts | Single point of truth for access tier | Fixing in multiple UI components |
| No database migration | Backwards compatible, fix on read | Updating all existing records |

### Open Technical Questions

1. Should other users be able to view shared custom signals in the future?
2. Should we show "locked" custom signals from other users as a teaser?

### Success Criteria

- [x] Root cause identified (incorrect access tier)
- [ ] Pro users can click their custom signals
- [ ] Elite users can click their custom signals
- [ ] Filtering works identically for all clickable signals
- [ ] No regression in built-in signal access control

### Recommended Fix

**Immediate fix (1 line change):**
```typescript
// traderManager.ts line 397
accessTier: data.created_by ? 'anonymous' : (data.access_tier || 'free'),
```

This ensures custom signals are always clickable while maintaining built-in signal restrictions.

---
*[End of architecture. Next: /plan issues/2025-01-19-my-signals-click-filtering.md]*