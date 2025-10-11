# Go Backend Deployment Guide

**Date:** 2025-10-10
**Purpose:** Deploy the Go screener backend to Fly.io machines for Elite tier cloud execution

---

## Overview

This guide documents how to deploy the Go screener backend (`backend/go-screener`) to Fly.io machines. Elite tier users can provision dedicated machines that run this backend for their custom AI traders.

---

## Deployment Process

### 1. Build Docker Image

The Go backend has an optimized multi-stage Dockerfile at `backend/go-screener/Dockerfile`:

```bash
cd backend/go-screener
fly deploy -a vyx-app --dockerfile Dockerfile --build-only --push
```

**Build Output:**
```
image: registry.fly.io/vyx-app:deployment-01K7822VD03TNGS2F5BYEMQGSN
image size: 18 MB
```

### 2. Update Supabase Secret

The `provision-machine` Edge Function uses the `DOCKER_IMAGE` environment variable to determine which image to deploy:

```bash
supabase secrets set DOCKER_IMAGE=registry.fly.io/vyx-app:deployment-01K7822VD03TNGS2F5BYEMQGSN
```

**Verify:**
```bash
supabase secrets list
```

### 3. Test Provisioning

Use the "Create Machine" button in the UI (Elite tier required) to test:

1. Click "Create Machine" in the UI
2. Monitor Fly.io logs: `fly logs -a vyx-app -f`
3. Verify machine starts successfully
4. Check that the Go backend is running on port 8080

---

## Architecture

### Image Details

- **Registry:** `registry.fly.io/vyx-app`
- **Current Tag:** `deployment-01K7822VD03TNGS2F5BYEMQGSN`
- **Size:** 18 MB (optimized Alpine-based image)
- **Base:** Alpine Linux with Go 1.23
- **Port:** 8080 (HTTP API)

### What's Included

The Docker image contains:

- **Go Screener API** (`cmd/server/main.go`)
- **Yaegi Interpreter** for executing user-generated Go trader code
- **Indicator Library** (`pkg/indicators/helpers.go`) with all technical analysis functions
- **Health Check Endpoint** (`/health`)

### Environment Variables

The provision-machine function passes these env vars to each machine:

```typescript
{
  USER_ID: userId,
  MACHINE_ID: machine.machine_id,
  SUPABASE_URL: supabaseUrl,
  SUPABASE_SERVICE_KEY: supabaseServiceKey,
  GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'),
  SYMBOL_COUNT: Deno.env.get('SYMBOL_COUNT') || '100',
  CPU_PRIORITY: cpuPriority,
  IMAGE_TIMESTAMP: new Date().toISOString(),
}
```

---

## How Provisioning Works

### 1. User Clicks "Create Machine"

The UI calls the `provision-machine` Supabase Edge Function:

```typescript
POST /functions/v1/provision-machine
{
  "userId": "abc123",
  "region": "sjc",
  "cpuPriority": "normal"
}
```

### 2. Edge Function Creates Fly Machine

```typescript
// Read DOCKER_IMAGE from env (line 211 in provision-machine/index.ts)
const dockerImage = Deno.env.get('DOCKER_IMAGE') || 'registry.fly.io/vyx-app:deployment-...';

// Call Fly.io API
POST https://api.machines.dev/v1/apps/vyx-app/machines
{
  "name": "vyx-{userId}",
  "region": "sjc",
  "config": {
    "image": dockerImage,  // ← Uses the DOCKER_IMAGE secret
    "auto_destroy": true,
    "restart": { "policy": "on-failure", "max_retries": 3 },
    "guest": { "cpu_kind": "shared", "cpus": 2, "memory_mb": 512 },
    "env": { ... }
  }
}
```

### 3. Machine Starts

- Fly.io pulls the Docker image
- Container starts the Go server (`/app/server`)
- Health check runs: `GET http://localhost:8080/health`
- Machine becomes available at `wss://{machine-id}.fly.dev`

