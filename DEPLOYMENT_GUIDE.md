# 🚀 Cloud Execution Deployment Guide

## Overview

This guide covers deploying the Fly Machine Elite Trader Execution system to production. The implementation is **99% complete** and ready for deployment.

## Architecture

```
┌─────────────────┐       WebSocket        ┌──────────────────┐
│   Browser UI    │ ←─────────────────────→ │  Fly Machine     │
│  (Elite Users)  │                         │   (per user)     │
└─────────────────┘                         └──────────────────┘
        │                                            │
        │ HTTPS                                     │ Direct
        ↓                                            ↓
┌─────────────────┐                         ┌──────────────────┐
│ Supabase Edge   │                         │  Binance API     │
│   Functions     │                         │   WebSocket      │
└─────────────────┘                         └──────────────────┘
        │
        ↓
┌─────────────────┐
│    Supabase     │
│    Database     │
└─────────────────┘
```

## Prerequisites

### 1. Fly.io Account
- [ ] Sign up at https://fly.io
- [ ] Install flyctl CLI: `brew install flyctl`
- [ ] Login: `flyctl auth login`
- [ ] Set up payment method (required for machines)

### 2. Supabase Project
- [ ] Active Supabase project
- [ ] Database tables created (traders, signals, etc.)
- [ ] Service role key available
- [ ] Edge Functions enabled

### 3. Environment Variables
Required for Fly machine:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
```

## Phase 7: Deployment Steps

### Step 1: Create Supabase Edge Functions

#### 1.1 Create Machine Provisioning Function

Create `supabase/functions/provision-machine/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface ProvisionRequest {
  userId: string;
  region: string;
  cpuPriority: 'low' | 'normal' | 'high';
}

