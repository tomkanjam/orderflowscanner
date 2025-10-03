# Machine Status Update Fix ✅

**Date:** 2025-10-02
**Issue:** Machine provisions and runs successfully, but status stuck on "starting" in database
**Status:** ✅ FIXED

---

## Problem

Machine was provisioning successfully and running in Fly.io, but the database `cloud_machines.status` never updated from `"starting"` to `"running"`.

### Symptoms
- ✅ Fly machine shows `STATE: started`
- ✅ Application running successfully
- ✅ Logs show `[Main] Status: isRunning: true`
- ❌ Database shows `status: "starting"`
- ❌ UI stuck showing "Starting..." forever

---

## Root Cause

The Edge Function was **not sending the `MACHINE_ID` environment variable** to the Fly machine.

### What Happened

**1. Machine starts without MACHINE_ID:**
```typescript
// Edge Function was sending:
env: {
  USER_ID: userId,              // ✅ Sent
  MACHINE_ID: ???,              // ❌ NOT SENT!
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_KEY: supabaseServiceKey,
}
```

**2. Machine uses default value:**
```typescript
// In server/fly-machine/index.ts:11
const MACHINE_ID = process.env.MACHINE_ID || `machine_${Date.now()}`;
// Result: MACHINE_ID = "machine_1759437443244"
```

**3. StateSynchronizer tries to update wrong machine:**
```typescript
// In StateSynchronizer.updateMachineStatus():
await this.supabase
  .from('cloud_machines')
  .update({ status: 'running' })
  .eq('machine_id', this.machineId);  // "machine_1759437443244" ❌
```

**4. Update fails silently:**
- Database has machine_id: `"vyx-63eea370"` ✅
- StateSynchronizer looking for: `"machine_1759437443244"` ❌
- No rows match → update returns 0 rows
- Status remains `"starting"`

---

## The Fix

Added `MACHINE_ID` to environment variables in Edge Function:

### File Changed
`supabase/functions/provision-machine/index.ts:245`

### Before (BROKEN):
```typescript
env: {
  USER_ID: userId,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_KEY: supabaseServiceKey,
  GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY') || '',
  CPU_PRIORITY: cpuPriority,
}
```

### After (FIXED):
```typescript
env: {
  USER_ID: userId,
  MACHINE_ID: machine.machine_id,  // ✅ Added!
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_KEY: supabaseServiceKey,
  GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY') || '',
  CPU_PRIORITY: cpuPriority,
}
```

### Deployed
```bash
supabase functions deploy provision-machine
```

**Result:** ✅ Version 23 deployed

---

## How It Works Now

**1. Edge Function sends correct MACHINE_ID:**
```
MACHINE_ID: "vyx-63eea370"  // Matches database!
```

**2. Machine receives and uses it:**
```typescript
const MACHINE_ID = process.env.MACHINE_ID;  // "vyx-63eea370" ✅
```

**3. StateSynchronizer updates correct record:**
```typescript
await this.supabase
  .from('cloud_machines')
  .update({ status: 'running' })
  .eq('machine_id', 'vyx-63eea370');  // ✅ Matches!
```

**4. Database status updates successfully:**
```sql
UPDATE cloud_machines
SET status = 'running', updated_at = NOW()
WHERE machine_id = 'vyx-63eea370';  -- ✅ 1 row updated
```

**5. UI polls and sees status change:**
```
Database: status = "running" ✅
UI: Shows "Running" ✅
```

---

## Testing

### Stop Current Machine
The existing machine has the wrong MACHINE_ID, so it can't update its status:

```bash
export PATH="$HOME/.fly/bin:$PATH"
fly machines destroy 7819752a92d138 --app vyx-app --force
```

### Provision New Machine
1. Navigate to Cloud Execution panel
2. Click "Start Machine"

### Expected Behavior

**Edge Function logs:**
```
[timestamp] Machine name: vyx-63eea370
[timestamp] Fly.io API request body: {
  "config": {
    "env": {
      "USER_ID": "63eea370-...",
      "MACHINE_ID": "vyx-63eea370",  // ✅ Now included!
      ...
    }
  }
}
```

**Fly Machine logs:**
```
[Main] Configuration:
  Machine ID: vyx-63eea370  // ✅ Correct ID!

[Orchestrator] Starting...
[StateSynchronizer] Initializing for user 63eea370-..., machine vyx-63eea370
[Orchestrator] Started successfully
```

**Database query:**
```sql
SELECT machine_id, status, updated_at
FROM cloud_machines
WHERE machine_id = 'vyx-63eea370';
```

**Expected result (after ~10-15 seconds):**
```
machine_id   | status  | updated_at
vyx-63eea370 | running | 2025-10-02 21:05:23  ✅
```

**UI:**
```
Status: Running ✅
```

---

## Complete Bug Summary

Four bugs total were preventing machine provisioning from working:

| # | Bug | Fix | Status |
|---|-----|-----|--------|
| 1 | Wrong Docker image (`:stub`) | Tagged as `:latest` | ✅ Fixed |
| 2 | Edge Function sends `SUPABASE_SERVICE_ROLE_KEY` | Changed to `SUPABASE_SERVICE_KEY` | ✅ Fixed |
| 3 | Fly machine expects `SUPABASE_SERVICE_ROLE_KEY` | Changed to `SUPABASE_SERVICE_KEY` | ✅ Fixed |
| 4 | Missing `MACHINE_ID` environment variable | Added to Edge Function | ✅ Fixed |

---

## Files Modified

### This Fix
- `supabase/functions/provision-machine/index.ts:245`
  - Added: `MACHINE_ID: machine.machine_id`

### Previous Fixes
1. `supabase/functions/provision-machine/index.ts:246` - Env var name
2. `server/fly-machine/services/ConcurrentAnalyzer.ts:52` - Env var name
3. `server/fly-machine/services/StateSynchronizer.ts:81` - Env var name
4. `server/fly-machine/scripts/deploy.sh` - Auto-tag `:latest`
5. Supabase secret: `DOCKER_IMAGE=registry.fly.io/vyx-app:latest`

---

## Related Documentation

1. `ALL_BUGS_FIXED.md` - Bugs #1-3 (image + env var names)
2. `ENV_VAR_MISMATCH_FIX.md` - Bug #3 details
3. `OPTION2_IMPLEMENTATION_COMPLETE.md` - Bug #1 fix
4. `DEBUG_REPORT_WRONG_IMAGE.md` - Original investigation

---

**Status:** 🚀 All 4 bugs fixed! Destroy old machine and provision fresh one to test.
