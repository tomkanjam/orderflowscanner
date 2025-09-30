# Deployment Guide: Go Kline Server Architecture

## Overview

This guide covers deploying the Go-based kline server architecture that replaces Redis and the data-collector service with a high-performance, in-memory Go server.

## Architecture Components

1. **Go Kline Server** (Fly.io) - In-memory kline and ticker storage with WebSocket streaming
2. **Edge Functions** (Supabase) - Server-side trader execution
3. **Database** (Supabase) - Trader and signal persistence
4. **Frontend** (Vercel) - React app with real-time updates

## Prerequisites

- [ ] Fly.io account
- [ ] Supabase project
- [ ] Vercel account (or your preferred hosting)

## Step 1: Deploy Go Kline Server to Fly.io

```bash
cd apps/kline-server

# Install Fly CLI (if not already installed)
curl -L https://fly.io/install.sh | sh

# Login to Fly
fly auth login

# Create the app (if not exists)
fly apps create vyx-kline-server

# Set API key for authentication
fly secrets set API_KEY="your-secure-api-key-here" --app vyx-kline-server

# Optional: Configure tracked symbols (comma-separated)
fly secrets set SYMBOLS="BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT" --app vyx-kline-server

# Deploy
fly deploy --app vyx-kline-server

# Scale to ensure it stays running
fly scale count 1 --app vyx-kline-server
```

Verify deployment:
```bash
fly status --app vyx-kline-server
fly logs --app vyx-kline-server

# Test health endpoint (no auth needed)
curl https://vyx-kline-server.fly.dev/health

# Test authenticated endpoint
curl -H "X-API-Key: your-api-key" https://vyx-kline-server.fly.dev/ticker/BTCUSDT
```

**Note**: The Go server:
- Stores last 500 klines per symbol/interval in memory using ring buffers
- Tracks symbols across intervals: 1m, 5m, 15m, 1h
- Provides WebSocket streaming at `/ws` for real-time updates
- Region: Amsterdam (optimal for Binance API)

## Step 2: Set Up Supabase

### 2.1 Apply Database Migrations

In Supabase Dashboard SQL Editor, run:

```sql
-- Run migrations in order
-- 001_initial_schema.sql (if not already applied)
-- 002_auth_tiers.sql (if not already applied)
-- 003_server_side_execution.sql
```

### 2.2 Enable Extensions

1. Go to Database → Extensions
2. Enable:
   - `pg_cron` (for scheduled execution)
   - `pg_net` (for HTTP requests from cron)

### 2.3 Deploy Edge Functions

```bash
cd /path/to/project/root

# Install Supabase CLI
brew install supabase/tap/supabase

# Link to your project
supabase link --project-ref your-project-ref

# Set environment secrets for Go server
supabase secrets set GO_SERVER_URL="https://vyx-kline-server.fly.dev"
supabase secrets set GO_SERVER_API_KEY="your-api-key-here"
supabase secrets set EDGE_FUNCTION_URL="https://your-project.supabase.co/functions/v1/execute-trader"

# Deploy Edge Functions
supabase functions deploy get-klines
supabase functions deploy execute-trader
supabase functions deploy trigger-executions
```

### 2.4 Set Up Scheduled Execution

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

## Step 3: Update Frontend Environment

Create/update `.env.production`:

```env
# Supabase (public keys are safe to expose)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Firebase (for Gemini AI)
NEXT_PUBLIC_FIREBASE_API_KEY=your-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project

# Go Kline Server (Edge Functions will use these via their own env vars)
GO_SERVER_URL=https://vyx-kline-server.fly.dev
# GO_SERVER_API_KEY is set in Supabase Edge Function secrets
```

## Step 4: Deploy Frontend

For Vercel:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
```

## Step 5: Monitoring & Verification

### Check Go Kline Server
```bash
fly logs -a vyx-kline-server
fly status -a vyx-kline-server

# Test health endpoint
curl https://vyx-kline-server.fly.dev/health

# Test data endpoints (with auth)
curl -H "X-API-Key: your-key" https://vyx-kline-server.fly.dev/ticker/BTCUSDT
curl -H "X-API-Key: your-key" https://vyx-kline-server.fly.dev/klines/BTCUSDT/1m
```

### Check Edge Functions
```bash
supabase functions logs get-klines
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

### Monitor Go Server Performance
In Fly.io dashboard:
- Check CPU and memory usage
- Monitor request latency
- View WebSocket connection count
- Check error rates

## Step 6: Rollback Plan

If issues arise with Go server:

1. **Go Server Issues**: Check logs and restart: `fly restart -a vyx-kline-server`
2. **Edge Function Issues**: Disable cron job temporarily:
   ```sql
   SELECT cron.unschedule('trigger-trader-executions');
   ```
3. **Authentication Issues**: Verify API keys match between Go server and Edge Functions

## Performance Targets

- Go Server: <10ms data retrieval from memory
- Edge Functions: <200ms total response time (including network to Go server)
- End-to-end signal detection: <2s from candle close
- Cost: ~$15/month for infrastructure at scale (reduced from $20 with Redis removal)

## Troubleshooting

### Data Not Flowing
1. Check Go server health: `curl https://vyx-kline-server.fly.dev/health`
2. Verify WebSocket connection to Binance in Fly logs
3. Check Go server memory usage (should be <256MB)

### Traders Not Executing
1. Check cron job is running: `SELECT * FROM cron.job`
2. Verify Edge Function logs for errors
3. Test Go server endpoints manually with curl

### Signals Not Appearing
1. Check Supabase Realtime is connected
2. Verify RLS policies allow reads
3. Check browser console for WebSocket errors

### Authentication Errors (401)
1. Verify API_KEY is set in Fly.io: `fly secrets list -a vyx-kline-server`
2. Verify GO_SERVER_API_KEY is set in Supabase: `supabase secrets list`
3. Check Edge Function logs for auth failures

## Cost Optimization

- **Fly.io**: Use shared-cpu-1x with 256MB RAM (~$5/month)
- **Supabase**: Free tier supports 500K Edge Function invocations
- **Total**: ~$10-15/month for production infrastructure
- **Savings**: ~$5/month from removing Redis/Upstash

## Next Steps

1. Set up monitoring alerts (UptimeRobot, Better Uptime) for Go server health
2. Configure error tracking (Sentry) for Edge Functions
3. Consider multi-region Go server deployment for redundancy
4. Implement usage analytics
5. Add performance monitoring and alerting

## Architecture Benefits

This Go server architecture provides:

✅ **Eliminated Redis Dependency**
- No command limits or rate restrictions
- No Redis costs (~$5/month savings)
- Simplified infrastructure

✅ **Improved Performance**
- <10ms data retrieval from in-memory storage
- No JSON parsing overhead
- Ring buffer architecture for efficient memory usage

✅ **Better Scalability**
- Can track 500+ symbols without performance degradation
- WebSocket streaming for real-time updates
- Horizontal scaling via multiple Go server instances

✅ **Reduced Complexity**
- Eliminated data-collector service
- One less deployment to manage
- Direct HTTP/WebSocket access to market data

---

**Note**: This architecture maintains sub-2s signal detection while reducing infrastructure costs by 25% and eliminating Redis command limits. The system is designed to scale to 1000+ concurrent traders with minimal cost increase.