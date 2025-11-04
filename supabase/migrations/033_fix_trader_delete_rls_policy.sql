-- ============================================================================
-- Fix Trader DELETE RLS Policy
-- ============================================================================
-- Purpose: Add admin check back to trader deletion policy
-- Issue: Admin users cannot delete traders because policy only checks user_id
-- Root cause: Migration 004 created policy with admin check, but it's missing in DB
-- ============================================================================

-- Drop the existing incomplete policy
DROP POLICY IF EXISTS "Users can delete their own traders" ON traders;

-- Recreate with proper admin check
CREATE POLICY "Users can delete their own traders" ON traders
  FOR DELETE USING (
    -- User owns the trader
    auth.uid() = user_id
    OR
    -- User is an admin (can delete any trader)
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ============================================================================
-- Migration Complete
-- ============================================================================
