# Free Tier Users Can Run Custom Traders (Tier Access Bypass)

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-30 12:20:01

## Context

Users on the Free tier can enable and run their own custom traders, generating signals in real-time, despite tier access rules explicitly stating that Free tier users **cannot create or run custom traders**. This is a tier access bypass bug that undermines the subscription-based access control system.

**Confirmed Case:**
- User: tom@tomk.ca
- Tier: Free (active)
- Custom Trader: "Three Green Candles 1m" (enabled: true)
- Evidence: 10 signals generated in last 2 hours (latest: 2025-10-30 11:16:01 UTC)

**Expected Tier Access Rules:**
```
- Anonymous: View basic signals, charts, real-time triggers only
- Free: + More signals, history, favorites (NO custom signals)
- Pro: + Create up to 10 custom signals, notifications
- Elite: + Unlimited signals, AI analysis/monitoring/trading
```

Free tier should have **0 trader execution capacity**, matching the backend quota system.

## Linked Items

- Part of: End-to-end trader workflow implementation initiative
- Related: `20251030-074721-000-fix-built-in-signals-rls-and-ownership.md` (RLS policies)
- Related: `2025-10-08-backend-enforce-tier-access-execution.md` (previous tier enforcement)

## Progress

🔍 **Root cause identified** - Ownership exception in frontend filter bypasses tier restrictions

## Spec

### Root Cause Analysis

**The Bug:**
The `filterTradersByTierAccess()` function in `apps/app/src/utils/tierAccess.ts` (lines 52-56) contains an ownership exception that allows users to **always** access their own custom traders, regardless of subscription tier:

```typescript
// Rule 1: Users can always access their own custom signals
// Custom signals are identified by having a userId
if (trader.userId && trader.userId === userId) {
  return true;  // ❌ BYPASSES ALL TIER RESTRICTIONS
}
```

This design decision **conflicts** with the tier system where Free users should have 0 trader capacity.

**How It Bypasses Tier Restrictions:**

1. **Frontend Filter (App.tsx:397-401, 431-435):**
   - Calls `filterTradersByTierAccess(traders, currentTier, userId)`
   - Ownership exception triggers before tier check
   - Free tier users see and can enable their custom traders

2. **Trader Enabling (traderManager.ts:258-264):**
   - `enableTrader()` / `disableTrader()` have **no tier validation**
   - Directly updates `enabled: true` in database
   - No checks against subscription tier or quota limits

3. **Backend Quota System (backend/go-screener/internal/trader/quotas.go:33-38):**
   - Correctly sets Free tier limit to `0`
   - But frontend filter runs first and hides traders from quota enforcement
   - Backend never gets the chance to reject Free tier execution

**The Design Conflict:**

The October 8th implementation (`2025-10-08-backend-enforce-tier-access-execution.md`) intentionally added this rule:
```typescript
// Custom signals: creator always has access
if (!trader.isBuiltIn && userId && trader.userId === userId) {
  return true;
}
```

This was a **visibility** decision (users should see their own traders), but it inadvertently became an **execution** bypass (users can run their own traders).

### Evidence

**Database Verification:**
```sql
-- User tier confirmation
SELECT u.email, us.tier, us.status
FROM auth.users u
LEFT JOIN user_subscriptions us ON u.id = us.user_id
WHERE u.email = 'tom@tomk.ca';
-- Result: {"email":"tom@tomk.ca","tier":"free","status":"active"}

-- Custom traders owned by Free tier user
SELECT t.id, t.name, t.enabled, t.access_tier, t.is_built_in
FROM traders t
JOIN auth.users u ON t.user_id = u.id
WHERE u.email = 'tom@tomk.ca' AND t.is_built_in = false;
-- Results:
--   "1m Mean Reversion" (enabled: false)
--   "Three Green Candles 1m" (enabled: true) ❌ SHOULD BE BLOCKED

-- Recent signals from custom trader
SELECT s.id, s.symbol, s.created_at
FROM signals s
WHERE s.trader_id = '2d21a873-e30d-41f2-aeee-f22d0081c0de'
ORDER BY s.created_at DESC LIMIT 10;
-- Latest: 2025-10-30 11:16:01 (KDAUSDT) ❌ SHOULD NOT EXIST
```

