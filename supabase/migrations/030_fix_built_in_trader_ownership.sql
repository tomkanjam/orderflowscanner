-- ============================================================================
-- Fix Built-in Trader Ownership Data
-- ============================================================================
-- Purpose: Set user_id = NULL for built-in traders and their signals
-- Related Issue: 20251030-074721-000-fix-built-in-signals-rls-and-ownership.md
-- ============================================================================

-- Fix built-in traders: set user_id = NULL
UPDATE traders
SET user_id = NULL
WHERE is_built_in = true
  AND user_id IS NOT NULL;

-- Fix signals from built-in traders: set user_id = NULL
UPDATE signals
SET user_id = NULL
WHERE trader_id IN (
  SELECT id FROM traders WHERE is_built_in = true
)
AND user_id IS NOT NULL;

-- Verify the fix
DO $$
DECLARE
  bad_trader_count INTEGER;
  bad_signal_count INTEGER;
BEGIN
  -- Check for built-in traders with non-NULL user_id
  SELECT COUNT(*) INTO bad_trader_count
  FROM traders
  WHERE is_built_in = true AND user_id IS NOT NULL;

  -- Check for signals from built-in traders with non-NULL user_id
  SELECT COUNT(*) INTO bad_signal_count
  FROM signals s
  JOIN traders t ON t.id = s.trader_id
  WHERE t.is_built_in = true AND s.user_id IS NOT NULL;

  IF bad_trader_count > 0 OR bad_signal_count > 0 THEN
    RAISE EXCEPTION 'Data migration failed: % built-in traders and % signals still have non-NULL user_id',
      bad_trader_count, bad_signal_count;
  END IF;

  RAISE NOTICE 'Data migration successful: All built-in traders and their signals now have user_id = NULL';
END $$;

-- ============================================================================
-- Migration Complete
-- ============================================================================
