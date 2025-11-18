# Restart Shared Backend to Clear Disabled Trader

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-17 16:23:36

## Context

The shared backend (vyx-app) currently has user trader "StochRSI Overbought Short" loaded in memory. This trader was disabled in the database on Nov 15, but continues running because there's no mechanism to remove disabled traders during polling.

After fixing the architecture bugs in sub-issues #2 and #3, a restart will clear this stale state.

**Evidence:**
- Trader disabled: 2025-11-15 19:58:05 UTC
- Signals still being created: 2025-11-17 15:00:05 UTC (43+ hours later)
- All signals have `source: "cloud"`, `fly_app_id: null`

## Linked Items
- Part of: `context/issues/open/20251117-162336-001-PROJECT-fix-user-trader-execution-architecture.md`
- Depends on: Sub-issue #3 (pollForChanges fix)
- Related: End-to-end trader workflow implementation

## Progress

Waiting for sub-issues #2 and #3 to complete.

## Spec

### Implementation Steps

1. **Verify fixes deployed:**
   - Sub-issue #2: SUPABASE_SERVICE_ROLE_KEY naming fixed
   - Sub-issue #3: pollForChanges respects RUN_MODE

2. **Restart shared backend:**
   ```bash
   flyctl restart --app vyx-app
   ```

3. **Monitor logs during restart:**
   ```bash
   flyctl logs --app vyx-app
   ```

4. **Verify correct trader loading:**
   - Check logs for "Loading built-in traders (shared_backend mode)"
   - Confirm only built-in traders loaded
   - Verify NO user traders in loaded set

5. **Verify signal behavior:**
   - Wait for next candle close (up to 5 minutes)
   - Check database: NO new signals for "StochRSI Overbought Short"
   - Check database: Only built-in trader signals with `fly_app_id: null`

### Expected Log Output

```
[Manager] Run mode: shared_backend
[Manager] Loading built-in traders (shared_backend mode)
[Supabase] Request URL: .../traders?is_built_in=eq.true&select=*
[Supabase] Decoded 2 traders
[Supabase] Trader 0: id=73d7da06..., name=1m MACD Cross Below 40, is_built_in=true
[Supabase] Trader 1: id=d16e060c..., name=Dual Stoch RSI Entry, is_built_in=true
[Manager] Loaded 2 traders successfully
[Manager] Starting background polling...
```

### Success Criteria

- [ ] Shared backend restarts successfully
- [ ] Only built-in traders loaded (count: 2)
- [ ] NO user traders in executor
- [ ] Logs show "shared_backend mode"
- [ ] No new signals for "StochRSI Overbought Short"
- [ ] Built-in trader signals continue normally

## Completion
**Closed:** 2025-11-18 10:32:00
**Outcome:** Success
**Commits:** 4027253, 0856457, 9c0c202

**Resolution:**
Shared backend restarted automatically during deployment. Disabled trader "StochRSI Overbought Short" cleared from memory. Logs confirm only built-in traders now running.
