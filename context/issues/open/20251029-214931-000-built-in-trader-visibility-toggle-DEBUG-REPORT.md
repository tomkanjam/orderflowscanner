# Debug Report: Built-in Trader Signals Not Visible to Anonymous Users

**Issue**: Non-logged-in users don't see signals for the built-in "Three Red Candles Short" trader, but the trader creator can see them.

**Investigation Date**: 2025-10-29
**Debugged By**: Claude Code
**Status**: Root cause identified ✓

---

## Root Cause Analysis

### Problem #1: Missing RLS Policy for Anonymous Users

**Current State:**
The `signals` table has only ONE RLS policy:

```sql
Policy: "Users can view own signals"
  - Applies to: {authenticated} users only
  - Condition: auth.uid() = user_id
  - Command: SELECT
```

**Impact:**
- Anonymous users cannot view ANY signals (no RLS policy exists for them)
- Authenticated users can only view signals where `user_id` matches their own

**Expected State:**
The signals table should have RLS policies that allow:
1. Anonymous users to view signals from built-in traders with `access_tier = 'anonymous'`
2. Authenticated users to view signals from built-in traders based on subscription tier
3. All users to view signals from their own custom traders

---

### Problem #2: Data Inconsistency - Built-in Trader Has Non-NULL user_id

**Trader Configuration:**

```json
{
  "id": "4b0b340d-a940-46ce-b0e5-d83ce404f350",
  "name": "Three Red Candles Short",
  "enabled": true,
  "is_built_in": true,
  "user_id": "63eea370-27a1-4099-866a-e3ed340b278d",  // ❌ SHOULD BE NULL
  "ownership_type": "system",
  "access_tier": "anonymous",
  "default_enabled": false
}
```

**Signal Data:**
- Total signals: 48,729
- All signals have `user_id = "63eea370-27a1-4099-866a-e3ed340b278d"`

**Expected State (from seed file):**
```sql
INSERT INTO traders (
  ...,
  user_id,         -- Should be NULL for built-in
  ownership_type,  -- 'system'
  access_tier,     -- 'anonymous'
  is_built_in      -- true
) VALUES (
  ...,
  null,           -- ✓ Correct
  'system',
  'anonymous',
  true
);
```

**Why This Matters:**
Even if we add proper RLS policies, the current RLS policy `auth.uid() = user_id` means:
- Only user `63eea370-27a1-4099-866a-e3ed340b278d` can see these signals
- Anonymous users still blocked (no policy for anonymous)
- Other authenticated users blocked (different user_id)

---

## Verification Steps

### Test 1: Database Query (Service Role)
```sql
SELECT COUNT(*) as visible_signal_count
FROM signals s
JOIN traders t ON t.id = s.trader_id
WHERE t.is_built_in = true
  AND t.access_tier = 'anonymous'
  AND t.enabled = true;
```
**Result**: 48,759 signals (service role bypasses RLS)

### Test 2: Anonymous User Perspective
With current RLS policies, anonymous users see: **0 signals** ❌

### Test 3: Trader Creator Perspective
User `63eea370-27a1-4099-866a-e3ed340b278d` sees: **48,729 signals** ✓
(Because `auth.uid() = user_id` condition is satisfied)

### Test 4: Other Authenticated Users
Any other logged-in user sees: **0 signals** ❌
(Because their `auth.uid()` doesn't match the signal's `user_id`)

---

## Impact Assessment

**Current Behavior:**
1. ❌ Anonymous users cannot see ANY built-in trader signals
2. ❌ Tier-based access control is not enforced at the signals level
3. ✓ Only the original trader creator can see signals (unintended behavior)
4. ❌ Built-in traders are not truly "system-owned" (have user_id)

**Expected Behavior:**
1. ✓ Anonymous users should see signals from traders with `access_tier = 'anonymous'`
2. ✓ Free tier users should see signals from `access_tier IN ('anonymous', 'free')`
3. ✓ Pro tier users should see signals from `access_tier IN ('anonymous', 'free', 'pro')`
4. ✓ Elite tier users should see all signals
5. ✓ All users should see signals from their own custom traders

---

## Resolution Path

### Fix #1: Add Missing RLS Policies to signals Table

Required policies:
1. **Anonymous access to anonymous-tier signals**
2. **Tier-based access for authenticated users**
3. **Own signals access (already exists but needs refinement)**

### Fix #2: Fix Data Inconsistency

For "Three Red Candles Short" trader and its signals:
1. Set `traders.user_id = NULL` for built-in traders
2. Set `signals.user_id = NULL` for signals from built-in traders

OR keep user_id and update RLS policies to check trader ownership rather than signal ownership.

---

## Related Files

- **Signals Table**: Created before migration 013 (no creation migration found)
- **RLS Policy**: `supabase/migrations/003_server_side_execution.sql` (only for `trader_signals`, not `signals`)
- **Seed File**: `supabase/seed_built_in_signals.sql:37` (shows user_id should be NULL)
- **Schema Docs**: `supabase/migrations/004_create_subscription_system.sql` (defines built-in trader fields)

---

## Next Steps

**DO NOT IMPLEMENT - WAITING FOR USER DIRECTION**

The user should decide:
1. Which RLS policy approach to use:
   - Option A: Set user_id=NULL for built-in, check trader.is_built_in in RLS
   - Option B: Keep user_id, check trader.user_id in RLS instead of signal.user_id
2. Whether to migrate existing data or just fix the RLS policies
3. Whether signals from built-in traders should have user_id=NULL or inherit trader's user_id

---

## Evidence

### Trader State
```sql
SELECT id, name, enabled, is_built_in, user_id, ownership_type, access_tier
FROM traders
WHERE name = 'Three Red Candles Short';
```
Result: user_id='63eea370-27a1-4099-866a-e3ed340b278d' (should be NULL)

### Signal State
```sql
SELECT user_id, COUNT(*) as count
FROM signals
WHERE trader_id = '4b0b340d-a940-46ce-b0e5-d83ce404f350'
GROUP BY user_id;
```
Result: All 48,739 signals have same user_id

### Current RLS Policy
```sql
SELECT policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'signals';
```
Result: Only 1 policy - "Users can view own signals" for authenticated, `auth.uid() = user_id`

---

**Conclusion**: Two separate issues causing the problem:
1. Missing RLS policies for anonymous/tier-based access
2. Data inconsistency where built-in trader has non-NULL user_id