**Backend Quota Settings (quotas.go:33-38):**
```go
tierLimits: map[types.SubscriptionTier]int64{
    types.TierAnonymous: 0,  // Cannot start traders
    types.TierFree:      0,  // Cannot start traders ✓ CORRECT
    types.TierPro:       10, // Max 10 concurrent traders
    types.TierElite:     0,  // Unlimited (checked separately)
}
```

### Enforcement Points

**Current Enforcement Landscape:**

1. **Frontend Filter (tierAccess.ts):**
   - ❌ Has ownership bypass exception
   - Location: `apps/app/src/utils/tierAccess.ts:52-56`
   - Used in: `App.tsx:397, 431`

2. **Trader Enable/Disable (traderManager.ts):**
   - ❌ No tier validation
   - Location: `apps/app/src/services/traderManager.ts:258-264`
   - Functions: `enableTrader()`, `disableTrader()`

3. **Server Execution Service (serverExecutionService.ts):**
   - ❌ No tier validation
   - Location: `apps/app/src/services/serverExecutionService.ts:316-318`
   - Function: `toggleTraderEnabled()`

4. **Backend Quota System (Go screener):**
   - ✓ Correct tier limits defined
   - ❌ Never invoked (frontend bypass prevents backend from running)
   - Location: `backend/go-screener/internal/trader/quotas.go`

5. **Database RLS Policies:**
   - ⚠️ Signals table has tier-based access for SELECT
   - ❌ No policies preventing trader creation/enabling for low tiers
   - Recent fix: `029_fix_signals_rls_policies.sql`

### Impact Assessment

**Severity: CRITICAL** - Tier-based access control is completely bypassed for custom traders, including downgrade scenario.

**Affected Users:**
- All Free tier users with existing custom traders
- Anonymous users who create custom traders (if they could auth)
- **Users who downgrade from Pro/Elite → Free with running traders**

