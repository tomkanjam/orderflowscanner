# Built-in Trader Run Control

## Metadata
- **Status:** 📊 planning
- **Created:** 2025-10-07T10:00:00Z
- **Updated:** 2025-10-07T12:00:00Z
- **Priority:** High
- **Type:** feature
- **Progress:** [          ] 0%

---

## Idea Review
*Stage: idea | Date: 2025-10-07T10:00:00Z*

### Original Idea
The user needs to be able to control whether a built-in trader is running or not in their browser. We'll have a large library of built-in signals so we can't have all of them running at once. Custom traders already have this toggle. Built-in traders need a setting that says whether a trader is by default running for users. Remember, built-in traders will be available across users so we need to set whether they should be running when a user opens the app. Most will not be running.

### Enhanced Concept
Build a two-tier control system for built-in traders that balances system performance with user experience:

**1. System-Level Default Setting (Admin)**
- Each built-in trader has a `default_enabled` boolean flag set by admins
- This determines whether the trader auto-starts for NEW users or when a user first encounters it
- Most built-in traders will have `default_enabled: false` to prevent browser overload
- A select few "showcase" traders can have `default_enabled: true` for demos

**2. User-Level Override (Per User)**
- Users can toggle any built-in trader on/off in their browser via the UI
- User preferences are persisted in `user_trader_settings` table
- User's choice always overrides the system default
- Settings persist across sessions (stored in Supabase, synced to localStorage for offline access)

**Architecture Implications:**
- Built-in traders are `ownership_type: 'system'` and shared across all users
- The existing `enabled` field on the trader controls admin-level activation (can admins even offer this trader?)
- We need a NEW field `default_enabled` for the system default when users first see it
- We need a NEW table `user_trader_settings` to store per-user preferences

### Target Users
- **Primary:** Free/Pro users browsing the built-in signal library who want to try different strategies without overwhelming their browser
- **Secondary:** Anonymous users who need a curated "starter set" of active signals
- **Edge Case:** Elite users who may want to enable many built-in traders alongside their custom ones (need performance guardrails)

### Domain Context (Algorithmic Trading)
This is a critical UX problem in trading platforms:
- **Performance:** Running too many real-time filters simultaneously kills browser performance
- **Discovery:** Users need to explore a library of pre-built strategies
- **Onboarding:** New users should see 2-3 active "showcase" signals immediately
- **Personalization:** Power users want to curate their own active set

**Industry Parallels:**
- TradingView: Users can add/remove indicators to charts (similar concept)
- Screeners (Finviz, TradingView): Users save custom screener "presets"
- Crypto exchanges: Users favorite/pin specific trading pairs

**Why This Matters Now:**
- Built-in trader library is growing → can't run all of them
- Users report confusion about which signals are active
- Browser performance degrades with 10+ active traders

### Suggestions for Improvement

1. **Default Recommendations Based on User Tier:**
   - Anonymous: Enable 1-2 beginner signals (e.g., "RSI Oversold Bounce")
   - Free: Suggest enabling 3-4 signals from different categories
   - Pro/Elite: No automatic limits, but show performance warnings

2. **Performance Guardrails:**
   - Show warning when user enables 10+ traders: "Performance may be impacted"
   - Automatically disable least-used traders if performance degrades (opt-in setting)
   - Display "Active Traders: 5/10 recommended" indicator in UI

3. **Smart Defaults Based on Activity:**
   - Track which built-in traders generate the most signals
   - Surface popular/high-performing traders as "recommended to enable"
   - Allow users to "Reset to Recommended" if they've enabled too many

4. **Categorization for Easier Management:**
   - Group built-in traders by category (Momentum, Reversal, Volume, etc.)
   - "Enable all in category" / "Disable all in category" shortcuts
   - Collapsible sections in TraderList to reduce visual clutter

5. **Migration Strategy:**
   - For existing users: Check which built-in traders they currently have running
   - Create initial `user_trader_settings` entries based on current state
   - Don't change their active set during migration

### Critical Questions

#### User Experience
1. **How do users discover which built-in traders to enable?**
   - **Why it matters:** If all traders are disabled by default, new users see an empty list
   - **Recommendation:**
     - Have 2-3 "featured" signals auto-enabled for new users
     - Show a "Browse Built-in Signals" gallery with preview cards
     - Display "Not Running" badge on disabled traders with one-click enable

2. **What happens when a user enables too many traders?**
   - **Why it matters:** Browser performance degradation, missed signals
   - **Recommendation:**
     - Soft limit: Show warning at 10 traders ("Performance may be impacted")
     - Hard limit: Block enabling beyond 15 traders (Elite users: 20)
     - Provide "Disable All" quick action to reset

#### Technical Implementation
3. **Where should user preferences be stored?**
   - **Why it matters:** Need persistence, sync across devices, offline support
   - **Recommendation:**
     - Primary: `user_trader_settings` table in Supabase
     - Cache: localStorage for offline/anonymous users
     - Sync strategy: On auth, merge localStorage → Supabase
     - For anonymous users: Use localStorage only, migrate on signup

4. **How do we handle the built-in trader "enabled" field vs user preferences?**
   - **Why it matters:** Confusing if `enabled: false` at system level but user has it "enabled" in their settings
   - **Recommendation:**
     - `trader.enabled`: Admin control (is this trader available to ANY user?)
     - `trader.default_enabled`: System default (should this auto-start for new users?)
     - `user_trader_settings.enabled`: User's personal preference (overrides default)
     - UI shows trader ONLY if: `trader.enabled === true` (admin gate)
     - UI auto-starts trader if: `(user_setting?.enabled ?? trader.default_enabled) === true`

#### Data Model
5. **Should we track additional metadata about user trader usage?**
   - **Why it matters:** Could improve recommendations, onboarding
   - **Recommendation:**
     - Track `last_enabled_at`, `total_signals_generated` per user-trader pair
     - Use for "Recently Active" sorting in UI
     - Use for recommendations ("This trader has generated 50 signals for you")

#### Migration & Backwards Compatibility
6. **What happens to users who already have built-in traders in their TraderList?**
   - **Why it matters:** Don't disrupt existing users' workflows
   - **Recommendation:**
     - Run migration to populate `user_trader_settings` for existing users
     - Query: For each user, find built-in traders they've interacted with (signals table)
     - Create `user_trader_settings` entry with `enabled: true` for those traders
     - For traders with no signals: Use `default_enabled` value

#### Admin Workflow
7. **How do admins set which traders are enabled by default?**
   - **Why it matters:** Needs to be easy to curate the "new user experience"
   - **Recommendation:**
     - Add `default_enabled` checkbox to TraderForm (admin-only section)
     - Default to `false` for safety
     - Provide admin dashboard showing: "X users have this trader enabled"

