# Apply Auto-Trigger AI Analysis Migrations

## Step 1: Apply Migration 023 (Add Toggle Columns)

Go to Supabase Dashboard → SQL Editor → New Query

Paste and run:

```sql
-- Add automation toggle columns to traders table
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS auto_analyze_signals BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_execute_trades BOOLEAN DEFAULT false;

-- Add indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_traders_auto_analyze
  ON traders(auto_analyze_signals)
  WHERE auto_analyze_signals = true;

CREATE INDEX IF NOT EXISTS idx_traders_auto_execute
  ON traders(auto_execute_trades)
  WHERE auto_execute_trades = true;

-- Add comments for documentation
COMMENT ON COLUMN traders.auto_analyze_signals IS
  'When true, automatically trigger AI analysis for new signals (Elite tier only)';

COMMENT ON COLUMN traders.auto_execute_trades IS
  'When true, automatically execute trades based on AI analysis (Elite tier only, requires auto_analyze_signals=true)';
```

## Step 2: Apply Migration 024 (Auto-Trigger Function)

**NOTE:** First, you need to set Supabase secrets for the trigger to work:

### Set Secrets (via Supabase Dashboard → Project Settings → Vault)

1. Go to Project Settings → Edge Functions → Secrets
2. Add these secrets:
   - Name: `app.service_role_key`
   - Value: Your `SUPABASE_SERVICE_ROLE_KEY` (from .env or Supabase Dashboard → Settings → API)

3. Add URL secret:
   - Name: `app.supabase_url`
   - Value: Your Supabase project URL (e.g., `https://ktyjpnvgqspdzhbwcxpe.supabase.co`)

### Then run the migration:

Go to Supabase Dashboard → SQL Editor → New Query

Paste and run:

```sql
-- Enable pg_net extension for async HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger AI analysis for new signals
CREATE OR REPLACE FUNCTION trigger_ai_analysis_on_signal()
RETURNS TRIGGER AS $$
DECLARE
  trader_record RECORD;
  analysis_payload JSONB;
  edge_function_url TEXT;
  service_role_key TEXT;
  http_request_id BIGINT;
BEGIN
  -- Get trader details with user subscription tier
  SELECT
    t.*,
    COALESCE(up.subscription_tier, 'anonymous') as subscription_tier
  INTO trader_record
  FROM traders t
  LEFT JOIN user_profiles up ON t.user_id = up.id
  WHERE t.id = NEW.trader_id;

  -- Check 1: Only Elite tier users
  IF trader_record.subscription_tier != 'elite' THEN
    RAISE LOG 'Skipping AI analysis for trader % - tier: %',
      NEW.trader_id, trader_record.subscription_tier;
    RETURN NEW;
  END IF;

  -- Check 2: Only if trader has auto_analyze_signals enabled
  IF trader_record.auto_analyze_signals != true THEN
    RAISE LOG 'Skipping AI analysis for trader % - auto_analyze_signals is disabled',
      NEW.trader_id;
    RETURN NEW;
  END IF;

  -- Get Edge Function URL from environment or use default
  edge_function_url := current_setting('app.edge_function_url', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    -- Build default URL using Supabase project reference
    edge_function_url := current_setting('app.supabase_url', true) || '/functions/v1/ai-analysis';
  END IF;

  -- Get service role key (must be set via Supabase secrets)
  service_role_key := current_setting('app.service_role_key', true);
  IF service_role_key IS NULL OR service_role_key = '' THEN
    RAISE WARNING 'Service role key not configured - cannot trigger AI analysis';
    RETURN NEW;
  END IF;

  -- Build request payload for ai-analysis Edge Function
  -- Note: We send the first symbol only (signals can have multiple)
  analysis_payload := jsonb_build_object(
    'signalId', NEW.id,
    'symbol', (NEW.symbols)[1],
    'strategy', jsonb_build_object(
      'instructions', (trader_record.strategy->>'instructions'),
      'modelTier', COALESCE(trader_record.strategy->>'modelTier', 'standard')
    ),
    'traderId', NEW.trader_id,
    'userId', trader_record.user_id,
    'timestamp', NEW.timestamp,
    'triggerSource', 'database-trigger'
  );

  -- Make async HTTP POST to ai-analysis Edge Function via pg_net
  SELECT INTO http_request_id net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key,
      'x-trigger-source', 'database-trigger',
      'x-correlation-id', NEW.id::text
    ),
    body := analysis_payload,
    timeout_milliseconds := 30000
  );

  RAISE LOG 'Triggered AI analysis for signal % (trader: %, symbol: %, request_id: %)',
    NEW.id, NEW.trader_id, (NEW.symbols)[1], http_request_id;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail signal creation
    RAISE WARNING 'Failed to trigger AI analysis for signal %: % (SQLSTATE: %)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on trader_signals INSERT
DROP TRIGGER IF EXISTS auto_trigger_ai_analysis ON trader_signals;

CREATE TRIGGER auto_trigger_ai_analysis
  AFTER INSERT ON trader_signals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_ai_analysis_on_signal();

-- Add comments for documentation
COMMENT ON FUNCTION trigger_ai_analysis_on_signal() IS
  'Automatically triggers AI analysis via Edge Function for Elite tier signals with auto_analyze_signals=true';

COMMENT ON TRIGGER auto_trigger_ai_analysis ON trader_signals IS
  'Auto-triggers AI analysis for new signals (Elite tier + auto_analyze_signals=true only)';
```

## Verification

### Check that columns were added:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'traders'
  AND column_name IN ('auto_analyze_signals', 'auto_execute_trades');
```

Expected output:
```
column_name           | data_type | column_default
----------------------+-----------+----------------
auto_analyze_signals  | boolean   | false
auto_execute_trades   | boolean   | false
```

### Check that trigger was created:

```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'auto_trigger_ai_analysis';
```

Expected output:
```
trigger_name              | event_manipulation | event_object_table
--------------------------+--------------------+--------------------
auto_trigger_ai_analysis  | INSERT             | trader_signals
```

### Check that secrets are set:

```sql
SELECT current_setting('app.service_role_key', true) IS NOT NULL as service_key_set,
       current_setting('app.supabase_url', true) IS NOT NULL as url_set;
```

Expected output:
```
service_key_set | url_set
----------------+---------
t               | t
```

If either is `f`, you need to set the secrets via Dashboard → Project Settings → Vault.

## Done!

The migrations are now applied. The trigger will automatically fire when:
1. A new signal is created (INSERT into trader_signals)
2. The trader belongs to an Elite tier user
3. The trader has `auto_analyze_signals = true`

By default, `auto_analyze_signals` is `false` for all traders (opt-in model).
