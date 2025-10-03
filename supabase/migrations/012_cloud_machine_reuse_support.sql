-- ============================================================================
-- Cloud Machine Reuse Support
-- ============================================================================
-- Purpose: Add helper function and event type for machine record reuse
-- Related Issue: issues/2025-10-02-fix-cloud-machine-reuse.md
-- ============================================================================

-- Helper function for atomic error count increment
CREATE OR REPLACE FUNCTION increment_machine_error_count(p_machine_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE cloud_machines
  SET
    error_count = error_count + 1,
    updated_at = NOW()
  WHERE id = p_machine_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_machine_error_count IS 'Atomically increments error_count for a machine to avoid race conditions';

-- Extend cloud_events event_type constraint to include retry event and existing types
ALTER TABLE cloud_events DROP CONSTRAINT IF EXISTS cloud_events_event_type_check;
ALTER TABLE cloud_events ADD CONSTRAINT cloud_events_event_type_check
  CHECK (event_type IN (
    'provision',
    'error',
    'stop',
    'start',
    'config_update',
    'machine_provisioned',
    'machine_started',
    'machine_stopped',
    'machine_scaled',
    'machine_error',
    'machine_retry',  -- NEW: For retry after error/stopped
    'config_synced',
    'trader_added',
    'trader_removed',
    'trader_updated',
    'signal_created',
    'analysis_completed',
    'websocket_connected',
    'websocket_disconnected',
    'health_check_failed'
  ));

-- ============================================================================
-- Migration Complete
-- ============================================================================