### Success Criteria
- [ ] Users can toggle built-in traders on/off with visible UI feedback
- [ ] Settings persist across sessions (even after browser restart)
- [ ] New users see 2-3 curated "starter" signals auto-enabled
- [ ] Browser performance maintained with 15+ built-in traders in library
- [ ] Anonymous users can use localStorage-based preferences
- [ ] Admins can set default-enabled status per trader
- [ ] Migration preserves existing users' active trader sets

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Users enable too many traders → browser crashes | High | Soft limit (warning at 10), hard limit (block at 15), auto-disable on performance issues |
| New users see zero active traders → confused/leave | High | Auto-enable 2-3 "featured" traders for new users based on tier |
| Migration disrupts existing users' workflows | Medium | Careful migration: preserve existing active traders, default to `enabled: true` for traders with signals |
| localStorage vs Supabase sync conflicts | Medium | Supabase is source of truth; localStorage is cache; merge on auth with Supabase winning |
| Performance tracking adds overhead | Low | Debounce writes, batch updates, only track key metrics (last_enabled_at, signal_count) |

### Recommended Next Steps
1. Answer critical questions above (especially user preference storage strategy)
2. Define database schema for `user_trader_settings` table
3. Create detailed spec with `/spec`
4. Design UI for trader enable/disable controls (toggle in TraderList)
5. Plan migration strategy for existing users

### Priority Assessment
**Urgency:** High - Library is growing, users reporting confusion
**Impact:** High - Affects all users, critical for UX and performance
**Effort:** M - New table, UI updates, migration script
**Recommendation:** **Proceed** - Critical for scaling the built-in trader library

### Open Questions for PM
1. **How many built-in traders should be auto-enabled for new users?** (I recommend 2-3)
2. **Should we show disabled built-in traders in the main TraderList, or hide them in a "Browse Signals" section?**
3. **Do we want category-based enable/disable (e.g., "Enable all Momentum signals")?**
4. **Should Elite users have a higher limit for enabled traders?** (I recommend 20 vs 15 for other tiers)
5. **Do we need an "auto-enable high performers" feature, or is that too magic?**

---
*[End of idea review. Next: /spec issues/2025-10-07-builtin-trader-run-control.md]*

---

## Engineering Review
*Stage: engineering-review | Date: 2025-10-07T11:30:00Z*

### PM Decisions Summary
Based on PM feedback, the implementation will follow these principles:
1. **Auto-enable traders:** PM will choose specific traders to enable by default
2. **Layout:** Keep current TraderList layout (no separate browse section)
3. **Performance limits:** Tier-based limits (handled elsewhere, not in this feature)
4. **Anonymous users:** localStorage only (no migration on signup needed)
5. **Migration:** No migration for existing users

### Codebase Analysis

#### Relevant Existing Code

**Core infrastructure already in place:**
- ✅ `TraderManager` service (`apps/app/src/services/traderManager.ts`):
  - Line 235-240: `enableTrader()` / `disableTrader()` methods exist
  - Line 167-179: `getTraders()` supports filtering by `enabled: boolean`
  - Line 440-442: `getEnabledTraders()` convenience method
  - Subscribable architecture with debounced notifications (line 320-333)

- ✅ Database schema (`supabase/migrations/004_create_subscription_system.sql`):
  - Line 38-45: `traders` table has `ownership_type`, `access_tier`, `is_built_in` columns
  - Line 64-66: Proper indexes on `ownership_type`, `access_tier`, `is_built_in`
  - Line 111-138: RLS policies support built-in trader visibility based on tier

- ✅ TraderList UI (`apps/app/src/components/TraderList.tsx`):
  - Line 50-78: Already separates built-in vs custom signals
  - Line 80-90: `handleToggleTrader()` already exists for enable/disable
  - Uses `SignalCardEnhanced` component (no direct toggle UI visible yet)

**Worker architecture (critical for performance):**
- ✅ `useMultiTraderScreener` (`apps/app/hooks/useMultiTraderScreener.ts`):
  - Line 98: **Already filters to enabled traders only**: `enabledTraders = traders.filter(t => t.enabled)`
  - Line 100-103: Skips execution if no enabled traders
  - This means toggle changes will automatically affect screener execution

**Patterns to follow:**
- **Subscription pattern:** TraderManager already uses observable pattern (line 295-307)
- **Toggle pattern:** Existing `handleToggleTrader` in TraderList (line 80-90)
- **Tier access checks:** `getSignalAccess()` utility already exists (TraderList line 155)

#### Technical Debt to Address

**None blocking this feature**, but note:
- TraderManager uses in-memory Map + Supabase sync (line 11-12)
- No optimistic locking on trader updates (potential race condition if multiple tabs)
- TraderForm.tsx has `isBuiltIn` admin fields (line 56-61) but **missing `default_enabled`**

#### Performance Baseline

**Current architecture:**
- Worker filters enabled traders before executing (line 98 in useMultiTraderScreener)
- Screener runs every 5s by default (line 26 in useMultiTraderScreener)
- Each trader runs in isolated worker context (web worker pattern)

**Performance impact of this feature:**
- ✅ **Minimal:** Only adds localStorage read/write on toggle
- ✅ **No worker changes needed:** Worker already respects `enabled` flag
- ✅ **No database load increase:** Toggling updates single field

### Spec Analysis

#### Technical Feasibility
**Verdict:** ✅ **Feasible with minimal effort**

**Reasoning:**
1. **90% of infrastructure exists:** `enabled` field, toggle methods, worker filtering
2. **Only missing piece:** Per-user preferences for built-in traders
3. **PM simplified scope:** No Supabase sync, no migration, localStorage-only for anonymous
4. **Admin UI needs:** Add `default_enabled` field to TraderForm

#### Hidden Complexity

1. **localStorage key collision between users**
   - **Why it's complex:** Multiple users on same device (shared computer)
   - **Solution:** Prefix keys with `userId` if authenticated: `trader_prefs_${userId || 'anon'}`
   - **Mitigation:** For anonymous users, accept that prefs are device-specific

2. **Built-in trader updates from admins**
   - **Why it's complex:** If admin toggles a built-in trader's `enabled: false`, user's localStorage may still say "enabled"
   - **Solution:** UI must check BOTH `trader.enabled` (admin gate) AND localStorage preference
   - **Logic:** `actuallyEnabled = trader.enabled && (userPref ?? trader.default_enabled)`

3. **Race condition: Toggle during screener execution**
   - **Why it's complex:** User toggles trader while worker is running that trader's filter
   - **Current behavior:** TraderManager debounces updates (50ms), then notifies subscribers
   - **Mitigation:** Worker uses snapshot of traders at execution time, next run picks up change

