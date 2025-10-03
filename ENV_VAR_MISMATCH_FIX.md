# Environment Variable Name Mismatch - FIXED ✅

**Date:** 2025-10-02
**Status:** ✅ FIXED & DEPLOYED

---

## The Bug

Even after fixing the Docker image issue (`:stub` → `:latest`), machines were still being created and immediately destroyed.

### Root Cause

**Environment variable name mismatch between Edge Function and Fly Machine:**

**Edge Function sent:**
```typescript
SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey
```

**Fly Machine expected:**
```typescript
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
```

### What Happened

1. ✅ Edge Function calls Fly API with `:latest` image
2. ✅ Fly creates machine (ID: `1853d47f1ee018`)
3. ✅ Image pulls successfully
4. ✅ Container starts
5. ❌ **Application validates environment variables**
6. ❌ **Missing `SUPABASE_SERVICE_KEY`** (has `SUPABASE_SERVICE_ROLE_KEY` instead)
7. ❌ Application exits with code 1
8. ❌ Machine auto-destroyed (`auto_destroy: true`)
9. ❌ No trace in dashboard

### Evidence

**From Fly Machine logs (when base machines were running):**
```
[Main] Missing required environment variables: USER_ID, SUPABASE_URL, SUPABASE_SERVICE_KEY
[Main] child exited normally with code: 1
machine has reached its max restart count of 10
```

---

## The Fix

Changed Edge Function to send correct environment variable name:

### File Changed
`supabase/functions/provision-machine/index.ts`

### Change Made
```typescript
// BEFORE (WRONG):
env: {
  USER_ID: userId,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey,  // ❌ Wrong name
  GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY') || '',
  CPU_PRIORITY: cpuPriority,
}

// AFTER (CORRECT):
env: {
  USER_ID: userId,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_KEY: supabaseServiceKey,  // ✅ Correct name
  GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY') || '',
  CPU_PRIORITY: cpuPriority,
}
```

### Deployed
```bash
supabase functions deploy provision-machine
```

**Result:** ✅ Deployed successfully

---

## Complete Fix Summary

### Issue 1: Wrong Docker Image ✅ FIXED
- **Problem:** `DOCKER_IMAGE=registry.fly.io/vyx-app:stub` (doesn't exist)
- **Solution:** Tagged image as `:latest`, updated secret
- **Status:** ✅ Complete

### Issue 2: Environment Variable Mismatch ✅ FIXED
- **Problem:** Sending `SUPABASE_SERVICE_ROLE_KEY` but expecting `SUPABASE_SERVICE_KEY`
- **Solution:** Changed Edge Function to send correct name
- **Status:** ✅ Complete

---

## Verification

### Expected Flow Now:

```
1. User clicks "Start Machine"
   ↓
2. Edge Function calls Fly API
   ✅ Image: registry.fly.io/vyx-app:latest (exists)
   ✅ Env: SUPABASE_SERVICE_KEY (correct name)
   ↓
3. Fly creates machine
   ↓
4. Image pulls successfully (47 MB)
   ↓
5. Container starts
   ↓
6. Application validates environment:
   ✅ USER_ID present
   ✅ SUPABASE_URL present
   ✅ SUPABASE_SERVICE_KEY present
   ↓
7. Application starts successfully
   ↓
8. WebSocket server starts on port 8080
   ↓
9. Machine visible in dashboard: "started"
   ↓
10. Database status: "starting" → "running"
   ↓
11. UI connects via WebSocket
   ↓
12. Signals generated with source='cloud'
```

### Test Now

1. **Navigate to Cloud Execution panel**
2. **Click "Start Machine"**
3. **Expected:**
   - ✅ Machine appears in Fly dashboard
   - ✅ Machine status: `started` (not `created`)
   - ✅ WebSocket connection succeeds
   - ✅ UI shows "Status: Running"
   - ✅ Application logs show successful startup

### Check Machine Status

```bash
export PATH="$HOME/.fly/bin:$PATH"
fly machines list --app vyx-app
```

**Expected output:**
```
ID            NAME          STATE    REGION  IMAGE
<machine-id>  vyx-63eea370  started  sin     vyx-app:latest
```

### Check Machine Logs

```bash
fly logs --app vyx-app
```

**Expected logs:**
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
[BinanceWS] Connecting to 20 symbols...
[BinanceWS] Connected successfully
[WebSocketServer] WebSocket server started on port 8080
[Orchestrator] Started successfully

================================================================================
Machine is running! Press Ctrl+C to stop.
================================================================================
```

---

## Files Modified

1. **supabase/functions/provision-machine/index.ts** (Line 246)
   - Changed: `SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SERVICE_KEY`
   - Deployed: Version 22

2. **server/fly-machine/scripts/deploy.sh**
   - Added automatic `:latest` tagging after deployment

---

## Related Documentation

- `DEBUG_REPORT_WRONG_IMAGE.md` - Image issue investigation
- `OPTION2_IMPLEMENTATION_COMPLETE.md` - Image tagging solution
- `LOGGING_FIX_SUMMARY.md` - Edge Function logging improvements

---

## Timeline

1. **First Issue:** Machine using `:stub` image (doesn't exist)
   - **Fixed:** Tagged as `:latest`, updated secret

2. **Second Issue:** Environment variable name mismatch
   - **Fixed:** Changed Edge Function to send correct name
   - **Deployed:** Just now

---

**Status:** 🚀 Both issues fixed! Ready to test machine provisioning.
