# Debug Report: Machine Not Visible in Dashboard

**Date:** 2025-10-02
**Status:** 🔍 ROOT CAUSE IDENTIFIED

---

## Issue Summary

**Symptoms:**
- User clicks "Start Machine" in Cloud Execution panel
- Edge Function logs show successful API call to Fly.io
- Fly API returns machine ID: `5683732efe3208`
- Database record created in Supabase with status: `starting`
- ❌ Machine NOT visible in Fly dashboard
- ❌ UI stuck on "Starting" status for 1+ hour
- ❌ WebSocket connection fails

**Expected Behavior:**
- Machine should appear in Fly dashboard
- Machine should start successfully
- Status should update from `starting` → `running`
- WebSocket should connect

---

## Root Cause Analysis

### The Problem: Wrong Docker Image

**From Edge Function Logs:**
```
"image": "registry.fly.io/vyx-app:stub"
- DOCKER_IMAGE: registry.fly.io/vyx-app:stub
```

**The Correct Image (from recent deployment):**
```
registry.fly.io/vyx-app:deployment-01K6JV132H7B7Y5PP8Y5QSR23X
```

### What Happens:

1. ✅ Edge Function calls Fly Machines API
2. ✅ Fly API accepts request and returns machine ID `5683732efe3208`
3. ✅ Database record created with status `starting`
4. ❌ Fly tries to pull image `registry.fly.io/vyx-app:stub`
5. ❌ **Image doesn't exist** → 404 error
6. ❌ Machine fails to start
7. ❌ Machine auto-destroyed (`auto_destroy: true` in config)
8. ❌ Machine disappears from dashboard
9. ❌ Database status stuck on `starting` (never updated)

### Why This Image is Wrong:

The Supabase Edge Function has an environment variable:
```typescript
// In provision-machine/index.ts:196
const dockerImage = Deno.env.get('DOCKER_IMAGE') || 'registry.fly.io/vyx-app:latest';
```

**The Supabase secret `DOCKER_IMAGE` is set to:**
```
registry.fly.io/vyx-app:stub
```

This "stub" image **does not exist** in the Fly registry.

---

## Investigation Evidence

### 1. Verified Machine Doesn't Exist
```bash
fly machines list --app vyx-app
# Result: No machines are available on this app vyx-app
```

Machine ID `5683732efe3208` was created but immediately destroyed.

### 2. Confirmed Image Tags
```bash
fly releases --app vyx-app --image
```

**Result:**
- v2: `registry.fly.io/vyx-app:deployment-01K6JV132H7B7Y5PP8Y5QSR23X` ✅ EXISTS
- v1: `registry.fly.io/vyx-app:deployment-01K6JB0TX9MACMV6XMSZXF94BC` ✅ EXISTS

### 3. Verified Stub Image Doesn't Exist
```bash
fly image show registry.fly.io/vyx-app:stub
# Result: Error 404: 404 page not found
```

### 4. Tested Correct Image Works
```bash
fly machines run registry.fly.io/vyx-app:deployment-01K6JV132H7B7Y5PP8Y5QSR23X \
  --app vyx-app --region sjc --name test-machine
```

**Result:** ✅ Machine created successfully (ID: `e829737ad04058`)
- State: `started`
- Visible in dashboard
- Image pulled successfully

This proves the correct image **does work**.

---

## Root Cause Confirmation

**The Supabase secret `DOCKER_IMAGE` is incorrect.**

**Current Value (WRONG):**
```
DOCKER_IMAGE=registry.fly.io/vyx-app:stub
```

**Should Be:**
```
DOCKER_IMAGE=registry.fly.io/vyx-app:deployment-01K6JV132H7B7Y5PP8Y5QSR23X
```

Or better yet, use a stable tag strategy (explained in Resolution Options below).

---

## Resolution Options

### Option 1: Update Secret to Specific Deployment Tag ⚡ (Quick Fix)

**Pros:**
- Immediate fix
- Uses known working image

**Cons:**
- Requires updating secret after every deployment
- Not sustainable long-term

**Command:**
```bash
supabase secrets set DOCKER_IMAGE=registry.fly.io/vyx-app:deployment-01K6JV132H7B7Y5PP8Y5QSR23X
```