4. **localStorage size limits**
   - **Why it's complex:** localStorage has 5-10MB limit per domain
   - **Current usage:** Only storing trader enable/disable states (minimal)
   - **Mitigation:** Use simple JSON: `{ [traderId]: boolean }` (~50 bytes per trader)
   - **At scale:** 100 traders = ~5KB, well within limits

### Architecture Recommendations

#### Proposed Approach

**Three-layer architecture:**

```typescript
// Layer 1: localStorage persistence
class TraderPreferenceStore {
  private getKey(userId?: string): string {
    return `trader_prefs_${userId || 'anon'}`;
  }

  getTraderEnabled(traderId: string, userId?: string): boolean | null {
    const prefs = JSON.parse(localStorage.getItem(this.getKey(userId)) || '{}');
    return prefs[traderId] ?? null; // null = no preference set
  }

  setTraderEnabled(traderId: string, enabled: boolean, userId?: string): void {
    const key = this.getKey(userId);
    const prefs = JSON.parse(localStorage.getItem(key) || '{}');
    prefs[traderId] = enabled;
    localStorage.setItem(key, JSON.stringify(prefs));
  }
}

// Layer 2: TraderManager integration
class TraderManager {
  // Add method to get "effective enabled" state
  async getEffectiveEnabled(trader: Trader, userId?: string): Promise<boolean> {
    if (!trader.enabled) return false; // Admin disabled = always false
    if (!trader.isBuiltIn) return trader.enabled; // Custom traders use DB field

    // Built-in traders: check user preference, fallback to default_enabled
    const userPref = preferenceStore.getTraderEnabled(trader.id, userId);
    return userPref ?? trader.default_enabled ?? false;
  }

  // Add method to toggle user preference
  async toggleUserPreference(traderId: string, userId?: string): Promise<void> {
    const trader = await this.getTrader(traderId);
    if (!trader?.isBuiltIn) {
      // Custom traders: toggle DB field
      return trader.enabled ? this.disableTrader(traderId) : this.enableTrader(traderId);
    }

    // Built-in traders: toggle localStorage
    const currentPref = preferenceStore.getTraderEnabled(traderId, userId);
    const currentEffective = currentPref ?? trader.default_enabled ?? false;
    preferenceStore.setTraderEnabled(traderId, !currentEffective, userId);
    this.notifySubscribers(); // Trigger UI update
  }
}

// Layer 3: UI integration (TraderList)
// In TraderList component, filter traders by effective enabled state
const effectivelyEnabledTraders = traders.filter(t =>
  getEffectiveEnabled(t, user?.id)
);
```

#### Data Flow

1. **User clicks toggle on built-in trader**
   → `TraderList.handleToggleTrader()`
   → `traderManager.toggleUserPreference(traderId, userId)`
   → localStorage updated
   → `notifySubscribers()` triggers re-render

2. **TraderList re-renders**
   → Filters traders by `getEffectiveEnabled()`
   → Passes filtered list to `useMultiTraderScreener`

3. **Screener worker**
   → Receives updated trader list
   → Filters to `enabled: true` (line 98 in useMultiTraderScreener)
   → Executes filters

#### Key Components

**New:**
- `TraderPreferenceStore` class (new file: `src/services/traderPreferences.ts`)
- `default_enabled` field on `traders` table (migration)
- Admin UI for `default_enabled` in TraderForm

**Modified:**
- `TraderManager`:
  - Add `getEffectiveEnabled()` method
  - Add `toggleUserPreference()` method
- `TraderList`:
  - Update `handleToggleTrader()` to use `toggleUserPreference()`
  - Filter traders by effective enabled state before passing to screener
- `Trader` interface:
  - Add `default_enabled?: boolean` field

**Deprecated:**
- None

### Implementation Complexity

#### Effort Breakdown
- **Frontend:** M (new preference store, TraderList changes, TraderForm admin field)
- **Backend:** XS (single migration to add `default_enabled` column)
- **Infrastructure:** XS (localStorage only, no new services)
- **Testing:** S (unit tests for preference store, integration test for toggle)

**Total: ~4-6 hours of dev work**

#### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| localStorage quota exceeded | Low | Low | Use simple JSON schema, monitor size, warn at 100 traders |
| User confused why trader disabled | Medium | Medium | Clear UI states: "Disabled by admin" vs "Disabled by you" |
| Race condition on toggle | Low | Low | Already debounced (50ms), worker uses snapshot |
| Cross-tab sync issues | Medium | Low | Use `storage` event listener to sync localStorage changes |
| Admin changes not reflected | Low | Medium | UI checks `trader.enabled` first before user pref |

### Security Considerations

#### Authentication/Authorization
- ✅ **Already handled:** RLS policies restrict built-in trader visibility by tier (line 111-138 in migration 004)
- ✅ **localStorage is client-side:** No security risk (users can only affect their own browser)
- ⚠️ **Admin field:** `default_enabled` should only be settable by admins (check `profile.is_admin` in TraderForm)

#### Data Protection
- ✅ **No sensitive data:** localStorage only stores trader IDs and boolean states
- ✅ **No PII:** User ID used as key prefix, but already known client-side

#### API Security
- ✅ **No new API calls:** All operations are client-side localStorage
- ✅ **Existing toggle uses TraderManager:** Already has proper auth checks

### Testing Strategy

#### Unit Tests
```typescript
// tests/traderPreferences.test.ts
describe('TraderPreferenceStore', () => {
  it('should store and retrieve trader preference');
  it('should handle multiple users with different prefs');
  it('should return null for unset preference');
  it('should handle localStorage unavailable gracefully');
});

// tests/traderManager.test.ts
describe('TraderManager.getEffectiveEnabled', () => {
  it('should return false if admin disabled trader');
  it('should use user pref if set for built-in trader');
  it('should fall back to default_enabled if no user pref');
  it('should use DB enabled field for custom traders');
});
```

#### Integration Tests
```typescript
// tests/integration/traderToggle.test.tsx
describe('Built-in Trader Toggle', () => {
  it('should update localStorage on toggle');
  it('should filter screener traders after toggle');
  it('should sync across tabs using storage event');
  it('should respect admin disable even if user enabled');
});
```

#### Performance Tests
- **Not needed:** Feature adds <1ms to toggle operation (localStorage write)

#### Chaos Engineering
- **localStorage unavailable:** Fallback to in-memory Map
- **Quota exceeded:** Warn user, prevent further enables
- **Corrupted localStorage:** Try/catch JSON.parse, reset on error

### Technical Recommendations

