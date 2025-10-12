-- Migration: Trader State Tracking for Shared Go Backend
-- Purpose: Add state management tables for the shared multi-tenant trader execution system
-- Date: 2025-10-12

-- Create trader_state table to track runtime state of traders
CREATE TABLE IF NOT EXISTS trader_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,

  -- State information
  state TEXT NOT NULL CHECK (state IN ('stopped', 'starting', 'running', 'stopping', 'error')),

  -- Lifecycle timestamps
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,

  -- Error tracking
  last_error TEXT,
  error_count INTEGER DEFAULT 0,

  -- Performance metrics
  signal_count INTEGER DEFAULT 0,
  execution_count INTEGER DEFAULT 0,
  avg_execution_duration_ms NUMERIC(10, 2),

  -- Resource tracking
  goroutine_id TEXT, -- Internal tracking ID
  machine_id TEXT,   -- For distributed deployment

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure only one active state per trader
  UNIQUE(trader_id)
);

-- Create trader_execution_history table for audit trail
CREATE TABLE IF NOT EXISTS trader_execution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,

  -- Execution details
  started_at TIMESTAMPTZ NOT NULL,
  stopped_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,

  -- Results
  symbols_scanned INTEGER DEFAULT 0,
  signals_generated INTEGER DEFAULT 0,

  -- State transition
  initial_state TEXT NOT NULL,
  final_state TEXT NOT NULL,

  -- Error information
  error TEXT,

  -- Resource information
  machine_id TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trader_resource_usage table for quota tracking
CREATE TABLE IF NOT EXISTS trader_resource_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Resource metrics
  active_traders INTEGER DEFAULT 0,
  max_traders INTEGER NOT NULL, -- Based on subscription tier

  -- Usage statistics
  total_executions INTEGER DEFAULT 0,
  total_signals_generated INTEGER DEFAULT 0,
  total_runtime_minutes INTEGER DEFAULT 0,

  -- Billing period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Metadata
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'elite')),
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One record per user per billing period
  UNIQUE(user_id, period_start)
);

-- Create indexes for performance
CREATE INDEX idx_trader_state_trader_id ON trader_state(trader_id);
CREATE INDEX idx_trader_state_state ON trader_state(state);
CREATE INDEX idx_trader_state_updated_at ON trader_state(updated_at);

CREATE INDEX idx_trader_execution_history_trader_id ON trader_execution_history(trader_id);
CREATE INDEX idx_trader_execution_history_started_at ON trader_execution_history(started_at);
CREATE INDEX idx_trader_execution_history_final_state ON trader_execution_history(final_state);

CREATE INDEX idx_trader_resource_usage_user_id ON trader_resource_usage(user_id);
CREATE INDEX idx_trader_resource_usage_tier ON trader_resource_usage(tier);
CREATE INDEX idx_trader_resource_usage_period ON trader_resource_usage(period_start, period_end);

-- Enable RLS
ALTER TABLE trader_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE trader_execution_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE trader_resource_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trader_state
CREATE POLICY "Users can view state of their own traders" ON trader_state
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM traders
      WHERE traders.id = trader_state.trader_id
      AND traders.user_id = auth.uid()
    )
  );

-- Only service role can modify trader state (managed by Go backend)
CREATE POLICY "Service role can manage trader state" ON trader_state
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for trader_execution_history
CREATE POLICY "Users can view execution history of their own traders" ON trader_execution_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM traders
      WHERE traders.id = trader_execution_history.trader_id
      AND traders.user_id = auth.uid()
    )
  );

-- Only service role can write execution history
CREATE POLICY "Service role can manage execution history" ON trader_execution_history
  FOR ALL USING (auth.role() = 'service_role');

-- RLS Policies for trader_resource_usage
CREATE POLICY "Users can view their own resource usage" ON trader_resource_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Only service role can manage resource usage
CREATE POLICY "Service role can manage resource usage" ON trader_resource_usage
  FOR ALL USING (auth.role() = 'service_role');

