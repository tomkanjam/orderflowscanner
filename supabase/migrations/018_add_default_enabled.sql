-- Migration 018: Add default_enabled column for built-in trader run control
-- Purpose: Allow admins to set which built-in traders are enabled by default for new users

-- Add default_enabled column to traders table
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS default_enabled BOOLEAN DEFAULT false;

-- Create partial index for fast filtering of built-in traders
-- Only index built-in traders since custom traders don't use this field
CREATE INDEX IF NOT EXISTS idx_traders_default_enabled
ON traders(default_enabled) WHERE is_built_in = true;

-- Set showcase traders to default_enabled = true
-- Note: PM will need to provide specific trader IDs after this migration runs
-- For now, we'll update traders based on their names (common showcase signals)
UPDATE traders
SET default_enabled = true
WHERE is_built_in = true
  AND name IN (
    'RSI Oversold Bounce',
    'Volume Spike Detector',
    'Golden Cross'
  );

-- Verify the update
-- Expected: 2-3 traders should have default_enabled = true