#### Must Have
1. ✅ **Add `default_enabled` column to traders table**
2. ✅ **Implement `TraderPreferenceStore` with localStorage**
3. ✅ **Add admin UI for `default_enabled` in TraderForm**
4. ✅ **Update `handleToggleTrader` to use preference store for built-in traders**

#### Should Have
1. **Cross-tab sync:** Listen to `storage` event to sync localStorage changes
2. **Clear UI states:** Show different icons/text for "admin disabled" vs "user disabled"
3. **LocalStorage fallback:** Gracefully handle quota exceeded or unavailable

#### Nice to Have
1. **Export/import preferences:** Let users export their enabled set as JSON
2. **Reset to defaults:** Quick button to clear all preferences
3. **Performance warning:** Show toast if >10 traders enabled

### Implementation Guidelines

#### Code Organization
```
apps/app/src/
  services/
    traderPreferences.ts          # NEW: localStorage preference store
    traderManager.ts               # MODIFIED: add getEffectiveEnabled, toggleUserPreference
  components/
    TraderList.tsx                 # MODIFIED: use preference store
    TraderForm.tsx                 # MODIFIED: add default_enabled admin field
  abstractions/
    trader.interfaces.ts           # MODIFIED: add default_enabled field
supabase/
  migrations/
    018_add_default_enabled.sql    # NEW: add default_enabled column
```

#### Key Decisions

**State management:**
- Built-in traders: localStorage (user preference) + DB (admin control)
- Custom traders: DB only (existing `enabled` field)

**Data fetching:**
- No new API calls needed
- All operations use existing TraderManager methods + localStorage

**Caching:**
- localStorage IS the cache
- No Supabase sync needed (per PM decision)

**Error handling:**
- Wrap localStorage calls in try/catch
- Fall back to in-memory Map if localStorage unavailable
- Log errors but don't block UI

### Questions for PM/Design

1. ✅ **ANSWERED:** How many traders auto-enable for new users? → PM will choose specific traders
2. ✅ **ANSWERED:** Separate browse section or current layout? → Keep current layout
3. ✅ **ANSWERED:** Performance limits? → Tier-based (handled elsewhere)
4. **NEW:** Should we show an indicator when a built-in trader is "disabled by admin" vs "disabled by you"?
5. **NEW:** Do we want a "Reset to Recommended" button to clear all localStorage preferences?

### Pre-Implementation Checklist

- [x] Performance requirements achievable (minimal impact)
- [x] Security model defined (localStorage only, no new auth)
- [x] Error handling strategy clear (try/catch, fallback to in-memory)
- [x] Monitoring plan in place (console logs for localStorage errors)
- [x] Rollback strategy defined (remove migration, revert code)
- [x] Dependencies available (localStorage API, existing TraderManager)
- [x] No blocking technical debt

### Critical Implementation Notes

#### 1. The "enabled" field hierarchy
```typescript
// For built-in traders, there are THREE levels of control:
// 1. trader.enabled (admin gate) - if false, ALWAYS disabled
// 2. user localStorage preference - if set, use this
// 3. trader.default_enabled (fallback) - use if no user pref

// CORRECT logic:
const effectivelyEnabled =
  trader.enabled &&                              // Admin hasn't disabled it
  (userPref ?? trader.default_enabled ?? false); // User pref or default

// INCORRECT (bug risk):
const effectivelyEnabled = userPref ?? trader.default_enabled;
// ^ Missing admin gate check!
```

#### 2. Worker integration (already works!)
The worker architecture **already handles this correctly**:
```typescript
// useMultiTraderScreener.ts:98
const enabledTraders = tradersRef.current.filter(t => t.enabled);
```

We just need to ensure `trader.enabled` reflects the effective state BEFORE passing to the hook.

**Two approaches:**

**Approach A (Recommended): Filter in TraderList**
```typescript
// TraderList.tsx - before passing to useMultiTraderScreener
const effectivelyEnabledTraders = traders.map(t => ({
  ...t,
  enabled: getEffectiveEnabled(t, user?.id)
}));
// Pass effectivelyEnabledTraders to screener
```

**Approach B: Filter in hook**
```typescript
// useMultiTraderScreener.ts - modify line 98
const enabledTraders = tradersRef.current.filter(t =>
  getEffectiveEnabled(t, userId)
);
```

**Recommendation: Approach A** - Keep worker logic simple, do filtering in UI layer.

#### 3. Migration strategy (simplified per PM)

**No user migration needed**, but we need:
```sql
-- Migration 018: Add default_enabled column
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS default_enabled BOOLEAN DEFAULT false;

-- Create index for fast filtering
CREATE INDEX IF NOT EXISTS idx_traders_default_enabled
ON traders(default_enabled) WHERE is_built_in = true;

-- Set a few showcase traders to default_enabled = true
-- (PM will provide list)
UPDATE traders
SET default_enabled = true
WHERE id IN (
  'trader-id-1',  -- PM to provide
  'trader-id-2',
  'trader-id-3'
);
```

### Recommended Next Steps

**Since PM answered all critical questions:**

1. ✅ **Proceed to implementation** - All blockers resolved
2. Create migration for `default_enabled` column
3. Implement `TraderPreferenceStore` class
4. Update `TraderManager` with preference methods
5. Update `TraderList` to filter by effective enabled state
6. Add admin UI in `TraderForm` for `default_enabled` checkbox
7. Add unit tests for preference store
8. Test with multiple traders, multiple users, multiple tabs

**Estimated timeline: 4-6 hours** (1 development session)

---
*[End of engineering review. Next: /architect issues/2025-10-07-builtin-trader-run-control.md]*

---

## Implementation Plan
*Stage: planning | Date: 2025-10-07T12:00:00Z*

### Overview
Implement per-user run control for built-in traders using a three-tier hierarchy:
1. Admin gate (`trader.enabled`) - controls availability
2. User preference (localStorage) - per-user enable/disable
3. System default (`trader.default_enabled`) - fallback for new users

**UI Work Detected:** Yes - Adding toggle controls, admin UI, and filtering logic

### Prerequisites
- [x] TraderManager service exists with enable/disable methods
- [x] SignalCardEnhanced component has `showEnableToggle` prop
- [x] Worker already filters by `enabled` field
- [x] Database has `is_built_in`, `ownership_type`, `access_tier` columns
- [ ] Create feature branch: `feature/builtin-trader-run-control`
- [ ] Load TraderManager and TraderList code for context

### Implementation Phases

#### Phase 1: Database Schema & Types (30 minutes)
**Objective:** Add `default_enabled` column and update TypeScript interfaces

##### Task 1.1: Create Database Migration (15 min)
Files to create:
- `supabase/migrations/018_add_default_enabled.sql`

