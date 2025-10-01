-- ============================================================================
-- Cloud Execution Infrastructure Tables
-- ============================================================================
-- Purpose: Support Fly.io machine-based execution for Elite tier users
-- Feature: Each Elite user gets a dedicated Fly machine for 24/7 trading
-- Related Issue: issues/2025-09-30-fly-machine-elite-trader-execution.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend traders table with cloud execution fields
-- ----------------------------------------------------------------------------

-- Add version tracking for safe concurrent updates
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS cloud_config JSONB DEFAULT '{"enabledInCloud": false, "notifyOnSignal": true, "notifyOnAnalysis": true}'::jsonb;

-- Create index for version-based optimistic locking
CREATE INDEX IF NOT EXISTS idx_traders_version ON traders(version);

-- Add comment for documentation
COMMENT ON COLUMN traders.version IS 'Increments on each update for optimistic locking and sync';
COMMENT ON COLUMN traders.cloud_config IS 'Cloud execution preferences: {enabledInCloud, preferredRegion, cpuPriority, notifyOnSignal, notifyOnAnalysis}';

-- ----------------------------------------------------------------------------
-- 2. Cloud Machines Table
-- ----------------------------------------------------------------------------
-- Tracks Fly.io machine instances for each Elite user

CREATE TABLE IF NOT EXISTS cloud_machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id TEXT UNIQUE NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('sin', 'iad', 'fra')),
  status TEXT NOT NULL CHECK (status IN ('provisioning', 'starting', 'running', 'stopping', 'stopped', 'error')),
  cpus INTEGER NOT NULL DEFAULT 1 CHECK (cpus >= 1 AND cpus <= 8),
  memory_mb INTEGER NOT NULL DEFAULT 256,

  -- Connection info
  websocket_url TEXT,
  health_check_url TEXT,

  -- Lifecycle timestamps
  provisioned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  last_health_check TIMESTAMPTZ,

  -- Error tracking
  error_message TEXT,
  error_count INTEGER DEFAULT 0,

  -- Metadata
  fly_app_name TEXT,
  fly_machine_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one machine per user
  UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cloud_machines_user_id ON cloud_machines(user_id);
CREATE INDEX IF NOT EXISTS idx_cloud_machines_status ON cloud_machines(status);
CREATE INDEX IF NOT EXISTS idx_cloud_machines_machine_id ON cloud_machines(machine_id);

-- Comments
COMMENT ON TABLE cloud_machines IS 'Fly.io machine instances for Elite users';
COMMENT ON COLUMN cloud_machines.machine_id IS 'Fly.io machine ID from Machines API';
COMMENT ON COLUMN cloud_machines.region IS 'Fly.io region code (sin=Singapore, iad=Ashburn, fra=Frankfurt)';
COMMENT ON COLUMN cloud_machines.cpus IS 'Current vCPU allocation (1-8), dynamically scaled';

-- ----------------------------------------------------------------------------
-- 3. Cloud Metrics Table
-- ----------------------------------------------------------------------------
-- Time-series metrics for monitoring and cost tracking

CREATE TABLE IF NOT EXISTS cloud_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES cloud_machines(id) ON DELETE CASCADE,

  -- Resource metrics
  cpu_usage_vcpus NUMERIC(4,2),
  memory_used_mb INTEGER,
  memory_total_mb INTEGER,

  -- Performance metrics
  active_signals INTEGER DEFAULT 0,
  analysis_queue_depth INTEGER DEFAULT 0,
  websocket_latency_ms INTEGER,
  filter_execution_time_ms INTEGER,
  ai_analysis_time_ms INTEGER,

  -- Throughput metrics
  signals_created_count INTEGER DEFAULT 0,
  analyses_completed_count INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,

  -- Timestamp
  recorded_at TIMESTAMPTZ DEFAULT NOW(),

  -- Partition key (for future time-series partitioning)
  recorded_date DATE DEFAULT CURRENT_DATE
);

