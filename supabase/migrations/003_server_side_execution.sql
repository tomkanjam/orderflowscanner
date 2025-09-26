-- Migration for server-side execution architecture

-- Add execution interval to traders table
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS execution_interval TEXT DEFAULT '5m',
ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_execution TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS execution_count INTEGER DEFAULT 0;

-- Create trader_signals table for storing matched signals
CREATE TABLE IF NOT EXISTS trader_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  symbols TEXT[] NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_trader_signals_trader_id ON trader_signals(trader_id);
CREATE INDEX IF NOT EXISTS idx_trader_signals_timestamp ON trader_signals(timestamp DESC);

-- Create table for execution history (for debugging/monitoring)
CREATE TABLE IF NOT EXISTS execution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  symbols_checked INTEGER,
  symbols_matched INTEGER,
  execution_time_ms INTEGER,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_history_trader_id ON execution_history(trader_id);
CREATE INDEX IF NOT EXISTS idx_execution_history_started_at ON execution_history(started_at DESC);

-- Enable Row Level Security
ALTER TABLE trader_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for trader_signals
CREATE POLICY "Users can view their own signals"
  ON trader_signals
  FOR SELECT
  USING (
    trader_id IN (
      SELECT id FROM traders WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert signals"
  ON trader_signals
  FOR INSERT
  WITH CHECK (true); -- Edge functions use service role

-- RLS policies for execution_history
CREATE POLICY "Users can view their own execution history"
  ON execution_history
  FOR SELECT
  USING (
    trader_id IN (
      SELECT id FROM traders WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert execution history"
  ON execution_history
  FOR INSERT
  WITH CHECK (true); -- Edge functions use service role

-- Function to get active traders for an interval
CREATE OR REPLACE FUNCTION get_active_traders_for_interval(p_interval TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  filter JSONB,
  tier TEXT,
  user_id UUID
) AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.filter, t.tier, t.user_id
  FROM traders t
  WHERE t.enabled = true
  AND t.execution_interval = p_interval;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old execution history (keep last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_execution_history()
RETURNS void AS $$
BEGIN
  DELETE FROM execution_history
  WHERE created_at < NOW() - INTERVAL '7 days';

  DELETE FROM trader_signals
  WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (requires pg_cron extension)
-- This would be set up in Supabase dashboard or via API:
-- SELECT cron.schedule('cleanup-execution-history', '0 3 * * *', 'SELECT cleanup_old_execution_history();');