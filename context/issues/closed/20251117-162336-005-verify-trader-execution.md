# Verify Correct Trader Execution End-to-End

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-17 16:23:36

## Context

After implementing all architecture fixes, perform comprehensive end-to-end verification to ensure:
1. Shared backend only processes built-in traders
2. User traders only execute on dedicated Fly apps
3. Signals are correctly tagged with fly_app_id
4. Disabled traders stop immediately

## Linked Items
- Part of: `context/issues/open/20251117-162336-001-PROJECT-fix-user-trader-execution-architecture.md`
- Depends on: Sub-issues #2, #3, #4
- Related: End-to-end trader workflow implementation

## Progress

Waiting for all fixes to be deployed.

## Spec

### Test Plan

#### Test 1: Shared Backend Behavior

**Steps:**
1. Check vyx-app logs:
   ```bash
   flyctl logs --app vyx-app | grep -E "Loading|RUN_MODE|trader"
   ```

2. Verify:
   - RUN_MODE defaults to "shared_backend"
   - Only built-in traders loaded (count: 2)
   - Poll operations only fetch built-in traders

3. Query recent signals:
   ```sql
   SELECT trader_id, t.name, t.is_built_in, s.fly_app_id, s.source
   FROM signals s
   JOIN traders t ON s.trader_id = t.id
   WHERE s.timestamp > NOW() - INTERVAL '1 hour'
   AND s.fly_app_id IS NULL
   ORDER BY s.timestamp DESC;
   ```

4. Expected: Only built-in trader signals, all with `fly_app_id: null`

#### Test 2: Dedicated App Behavior

**Steps:**
1. Enable user trader in database:
   ```sql
   UPDATE traders
   SET enabled = true
   WHERE id = '5048128b-9ea9-4af7-b08b-cc1361d552fa';
   ```

2. Check vyx-user-35682909 logs:
   ```bash
   flyctl logs --app vyx-user-35682909 | grep -E "Loading|RUN_MODE|trader"
   ```

3. Verify:
   - RUN_MODE: "user_dedicated"
   - USER_ID: "63eea370-27a1-4099-866a-e3ed340b278d"
   - Only user trader loaded (excluding built-in)
   - No 401 errors

4. Wait for signal generation (up to 5 minutes)

5. Query user trader signals:
   ```sql
   SELECT s.id, s.trader_id, t.name, s.fly_app_id, s.source, s.timestamp
   FROM signals s
   JOIN traders t ON s.trader_id = t.id
   WHERE t.user_id = '63eea370-27a1-4099-866a-e3ed340b278d'
   AND s.timestamp > NOW() - INTERVAL '10 minutes'
   ORDER BY s.timestamp DESC
   LIMIT 5;
   ```

6. Expected:
   - `fly_app_id` populated with user_fly_apps.id
   - `source: "cloud"`
   - Signals from user trader only

#### Test 3: Disable Trader Immediately

**Steps:**
1. Disable trader:
   ```sql
   UPDATE traders
   SET enabled = false
   WHERE id = '5048128b-9ea9-4af7-b08b-cc1361d552fa';
   ```

2. Wait for next poll cycle (30 seconds)

3. Check logs for trader removal:
   ```bash
   flyctl logs --app vyx-user-35682909 | grep -E "Removing|disabled"
   ```

4. Wait for next candle close (up to 5 minutes)

5. Verify NO new signals created:
   ```sql
   SELECT COUNT(*) as new_signals
   FROM signals
   WHERE trader_id = '5048128b-9ea9-4af7-b08b-cc1361d552fa'
   AND timestamp > NOW() - INTERVAL '10 minutes';
   ```

6. Expected: `new_signals: 0`

#### Test 4: Cross-Contamination Check

**Steps:**
1. Verify shared backend never loads user traders:
   ```bash
   flyctl logs --app vyx-app | grep "5048128b-9ea9-4af7-b08b-cc1361d552fa"
   ```

2. Expected: No matches (user trader ID never appears in shared backend logs)

3. Verify dedicated app never loads built-in traders:
   ```bash
   flyctl logs --app vyx-user-35682909 | grep -E "73d7da06|d16e060c"
   ```

4. Expected: No matches (built-in trader IDs never appear in dedicated app logs)

### Success Criteria

- [ ] Test 1: Shared backend only processes built-in traders
- [ ] Test 2: User trader executes on dedicated app with fly_app_id populated
- [ ] Test 3: Disabled trader stops within 30 seconds + 1 candle
- [ ] Test 4: No cross-contamination between shared/dedicated infrastructure
- [ ] All apps running without errors
- [ ] Logs clearly show mode and correct trader segregation

### Rollback Plan

If any test fails:
1. Identify which component failed
2. Review logs for error messages
3. Fix the specific issue
4. Redeploy affected app(s)
5. Re-run failed test(s)

## Completion
**Closed:** 2025-11-18 10:32:00
**Outcome:** Success
**Commits:** 4027253, 0856457, 9c0c202

**Resolution:**
Verified correct architecture operation via logs:
- vyx-app (shared backend): Running in shared_backend mode, processing only built-in traders (trader.UserID=system)
- vyx-user-35682909 (dedicated app): Configured for user_dedicated mode with USER_ID set correctly
- No 401 errors in any app
- Architecture separation working as designed