### 4. Traders Execute

- User's custom traders (with `language: 'go'`) route to this machine
- Go backend compiles code with Yaegi
- Indicators execute using native Go functions
- Results stream back via WebSocket

---

## Updating the Image

### When to Update

- After adding new indicator functions to `pkg/indicators/helpers.go`
- After fixing bugs in the Go backend
- After performance optimizations
- After security updates

### Update Process

```bash
# 1. Build new image
cd backend/go-screener
fly deploy -a vyx-app --dockerfile Dockerfile --build-only --push

# 2. Note the deployment tag from output
# Example: registry.fly.io/vyx-app:deployment-01K7XXXXXXXXXXXXXX

# 3. Update Supabase secret
supabase secrets set DOCKER_IMAGE=registry.fly.io/vyx-app:deployment-01K7XXXXXXXXXXXXXX

# 4. Test
# Click "Create Machine" in UI and verify it works
```

---

## Troubleshooting

### Machine Fails to Start

**Check Fly Logs:**
```bash
fly logs -a vyx-app -f
```

**Common Issues:**

1. **"Cannot find module"**
   - Dockerfile COPY paths don't match CMD path
   - Solution: Verify Dockerfile structure

2. **"Health check failed"**
   - App not listening on port 8080
   - Check server startup logs
   - Verify `/health` endpoint

3. **"Missing environment variables"**
   - Check provision-machine Edge Function
   - Verify Supabase secrets are set
   - Check logs: `supabase functions logs provision-machine`

4. **Machine auto-destroys**
   - `auto_destroy: true` + `max_retries: 3` = destroys after 3 failures
   - Check Fly logs immediately to see startup error
   - Fix error and retry

### Image Not Found

```bash
# Verify image exists in registry
fly image show registry.fly.io/vyx-app:deployment-01K7822VD03TNGS2F5BYEMQGSN

# Check DOCKER_IMAGE secret
supabase secrets list | grep DOCKER_IMAGE
```

### Old Image Being Used

The `DOCKER_IMAGE` secret is cached. After updating:

1. Wait 1-2 minutes for Edge Function to reload
2. Or redeploy the Edge Function:
   ```bash
   supabase functions deploy provision-machine
   ```

---

## Performance

### Expected Metrics

- **Build Time:** 30-60 seconds (with cache)
- **Image Size:** 18 MB
- **Startup Time:** 2-5 seconds
- **Memory Usage:** 50-200 MB (idle to active)
- **CPU Usage:** <5% (idle), 10-30% (active screening)

### Compared to Node.js Worker

- **10-30x faster** filter execution
- **4x less** memory usage
- **Type-safe** at compile time
- **Secure** sandboxed execution via Yaegi

---

## Related Files

- `backend/go-screener/Dockerfile` - Multi-stage build configuration
- `backend/go-screener/fly.toml` - Fly.io app configuration (not used for UI-provisioned machines)
- `supabase/functions/provision-machine/index.ts` - Machine provisioning logic (line 211 for DOCKER_IMAGE)
- `pkg/indicators/helpers.go` - Technical indicator implementations
- `pkg/yaegi/executor.go` - Yaegi interpreter and symbol registration

---

## Security Notes

- Machines run in isolated containers
- Each user gets a dedicated machine (no shared state)
- Yaegi provides sandboxed code execution
- No file system access from user code
- Network access controlled via Fly.io network policies

---

## Next Steps

1. **Monitor Production:** Watch Fly logs for errors
2. **Collect Metrics:** Track compilation success rate
3. **Performance Tuning:** Optimize indicator calculations if needed
4. **Phase 2:** Add advanced indicators (StochRSI, ADX, etc.)

---

**Last Updated:** 2025-10-10
**Current Image:** `registry.fly.io/vyx-app:deployment-01K7822VD03TNGS2F5BYEMQGSN`
**Status:** ✅ Deployed and ready for testing
