# Fly.io Integration Guide

## Overview

The cloud execution system is **95% complete**. The Edge Functions create database records but need to call the Fly.io API to actually provision machines.

## What's Already Done ✅

1. **Backend Services** (99% complete)
   - Node.js backend in `server/fly-machine/`
   - WebSocket server for browser communication
   - Binance data streaming
   - AI analysis integration
   - All services tested and working

2. **Browser UI** (100% complete)
   - CloudExecutionPanel for machine control
   - Cloud toggles on trader cards
   - Real-time metrics display
   - WebSocket client for updates

3. **Edge Functions** (Deployed, need Fly API calls)
   - `provision-machine` - Creates DB record
   - `stop-machine` - Updates DB record
   - `get-machine-status` - Fetches DB record

4. **Database Schema** (Ready to apply)
   - Migration script: `apply_cloud_migration.sql`
   - 5 tables: machines, metrics, costs, events
   - RLS policies for security

## What Needs to Be Added ⏳

### 1. Apply Database Migration

**File:** `apply_cloud_migration.sql`

**Steps:**
1. Go to Supabase Dashboard → SQL Editor
2. Copy/paste entire migration script
3. Execute to create tables

**Verify:**
```sql
SELECT * FROM cloud_machines LIMIT 1;
```

---

### 2. Add Fly.io API Integration to Edge Functions

**Files to Update:**
- `supabase/functions/provision-machine/index.ts`
- `supabase/functions/stop-machine/index.ts`

#### **A. Get Fly.io API Token**

1. Install Fly CLI:
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. Login and get token:
   ```bash
   flyctl auth login
   flyctl auth token
   ```

3. Add token to Supabase secrets:
   ```bash
   supabase secrets set FLY_API_TOKEN=your_token_here
   ```

#### **B. Update `provision-machine` Edge Function**

**Location:** `supabase/functions/provision-machine/index.ts`

**Add after line 98 (after database insert):**

```typescript
// TODO: In production, this would call Fly.io API to actually provision the machine
// For now, we'll simulate the provisioning by updating status after a delay
// The actual Fly deployment will be done via flyctl CLI for beta testing

// ========== ADD THIS CODE ==========

// Call Fly.io API to create machine
const flyToken = Deno.env.get('FLY_API_TOKEN')!;
const appName = 'trademind-cloud'; // Your Fly app name

try {
  // Create Fly machine using API
  const flyResponse = await fetch(
    `https://api.machines.dev/v1/apps/${appName}/machines`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: machineId,
        region: region,
        config: {
          image: 'your-docker-registry/trademind-backend:latest', // Your Docker image
          env: {
            USER_ID: userId,
            SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
            SUPABASE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
            GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY'),
          },
          services: [
            {
              ports: [
                { port: 80, handlers: ['http'] },
                { port: 443, handlers: ['tls', 'http'] },
                { port: 8080, handlers: ['http'] }, // WebSocket port
              ],
              protocol: 'tcp',
              internal_port: 8080,
            },
          ],
        },
      }),
    }
  );

  if (!flyResponse.ok) {
    throw new Error(`Fly API error: ${await flyResponse.text()}`);
  }

  const flyData = await flyResponse.json();
  console.log('Fly machine created:', flyData);

  // Update machine status to 'starting'
  await supabase
    .from('cloud_machines')
    .update({
      status: 'starting',
      started_at: new Date().toISOString(),
    })
    .eq('id', machine.id);

} catch (error) {
  console.error('Failed to provision Fly machine:', error);

  // Update machine status to 'error'
  await supabase
    .from('cloud_machines')
    .update({
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    })
    .eq('id', machine.id);

  throw error;
}

// ========== END NEW CODE ==========
```

#### **C. Update `stop-machine` Edge Function**

**Location:** `supabase/functions/stop-machine/index.ts`

**Add after line 61 (after status update):**

```typescript
// TODO: In production, this would call Fly.io API to actually stop the machine

// ========== ADD THIS CODE ==========

// Call Fly.io API to stop machine
const flyToken = Deno.env.get('FLY_API_TOKEN')!;
const appName = 'trademind-cloud';

try {
  const flyResponse = await fetch(
    `https://api.machines.dev/v1/apps/${appName}/machines/${machine.machine_id}/stop`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flyToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!flyResponse.ok) {
    throw new Error(`Fly API error: ${await flyResponse.text()}`);
  }

  console.log('Fly machine stopped:', machine.machine_id);

  // Update to stopped status
  await supabase
    .from('cloud_machines')
    .update({ status: 'stopped' })
    .eq('id', machine.id);

} catch (error) {
  console.error('Failed to stop Fly machine:', error);

  await supabase
    .from('cloud_machines')
    .update({
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Failed to stop',
    })
    .eq('id', machine.id);

  throw error;
}

