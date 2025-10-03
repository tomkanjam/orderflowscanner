# Fly Machine Creation Debug Report

**Date:** 2025-10-02
**Issue:** Machine created via API but not visible in dashboard
**Status:** 🔍 INVESTIGATING

## Symptoms

1. ✅ `provision-machine` Edge Function succeeds
2. ✅ Returns Fly Machine ID: `91850296bd4738`
3. ✅ Database record created: `vyx-63eea370`, status: `starting`
4. ❌ Machine NOT visible in Fly.io dashboard
5. ❌ WebSocket connection fails (expected - machine doesn't exist)

## API Response

```json
{
  "machineId": "vyx-63eea370",
  "websocketUrl": "wss://vyx-63eea370.fly.dev",
  "status": "starting",
  "flyMachineId": "91850296bd4738",
  "wasReused": false,
  "message": "Machine provisioned successfully on Fly.io"
}
```

## Logs from Edge Function

```
[CloudExecution] Calling provision-machine with: {
  userId: '63eea370-27a1-4099-866a-e3ed340b278d',
  userEmail: 'tom@tomk.ca',
  region: 'sin',
  cpuPriority: 'normal'
}
[CloudExecution] Response data: {
  machineId: 'vyx-63eea370',
  websocketUrl: 'wss://vyx-63eea370.fly.dev',
  status: 'starting',
  flyMachineId: '91850296bd4738',
  wasReused: false,
  message: 'Machine provisioned successfully on Fly.io'
}
```

## Hypothesis

The Fly.io Machines API returned a 200 OK response, but the machine may have:

1. **Failed to start immediately** - Docker image pull failed, or startup crashed
2. **Wrong app name** - Machine created in different app than expected
3. **API token issue** - Token has read/write but machine is in different organization
4. **Docker image missing** - `registry.fly.io/vyx-app:latest` doesn't exist

## Investigation Steps

### Step 1: Check Fly.io Logs

The Edge Function logs show the API call succeeded. We need to check:

```bash
# Check if the app exists
fly apps list | grep vyx-app

# Check machines in the app
fly machines list --app vyx-app

# Check logs for machine creation attempts
fly logs --app vyx-app | grep -i machine
```

### Step 2: Verify Docker Image Exists

The provision-machine function uses:
```typescript
const dockerImage = Deno.env.get('DOCKER_IMAGE') || 'registry.fly.io/vyx-app:latest';
```

**Action:** Verify this image exists:
```bash
fly image list --app vyx-app
```

If the image doesn't exist, the machine will fail to start.

### Step 3: Check Fly API Token Permissions

The `FLY_API_TOKEN` may have limited permissions. Check:

```bash
# Verify token can create machines
curl -H "Authorization: Bearer $FLY_API_TOKEN" \
  https://api.machines.dev/v1/apps/vyx-app/machines
```

### Step 4: Test Machine Creation Directly

Try creating a machine manually to see if it succeeds:

```bash
fly machines create \
  --app vyx-app \
  --region sin \
  --name test-machine \
  --image registry.fly.io/vyx-app:latest
```

## Root Cause Analysis

Looking at the provision-machine function (`supabase/functions/provision-machine/index.ts:233-276`):

```typescript
const requestBody = {
  name: machine.machine_id,  // "vyx-63eea370"
  region: region,            // "sin"
  config: {
    image: dockerImage,      // "registry.fly.io/vyx-app:latest" (default)
    auto_destroy: true,
    restart: {
      policy: 'on-failure',
      max_retries: 3,
    },
    env: {
      USER_ID: userId,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey,
      GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY') || '',
      CPU_PRIORITY: cpuPriority,
    },
    services: [
      {
        ports: [
          { port: 80, handlers: ['http'] },
          { port: 443, handlers: ['tls', 'http'] },
          { port: 8080, handlers: ['http'] },
        ],
        protocol: 'tcp',
        internal_port: 8080,
      },
    ],
  },
};
```

**CRITICAL ISSUE:** The Docker image `registry.fly.io/vyx-app:latest` likely **does not exist**!

The Fly.io Machines API returns a machine ID (`91850296bd4738`), but if the image doesn't exist, the machine will:
1. Be created
2. Fail to start (image pull fails)
3. Be automatically destroyed (`auto_destroy: true`)
4. Leave no trace in the dashboard

## Solution

### Option 1: Deploy the Docker Image First (RECOMMENDED)

```bash
cd server/fly-machine

# Build and deploy the image
./scripts/deploy.sh

# This will:
# 1. Build the Docker image
# 2. Push to registry.fly.io/vyx-app:latest
# 3. Deploy the app
```

### Option 2: Use a Test Image to Verify Provisioning

Temporarily change the Edge Function to use a known working image:

```typescript
// In provision-machine/index.ts
const dockerImage = Deno.env.get('DOCKER_IMAGE') || 'flyio/hellofly:latest';
```

This will prove the provisioning mechanism works.

### Option 3: Check DOCKER_IMAGE Secret

The image might be configured via Supabase secret:

```bash
# Check Supabase secrets
supabase secrets list

# Set DOCKER_IMAGE if needed
supabase secrets set DOCKER_IMAGE=registry.fly.io/vyx-app:latest
```

## Verification

Once fixed, verify:

1. ✅ Docker image exists: `fly image list --app vyx-app`
2. ✅ Machine shows in dashboard: `fly machines list --app vyx-app`
3. ✅ Machine is running: `fly status --app vyx-app`
4. ✅ WebSocket connects: Check browser logs for successful connection
5. ✅ Database status updates: Machine status changes from `starting` → `running`

## Next Steps

1. **Confirm Docker image status** - Does `registry.fly.io/vyx-app:latest` exist?
2. **Deploy image if missing** - Run `cd server/fly-machine && ./scripts/deploy.sh`
3. **Retry provisioning** - Test machine creation again
4. **Update Edge Function** - Add image validation to prevent this issue

## Additional Logging Needed

To prevent this issue in the future, add to `provision-machine/index.ts`:

```typescript
// After Fly API call succeeds
console.log(`[${new Date().toISOString()}] Verifying machine status...`);

// Poll Fly API to check if machine actually started
const verifyResponse = await fetch(
  `https://api.machines.dev/v1/apps/${flyAppName}/machines/${flyMachine.id}`,
  {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${flyToken}`,
    },
  }
);

const machineStatus = await verifyResponse.json();
console.log(`[${new Date().toISOString()}] Machine status:`, machineStatus);

if (machineStatus.state === 'failed') {
  console.error(`[${new Date().toISOString()}] Machine failed to start:`, machineStatus);
  throw new Error('Machine creation failed - check Docker image and configuration');
}
```

## Files Involved

- `supabase/functions/provision-machine/index.ts` - Machine provisioning logic
- `server/fly-machine/Dockerfile.prod` - Production Docker image
- `server/fly-machine/scripts/deploy.sh` - Deployment script
- `server/fly-machine/fly.toml` - Fly.io app configuration

---

**Status**: Awaiting investigation of Docker image existence