-- Indexes for time-series queries
CREATE INDEX IF NOT EXISTS idx_cloud_metrics_machine_id ON cloud_metrics(machine_id);
CREATE INDEX IF NOT EXISTS idx_cloud_metrics_recorded_at ON cloud_metrics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_metrics_machine_recorded ON cloud_metrics(machine_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_metrics_date ON cloud_metrics(recorded_date);

-- Comments
COMMENT ON TABLE cloud_metrics IS 'Time-series metrics for Fly machine monitoring (recorded every 30 seconds)';
COMMENT ON COLUMN cloud_metrics.recorded_date IS 'Partition key for time-series data (future optimization)';

-- ----------------------------------------------------------------------------
-- 4. Cloud Costs Table
-- ----------------------------------------------------------------------------
-- Track estimated costs for transparency and budgeting

CREATE TABLE IF NOT EXISTS cloud_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id UUID REFERENCES cloud_machines(id) ON DELETE SET NULL,

  -- Cost breakdown
  vcpu_hours NUMERIC(10,4) DEFAULT 0,
  cost_per_vcpu_hour NUMERIC(6,4) DEFAULT 0.02, -- $0.02/vCPU/hour (Fly.io pricing)
  total_cost_usd NUMERIC(10,4) DEFAULT 0,

  -- Billing period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Metadata
  region TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for cost queries
CREATE INDEX IF NOT EXISTS idx_cloud_costs_user_id ON cloud_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_cloud_costs_period ON cloud_costs(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_cloud_costs_user_period ON cloud_costs(user_id, period_start DESC);

-- Comments
COMMENT ON TABLE cloud_costs IS 'Cost tracking for cloud execution (aggregated hourly)';
COMMENT ON COLUMN cloud_costs.vcpu_hours IS 'Total vCPU-hours used in billing period';
COMMENT ON COLUMN cloud_costs.cost_per_vcpu_hour IS 'Pricing rate (adjustable for different regions/tiers)';

-- ----------------------------------------------------------------------------
-- 5. Cloud Events Table
-- ----------------------------------------------------------------------------
-- Audit log for machine lifecycle and operational events

CREATE TABLE IF NOT EXISTS cloud_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID NOT NULL REFERENCES cloud_machines(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event details
  event_type TEXT NOT NULL CHECK (event_type IN (
    'machine_provisioned',
    'machine_started',
    'machine_stopped',
    'machine_scaled',
    'machine_error',
    'config_synced',
    'trader_added',
    'trader_removed',
    'trader_updated',
    'signal_created',
    'analysis_completed',
    'websocket_connected',
    'websocket_disconnected',
    'health_check_failed'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')) DEFAULT 'info',
  message TEXT NOT NULL,
  details JSONB,

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for event queries
CREATE INDEX IF NOT EXISTS idx_cloud_events_machine_id ON cloud_events(machine_id);
CREATE INDEX IF NOT EXISTS idx_cloud_events_user_id ON cloud_events(user_id);
CREATE INDEX IF NOT EXISTS idx_cloud_events_created_at ON cloud_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_events_machine_created ON cloud_events(machine_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_events_type ON cloud_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cloud_events_severity ON cloud_events(severity);

-- Comments
COMMENT ON TABLE cloud_events IS 'Audit log for all cloud execution events (debugging and monitoring)';
COMMENT ON COLUMN cloud_events.details IS 'Additional context as JSON (cpu_count, error_stack, trader_id, etc)';

-- ----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------

-- Enable RLS on all new tables
ALTER TABLE cloud_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_events ENABLE ROW LEVEL SECURITY;

-- Cloud Machines: Users can only see their own machine
CREATE POLICY "Users can view their own cloud machine" ON cloud_machines
  FOR SELECT USING (auth.uid() = user_id);

-- Cloud Machines: Service role can manage all machines (for Fly.io orchestrator)
CREATE POLICY "Service role can manage all cloud machines" ON cloud_machines
  FOR ALL USING (auth.role() = 'service_role');

-- Cloud Metrics: Users can view metrics for their machine
CREATE POLICY "Users can view their machine metrics" ON cloud_metrics
  FOR SELECT USING (
    machine_id IN (
      SELECT id FROM cloud_machines WHERE user_id = auth.uid()
    )
  );

-- Cloud Metrics: Service role can write all metrics
CREATE POLICY "Service role can write all metrics" ON cloud_metrics
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Cloud Costs: Users can view their own costs
CREATE POLICY "Users can view their own costs" ON cloud_costs
  FOR SELECT USING (auth.uid() = user_id);

-- Cloud Costs: Service role can write all costs
CREATE POLICY "Service role can write all costs" ON cloud_costs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Cloud Events: Users can view events for their machine
CREATE POLICY "Users can view their machine events" ON cloud_events
  FOR SELECT USING (auth.uid() = user_id);

-- Cloud Events: Service role can write all events
CREATE POLICY "Service role can write all events" ON cloud_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 7. Triggers
-- ----------------------------------------------------------------------------

-- Update updated_at timestamp on cloud_machines
CREATE TRIGGER update_cloud_machines_updated_at
  BEFORE UPDATE ON cloud_machines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Increment trader version on update (optimistic locking)
CREATE OR REPLACE FUNCTION increment_trader_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_trader_version
  BEFORE UPDATE ON traders
  FOR EACH ROW EXECUTE FUNCTION increment_trader_version();

-- ----------------------------------------------------------------------------
-- 8. Utility Functions
-- ----------------------------------------------------------------------------

-- Function to calculate current month cost for a user
CREATE OR REPLACE FUNCTION get_current_month_cost(p_user_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(total_cost_usd), 0)
  FROM cloud_costs
  WHERE user_id = p_user_id
    AND period_start >= date_trunc('month', CURRENT_TIMESTAMP)
    AND period_end <= CURRENT_TIMESTAMP;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to get machine status for a user
CREATE OR REPLACE FUNCTION get_user_machine_status(p_user_id UUID)
RETURNS TABLE(
  machine_id TEXT,
  status TEXT,
  cpus INTEGER,
  region TEXT,
  uptime_seconds INTEGER
) AS $$
  SELECT
    machine_id,
    status,
    cpus,
    region,
    CASE
      WHEN started_at IS NOT NULL AND status = 'running'
      THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
      ELSE 0
    END as uptime_seconds
  FROM cloud_machines
  WHERE user_id = p_user_id
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to check if user has Elite tier (for cloud execution eligibility)
CREATE OR REPLACE FUNCTION user_has_cloud_access(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS(
    SELECT 1 FROM user_subscriptions
    WHERE user_id = p_user_id
      AND subscription_tier = 'ELITE'
      AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 9. Indexes for Common Queries
-- ----------------------------------------------------------------------------

-- Query: Get all active Elite users with cloud machines
CREATE INDEX IF NOT EXISTS idx_active_elite_machines ON cloud_machines(status)
  WHERE status IN ('running', 'starting');

-- Query: Find machines needing health checks
CREATE INDEX IF NOT EXISTS idx_machines_health_check ON cloud_machines(last_health_check)
  WHERE status = 'running';

-- Query: Recent metrics for dashboard
CREATE INDEX IF NOT EXISTS idx_recent_metrics ON cloud_metrics(machine_id, recorded_at DESC)
  WHERE recorded_at > NOW() - INTERVAL '1 hour';

-- ----------------------------------------------------------------------------
-- 10. Data Retention Policy (Comments for future automation)
-- ----------------------------------------------------------------------------

-- FUTURE: Implement pg_cron or scheduled function to:
-- - Delete cloud_metrics older than 30 days
-- - Archive cloud_events older than 90 days
-- - Keep cloud_costs indefinitely for billing records

COMMENT ON TABLE cloud_metrics IS 'Retention: 30 days (time-series data, automated cleanup TBD)';
COMMENT ON TABLE cloud_events IS 'Retention: 90 days (audit logs, automated archival TBD)';
COMMENT ON TABLE cloud_costs IS 'Retention: Indefinite (financial records, required for accounting)';

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- Summary:
-- - Extended traders table with version and cloud_config
-- - Created 5 new tables: cloud_machines, cloud_metrics, cloud_costs, cloud_events
-- - Set up RLS policies for user isolation and service role access
-- - Added utility functions for cost tracking and status queries
-- - Created optimized indexes for common queries
-- ============================================================================
