-- ============================================================================
-- Add Source Field to Signals Table
-- ============================================================================
-- Purpose: Enable differentiation between local and cloud execution signals
-- Related Issue: issues/2025-10-02-cloud-execution-state-awareness.md
-- ============================================================================

-- Add source column to differentiate local vs cloud signals
ALTER TABLE signals ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'local';
ALTER TABLE signals ADD CONSTRAINT signals_source_check CHECK (source IN ('local', 'cloud'));

-- Add machine_id reference for cloud signals
ALTER TABLE signals ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES cloud_machines(id) ON DELETE SET NULL;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_signals_source ON signals(source);
CREATE INDEX IF NOT EXISTS idx_signals_machine_id ON signals(machine_id);
CREATE INDEX IF NOT EXISTS idx_signals_trader_source ON signals(trader_id, source);

-- Add comments for documentation
COMMENT ON COLUMN signals.source IS 'Execution source: local (browser) or cloud (Fly.io machine)';
COMMENT ON COLUMN signals.machine_id IS 'Reference to cloud_machines table for cloud-sourced signals';

-- Update existing signals to have source='local'
-- (Already done by DEFAULT, but explicit for clarity)
UPDATE signals SET source = 'local' WHERE source IS NULL;

-- Make source NOT NULL after setting defaults
ALTER TABLE signals ALTER COLUMN source SET NOT NULL;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Next Steps:
-- 1. Update Fly machine StateSynchronizer to write source='cloud' and machine_id
-- 2. Update local signal creation to explicitly write source='local'
-- 3. Update TypeScript interfaces to include source field
-- ============================================================================
