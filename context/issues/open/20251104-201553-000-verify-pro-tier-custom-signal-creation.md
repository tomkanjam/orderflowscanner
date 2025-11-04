# Verify Pro Tier Custom Signal Creation Works End-to-End

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 20:15:53

## Context
The CLAUDE.md spec states that Pro tier users should be able to create up to 10 custom signals. After comprehensive code analysis, I've confirmed that:

1. **Backend is fully implemented** with multi-layer enforcement:
   - Database RLS policies enforce Pro tier quota (10 traders max)
   - Trigger auto-increments `user_subscriptions.custom_signals_count`
   - Migration 031 auto-disables excess traders on downgrade

2. **Frontend has all necessary checks**:
   - `SubscriptionContext.canCreateSignal()` validates quota
   - `tierAccess.canEnableTrader()` enforces execution limits
   - TraderForm blocks creation with upgrade prompt

3. **Tier limits properly configured**:
   - Anonymous: 0 custom signals
   - Free: 0 custom signals (NO custom signals)
   - Pro: 10 custom signals ✅
   - Elite: Unlimited custom signals

However, we need to **verify this works end-to-end** in the running app with real Pro tier users.

## Linked Items
- Part of: End-to-end trader workflow implementation initiative
- Related: `context/issues/closed/20251030-122001-000-free-tier-custom-trader-bypass.md` (previous tier enforcement fix)

## Progress
Issue created - ready to spec and test

## Spec

### Current Implementation Review

**Key Files:**
1. `apps/app/src/contexts/SubscriptionContext.tsx:179-183` - `canCreateSignal()` check
2. `apps/app/src/utils/tierAccess.ts:95-148` - `canEnableTrader()` quota enforcement
3. `apps/app/src/components/TraderForm.tsx:29` - Frontend tier check
4. `supabase/migrations/004_create_subscription_system.sql:140-166` - RLS policy
5. `supabase/migrations/031_enforce_tier_quota_on_downgrade.sql` - Downgrade enforcement

**Enforcement Layers:**
- Layer 1: Frontend `canCreateSignal()` - prevents form submission
- Layer 2: Database RLS - blocks INSERT if quota exceeded
- Layer 3: Database trigger - auto-increments counter
- Layer 4: Downgrade trigger - auto-disables excess traders
- Layer 5: `canEnableTrader()` - validates before enable/disable

### Testing Plan

**Test 1: Pro User Creates Custom Signal**
1. Set test user to Pro tier in database
2. Verify `custom_signals_count = 0`
3. Create 1st custom signal via TraderForm
4. Confirm signal created successfully
5. Verify `custom_signals_count = 1`

**Test 2: Pro User Hits Quota Limit**
1. Create signals until count = 10
2. Attempt to create 11th signal
3. Verify frontend shows "Upgrade to Elite" message
4. Verify database rejects INSERT

**Test 3: Pro User Deletes Signal**
1. Delete 1 of 10 signals
2. Verify `custom_signals_count = 9`
3. Confirm can now create 1 more

**Test 4: Downgrade from Pro to Free**
1. User has 10 custom traders enabled
2. Downgrade user to Free tier
3. Verify all 10 traders auto-disabled
4. Verify user cannot enable any

**Test 5: Anonymous & Free Users Blocked**
1. Anonymous user sees TraderForm
2. Clicking "Create" shows auth modal
3. Free user sees "Upgrade to Pro" message

### Implementation Steps

1. **Database Setup**
   ```sql
   -- Create test user if needed
   -- Set tier to 'pro'
   UPDATE user_subscriptions
   SET tier = 'pro', custom_signals_count = 0
   WHERE user_id = 'test-user-id';
   ```

2. **Frontend Testing**
   - Open app in browser
   - Sign in as Pro user
   - Navigate to "Create Signal" page
   - Fill out TraderForm with AI prompt
   - Submit and verify success
   - Check database for updated count

3. **Chrome DevTools Testing**
   - Use chrome MCP tool to interact with UI
   - Automate signal creation flow
   - Verify error messages
   - Check network requests

4. **Database Verification**
   ```sql
   -- Check user's subscription and quota
   SELECT tier, custom_signals_count FROM user_subscriptions
   WHERE user_id = 'test-user-id';

   -- Check created traders
   SELECT id, name, user_id, enabled FROM traders
   WHERE user_id = 'test-user-id';
   ```

### Expected Outcomes

✅ Pro users can create up to 10 custom signals
✅ 11th signal blocked with upgrade prompt
✅ Quota counter accurate after create/delete
✅ Free/Anonymous users blocked from creation
✅ Downgrade auto-disables excess traders
✅ RLS policy enforces quota server-side

### Files to Verify (no changes needed)

All code is already implemented. Just need to verify:
- `apps/app/src/contexts/SubscriptionContext.tsx`
- `apps/app/src/components/TraderForm.tsx`
- `apps/app/src/utils/tierAccess.ts`
- `supabase/migrations/004_create_subscription_system.sql`
- `supabase/migrations/031_enforce_tier_quota_on_downgrade.sql`
