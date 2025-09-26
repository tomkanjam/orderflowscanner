# Deployment Guide: Centralized Architecture Migration

## Overview

This guide covers deploying the new centralized data collection and edge function execution architecture that replaces browser-based worker execution.

## Architecture Components

1. **Data Collector Service** (Fly.io) - Centralized WebSocket data aggregation
2. **Redis Cache** (Upstash) - High-performance kline and ticker storage
3. **Edge Functions** (Supabase) - Server-side trader execution
4. **Database** (Supabase) - Trader and signal persistence
5. **Frontend** (Vercel) - React app with real-time updates

## Prerequisites

- [ ] Fly.io account
- [ ] Upstash account
- [ ] Supabase project
- [ ] Vercel account (or your preferred hosting)

## Step 1: Set Up Upstash Redis

1. Create an Upstash account at https://console.upstash.com/
2. Create a new Redis database:
   - Name: `crypto-screener-cache`
   - Region: Choose closest to your users
   - Type: Regional (not Global)
3. Copy credentials:
   - `UPSTASH_REDIS_URL`
   - `UPSTASH_REDIS_TOKEN`

## Step 2: Deploy Data Collector to Fly.io

```bash
cd apps/data-collector

# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login to Fly
fly auth login

# Create the app
fly apps create ai-crypto-data-collector

# Set Redis secrets
fly secrets set UPSTASH_REDIS_URL="your-url" UPSTASH_REDIS_TOKEN="your-token"

# Deploy
fly deploy

# Scale to ensure it stays running
fly scale count 1
```

Verify deployment:
```bash
fly status
fly logs
```

## Step 3: Set Up Supabase

### 3.1 Apply Database Migrations

In Supabase Dashboard SQL Editor, run:

```sql
-- Run migrations in order
-- 001_initial_schema.sql (if not already applied)
-- 002_auth_tiers.sql (if not already applied)
-- 003_server_side_execution.sql
```

### 3.2 Enable Extensions

1. Go to Database → Extensions
2. Enable:
   - `pg_cron` (for scheduled execution)
   - `pg_net` (for HTTP requests from cron)

### 3.3 Deploy Edge Functions

```bash
cd /path/to/project/root

# Install Supabase CLI
brew install supabase/tap/supabase

# Link to your project
supabase link --project-ref your-project-ref

# Set environment secrets
supabase secrets set UPSTASH_REDIS_URL="your-url"
supabase secrets set UPSTASH_REDIS_TOKEN="your-token"
supabase secrets set EDGE_FUNCTION_URL="https://your-project.supabase.co/functions/v1/execute-trader"

# Deploy Edge Functions
supabase functions deploy execute-trader
supabase functions deploy trigger-executions
```

### 3.4 Set Up Scheduled Execution

In SQL Editor:

```sql
-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the trigger function to run every minute
SELECT cron.schedule(
  'trigger-trader-executions',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR-PROJECT.supabase.co/functions/v1/trigger-executions',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $$
);

-- Verify the schedule
SELECT * FROM cron.job;
```

## Step 4: Update Frontend Environment

Create/update `.env.production`:

```env
# Supabase (public keys are safe to expose)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Firebase (for Gemini AI)
NEXT_PUBLIC_FIREBASE_API_KEY=your-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project
```

## Step 5: Deploy Frontend

For Vercel:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
```

## Step 6: Monitoring & Verification

### Check Data Collector
```bash
fly logs -a ai-crypto-data-collector
curl https://ai-crypto-data-collector.fly.dev/health
```

### Check Edge Functions
```bash
supabase functions logs execute-trader
supabase functions logs trigger-executions
```

### Check Scheduled Jobs
```sql
-- View cron job status
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

### Monitor Redis
In Upstash console:
- Check data browser for keys
- Monitor usage metrics
- View command latency

## Step 7: Migration Rollback Plan

If issues arise:

1. **Immediate Rollback**: The frontend still contains worker code, just disabled
2. **Data Collector Issues**: Scale down Fly app: `fly scale count 0`
3. **Edge Function Issues**: Disable cron job:
   ```sql
   SELECT cron.unschedule('trigger-trader-executions');
   ```

## Performance Targets

- Data Collector: <5ms Redis write latency
- Edge Functions: <1s execution per trader
- End-to-end signal detection: <2s from candle close
- Cost: ~$20/month for infrastructure at scale

## Troubleshooting

### Data Not Flowing
1. Check data collector health: `/health` endpoint
2. Verify Redis connection in Upstash console
3. Check WebSocket connection in Fly logs

### Traders Not Executing
1. Check cron job is running: `SELECT * FROM cron.job`
2. Verify Edge Function logs for errors
3. Check Redis has fresh data (TTLs not expired)

### Signals Not Appearing
1. Check Supabase Realtime is connected
2. Verify RLS policies allow reads
3. Check browser console for WebSocket errors

## Cost Optimization

- **Fly.io**: Use shared-cpu-1x with 256MB RAM
- **Upstash**: Pay-as-you-go tier (10K requests free)
- **Supabase**: Free tier supports 500K Edge Function invocations
- **Total**: ~$20/month for Pro tier infrastructure

## Next Steps

1. Set up monitoring alerts (UptimeRobot, Better Uptime)
2. Configure error tracking (Sentry)
3. Set up backup Redis instance for failover
4. Implement usage analytics
5. Add performance monitoring

---

**Note**: This architecture reduces execution frequency by 460x (from every second to candle close) while maintaining real-time signal detection. The system is designed to scale to 1000+ concurrent traders with minimal cost increase.