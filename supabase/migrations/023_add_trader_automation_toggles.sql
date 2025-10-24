-- Add automation toggle columns to traders table
-- Issue: 20251024-115859-auto-trigger-ai-analysis.md
-- Purpose: Allow users to control auto-analysis and auto-execution per trader

ALTER TABLE traders
ADD COLUMN IF NOT EXISTS auto_analyze_signals BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS auto_execute_trades BOOLEAN DEFAULT false;

-- Add indexes for efficient filtering
-- Partial indexes only index rows where the condition is true (more efficient)
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