-- Function to update trader_state.updated_at
CREATE TRIGGER update_trader_state_updated_at
  BEFORE UPDATE ON trader_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trader_resource_usage_updated_at
  BEFORE UPDATE ON trader_resource_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create resource usage record for new users
CREATE OR REPLACE FUNCTION initialize_resource_usage_for_user()
RETURNS TRIGGER AS $$
DECLARE
  max_traders_limit INTEGER;
BEGIN
  -- Determine max traders based on tier
  max_traders_limit := CASE NEW.tier
    WHEN 'free' THEN 0
    WHEN 'pro' THEN 10
    WHEN 'elite' THEN 1000 -- Effectively unlimited
    ELSE 0
  END;

  -- Create initial resource usage record for current billing period
  INSERT INTO trader_resource_usage (
    user_id,
    max_traders,
    tier,
    period_start,
    period_end
  ) VALUES (
    NEW.user_id,
    max_traders_limit,
    NEW.tier,
    DATE_TRUNC('month', NOW()),
    DATE_TRUNC('month', NOW() + INTERVAL '1 month')
  )
  ON CONFLICT (user_id, period_start) DO UPDATE
  SET max_traders = max_traders_limit,
      tier = NEW.tier;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to initialize resource usage on subscription creation/update
CREATE TRIGGER on_subscription_change
AFTER INSERT OR UPDATE OF tier ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION initialize_resource_usage_for_user();

-- Function to track active traders count
CREATE OR REPLACE FUNCTION update_active_traders_count()
RETURNS TRIGGER AS $$
DECLARE
  user_uuid UUID;
  active_count INTEGER;
BEGIN
  -- Get user_id from trader
  SELECT user_id INTO user_uuid
  FROM traders
  WHERE id = COALESCE(NEW.trader_id, OLD.trader_id);

  -- Count currently active traders for this user
  SELECT COUNT(*) INTO active_count
  FROM trader_state ts
  JOIN traders t ON ts.trader_id = t.id
  WHERE t.user_id = user_uuid
  AND ts.state IN ('starting', 'running');

  -- Update current period's resource usage
  UPDATE trader_resource_usage
  SET active_traders = active_count,
      updated_at = NOW()
  WHERE user_id = user_uuid
  AND period_start <= NOW()
  AND period_end > NOW();

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update active traders count on state changes
CREATE TRIGGER on_trader_state_change
AFTER INSERT OR UPDATE OF state OR DELETE ON trader_state
FOR EACH ROW
EXECUTE FUNCTION update_active_traders_count();

-- View for easy trader status monitoring
CREATE OR REPLACE VIEW trader_status_view AS
SELECT
  t.id as trader_id,
  t.name,
  t.user_id,
  t.enabled,
  ts.state,
  ts.started_at,
  ts.stopped_at,
  ts.last_run_at,
  ts.signal_count,
  ts.execution_count,
  ts.last_error,
  ts.error_count,
  us.tier as user_tier,
  ru.active_traders,
  ru.max_traders
FROM traders t
LEFT JOIN trader_state ts ON t.id = ts.trader_id
LEFT JOIN user_subscriptions us ON t.user_id = us.user_id
LEFT JOIN trader_resource_usage ru ON t.user_id = ru.user_id
  AND ru.period_start <= NOW()
  AND ru.period_end > NOW()
WHERE t.ownership_type = 'user'
ORDER BY ts.updated_at DESC NULLS LAST;

-- Grant access to the view
GRANT SELECT ON trader_status_view TO authenticated;

-- Comment on tables
COMMENT ON TABLE trader_state IS 'Runtime state tracking for traders in the shared Go backend';
COMMENT ON TABLE trader_execution_history IS 'Audit trail of trader execution sessions';
COMMENT ON TABLE trader_resource_usage IS 'Per-user resource tracking and quota enforcement';
COMMENT ON VIEW trader_status_view IS 'Consolidated view of trader status with user tier information';