**Business Impact:**
- Free tier users get Pro/Elite features for free
- Subscription revenue loss (users don't upgrade if they can bypass restrictions)
- **Subscription abuse: Users can subscribe, create traders, then downgrade while keeping them running**
- Unfair to paying Pro/Elite users
- System design credibility undermined

**Technical Impact:**
- Frontend-backend enforcement inconsistency
- Backend quota system never exercised for Free tier
- Potential database load from unrestricted custom traders
- Difficult to audit who's actually using which tier features
- **No enforcement of quota limits on already-running traders**

### Implementation Options

**Option 1: Remove Ownership Exception (Breaking Change)**
- Remove lines 52-56 from `tierAccess.ts`
- Pro: Clean, enforces tier rules strictly
- Con: Free tier users lose visibility of their custom traders (UX regression)
- Con: Breaking change for existing users

**Option 2: Split Visibility and Execution Logic (Recommended)**
- Keep ownership exception for **visibility** (users can see their traders)
- Add separate **execution** check for `enabled` state
- Prevent enabling traders that exceed tier quota
- Pro: Users can see their traders but can't run them (clear upgrade prompt)
- Pro: Non-breaking, better UX
- Con: More complex logic

**Option 3: Add Tier Validation to Enable/Disable Functions**
- Add tier checks in `traderManager.enableTrader()`
- Add tier checks in `serverExecutionService.toggleTraderEnabled()`
- Pro: Defense-in-depth
- Con: Requires passing tier info to these functions
- Con: Doesn't fix the frontend filter bypass

**Option 4: Database RLS Policy Enforcement**
- Add RLS policy: `UPDATE traders SET enabled = true` checks tier quota
- Pro: Backend enforcement, can't be bypassed
- Con: Requires complex RLS policy with user_subscriptions join
- Con: Poor UX (frontend button succeeds, but database silently fails)

**Option 5: Database Trigger on Subscription Downgrade (Backend Enforcement)**
- Extend `on_subscription_change` trigger to auto-disable excess traders
- When `max_traders` decreases, automatically set `enabled = false` on excess traders
- Pro: Can't be bypassed, runs at database level
- Pro: Works even if frontend/backend are down
- Con: Need to decide which traders to disable (oldest? newest? least used?)

**Recommended Approach: Combination of Options 2 + 3 + 5**
1. **Frontend validation** - Split `filterTradersByTierAccess()` into two functions:
   - `filterTradersByVisibility()` - includes ownership exception
   - `canExecuteTrader()` - strict tier check without ownership exception
2. **Frontend enforcement** - Add tier validation in `enableTrader()` / `disableTrader()`
3. **UI clarity** - Show disabled traders with "Upgrade to Pro" prompt
4. **Backend validation** - Go screener quota check before execution
5. **Database trigger enforcement** - Auto-disable traders on subscription downgrade

### Testing Plan

**Verification Steps:**
1. Create Free tier test account
2. Create custom trader as Elite, downgrade to Free
3. Attempt to enable custom trader
4. Verify frontend prevents enabling with upgrade prompt
5. Verify backend rejects execution if frontend bypassed
6. Verify Pro tier can enable up to 10 traders
7. Verify Elite tier can enable unlimited traders

**Edge Cases:**
- **User downgrades from Pro → Free with 5 traders running** ⚠️ CRITICAL
  - Expected: All 5 traders auto-disabled immediately
  - Database trigger should fire on tier update
  - User receives notification about disabled traders
- **User enables trader, then subscription expires**
  - Expected: Trader auto-disabled when status changes to 'past_due'
  - Backend stops execution within 1 minute
- **User downgrades from Elite → Pro with 50 traders running**
  - Expected: 40 oldest/least-used traders disabled, keep 10 newest
  - User can manually choose which 10 to keep (grace period?)
- Anonymous user attempts to enable trader
- Elite user enables 100+ traders (stress test)

### Migration Considerations

**Existing Free Tier Users with Running Traders:**
- Need data migration to disable these traders
- Need communication: "Your custom traders require Pro subscription"
- Consider grace period before force-disabling

**SQL to Find Affected Users:**
```sql
SELECT
  u.email,
  us.tier,
  COUNT(t.id) as custom_traders,
  COUNT(CASE WHEN t.enabled THEN 1 END) as enabled_traders
FROM auth.users u
LEFT JOIN user_subscriptions us ON u.id = us.user_id
JOIN traders t ON t.user_id = u.id
WHERE t.is_built_in = false
  AND us.tier IN ('anonymous', 'free')
GROUP BY u.email, us.tier
HAVING COUNT(CASE WHEN t.enabled THEN 1 END) > 0;
```

---

## Acceptance Criteria

**Bug Fix:**
- [ ] Free tier users cannot enable custom traders
- [ ] Free tier users can still **view** their custom traders (with upgrade CTA)
- [ ] Pro tier users can enable up to 10 custom traders
- [ ] Elite tier users can enable unlimited custom traders
- [ ] Existing running traders for Free tier users are disabled

**Enforcement Layers:**
- [ ] Frontend: `enableTrader()` validates tier before updating database
- [ ] Frontend: UI shows "Upgrade to Pro" for Free tier custom traders
- [ ] Backend: Go quota system enforces tier limits during execution
- [ ] Database: RLS policies prevent unauthorized trader enabling (optional)

**User Experience:**
- [ ] Clear error message when Free tier tries to enable trader
- [ ] Upgrade CTA shown on custom trader cards for Free tier
- [ ] No breaking changes for existing Pro/Elite users
- [ ] Graceful handling of downgrades (disable excess traders)

**Testing:**
- [ ] Unit tests for tier validation logic
- [ ] Integration tests for enable/disable with different tiers
- [ ] Manual testing: Free tier cannot bypass restrictions
- [ ] Manual testing: Pro tier can run 10 traders
- [ ] Manual testing: Elite tier unlimited

---

## Code Locations

**Frontend:**
- `apps/app/src/utils/tierAccess.ts:52-56` - Ownership bypass exception
- `apps/app/App.tsx:397-401, 431-435` - Filter application
- `apps/app/src/services/traderManager.ts:258-264` - Enable/disable functions
- `apps/app/src/services/serverExecutionService.ts:316-318` - Toggle function

**Backend:**
- `backend/go-screener/internal/trader/quotas.go:33-38` - Tier limits
- `backend/go-screener/internal/trader/quotas.go:42-94` - Acquire quota logic

**Database:**
- `supabase/migrations/029_fix_signals_rls_policies.sql` - Recent RLS changes
- `traders` table - needs RLS policy for UPDATE enabled column

---

---

## Critical Downgrade Scenario Gap

### The Problem

**When a user downgrades (Pro → Free), their enabled traders keep running indefinitely.**

**Why It Happens:**

1. **Database trigger exists** (`migration 021:252-256`):
   ```sql
   CREATE TRIGGER on_subscription_change
   AFTER INSERT OR UPDATE OF tier ON user_subscriptions
   FOR EACH ROW
   EXECUTE FUNCTION initialize_resource_usage_for_user();
   ```

2. **Trigger updates quota limits** ✅:
   - Updates `trader_resource_usage.max_traders` from 10 → 0
   - Updates `trader_resource_usage.tier` from 'pro' → 'free'

3. **But doesn't disable running traders** ❌:
   - No code to set `traders.enabled = false` for excess traders
   - No notification to Go backend to stop running traders
   - No cleanup of `trader_state` table (state remains 'running')

4. **Backend quota check doesn't help** ❌:
   - `quotas.go:Acquire()` only checks when **starting new traders**
   - Already-running traders bypass the quota system entirely
   - No periodic job to reconcile running traders vs. current quota

**Attack Vector:**
```
1. User subscribes to Pro tier ($19/month)
2. User creates 10 custom traders and enables all of them
3. User immediately downgrades to Free tier
4. All 10 traders keep running (database shows max_traders: 0)
5. User gets Pro features while paying $0/month ⚠️
```

### Required Fix for Downgrade Scenario

**Extend the database trigger to auto-disable excess traders:**

```sql
-- Enhanced version of initialize_resource_usage_for_user()
CREATE OR REPLACE FUNCTION initialize_resource_usage_for_user()
RETURNS TRIGGER AS $$
DECLARE
  max_traders_limit INTEGER;
  current_enabled_count INTEGER;
  traders_to_disable INTEGER;
BEGIN
  -- Determine max traders based on tier
  max_traders_limit := CASE NEW.tier
    WHEN 'free' THEN 0
    WHEN 'pro' THEN 10
    WHEN 'elite' THEN 1000
  END;

  -- Count currently enabled traders
  SELECT COUNT(*) INTO current_enabled_count
  FROM traders
  WHERE user_id = NEW.user_id
    AND enabled = true
    AND ownership_type = 'user';

  -- If downgrade causes quota violation, auto-disable excess traders
  IF current_enabled_count > max_traders_limit THEN
    traders_to_disable := current_enabled_count - max_traders_limit;

    -- Disable oldest traders first (could also be newest, or least-used)
    UPDATE traders
    SET enabled = false,
        updated_at = NOW()
    WHERE id IN (
      SELECT id FROM traders
      WHERE user_id = NEW.user_id
        AND enabled = true
        AND ownership_type = 'user'
      ORDER BY created_at ASC  -- Disable oldest first
      LIMIT traders_to_disable
    );

    -- Log notification (or insert into notification_queue)
    INSERT INTO notification_queue (user_id, type, channel, payload)
    VALUES (
      NEW.user_id,
      'subscription_downgrade',
      'in_app',
      jsonb_build_object(
        'disabled_count', traders_to_disable,
        'new_tier', NEW.tier,
        'max_traders', max_traders_limit
      )
    );
  END IF;

  -- Update resource usage as before...
  INSERT INTO trader_resource_usage (...)
  VALUES (...)
  ON CONFLICT (user_id, period_start) DO UPDATE ...;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Alternative: Backend Reconciliation Job**

If database triggers feel too aggressive, add a periodic Go backend job:

```go
// Every 5 minutes, check for quota violations
func (m *Manager) reconcileQuotas() {
  users := m.getUsersWithRunningTraders()

  for _, user := range users {
    quota := m.getUserQuota(user.ID, user.Tier)
    runningCount := m.getRunningTraderCount(user.ID)

    if runningCount > quota {
      excess := runningCount - quota
      m.stopOldestTraders(user.ID, excess)
      m.notifyUser(user.ID, "quota_exceeded", excess)
    }
  }
}
```

---

## Next Steps

1. **Discuss with team:** Which implementation option to pursue?
2. **Decide downgrade strategy:** Auto-disable (trigger) vs. Periodic reconciliation (Go job)?
3. **Design UX:** How to show disabled custom traders to Free tier users?
4. **Plan migration:** Communication and grace period for affected users
5. **Estimate effort:** Frontend changes, backend validation, database triggers, testing
6. **Create sub-tasks:** Break down implementation into smaller issues