### Option 2: Tag Image as `:latest` 🏆 (Recommended)

**Pros:**
- Stable tag name
- Edge Function can use `registry.fly.io/vyx-app:latest`
- No secret updates needed after deployments
- Industry standard practice

**Cons:**
- Requires updating deploy script to tag as `:latest`

**Implementation:**

1. **Update deploy script** to tag image as `:latest`:
   ```bash
   # After fly deploy succeeds
   DEPLOYED_IMAGE=$(fly releases --app vyx-app --image -j | jq -r '.[0].image')
   fly image tag $DEPLOYED_IMAGE registry.fly.io/vyx-app:latest
   ```

2. **Update Supabase secret:**
   ```bash
   supabase secrets set DOCKER_IMAGE=registry.fly.io/vyx-app:latest
   ```

3. **Future deployments automatically update `:latest` tag**

### Option 3: Remove Secret, Use Default 🔧 (Alternative)

**Pros:**
- No secret management needed
- Defaults to `:latest` tag

**Cons:**
- Requires creating `:latest` tag first (see Option 2)

**Command:**
```bash
# Delete the secret
supabase secrets unset DOCKER_IMAGE

# Edge Function will use default: 'registry.fly.io/vyx-app:latest'
```

---

## Recommended Action

**Use Option 2: Tag Image as `:latest`**

This provides:
- ✅ Stable, predictable image reference
- ✅ No manual updates after deployments
- ✅ Industry best practice
- ✅ Works with existing Edge Function logic

**Steps:**
1. Update `server/fly-machine/scripts/deploy.sh` to tag as `:latest`
2. Update Supabase secret: `DOCKER_IMAGE=registry.fly.io/vyx-app:latest`
3. Redeploy to create `:latest` tag
4. Test machine provisioning

---

## Additional Findings

### Machine Lifecycle Issue

**Current Flow (BROKEN):**
```
provision-machine creates machine
  ↓
Machine tries to pull image
  ↓
Image doesn't exist (404)
  ↓
Machine fails, auto-destroyed
  ↓
Database status: "starting" (STUCK!)
```

**Expected Flow:**
```
provision-machine creates machine
  ↓
Machine pulls image successfully
  ↓
Machine starts, WebSocket ready
  ↓
Status update: "starting" → "running"
  ↓
UI connects to WebSocket
```

### Status Update Gap

The Edge Function doesn't poll/verify machine actually started. It:
1. Creates machine
2. Updates DB to `starting`
3. Returns success immediately

**If machine fails to start:**
- No error is reported back
- Database status never updated
- UI stuck polling forever

**Recommendation:** Add machine status verification after creation (see FLY_MACHINE_DEBUG.md).

---

## Files Involved

- `supabase/functions/provision-machine/index.ts:196` - Reads DOCKER_IMAGE secret
- `server/fly-machine/scripts/deploy.sh` - Deployment script (needs `:latest` tagging)
- Supabase Secrets - `DOCKER_IMAGE` secret (currently wrong value)

---

## Timeline

1. **Earlier today:** Deployed Docker image successfully
   - Image: `registry.fly.io/vyx-app:deployment-01K6JV132H7B7Y5PP8Y5QSR23X`

2. **User triggered provisioning:** Edge Function used wrong image
   - Used: `registry.fly.io/vyx-app:stub` (from secret)
   - Should use: `registry.fly.io/vyx-app:deployment-01K6JV132H7B7Y5PP8Y5QSR23X`

3. **Machine failed silently:**
   - Created: `5683732efe3208`
   - Failed to pull image
   - Auto-destroyed
   - Status stuck: `starting`

---

## Verification Steps (After Fix)

1. ✅ Update `DOCKER_IMAGE` secret
2. ✅ Create new machine from UI
3. ✅ Check machine appears in dashboard: `fly machines list --app vyx-app`
4. ✅ Verify machine state: `started`
5. ✅ Check database status updates: `starting` → `running`
6. ✅ Verify WebSocket connection succeeds
7. ✅ Confirm signals are generated

---

**Status:** Ready for resolution - root cause identified and verified.