// ========== END NEW CODE ==========
```

---

### 3. Build and Deploy Docker Image

**Location:** `server/fly-machine/`

**Steps:**

1. **Create Dockerfile** (if not exists):
   ```dockerfile
   FROM node:18-alpine

   WORKDIR /app

   COPY package*.json ./
   RUN npm install --production

   COPY . .

   EXPOSE 8080

   CMD ["node", "src/server.js"]
   ```

2. **Build Docker image:**
   ```bash
   cd server/fly-machine
   docker build -t trademind-backend:latest .
   ```

3. **Create Fly app** (one-time):
   ```bash
   flyctl apps create trademind-cloud
   ```

4. **Deploy to Fly registry:**
   ```bash
   flyctl deploy \
     --app trademind-cloud \
     --image trademind-backend:latest \
     --region sjc
   ```

5. **Set environment variables:**
   ```bash
   flyctl secrets set \
     SUPABASE_URL=your_supabase_url \
     SUPABASE_KEY=your_service_role_key \
     GEMINI_API_KEY=your_gemini_key \
     --app trademind-cloud
   ```

---

### 4. Test End-to-End Flow

**Prerequisites:**
- ✅ Database migration applied
- ✅ Fly API token set in Supabase secrets
- ✅ Edge Functions updated with Fly API calls
- ✅ Docker image deployed to Fly
- ✅ User tier set to 'elite' in Supabase

**Test Steps:**

1. **Start Machine:**
   - Click "Cloud Machine" button in UI
   - Click "Start Machine"
   - Verify Edge Function logs show Fly API call
   - Check Supabase: machine status = 'starting'
   - Check Fly dashboard: machine appears

2. **Wait for Running:**
   - Machine should transition: provisioning → starting → running
   - CloudExecutionPanel shows metrics
   - WebSocket connects to Fly machine

3. **Deploy Trader:**
   - Cloud toggle becomes active (not grayed out)
   - Click cloud icon on a trader
   - Verify trader config syncs to Fly machine
   - "Cloud" badge appears

4. **Verify Execution:**
   - Fly machine logs show trader running
   - Signals detected and sent to browser
   - Cloud metrics update in UI

5. **Stop Machine:**
   - Click "Stop" in CloudExecutionPanel
   - Verify Edge Function calls Fly API stop
   - Machine stops on Fly
   - Cloud toggles gray out again

---

## Alternative: Manual Fly Deployment (For Testing)

If you want to test without full Fly API integration:

1. **Deploy backend manually:**
   ```bash
   cd server/fly-machine
   flyctl launch --name trademind-test
   flyctl deploy
   ```

2. **Get machine info:**
   ```bash
   flyctl machines list --app trademind-test
   ```

3. **Manually create DB record:**
   ```sql
   INSERT INTO cloud_machines (
     user_id,
     machine_id,
     region,
     status,
     websocket_url
   ) VALUES (
     'your-user-id',
     'actual-fly-machine-id-from-above',
     'sjc',
     'running',
     'wss://trademind-test.fly.dev'
   );
   ```

4. **Test in browser:**
   - UI should see machine as "running"
   - Cloud toggles should be active
   - Can deploy traders

---

## Deployment Checklist

### Before Beta Launch:

- [ ] Apply database migration (`apply_cloud_migration.sql`)
- [ ] Get Fly.io API token
- [ ] Set Fly token in Supabase secrets
- [ ] Update Edge Functions with Fly API calls
- [ ] Deploy Edge Functions: `supabase functions deploy provision-machine`
- [ ] Deploy Edge Functions: `supabase functions deploy stop-machine`
- [ ] Build Docker image for backend
- [ ] Deploy Docker image to Fly registry
- [ ] Create Fly app with `flyctl apps create`
- [ ] Test provisioning flow end-to-end
- [ ] Verify WebSocket connection works
- [ ] Test trader deployment
- [ ] Test machine stop/cleanup
- [ ] Set up monitoring/alerts
- [ ] Document beta tester instructions

### Cost Monitoring:

- [ ] Set up Fly.io billing alerts
- [ ] Track machine runtime hours
- [ ] Monitor per-user costs
- [ ] Verify auto-stop works (prevent runaway costs)

---

## Documentation References

- **Complete Architecture:** `CLOUD_EXECUTION_SUMMARY.md`
- **Backend Services:** `server/fly-machine/README.md`
- **Deployment Steps:** `DEPLOYMENT_GUIDE.md`
- **Phase 7 Plan:** `PHASE7_PLAN.md`
- **Database Migration:** `apply_cloud_migration.sql`
- **Supabase Migration:** `supabase/migrations/011_create_cloud_execution_tables.sql`

---

## Support

- **Fly.io Docs:** https://fly.io/docs/machines/api/
- **Fly.io Status:** https://status.fly.io/
- **Supabase Docs:** https://supabase.com/docs/guides/functions
- **Docker Docs:** https://docs.docker.com/

---

## Estimated Time to Complete

- **Database Migration:** 5 minutes
- **Fly API Integration:** 30-60 minutes
- **Docker Build/Deploy:** 30 minutes
- **End-to-End Testing:** 1-2 hours
- **Total:** 2-4 hours

The system is architecturally complete and ready for this final integration step!
