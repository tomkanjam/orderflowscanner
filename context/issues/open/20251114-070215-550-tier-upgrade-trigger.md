# Auto-Provision on Tier Upgrade Trigger

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-14 07:02:15

## Context

Automatically trigger Fly app provisioning when user is upgraded from Free to Pro/Elite tier. Handle both database triggers and edge function orchestration.

## Linked Items

- Part of: `context/issues/open/20251114-070215-547-PROJECT-dedicated-fly-app-per-user.md`

## Progress

Spec phase.

## Spec

### Database Trigger (Already included in issue 548)

The trigger function `handle_user_tier_change()` was already specified in the database schema issue. It will:
1. Detect tier changes on `user_subscriptions` table
2. Call `provision-user-fly-app` edge function for Pro/Elite upgrades
3. Call `deprovision-user-fly-app` edge function for downgrades

### Test Scenarios

**Manual Testing:**
```sql
-- Test 1: Upgrade Free → Pro
UPDATE user_subscriptions
SET tier = 'pro'
WHERE user_id = '<test-user-id>';

-- Verify: Check user_fly_apps table
SELECT * FROM user_fly_apps WHERE user_id = '<test-user-id>';

-- Verify: Check events
SELECT * FROM user_fly_app_events WHERE user_id = '<test-user-id>' ORDER BY created_at DESC;

-- Test 2: Downgrade Pro → Free
UPDATE user_subscriptions
SET tier = 'free'
WHERE user_id = '<test-user-id>';

-- Verify: App should be deleted
SELECT * FROM user_fly_apps WHERE user_id = '<test-user-id>';
```

### Error Handling

If provisioning fails, the trigger should:
1. Log error to `user_fly_app_events` table
2. Set `user_fly_apps.status = 'error'`
3. Increment `retry_count`
4. Send notification to admins (future enhancement)

### Idempotency

The edge functions must be idempotent:
- Multiple calls to provision should not create duplicate apps
- Deprovisioning a non-existent app should succeed gracefully

### Admin Override

Admins can manually trigger provisioning via edge function call:
```bash
curl -X POST https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/provision-user-fly-app \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "<user-id>", "tier": "pro"}'
```

### Monitoring

Set up alert for failed provisions:
- Query `user_fly_app_events` for `provision_failed` events
- Email admin if retry_count > 3
- Dashboard to show pending/failed provisions
