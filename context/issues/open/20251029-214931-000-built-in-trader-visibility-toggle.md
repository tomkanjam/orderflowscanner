# Built-in Trader Visibility Toggle for Non-Admin Users

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-29 21:49:31

## Context

Built-in traders can be enabled by admins for all users based on tier access. When an admin enables a built-in trader, non-admin users should not be able to actually disable the trader system-wide. Instead, when a non-admin user "disables" a built-in trader, the app should simply hide signals from that trader for that specific user only.

This ensures:
1. Admin control over which built-in traders are active in the system
2. User autonomy to customize their signal feed without affecting other users
3. Clear separation between system-level trader management and user preferences

## Linked Items

- Part of: End-to-end trader workflow implementation initiative
- Related: Built-in trader seeding, tier-based access control

## Progress

Investigation phase - verifying current implementation

## Spec

### Current Implementation Analysis

From `traderManager.ts:497-511`, the `getEffectiveEnabled()` method already implements the correct logic:

```typescript
getEffectiveEnabled(trader: Trader, userId?: string): boolean {
  if (!trader.enabled) return false;  // Admin gate - if disabled by admin, hidden for everyone
  if (!trader.isBuiltIn) return trader.enabled;  // Custom traders use DB field directly

  // Built-in traders: check user preference (localStorage), fallback to default_enabled
  const userPref = traderPreferences.getTraderEnabled(trader.id, userId);
  return userPref ?? trader.default_enabled ?? false;
}
```

**Three-tier logic:**
1. **Admin gate**: If `trader.enabled=false` in database, return false for everyone
2. **Custom traders**: Use database `enabled` field directly
3. **Built-in traders**: Check user's localStorage preference; if null, use `default_enabled`

**User preferences stored in:** `localStorage` with key `trader_prefs_${userId || 'anon'}`

### Tasks

**Phase 1: Verification** (Quick testing to confirm current behavior)
1. Test that admin-enabled built-in traders appear for users
2. Test that user "disable" action only sets localStorage preference
3. Verify signals are filtered based on effective enabled state
4. Confirm database `enabled` field is not modified by non-admin users

**Phase 2: UX Enhancement** (If needed based on testing)
1. Update UI to clearly indicate built-in vs custom traders
2. Show different toggle behavior/label for built-in traders ("Hide" vs "Disable")
3. Add tooltip explaining that built-in traders can only be hidden, not disabled
4. Ensure signal filtering respects user visibility preferences

**Phase 3: Documentation**
1. Document the visibility model in architecture docs
2. Add inline comments for the three-tier logic
3. Update any user-facing help text

### Implementation Notes

- No database schema changes needed - current structure supports this
- No changes to `traderPreferences.ts` needed - already handles user prefs correctly
- Main work is in UI clarity and testing
- Signal fetching already respects `getEffectiveEnabled()` through trader filtering

### Acceptance Criteria

- [ ] Admin can enable/disable built-in traders via database `enabled` field
- [ ] When admin enables built-in trader, it appears for users (respecting tier access)
- [ ] Non-admin user "disable" action stores preference in localStorage only
- [ ] Database `enabled` field is never modified by non-admin user actions
- [ ] User sees only signals from traders where `getEffectiveEnabled()` returns true
- [ ] UI clearly distinguishes between hiding (user pref) and disabling (admin action)
- [ ] Cross-tab synchronization works via StorageEvent
- [ ] Anonymous users can hide built-in traders (stored with 'anon' key)
