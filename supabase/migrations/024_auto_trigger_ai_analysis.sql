-- Auto-trigger AI analysis for new signals (with toggle control)
-- Issue: 20251024-115859-auto-trigger-ai-analysis.md
-- Purpose: Automatically call ai-analysis Edge Function when signals are created (Elite tier + toggle ON only)

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

  -- Get Edge Function URL from standard Supabase environment variable
  edge_function_url := current_setting('SUPABASE_URL', true);
  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RAISE WARNING 'SUPABASE_URL not configured - cannot trigger AI analysis';
    RETURN NEW;
  END IF;
  edge_function_url := edge_function_url || '/functions/v1/ai-analysis';

  -- Get service role key from standard Supabase environment variable
  service_role_key := current_setting('SUPABASE_SERVICE_ROLE_KEY', true);
  IF service_role_key IS NULL OR service_role_key = '' THEN
    RAISE WARNING 'SUPABASE_SERVICE_ROLE_KEY not configured - cannot trigger AI analysis';
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
