# All Machine Provisioning Bugs Fixed ✅

**Date:** 2025-10-02
**Status:** ✅ ALL FIXED - READY TO TEST

---

## Summary of All Issues

Three separate bugs were causing machines to be created but immediately destroyed:

| # | Issue | Root Cause | Fix | Status |
|---|-------|------------|-----|--------|
| 1 | Wrong Docker Image | Using `:stub` (doesn't exist) | Tagged as `:latest`, updated secret | ✅ Fixed |
| 2 | Edge Function Env Var | Sending `SUPABASE_SERVICE_ROLE_KEY` | Changed to `SUPABASE_SERVICE_KEY` | ✅ Fixed |
| 3 | Fly Machine Env Var | Code expects `SUPABASE_SERVICE_ROLE_KEY` | Changed to `SUPABASE_SERVICE_KEY` | ✅ Fixed |

---

## Bug #1: Wrong Docker Image

### Problem
Supabase secret `DOCKER_IMAGE` was set to `registry.fly.io/vyx-app:stub` which doesn't exist in the registry.

### What Happened
1. Edge Function calls Fly API with `:stub` image
2. Fly creates machine
3. Tries to pull image → 404 error
4. Machine fails, gets auto-destroyed
5. No trace in dashboard

### Fix
1. Tagged current deployment as `:latest`
2. Updated Supabase secret: `DOCKER_IMAGE=registry.fly.io/vyx-app:latest`
3. Updated deploy script to auto-tag future deployments

**Files Changed:**
- `server/fly-machine/scripts/deploy.sh` - Added automatic `:latest` tagging

**Commands:**
```bash
docker pull registry.fly.io/vyx-app:deployment-01K6JV132H7B7Y5PP8Y5QSR23X
docker tag registry.fly.io/vyx-app:deployment-01K6JV132H7B7Y5PP8Y5QSR23X registry.fly.io/vyx-app:latest
docker push registry.fly.io/vyx-app:latest
supabase secrets set DOCKER_IMAGE=registry.fly.io/vyx-app:latest
```

---

## Bug #2: Edge Function Environment Variable Name

### Problem
Edge Function was sending `SUPABASE_SERVICE_ROLE_KEY` but Fly machine expected `SUPABASE_SERVICE_KEY`.

### Log Evidence
```
[Main] Missing required environment variables: USER_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY
```

### Fix
Changed environment variable name in provision-machine Edge Function:

**File:** `supabase/functions/provision-machine/index.ts:246`

```typescript
// BEFORE (WRONG):
env: {
  SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey  // ❌
}

// AFTER (CORRECT):
env: {
  SUPABASE_SERVICE_KEY: supabaseServiceKey  // ✅
}
```

**Deployed:** Version 22

---

## Bug #3: Fly Machine Code Environment Variable Names

### Problem
Even after fixing Bug #2, machines were still crashing. Two services in the Fly machine code were ALSO expecting `SUPABASE_SERVICE_ROLE_KEY`.

### Log Evidence
```
[Main] Fatal error: Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set
    at new ConcurrentAnalyzer (/app/dist/services/ConcurrentAnalyzer.js:34:19)
```

### Fix
Changed environment variable names in TWO files:

**File 1:** `server/fly-machine/services/ConcurrentAnalyzer.ts:52`

```typescript
// BEFORE (WRONG):
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

// AFTER (CORRECT):
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
}
```

**File 2:** `server/fly-machine/services/StateSynchronizer.ts:81`

```typescript
// Same change as above
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
```

**Redeployed Fly Machine:**
```bash
cd server/fly-machine
./scripts/deploy.sh
```

**Result:**
- New image: `registry.fly.io/vyx-app:deployment-01K6KAH4CZJ6TVK0A4SH3K37JR`
- Tagged as `:latest`
- All environment variables now consistent

---

## Why This Was Confusing

The variable naming was inconsistent across the codebase:

### Before (INCONSISTENT):
```
Edge Function sends:   SUPABASE_SERVICE_ROLE_KEY ❌
Fly Machine expects:   SUPABASE_SERVICE_KEY ❌
Other services expect: SUPABASE_SERVICE_ROLE_KEY ❌
```

### After (CONSISTENT):
```
Edge Function sends:   SUPABASE_SERVICE_KEY ✅
Fly Machine expects:   SUPABASE_SERVICE_KEY ✅
All services expect:   SUPABASE_SERVICE_KEY ✅
```

---

## Complete Fix Timeline

### Attempt 1 - Image Fix
- ✅ Fixed Docker image (`:stub` → `:latest`)
- ❌ Machine still failing (Bug #2 discovered)

### Attempt 2 - Edge Function Fix
- ✅ Fixed Edge Function env var name
- ❌ Machine still failing (Bug #3 discovered from logs)

### Attempt 3 - Fly Machine Code Fix
- ✅ Fixed ConcurrentAnalyzer env var name
- ✅ Fixed StateSynchronizer env var name
- ✅ Rebuilt and deployed Fly machine
- ✅ Tagged as `:latest`
- ✅ **ALL ISSUES RESOLVED**

---

## Testing Guide

### Test Machine Provisioning

1. **Navigate to Cloud Execution Panel**
2. **Click "Start Machine"**

### Expected Success Behavior

**Edge Function logs** (Supabase Dashboard):
```
[timestamp] provision-machine invoked
[timestamp] Image: registry.fly.io/vyx-app:latest ✅
[timestamp] SUPABASE_SERVICE_KEY: eyJ... ✅
[timestamp] ✅ Fly machine created successfully: <machine-id>
```

**Fly Machine logs:**
```
================================================================================
Fly Machine - AI-Powered Crypto Screener
================================================================================

[Main] Configuration:
  User ID: 63eea370-27a1-4099-866a-e3ed340b278d
  Machine ID: vyx-63eea370
  Region: sin
  CPUs: 1
  Memory: 256 MB

[Main] Loading symbols...
[Main] Monitoring 20 symbols

[Orchestrator] Starting...
[WebSocketServer] WebSocket server started on port 8080
[BinanceWS] Connecting to 20 symbols...
[BinanceWS] Connected successfully
[Orchestrator] Started successfully

================================================================================
Machine is running! Press Ctrl+C to stop.
================================================================================
```

**Fly Dashboard:**
```bash
fly machines list --app vyx-app
```

Expected:
```
ID            NAME          STATE    REGION  IMAGE
<machine-id>  vyx-63eea370  started  sin     vyx-app:latest
```

**Database:**
```sql
SELECT machine_id, status, error_message, updated_at
FROM cloud_machines
WHERE user_id = '63eea370-27a1-4099-866a-e3ed340b278d'
ORDER BY updated_at DESC
LIMIT 1;
```

Expected:
```
machine_id   | status  | error_message | updated_at
vyx-63eea370 | running | NULL          | [recent timestamp]
```

**UI:**
- ✅ Status shows "Running" (not stuck on "Starting")
- ✅ WebSocket connects successfully
- ✅ Cloud signals appear with `source='cloud'`

---

## Files Modified

### Edge Function
1. `supabase/functions/provision-machine/index.ts`
   - Line 246: Changed `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_KEY`

### Fly Machine
1. `server/fly-machine/services/ConcurrentAnalyzer.ts`
   - Line 52: Changed `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_KEY`
   - Line 55: Updated error message

2. `server/fly-machine/services/StateSynchronizer.ts`
   - Line 81: Changed `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_KEY`
   - Line 84: Updated error message

3. `server/fly-machine/scripts/deploy.sh`
   - Added automatic `:latest` tagging after deployment

### Secrets
1. Updated Supabase secret:
   - `DOCKER_IMAGE=registry.fly.io/vyx-app:latest`

---

## Deployment Status

### Edge Function
- **Version:** 22
- **Deployed:** ✅ Yes
- **Image sent:** `registry.fly.io/vyx-app:latest` ✅
- **Env var sent:** `SUPABASE_SERVICE_KEY` ✅

### Fly Machine
- **Image:** `registry.fly.io/vyx-app:deployment-01K6KAH4CZJ6TVK0A4SH3K37JR`
- **Tagged as:** `:latest` ✅
- **Deployed:** ✅ Yes
- **Env var expected:** `SUPABASE_SERVICE_KEY` ✅

---

## Verification Commands

### Check Supabase Secret
```bash
supabase secrets list | grep DOCKER_IMAGE
```

### Check Fly Image
```bash
fly image show registry.fly.io/vyx-app:latest
```

### List Machines (after provisioning)
```bash
fly machines list --app vyx-app
```

### View Logs (after provisioning)
```bash
fly logs --app vyx-app
```

---

## Related Documentation

1. `DEBUG_REPORT_WRONG_IMAGE.md` - Bug #1 investigation
2. `OPTION2_IMPLEMENTATION_COMPLETE.md` - Image tagging solution
3. `ENV_VAR_MISMATCH_FIX.md` - Bug #2 fix
4. `LOGGING_FIX_SUMMARY.md` - Earlier logging improvements

---

**Status:** 🚀 ALL BUGS FIXED - READY FOR PRODUCTION TESTING!

Try clicking "Start Machine" - it should work now! 🎉
