-- Update signal status based on analysis decision
-- Part of: Continuous monitoring system (sub-issue 002)
-- Purpose: Automatically update signal status when AI analysis completes
--
-- Flow:
--  Initial analysis decision="wait"   → signal status="monitoring"
--  Initial analysis decision="enter"  → signal status="ready"
--  Initial analysis decision="bad"    → signal status="expired"
--
-- This allows Go monitoring engine to load active monitors by querying:
--   SELECT * FROM signals WHERE status='monitoring'

CREATE OR REPLACE FUNCTION update_signal_status_from_analysis()
RETURNS TRIGGER AS $$
BEGIN
  -- Update signal status based on analysis decision
  -- Only update if this is an initial analysis (not a reanalysis)
  -- We can detect this by checking if signal already has a status set

  IF NEW.decision = 'wait' THEN
    -- Setup looks promising but not ready - start monitoring
    UPDATE signals
    SET
      status = 'monitoring',
      updated_at = NOW()
    WHERE id = NEW.signal_id;

    RAISE LOG 'Signal % status updated to monitoring (decision=wait)', NEW.signal_id;

  ELSIF NEW.decision = 'enter' OR NEW.decision = 'enter_trade' THEN
    -- Setup is ready for entry
    UPDATE signals
    SET
      status = 'ready',
      updated_at = NOW()
    WHERE id = NEW.signal_id;

    RAISE LOG 'Signal % status updated to ready (decision=enter)', NEW.signal_id;

  ELSIF NEW.decision = 'bad' OR NEW.decision = 'bad_setup' THEN
    -- Setup is invalid - expire it
    UPDATE signals
    SET
      status = 'expired',
      closed_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.signal_id;

    RAISE LOG 'Signal % status updated to expired (decision=bad)', NEW.signal_id;
  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail analysis insert
    RAISE WARNING 'Failed to update signal status for signal %: % (SQLSTATE: %)',
      NEW.signal_id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on signal_analyses table
DROP TRIGGER IF EXISTS update_signal_status_on_analysis ON signal_analyses;

CREATE TRIGGER update_signal_status_on_analysis
  AFTER INSERT ON signal_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_signal_status_from_analysis();

-- Add comments
COMMENT ON FUNCTION update_signal_status_from_analysis() IS
  'Automatically updates signal status based on AI analysis decision (wait→monitoring, enter→ready, bad→expired)';

COMMENT ON TRIGGER update_signal_status_on_analysis ON signal_analyses IS
  'Updates signal status when analysis completes - enables Go monitoring engine to load active monitors';