Actions:
- [ ] Add `default_enabled BOOLEAN DEFAULT false` column to `traders` table
- [ ] Create partial index on `(default_enabled) WHERE is_built_in = true`
- [ ] Update 2-3 showcase traders to `default_enabled = true` (PM to provide IDs)

Migration SQL:
```sql
-- Add default_enabled column
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS default_enabled BOOLEAN DEFAULT false;

-- Create index for fast filtering of built-in traders
CREATE INDEX IF NOT EXISTS idx_traders_default_enabled
ON traders(default_enabled) WHERE is_built_in = true;

-- Set showcase traders to default_enabled = true
-- PM will provide specific trader IDs
UPDATE traders
SET default_enabled = true
WHERE id IN (
  'trader-id-1',
  'trader-id-2',
  'trader-id-3'
) AND is_built_in = true;
```

Test criteria:
- [ ] Migration runs without errors: `supabase db push`
- [ ] Column exists: `SELECT default_enabled FROM traders LIMIT 1`
- [ ] Index created: Check `pg_indexes` table
- [ ] Showcase traders updated: `SELECT name, default_enabled FROM traders WHERE default_enabled = true`

**Checkpoint:** Database schema updated

##### Task 1.2: Update TypeScript Interfaces (15 min)
Files to modify:
- `apps/app/src/abstractions/trader.interfaces.ts`
- `server/fly-machine/shared/abstractions/trader.interfaces.ts`

Actions:
- [ ] Add `default_enabled?: boolean` to `Trader` interface
- [ ] Update `TraderManager.serializeTrader()` to include `default_enabled`
- [ ] Update `TraderManager.deserializeTrader()` to parse `default_enabled`

Code changes:
```typescript
// trader.interfaces.ts (line ~26, after isBuiltIn)
export interface Trader {
  // ... existing fields
  isBuiltIn: boolean;
  default_enabled?: boolean; // NEW: Whether this built-in trader is enabled by default for new users
  category?: string;
  // ... rest of fields
}
```

```typescript
// traderManager.ts serializeTrader (line ~392)
private serializeTrader(trader: Trader): any {
  return {
    // ... existing fields
    is_built_in: trader.isBuiltIn,
    default_enabled: trader.default_enabled, // NEW
    category: trader.category,
    // ... rest of fields
  };
}
```

```typescript
// traderManager.ts deserializeTrader (line ~428)
return {
  // ... existing fields
  isBuiltIn: data.is_built_in || false,
  default_enabled: data.default_enabled, // NEW
  category: data.category,
  // ... rest of fields
};
```

Test criteria:
- [ ] TypeScript compiles without errors: `pnpm build`
- [ ] Types match database schema
- [ ] Serialization/deserialization handles `default_enabled`

**Phase 1 Complete When:**
- Database has `default_enabled` column
- TypeScript interfaces updated
- TraderManager handles new field
- No TypeScript errors

---

#### Phase 2: localStorage Preference Store (1 hour)
**Objective:** Create service to manage per-user trader preferences in localStorage

##### Task 2.1: Implement TraderPreferenceStore (45 min)
Files to create:
- `apps/app/src/services/traderPreferences.ts`

Actions:
- [ ] Create `TraderPreferenceStore` class with localStorage wrapper
- [ ] Implement `getTraderEnabled(traderId, userId)`
- [ ] Implement `setTraderEnabled(traderId, enabled, userId)`
- [ ] Implement `clearAllPreferences(userId)` for reset functionality
- [ ] Add error handling for localStorage unavailable/quota exceeded
- [ ] Add TypeScript types for preference storage format

Code implementation:
```typescript
// apps/app/src/services/traderPreferences.ts

/**
 * Storage format in localStorage:
 * Key: `trader_prefs_${userId || 'anon'}`
 * Value: { [traderId: string]: boolean }
 */

export class TraderPreferenceStore {
  private static readonly KEY_PREFIX = 'trader_prefs_';
  private inMemoryFallback: Map<string, Record<string, boolean>> = new Map();
  private useInMemory = false;

  constructor() {
    // Test localStorage availability
    try {
      const testKey = '__trader_prefs_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
    } catch (e) {
      console.warn('[TraderPreferences] localStorage unavailable, using in-memory fallback');
      this.useInMemory = true;
    }
  }

  private getKey(userId?: string): string {
    return `${TraderPreferenceStore.KEY_PREFIX}${userId || 'anon'}`;
  }

  /**
   * Get user's preference for a specific trader
   * @returns boolean if preference set, null if no preference
   */
  getTraderEnabled(traderId: string, userId?: string): boolean | null {
    const key = this.getKey(userId);

    try {
      if (this.useInMemory) {
        const prefs = this.inMemoryFallback.get(key) || {};
        return prefs[traderId] ?? null;
      }

      const stored = localStorage.getItem(key);
      if (!stored) return null;

      const prefs = JSON.parse(stored);
      return prefs[traderId] ?? null;
    } catch (error) {
      console.error('[TraderPreferences] Error reading preference:', error);
      return null;
    }
  }

  /**
   * Set user's preference for a specific trader
   */
  setTraderEnabled(traderId: string, enabled: boolean, userId?: string): void {
    const key = this.getKey(userId);

    try {
      if (this.useInMemory) {
        const prefs = this.inMemoryFallback.get(key) || {};
        prefs[traderId] = enabled;
        this.inMemoryFallback.set(key, prefs);
        return;
      }

      const stored = localStorage.getItem(key);
      const prefs = stored ? JSON.parse(stored) : {};
      prefs[traderId] = enabled;

      localStorage.setItem(key, JSON.stringify(prefs));

      // Emit storage event for cross-tab sync
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        newValue: JSON.stringify(prefs),
        storageArea: localStorage
      }));
    } catch (error) {
      console.error('[TraderPreferences] Error saving preference:', error);

      // If quota exceeded, try to make space
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('[TraderPreferences] localStorage quota exceeded');
        // Could implement cleanup logic here
      }
    }
  }

  /**
   * Clear all preferences for a user
   */
  clearAllPreferences(userId?: string): void {
    const key = this.getKey(userId);

    try {
      if (this.useInMemory) {
        this.inMemoryFallback.delete(key);
        return;
      }

      localStorage.removeItem(key);
    } catch (error) {
      console.error('[TraderPreferences] Error clearing preferences:', error);
    }
  }

  /**
   * Get all preferences for a user
   */
  getAllPreferences(userId?: string): Record<string, boolean> {
    const key = this.getKey(userId);

    try {
      if (this.useInMemory) {
        return this.inMemoryFallback.get(key) || {};
      }

      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('[TraderPreferences] Error reading all preferences:', error);
      return {};
    }
  }
}

// Singleton instance
export const traderPreferences = new TraderPreferenceStore();
```

