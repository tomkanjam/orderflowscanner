-- ============================================================================
-- Fix Signals Table RLS Policies
-- ============================================================================
-- Purpose: Add proper tier-based access control for signals
-- Related Issue: 20251030-074721-000-fix-built-in-signals-rls-and-ownership.md
-- ============================================================================

-- Drop inadequate existing policy
DROP POLICY IF EXISTS "Users can view own signals" ON signals;

-- Policy 1: Anonymous users can view signals from anonymous-tier built-in traders
CREATE POLICY "Anonymous users can view anonymous tier signals"
  ON signals
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM traders t
      WHERE t.id = signals.trader_id
        AND t.is_built_in = true
        AND t.access_tier = 'anonymous'
        AND t.enabled = true
    )
  );

-- Policy 2: Authenticated users can view signals based on their tier
CREATE POLICY "Users can view signals based on tier"
  ON signals
  FOR SELECT
  TO authenticated
  USING (
    -- Own custom trader signals
    EXISTS (
      SELECT 1 FROM traders t
      WHERE t.id = signals.trader_id
        AND t.user_id = auth.uid()
    )
    OR
    -- Built-in trader signals based on access tier
    EXISTS (
      SELECT 1 FROM traders t
      LEFT JOIN user_subscriptions s ON s.user_id = auth.uid()
      WHERE t.id = signals.trader_id
        AND t.is_built_in = true
        AND t.enabled = true
        AND (
          -- Anonymous tier (everyone can see)
          t.access_tier = 'anonymous'
          OR
          -- Free tier
          (t.access_tier = 'free' AND s.tier IN ('free', 'pro', 'elite') AND s.status = 'active')
          OR
          -- Pro tier
          (t.access_tier = 'pro' AND s.tier IN ('pro', 'elite') AND s.status = 'active')
          OR
          -- Elite tier
          (t.access_tier = 'elite' AND s.tier = 'elite' AND s.status = 'active')
        )
    )
  );

-- Policy 3: System/service role can insert signals
CREATE POLICY "System can insert signals"
  ON signals
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- Migration Complete
-- ============================================================================
