# Supabase Edge Functions

## Architecture

These Edge Functions implement the server-side execution for AI traders:

1. **execute-trader**: Executes a single trader's filter code against market data
2. **trigger-executions**: Scheduled function that runs at candle close to trigger all active traders

## Setup

### 1. Install Supabase CLI

```bash
brew install supabase/tap/supabase
```

### 2. Link to your project

```bash
supabase link --project-ref your-project-ref
```

### 3. Set environment secrets

```bash
# Set Upstash Redis credentials
supabase secrets set UPSTASH_REDIS_URL="https://your-redis.upstash.io"
supabase secrets set UPSTASH_REDIS_TOKEN="your-token"

# Set Edge Function URL (after first deploy)
supabase secrets set EDGE_FUNCTION_URL="https://your-project.supabase.co/functions/v1/execute-trader"
```

### 4. Deploy functions

```bash
# Deploy execute-trader function
supabase functions deploy execute-trader

# Deploy trigger-executions function
supabase functions deploy trigger-executions
```

### 5. Set up scheduled execution

In Supabase Dashboard:

1. Go to Database → Extensions
2. Enable `pg_cron` extension
3. Go to SQL Editor and run:

```sql
-- Schedule trigger to run every minute
SELECT cron.schedule(
  'trigger-trader-executions',
  '* * * * *', -- Every minute
  $$
  SELECT
    net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/trigger-executions',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $$
);
```

## Testing

### Test execute-trader locally

```bash
supabase functions serve execute-trader --env-file ./supabase/.env.local

# In another terminal
curl -i --location --request POST 'http://localhost:54321/functions/v1/execute-trader' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"traderId":"test-id","symbols":["BTCUSDT","ETHUSDT"]}'
```

### Test trigger-executions locally

```bash
supabase functions serve trigger-executions --env-file ./supabase/.env.local

curl -i --location --request POST 'http://localhost:54321/functions/v1/trigger-executions' \
  --header 'Authorization: Bearer YOUR_ANON_KEY'
```

## Monitoring

View function logs:

```bash
supabase functions logs execute-trader
supabase functions logs trigger-executions
```

## Performance Notes

- Each trader execution is independent and can run in parallel
- Redis data is cached for 60s (tickers) and 24h (klines)
- Functions have 10s timeout by default (can be increased)
- Memory limit is 256MB by default (can be increased)

## Cost Optimization

- Executions only happen at candle close (not every second)
- 1m candles: 60x reduction
- 5m candles: 300x reduction
- 15m candles: 900x reduction
- 1h candles: 3600x reduction

Average: ~460x reduction in executions vs constant polling