Test criteria:
- [ ] Can store and retrieve preferences
- [ ] Handles multiple user IDs correctly
- [ ] Returns `null` for unset preferences
- [ ] Gracefully handles localStorage unavailable
- [ ] Handles quota exceeded error

**Checkpoint:** Preference store working with localStorage

##### Task 2.2: Add Unit Tests (15 min)
Files to create:
- `apps/app/src/services/__tests__/traderPreferences.test.ts`

Actions:
- [ ] Test storing and retrieving preferences
- [ ] Test multiple users with different preferences
- [ ] Test null return for unset preference
- [ ] Test error handling (localStorage unavailable)
- [ ] Test cross-tab sync event emission

Test cases:
```typescript
// Basic test structure
describe('TraderPreferenceStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should store and retrieve trader preference', () => {
    traderPreferences.setTraderEnabled('trader-1', true, 'user-1');
    expect(traderPreferences.getTraderEnabled('trader-1', 'user-1')).toBe(true);
  });

  it('should return null for unset preference', () => {
    expect(traderPreferences.getTraderEnabled('trader-2', 'user-1')).toBeNull();
  });

  it('should handle multiple users independently', () => {
    traderPreferences.setTraderEnabled('trader-1', true, 'user-1');
    traderPreferences.setTraderEnabled('trader-1', false, 'user-2');

    expect(traderPreferences.getTraderEnabled('trader-1', 'user-1')).toBe(true);
    expect(traderPreferences.getTraderEnabled('trader-1', 'user-2')).toBe(false);
  });
});
```

**Phase 2 Complete When:**
- TraderPreferenceStore class implemented
- Unit tests passing
- Error handling works for edge cases
- localStorage and in-memory modes both work

---

#### Phase 3: TraderManager Integration (1 hour)
**Objective:** Add methods to TraderManager for effective enabled state

##### Task 3.1: Add Effective Enabled Logic (30 min)
Files to modify:
- `apps/app/src/services/traderManager.ts`

Actions:
- [ ] Import `traderPreferences` at top of file
- [ ] Add `getEffectiveEnabled(trader, userId)` method
- [ ] Add `toggleUserPreference(traderId, userId)` method
- [ ] Update toggle logic to differentiate built-in vs custom traders

Code changes:
```typescript
// traderManager.ts - Add at top with other imports (line ~8)
import { traderPreferences } from './traderPreferences';

// traderManager.ts - Add new methods before line 460 (before singleton export)

/**
 * Get the effective enabled state for a trader
 * For built-in traders: checks admin gate, user preference, then default_enabled
 * For custom traders: returns trader.enabled directly
 */
getEffectiveEnabled(trader: Trader, userId?: string): boolean {
  // Admin gate: if admin disabled, always return false
  if (!trader.enabled) {
    return false;
  }

  // Custom traders: use database enabled field directly
  if (!trader.isBuiltIn) {
    return trader.enabled;
  }

  // Built-in traders: check user preference, fallback to default_enabled
  const userPref = traderPreferences.getTraderEnabled(trader.id, userId);
  return userPref ?? trader.default_enabled ?? false;
}

/**
 * Toggle user preference for a trader
 * For built-in traders: updates localStorage
 * For custom traders: updates database enabled field
 */
async toggleUserPreference(traderId: string, userId?: string): Promise<void> {
  const trader = this.traders.get(traderId);
  if (!trader) {
    throw new Error(`Trader ${traderId} not found`);
  }

  if (!trader.isBuiltIn) {
    // Custom traders: toggle database field
    if (trader.enabled) {
      await this.disableTrader(traderId);
    } else {
      await this.enableTrader(traderId);
    }
    return;
  }

  // Built-in traders: toggle localStorage preference
  const currentPref = traderPreferences.getTraderEnabled(traderId, userId);
  const currentEffective = currentPref ?? trader.default_enabled ?? false;

  traderPreferences.setTraderEnabled(traderId, !currentEffective, userId);

  // Notify subscribers to trigger UI update
  this.notifySubscribers();
}

/**
 * Get all traders with their effective enabled state
 */
getEffectiveTraders(userId?: string): Trader[] {
  return Array.from(this.traders.values()).map(trader => ({
    ...trader,
    enabled: this.getEffectiveEnabled(trader, userId)
  }));
}
```

Test criteria:
- [ ] `getEffectiveEnabled` respects admin gate (returns false if `trader.enabled === false`)
- [ ] `getEffectiveEnabled` checks user pref for built-in traders
- [ ] `getEffectiveEnabled` falls back to `default_enabled` if no user pref
- [ ] `toggleUserPreference` updates localStorage for built-in traders
- [ ] `toggleUserPreference` updates DB for custom traders

**Checkpoint:** TraderManager has effective enabled logic

##### Task 3.2: Update TraderList Integration (30 min)
Files to modify:
- `apps/app/src/components/TraderList.tsx`

Actions:
- [ ] Import `traderPreferences`
- [ ] Get current user ID from `useAuth` hook
- [ ] Update `handleToggleTrader` to use `toggleUserPreference`
- [ ] Filter traders by effective enabled state before passing to screener
- [ ] Add visual indicator for user-disabled vs admin-disabled traders

Code changes:
```typescript
// TraderList.tsx - Update imports (around line 4)
import { traderManager } from '../services/traderManager';
import { useAuth } from '../hooks/useAuth'; // If not already imported

// TraderList.tsx - Inside component (around line 28)
const { user } = useAuth();

// TraderList.tsx - Update handleToggleTrader (line 80)
const handleToggleTrader = async (trader: Trader) => {
  try {
    await traderManager.toggleUserPreference(trader.id, user?.id);
  } catch (error) {
    console.error('Failed to toggle trader:', error);
  }
};

// TraderList.tsx - Add new helper to get effective enabled state
const getEffectiveEnabled = useCallback((trader: Trader): boolean => {
  return traderManager.getEffectiveEnabled(trader, user?.id);
}, [user?.id]);

// TraderList.tsx - Update trader rendering to show effective state
// In the map over builtInSignals (around line 154)
{builtInSignals.map(trader => {
  const access = getSignalAccess(trader, currentTier);
  const isFavorite = preferences?.favorite_signals?.includes(trader.id) || false;
  const isSelected = selectedTraderId === trader.id;
  const effectivelyEnabled = getEffectiveEnabled(trader); // NEW

  return (
    <SignalCardEnhanced
      key={trader.id}
      signal={{...trader, enabled: effectivelyEnabled}} // Pass effective state
      isSelected={isSelected}
      isFavorite={isFavorite}
      canView={access.canView}
      canFavorite={access.canFavorite}
      showEnableToggle={true}
      showAccessIndicator={true}
      showEditDelete={profile?.is_admin}
      onSelect={() => onSelectTrader?.(isSelected ? null : trader.id)}
      onEdit={() => onEditTrader(trader)}
      onDelete={() => handleDeleteTrader(trader)}
      onToggleFavorite={() => handleToggleFavorite(trader.id)}
      onToggleEnable={() => handleToggleTrader(trader)} // This now uses toggleUserPreference
    />
  );
})}
```