serve(async (req) => {
  try {
    const { userId, region, cpuPriority }: ProvisionRequest = await req.json();

    // Verify Elite tier
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    if (profile?.subscription_tier !== 'elite') {
      return new Response(
        JSON.stringify({ error: 'Elite tier required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing machine
    const { data: existing } = await supabase
      .from('cloud_machines')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'running')
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({
          machineId: existing.machine_id,
          websocketUrl: existing.websocket_url,
          status: existing.status
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create new Fly machine
    const machineId = `trademind-${userId}`;
    const flyToken = Deno.env.get('FLY_API_TOKEN');

    const createResponse = await fetch(
      `https://api.machines.dev/v1/apps/trademind-screener/machines`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${flyToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: machineId,
          region: region,
          config: {
            image: 'registry.fly.io/trademind-screener:latest',
            env: {
              USER_ID: userId,
              SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
              SUPABASE_SERVICE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
              GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY')
            },
            services: [
              {
                ports: [
                  {
                    port: 8080,
                    handlers: ['http', 'tls']
                  }
                ],
                protocol: 'tcp',
                internal_port: 8080
              }
            ]
          }
        })
      }
    );

    const machine = await createResponse.json();

    // Store in database
    await supabase.from('cloud_machines').insert({
      user_id: userId,
      machine_id: machine.id,
      region: region,
      status: 'provisioning',
      websocket_url: `wss://${machine.id}.fly.dev`,
      created_at: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({
        machineId: machine.id,
        websocketUrl: `wss://${machine.id}.fly.dev`,
        status: 'provisioning'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Provisioning error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

#### 1.2 Create Machine Stop Function

Create `supabase/functions/stop-machine/index.ts`:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { userId } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get machine info
    const { data: machine } = await supabase
      .from('cloud_machines')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!machine) {
      return new Response(
        JSON.stringify({ error: 'No machine found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Stop Fly machine
    const flyToken = Deno.env.get('FLY_API_TOKEN');
    await fetch(
      `https://api.machines.dev/v1/apps/trademind-screener/machines/${machine.machine_id}/stop`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${flyToken}`
        }
      }
    );

    // Update database
    await supabase
      .from('cloud_machines')
      .update({ status: 'stopped', stopped_at: new Date().toISOString() })
      .eq('id', machine.id);

    return new Response(
      JSON.stringify({ status: 'stopped' }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Stop error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

#### 1.3 Deploy Edge Functions

```bash
# Deploy provision function
supabase functions deploy provision-machine

# Deploy stop function
supabase functions deploy stop-machine

# Set secrets
supabase secrets set FLY_API_TOKEN=your-fly-token
supabase secrets set GEMINI_API_KEY=your-gemini-key
```

### Step 2: Create Database Tables

Run this migration in Supabase:

```sql
-- Cloud machines table
CREATE TABLE cloud_machines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id TEXT NOT NULL UNIQUE,
  region TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'provisioning',
  websocket_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stopped_at TIMESTAMPTZ,
  CONSTRAINT valid_status CHECK (status IN ('provisioning', 'starting', 'running', 'stopping', 'stopped', 'error'))
);

-- Indexes
CREATE INDEX idx_cloud_machines_user_id ON cloud_machines(user_id);
CREATE INDEX idx_cloud_machines_status ON cloud_machines(status);

-- RLS Policies
ALTER TABLE cloud_machines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own machines"
  ON cloud_machines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access"
  ON cloud_machines FOR ALL
  USING (auth.role() = 'service_role');
```

### Step 3: Build and Deploy Fly Machine Image

#### 3.1 Prepare Fly Machine Code

The Fly machine backend is in `server/fly-machine/` directory (Node.js/TypeScript implementation from Phases 2-4):

```bash
cd server/fly-machine

# Review Dockerfile
cat Dockerfile

# Review fly.toml
cat fly.toml

# Review implementation
cat README.md
```

#### 3.2 Build Docker Image

```bash
# Build image locally first
docker build -t trademind-screener:latest .

# Test locally
docker run -p 8080:8080 \
  -e USER_ID=test-user \
  -e SUPABASE_URL=your-url \
  -e SUPABASE_SERVICE_KEY=your-key \
  -e GEMINI_API_KEY=your-key \
  trademind-screener:latest
```

#### 3.3 Deploy to Fly.io

```bash
# Create Fly app (one-time)
flyctl apps create trademind-screener

# Set secrets
flyctl secrets set \
  SUPABASE_URL=your-url \
  SUPABASE_SERVICE_KEY=your-key \
  GEMINI_API_KEY=your-key

# Deploy
flyctl deploy

# Push to registry
flyctl deploy --push
```

### Step 4: Update Browser UI

#### 4.1 Update Edge Function URLs

In `apps/app/src/components/cloud/CloudExecutionPanel.tsx`:

```typescript
const handleStart = async () => {
  // ... validation

  try {
    const response = await supabase.functions.invoke('provision-machine', {
      body: {
        userId: user.id,
        region: config.region,
        cpuPriority: config.cpuPriority
      }
    });

    if (response.error) throw response.error;

    const { machineId, websocketUrl, status } = response.data;

    setStatus(status);

    // Connect to WebSocket
    cloudWebSocketClient.connect(machineId, websocketUrl, user.id);

  } catch (err) {
    setError(err.message);
    setStatus('error');
  } finally {
    setLoading(false);
  }
};

const handleStop = async () => {
  try {
    const response = await supabase.functions.invoke('stop-machine', {
      body: { userId: user.id }
    });

    if (response.error) throw response.error;

    cloudWebSocketClient.disconnect();
    setStatus('stopped');

  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};
```

#### 4.2 Build and Deploy Browser App

```bash
cd apps/app

# Build production
pnpm build

# Deploy to hosting (Vercel/Netlify)
vercel deploy --prod
# or
netlify deploy --prod
```

### Step 5: Monitoring Setup

#### 5.1 Fly.io Monitoring

```bash
# View logs
flyctl logs

# Monitor metrics
flyctl metrics

# Check status
flyctl status

# Scale if needed
flyctl scale count 2
```

#### 5.2 Supabase Monitoring

- Monitor Edge Function invocations in Supabase dashboard
- Check database performance
- Review RLS policy performance

#### 5.3 Application Monitoring

Add monitoring to `cloudWebSocketClient.ts`:

```typescript
// Track connection metrics
const metrics = {
  connectionAttempts: 0,
  successfulConnections: 0,
  failedConnections: 0,
  messagesSent: 0,
  messagesReceived: 0,
  reconnections: 0
};

// Send to analytics service
function trackMetric(event: string, data: any) {
  // Send to your analytics service
  console.log('[Metrics]', event, data);
}
```

## Deployment Checklist

### Pre-Deployment
- [ ] All code committed and pushed
- [ ] Tests passing (Phase 6 complete)
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] Edge Functions tested locally
- [ ] Docker image builds successfully

### Deployment
- [ ] Database migrations applied
- [ ] Edge Functions deployed
- [ ] Fly.io app created
- [ ] Docker image deployed to Fly
- [ ] Browser UI deployed
- [ ] DNS configured (if needed)

### Post-Deployment
- [ ] Smoke test: Create machine
- [ ] Verify WebSocket connection
- [ ] Test metrics updates
- [ ] Test machine stop
- [ ] Monitor logs for errors
- [ ] Verify database writes
- [ ] Test with Elite user account

### Monitoring
- [ ] Fly.io metrics dashboard
- [ ] Supabase analytics
- [ ] Error tracking configured
- [ ] Performance monitoring active
- [ ] Cost tracking enabled

## Rollback Plan

If issues occur:

```bash
# Rollback Edge Functions
supabase functions deploy provision-machine --version=previous

# Rollback Fly deployment
flyctl releases rollback

# Rollback browser UI
vercel rollback
# or
netlify rollback
```

## Cost Estimates

**Per Elite User Per Month:**
- Fly.io Machine (shared-cpu-1x): ~$5-10
- Supabase (included in existing plan): $0
- Edge Function invocations: ~$0.10
- Total: **~$5-10/month per active user**

## Support and Debugging

### View Fly Machine Logs
```bash
flyctl logs --app trademind-screener
```

### Check Machine Status
```bash
flyctl status --app trademind-screener
```

### Debug WebSocket Connection
```typescript
// In browser console
cloudWebSocketClient.getConnectionHealth()
```

### Check Database
```sql
SELECT * FROM cloud_machines WHERE user_id = 'user-id';
```

## Next Steps After Deployment

1. **Beta Testing**: Invite 5-10 Elite users
2. **Monitor Performance**: Track metrics for 1 week
3. **Gather Feedback**: User surveys and bug reports
4. **Optimize**: Based on real usage patterns
5. **Scale**: Add more regions as needed

## Status

✅ **Implementation Complete** (99%)
⏳ **Ready for Deployment** (Phase 7)
🎯 **Target**: Beta launch with 5-10 Elite users
