# Migrate Existing Pro/Elite Users to Dedicated Apps

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-14 07:02:15

## Context

After implementing the new dedicated Fly app architecture, need to migrate existing Pro/Elite users from the shared backend to their own dedicated apps.

## Linked Items

- Part of: `context/issues/open/20251114-070215-547-PROJECT-dedicated-fly-app-per-user.md`

## Progress

Spec phase.

## Spec

### Migration Strategy

**Phased Rollout:**
1. Deploy all infrastructure (database, edge functions, Go backend changes)
2. Test with 1-2 pilot Pro users
3. Migrate remaining Pro users in batches
4. Monitor and stabilize
5. Enable for Elite tier (when available)

### Pre-Migration Checklist

- [ ] All database migrations applied
- [ ] Edge functions deployed (provision, deprovision, health check)
- [ ] Go backend updated with RUN_MODE support
- [ ] Latest Docker image deployed to Fly registry
- [ ] Admin UI deployed and tested
- [ ] Health check cron job scheduled
- [ ] Monitoring dashboards configured

### Migration Script

**File:** `scripts/migrate-existing-users-to-fly-apps.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function migrateUser(userId: string, tier: string) {
  console.log(`Migrating user ${userId} (${tier})...`);

  // Call provision edge function
  const { data, error } = await supabase.functions.invoke(
    'provision-user-fly-app',
    {
      body: { user_id: userId, tier },
    }
  );

  if (error) {
    console.error(`Failed to migrate ${userId}:`, error);
    return { success: false, error };
  }

  console.log(`✓ Migrated ${userId} to app: ${data.app_name}`);
  return { success: true, appName: data.app_name };
}

async function main() {
  // Get all Pro/Elite users
  const { data: users, error } = await supabase
    .from('user_subscriptions')
    .select('user_id, tier, user_profiles(email)')
    .in('tier', ['pro', 'elite'])
    .eq('status', 'active');

  if (error) {
    console.error('Failed to fetch users:', error);
    return;
  }

  console.log(`Found ${users.length} Pro/Elite users to migrate`);

  const results = {
    success: 0,
    failed: 0,
    errors: [] as any[],
  };

  // Migrate in batches of 5 (avoid rate limits)
  const batchSize = 5;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    console.log(`\nMigrating batch ${i / batchSize + 1}...`);

    await Promise.all(
      batch.map(async (user) => {
        const result = await migrateUser(user.user_id, user.tier);

        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push({
            user_id: user.user_id,
            email: user.user_profiles?.email,
            error: result.error,
          });
        }
      })
    );

    // Wait 10 seconds between batches
    if (i + batchSize < users.length) {
      console.log('Waiting 10 seconds before next batch...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`Success: ${results.success}`);
  console.log(`Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\nFailed migrations:');
    results.errors.forEach((err) => {
      console.log(`- ${err.email} (${err.user_id}): ${err.error.message}`);
    });
  }
}

main().catch(console.error);
```

### Run Migration

```bash
# Install dependencies
pnpm install @supabase/supabase-js

# Set environment variables
export SUPABASE_URL=https://jtpqkbybuxbcvqeffmtf.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Run migration
npx tsx scripts/migrate-existing-users-to-fly-apps.ts
```

### Pilot Testing

Before full migration, test with pilot users:

```sql
-- Select 2 Pro users for pilot
SELECT user_id, email FROM user_profiles
WHERE id IN (
  SELECT user_id FROM user_subscriptions WHERE tier = 'pro' LIMIT 2
);

-- Manually provision their apps
-- Monitor for 24-48 hours
-- Verify traders execute correctly
-- Check cost estimates
```

### Rollback Plan

If migration fails:

1. **Stop provisioning new apps**
   ```sql
   -- Disable trigger temporarily
   ALTER TABLE user_subscriptions DISABLE TRIGGER on_user_tier_change;
   ```

2. **Revert Go backend to shared mode**
   ```bash
   flyctl deploy --app vyx-app --env RUN_MODE=shared_backend
   ```

3. **Deprovision failed apps**
   ```bash
   npx tsx scripts/rollback-migration.ts
   ```

4. **Investigate and fix issues**

5. **Re-enable when ready**

### Post-Migration Verification

**Check 1: All Pro/Elite users have apps**
```sql
SELECT
  u.tier,
  COUNT(*) as user_count,
  COUNT(f.id) as app_count
FROM user_subscriptions u
LEFT JOIN user_fly_apps f ON u.user_id = f.user_id AND f.deleted_at IS NULL
WHERE u.tier IN ('pro', 'elite')
  AND u.status = 'active'
GROUP BY u.tier;

-- Expected: user_count = app_count for each tier
```

**Check 2: All apps are healthy**
```sql
SELECT status, health_status, COUNT(*)
FROM user_fly_apps
WHERE deleted_at IS NULL
GROUP BY status, health_status;

-- Expected: Most apps in 'active' status with 'healthy' health
```

**Check 3: Signals are being generated**
```sql
SELECT
  f.fly_app_name,
  COUNT(s.id) as signal_count,
  MAX(s.created_at) as last_signal
FROM user_fly_apps f
LEFT JOIN trader_signals s ON s.user_id = f.user_id
WHERE f.deleted_at IS NULL
  AND s.created_at > NOW() - INTERVAL '1 hour'
GROUP BY f.fly_app_name
ORDER BY signal_count DESC;

-- Expected: Active users should have recent signals
```

### Monitoring After Migration

Watch for:
- Failed health checks
- Provisioning errors
- Cost spikes
- User complaints about missing traders
- Signal generation rates

Set up alerts:
```sql
-- Alert if >10% of apps are unhealthy
SELECT
  COUNT(*) FILTER (WHERE health_status = 'unhealthy') * 100.0 / COUNT(*) as unhealthy_pct
FROM user_fly_apps
WHERE deleted_at IS NULL
  AND status = 'active';
```

### User Communication

Email Pro/Elite users after successful migration:

**Subject:** Your trading just got faster - Dedicated infrastructure live!

**Body:**
```
Hi [Name],

Great news! We've just upgraded your account to run on dedicated infrastructure.

What this means for you:
✓ Faster execution - No more sharing resources
✓ Better reliability - Independent from other users
✓ More control - Dedicated environment for your traders

You don't need to do anything - all your traders have been migrated automatically and are already running on your dedicated app.

If you notice any issues, please let us know immediately.

Happy trading!
The VYX Team
```