Test criteria:
- [ ] Clicking toggle updates localStorage for built-in traders
- [ ] Clicking toggle updates DB for custom traders
- [ ] UI reflects effective enabled state
- [ ] Screener receives traders with effective enabled state

**Phase 3 Complete When:**
- TraderManager has `getEffectiveEnabled` and `toggleUserPreference` methods
- TraderList uses new methods
- Toggle works for both built-in and custom traders
- Effective enabled state passed to screener

---

#### Phase 4: Admin UI & Default Settings (45 minutes)
**Objective:** Add admin controls for `default_enabled` field

##### Task 4.1: Update TraderForm Admin Section (30 min)
Files to modify:
- `apps/app/src/components/TraderForm.tsx`

Actions:
- [ ] Add `defaultEnabled` state variable (line ~60, with other admin states)
- [ ] Initialize from `editingTrader?.default_enabled` in useEffect
- [ ] Add checkbox input in admin section (line ~847, after `isBuiltIn` checkbox)
- [ ] Include in create/update payload (line ~386 and line ~349)

Code changes:
```typescript
// TraderForm.tsx - Add state (line ~61, after adminNotes)
const [defaultEnabled, setDefaultEnabled] = useState(editingTrader?.default_enabled || false);

// TraderForm.tsx - Update useEffect (line ~83, in editingTrader effect)
useEffect(() => {
  if (editingTrader) {
    // ... existing state updates
    setAdminNotes(editingTrader.adminNotes || '');
    setDefaultEnabled(editingTrader.default_enabled || false); // NEW
  }
}, [editingTrader]);

// TraderForm.tsx - Update resetForm (line ~158)
const resetForm = () => {
  // ... existing resets
  setAdminNotes('');
  setDefaultEnabled(false); // NEW
};

// TraderForm.tsx - Add UI in admin section (line ~847, after isBuiltIn checkbox)
{isBuiltIn && (
  <>
    {/* Existing admin fields (accessTier, category, difficulty, adminNotes) */}

    {/* NEW: Default Enabled Checkbox */}
    <div className="flex items-center gap-3">
      <input
        type="checkbox"
        id="defaultEnabled"
        checked={defaultEnabled}
        onChange={(e) => setDefaultEnabled(e.target.checked)}
        className="h-4 w-4 rounded border-[var(--nt-border-default)] bg-[var(--nt-bg-secondary)]
          text-[var(--nt-accent-lime)] focus:ring-[var(--nt-accent-lime)] focus:ring-offset-0"
      />
      <label htmlFor="defaultEnabled" className="text-sm text-[var(--nt-text-primary)]">
        Enable by default for new users
      </label>
    </div>
    <p className="text-xs text-[var(--nt-text-muted)] mt-1">
      When checked, this signal will automatically run for new users when they first open the app
    </p>
  </>
)}

// TraderForm.tsx - Include in update payload (line ~349, in updateTrader call)
...(profile?.is_admin && {
  isBuiltIn,
  accessTier,
  category: isBuiltIn ? category : undefined,
  difficulty: isBuiltIn ? difficulty : undefined,
  adminNotes: isBuiltIn ? adminNotes : undefined,
  default_enabled: isBuiltIn ? defaultEnabled : undefined // NEW
})

// TraderForm.tsx - Include in create payload (line ~386, in createTrader call)
...(profile?.is_admin && {
  isBuiltIn,
  ownershipType: isBuiltIn ? 'system' : 'user',
  accessTier,
  category: isBuiltIn ? category : undefined,
  difficulty: isBuiltIn ? difficulty : undefined,
  adminNotes: isBuiltIn ? adminNotes : undefined,
  default_enabled: isBuiltIn ? defaultEnabled : undefined // NEW
})
```

Test criteria:
- [ ] Checkbox appears in admin section when `isBuiltIn === true`
- [ ] Checkbox hidden for custom traders
- [ ] State initializes correctly when editing built-in trader
- [ ] Value saved to database when creating/updating

**Checkpoint:** Admin can set `default_enabled` for built-in traders

##### Task 4.2: Test Admin Workflow (15 min)
Actions:
- [ ] Log in as admin user
- [ ] Create new built-in trader with `default_enabled = true`
- [ ] Verify checkbox appears and can be toggled
- [ ] Save trader and verify `default_enabled` in database
- [ ] Edit existing built-in trader and toggle `default_enabled`
- [ ] Verify new users see trader enabled/disabled based on default

Test criteria:
- [ ] Admin checkbox works
- [ ] Value persists to database
- [ ] New users respect `default_enabled` setting

**Phase 4 Complete When:**
- Admin UI has `default_enabled` checkbox
- Value saves to database
- TraderForm handles field correctly

---

#### Phase 5: Cross-Tab Sync & Edge Cases (30 minutes)
**Objective:** Handle edge cases and add cross-tab synchronization

##### Task 5.1: Implement Cross-Tab Sync (15 min)
Files to modify:
- `apps/app/src/components/TraderList.tsx`

Actions:
- [ ] Add `storage` event listener in useEffect
- [ ] Re-fetch traders when localStorage changes detected
- [ ] Handle cleanup on unmount

Code changes:
```typescript
// TraderList.tsx - Add after traders useEffect (around line 47)
useEffect(() => {
  // Listen for localStorage changes from other tabs
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key?.startsWith('trader_prefs_')) {
      console.log('[TraderList] Preference changed in another tab, re-rendering');
      // Force re-render by triggering trader manager notification
      traderManager['notifySubscribers']();
    }
  };

  window.addEventListener('storage', handleStorageChange);

  return () => {
    window.removeEventListener('storage', handleStorageChange);
  };
}, []);
```

Test criteria:
- [ ] Open app in two tabs
- [ ] Toggle trader in tab 1
- [ ] Verify tab 2 updates automatically

**Checkpoint:** Cross-tab sync working

##### Task 5.2: Edge Case Handling (15 min)
Actions:
- [ ] Test admin disables trader while user has it enabled in localStorage
- [ ] Test localStorage quota exceeded scenario
- [ ] Test localStorage unavailable (incognito mode)
- [ ] Test corrupted localStorage data
- [ ] Add console warnings for edge cases

