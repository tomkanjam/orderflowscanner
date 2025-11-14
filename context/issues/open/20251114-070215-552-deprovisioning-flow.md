# App Deletion on Tier Downgrade

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-14 07:02:15

## Context

Gracefully deprovision user's Fly app when they downgrade from Pro/Elite to Free tier. Ensure data is preserved in Supabase even after app deletion.

## Linked Items

- Part of: `context/issues/open/20251114-070215-547-PROJECT-dedicated-fly-app-per-user.md`

## Progress

Spec phase.

## Spec

### Deprovisioning Flow

```
Tier Downgrade (Pro/Elite → Free)
    ↓
Database Trigger: handle_user_tier_change()
    ↓
Call deprovision-user-fly-app Edge Function
    ↓
Set status = 'deprovisioning' in user_fly_apps
    ↓
Stop all machines in Fly app
    ↓
Delete all machines
    ↓
Delete Fly app
    ↓
Set status = 'deleted' in user_fly_apps
    ↓
Mark deleted_at timestamp
    ↓
Log event: deprovision_completed
```

### Data Preservation

**What stays in Supabase:**
- `traders` table - User's custom traders (disabled but not deleted)
- `trader_signals` table - All historical signals
- `trader_execution_history` - Execution logs
- `user_fly_apps` - Soft-deleted record (deleted_at set, not physically deleted)
- `user_fly_app_events` - Full event history

**What gets deleted:**
- Fly app and all machines on Fly.io infrastructure
- In-memory state on Go backend (naturally lost when app shuts down)

### Trader Status on Downgrade

When user downgrades, existing quota enforcement (from migration 031) will:
1. Disable custom traders that exceed Free tier quota (0 custom traders)
2. Send notification to user
3. Keep trader definitions in database

### Graceful Shutdown

Before deleting Fly app, ensure:
1. All running traders complete current execution cycle
2. In-flight signals are saved to database
3. WebSocket connections are closed cleanly

**Implementation:** Add 30-second grace period before deletion:

```typescript
// In deprovision-user-fly-app edge function
async function gracefulShutdown(appName: string) {
  // Send shutdown signal to app
  await fetch(`https://${appName}.fly.dev/shutdown`, {
    method: 'POST',
    headers: { 'X-Shutdown-Token': SHUTDOWN_TOKEN },
  });

  // Wait 30 seconds for cleanup
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Now safe to delete
  await deleteFlyApp(appName);
}
```

**Go Backend:** Add shutdown endpoint:

```go
// File: backend/go-screener/internal/server/handlers.go
func (s *Server) handleShutdown(w http.ResponseWriter, r *http.Request) {
    token := r.Header.Get("X-Shutdown-Token")
    expectedToken := os.Getenv("SHUTDOWN_TOKEN")

    if token != expectedToken {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    log.Println("Shutdown requested, stopping all traders...")

    // Stop all traders
    s.traderManager.StopAll()

    // Wait for pending executions
    time.Sleep(10 * time.Second)

    // Flush any buffered signals
    s.flushSignals()

    w.WriteHeader(http.StatusOK)
    w.Write([]byte("Shutdown initiated"))

    // Trigger graceful shutdown after response
    go func() {
        time.Sleep(1 * time.Second)
        os.Exit(0)
    }()
}
```

### Error Handling

**Scenario 1: Fly API fails to delete app**
- Retry up to 3 times with exponential backoff
- If still fails, mark as `error` status
- Alert admin via notification
- Manual cleanup required

**Scenario 2: User upgrades again before deletion completes**
- Check status in `user_fly_apps` table
- If status is `deprovisioning`, wait for completion
- If status is `deleted`, provision new app

**Scenario 3: App doesn't exist on Fly (already deleted manually)**
- Treat as successful deletion
- Update database status to `deleted`
- Log event

### Monitoring

Track deprovisioning metrics:
- Average time to deprovision
- Failed deprovision count
- Reasons for failures
- Cost savings from deprovisions

Add dashboard query:
```sql
-- Deprovision success rate
SELECT
  COUNT(*) FILTER (WHERE event_type = 'deprovision_completed') as success_count,
  COUNT(*) FILTER (WHERE event_type = 'deprovision_failed') as failure_count,
  ROUND(
    COUNT(*) FILTER (WHERE event_type = 'deprovision_completed') * 100.0 /
    NULLIF(COUNT(*), 0),
    2
  ) as success_rate_pct
FROM user_fly_app_events
WHERE event_type IN ('deprovision_completed', 'deprovision_failed')
  AND created_at > NOW() - INTERVAL '30 days';
```

### Re-provisioning

If user re-upgrades to Pro/Elite after downgrade:
1. Old app record will have `deleted_at` set
2. Trigger will create NEW app with fresh name
3. New record inserted in `user_fly_apps`
4. User's traders (still in DB) will load on new app

### Cost Tracking

Before deletion, calculate final cost and store in `user_fly_apps.monthly_cost_estimate_usd`. This helps with analytics and churn analysis.

### Testing

**Test 1: Downgrade Free tier user (no app)**
```sql
UPDATE user_subscriptions SET tier = 'free' WHERE user_id = '<free-user>';
-- Should succeed gracefully (no-op)
```

**Test 2: Downgrade Pro tier user (with app)**
```sql
UPDATE user_subscriptions SET tier = 'free' WHERE user_id = '<pro-user>';
-- Should trigger deprovisioning
-- Verify app deleted: flyctl apps list
-- Verify DB record: SELECT * FROM user_fly_apps WHERE user_id = '<pro-user>';
```

**Test 3: Upgrade again after downgrade**
```sql
UPDATE user_subscriptions SET tier = 'pro' WHERE user_id = '<pro-user>';
-- Should provision NEW app with different name
```
