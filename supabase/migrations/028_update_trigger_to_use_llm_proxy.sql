-- Update auto-trigger to use llm-proxy instead of ai-analysis
-- Issue: context/issues/open/20251025-084409-fix-ai-analysis-trigger-integration.md
-- Purpose: Integrate with OpenRouter + Braintrust for full observability

-- Drop and recreate the trigger function with new endpoint and payload
DROP FUNCTION IF EXISTS trigger_ai_analysis_on_signal() CASCADE;

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

  -- Get Edge Function URL from Supabase Vault
  SELECT decrypted_secret INTO edge_function_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url';

  IF edge_function_url IS NULL OR edge_function_url = '' THEN
    RAISE WARNING 'project_url not found in vault - cannot trigger AI analysis';
    RETURN NEW;
  END IF;

  -- Use llm-proxy endpoint instead of ai-analysis
  edge_function_url := edge_function_url || '/functions/v1/llm-proxy';

  -- Get service role key from Supabase Vault
  SELECT decrypted_secret INTO service_role_key
  FROM vault.decrypted_secrets
  WHERE name = 'service_role_key';

  IF service_role_key IS NULL OR service_role_key = '' THEN
    RAISE WARNING 'service_role_key not found in vault - cannot trigger AI analysis';
    RETURN NEW;
  END IF;

  -- Build request payload for llm-proxy with analyze-signal operation
  -- IMPORTANT: llm-proxy expects { operation: string, params: object }
  analysis_payload := jsonb_build_object(
    'operation', 'analyze-signal',
    'params', jsonb_build_object(
      'signalId', NEW.id,
      'symbol', NEW.symbol,  -- Note: signals table has single symbol field
      'traderId', NEW.trader_id,
      'userId', trader_record.user_id,
      'timestamp', NEW.timestamp,
      'price', NEW.price_at_signal,
      'strategy', trader_record.strategy  -- Full strategy JSONB object
    )
  );

  -- Make async HTTP POST to llm-proxy Edge Function via pg_net
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
    NEW.id, NEW.trader_id, NEW.symbol, http_request_id;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail signal creation
    RAISE WARNING 'Failed to trigger AI analysis for signal %: % (SQLSTATE: %)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger on signals table
DROP TRIGGER IF EXISTS auto_trigger_ai_analysis ON signals;

CREATE TRIGGER auto_trigger_ai_analysis
  AFTER INSERT ON signals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_ai_analysis_on_signal();

-- Update comments
COMMENT ON FUNCTION trigger_ai_analysis_on_signal() IS
  'Automatically triggers AI analysis via llm-proxy Edge Function (analyze-signal operation) for Elite tier signals with auto_analyze_signals=true';

COMMENT ON TRIGGER auto_trigger_ai_analysis ON signals IS
  'Auto-triggers AI analysis via llm-proxy for new signals (Elite tier + auto_analyze_signals=true only)';