Edge cases to verify:
```typescript
// Case 1: Admin disabled trader (trader.enabled = false)
// Expected: User's localStorage preference ignored, trader not running
// Verify: Check getEffectiveEnabled returns false

// Case 2: localStorage quota exceeded
// Expected: Graceful fallback to in-memory storage
// Verify: Toggle still works, console warning logged

// Case 3: localStorage unavailable
// Expected: Use in-memory fallback
// Verify: Preferences work within session

// Case 4: Corrupted localStorage
// Expected: Reset to empty object, log error
// Verify: App doesn't crash, user can set preferences
```

Test criteria:
- [ ] Admin gate overrides user preference
- [ ] Quota exceeded handled gracefully
- [ ] localStorage unavailable doesn't crash app
- [ ] Corrupted data resets cleanly

**Phase 5 Complete When:**
- Cross-tab sync working
- All edge cases handled
- No console errors in edge case scenarios

---

#### Phase 6: Testing & Polish (1 hour)
**Objective:** Comprehensive testing and final polish

##### Task 6.1: Manual Testing Checklist (30 min)
Test scenarios:
- [ ] **Anonymous user:**
  - [ ] Only sees traders with `default_enabled = true` running
  - [ ] Can toggle traders on/off
  - [ ] Preferences persist in localStorage
  - [ ] Preferences cleared when browser data cleared

- [ ] **Authenticated user:**
  - [ ] Sees traders based on `default_enabled` + localStorage prefs
  - [ ] Can toggle built-in traders (updates localStorage)
  - [ ] Can toggle custom traders (updates database)
  - [ ] Preferences persist across sessions
  - [ ] Preferences work on mobile

- [ ] **Admin user:**
  - [ ] Can set `default_enabled` checkbox when creating built-in trader
  - [ ] Can edit `default_enabled` on existing built-in traders
  - [ ] Checkbox hidden for custom traders
  - [ ] Changes reflected for new users immediately

- [ ] **Worker integration:**
  - [ ] Screener only runs traders with effective enabled = true
  - [ ] Toggle immediately affects next screener run
  - [ ] No performance degradation

- [ ] **Edge cases:**
  - [ ] Admin disables trader → user's localStorage ignored
  - [ ] Multiple tabs stay in sync
  - [ ] localStorage unavailable → in-memory fallback works
  - [ ] Quota exceeded → warning logged, no crash

##### Task 6.2: Performance Verification (15 min)
Actions:
- [ ] Profile toggle operation (should be <1ms)
- [ ] Check localStorage size (should be <5KB for 100 traders)
- [ ] Verify worker still filters efficiently
- [ ] Check for memory leaks (toggle 50 times, check heap)

Performance targets:
- [ ] Toggle operation: <1ms
- [ ] localStorage read: <1ms
- [ ] No memory leaks after 50 toggles
- [ ] Screener still runs in <100ms

##### Task 6.3: Final Polish (15 min)
Actions:
- [ ] Add console logging with timestamps
- [ ] Verify no `console.error` in normal operation
- [ ] Check UI polish (icons, colors, spacing)
- [ ] Update documentation comments
- [ ] Remove any debug code

**Phase 6 Complete When:**
- All test scenarios pass
- Performance meets targets
- UI polished and consistent
- No console errors

---

### Testing Strategy

#### Commands to Run After Each Phase
```bash
# Type checking
pnpm build

# Run tests (if any exist)
pnpm test

# Check for TypeScript errors
pnpm typecheck

# After Phase 6 - full build
pnpm build
```

#### Manual Testing Flow
1. **After Phase 1:** Verify migration ran, types compile
2. **After Phase 2:** Test preference store in browser console
3. **After Phase 3:** Test toggle in UI, check localStorage
4. **After Phase 4:** Test admin UI, verify database updates
5. **After Phase 5:** Test cross-tab sync, edge cases
6. **After Phase 6:** Full regression test

### Rollback Plan
If critical issues arise:
```bash
# Stash changes
git stash

# Revert to main
git checkout main

# If migration was run
supabase db reset  # Only in dev/staging!

# Document issue
echo "Blocker: [description]" >> issues/2025-10-07-builtin-trader-run-control.md
```

For production rollback:
1. Revert migration 018 (remove `default_enabled` column)
2. Deploy previous version of code
3. Clear localStorage keys: `trader_prefs_*`

### PM Checkpoints

- [ ] **After Phase 2:** Preference store working - PM review localStorage format
- [ ] **After Phase 3:** Toggle working end-to-end - PM test in dev environment
- [ ] **After Phase 4:** Admin UI complete - PM review default_enabled controls
- [ ] **Before Phase 6:** Feature complete - PM final acceptance test

### Success Metrics

Implementation is complete when:
- [ ] All phases 1-6 completed
- [ ] TypeScript compiles (0 errors)
- [ ] Manual tests pass (anonymous, authenticated, admin)
- [ ] Performance targets met (<1ms toggle, <5KB storage)
- [ ] Cross-tab sync works
- [ ] Edge cases handled gracefully
- [ ] No console errors in normal operation
- [ ] PM approved for release

### Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Migration breaks existing data | Test in dev first, use IF NOT EXISTS | ⏳ Pending |
| 2 | localStorage unavailable | In-memory fallback implemented | ⏳ Pending |
| 3 | Worker doesn't respect effective enabled | Filter in TraderList before passing to worker | ⏳ Pending |
| 4 | Admin UI cluttered | Only show for built-in traders, clear labels | ⏳ Pending |
| 5 | Cross-tab sync conflicts | Use storage event, single source of truth | ⏳ Pending |
| 6 | Scope creep | Defer nice-to-haves to future iteration | ⏳ Pending |

### Time Estimates
- **Phase 1:** 30 minutes (Database + Types)
- **Phase 2:** 1 hour (Preference Store + Tests)
- **Phase 3:** 1 hour (TraderManager Integration)
- **Phase 4:** 45 minutes (Admin UI)
- **Phase 5:** 30 minutes (Cross-tab Sync + Edge Cases)
- **Phase 6:** 1 hour (Testing & Polish)
- **Total:** ~4.75 hours (matches engineering estimate of 4-6 hours)

### Next Actions

1. ✅ Create feature branch: `git checkout -b feature/builtin-trader-run-control`
2. ✅ Start Phase 1, Task 1.1: Create migration file
3. ✅ Run migration: `supabase db push`
4. Continue with Task 1.2: Update TypeScript interfaces

**Ready to begin implementation!**

---
*[End of plan. Next: /implement issues/2025-10-07-builtin-trader-run-control.md]*
