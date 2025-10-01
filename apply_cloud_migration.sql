-- Apply cloud execution tables migration
-- This script can be run independently via Supabase dashboard SQL editor

-- 1. Extend traders table
ALTER TABLE traders
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS cloud_config JSONB DEFAULT '{"enabledInCloud": false, "notifyOnSignal": true, "notifyOnAnalysis": true}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_traders_version ON traders(version);

-- 2. Cloud Machines Table
CREATE TABLE IF NOT EXISTS cloud_machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id TEXT UNIQUE NOT NULL,
  region TEXT NOT NULL CHECK (region IN ('sin', 'iad', 'fra')),
  status TEXT NOT NULL CHECK (status IN ('provisioning', 'starting', 'running', 'stopping', 'stopped', 'error')),
  cpus INTEGER NOT NULL DEFAULT 1 CHECK (cpus >= 1 AND cpus <= 8),
  memory_mb INTEGER NOT NULL DEFAULT 256,
  websocket_url TEXT,
  health_check_url TEXT,
  provisioned_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  last_health_check TIMESTAMPTZ,
  error_message TEXT,
  error_count INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}'::jsonb,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_cloud_machines_user ON cloud_machines(user_id);
CREATE INDEX IF NOT EXISTS idx_cloud_machines_status ON cloud_machines(status) WHERE status IN ('running', 'starting');
CREATE INDEX IF NOT EXISTS idx_cloud_machines_version ON cloud_machines(version);

-- 3. Cloud Machine Metrics
CREATE TABLE IF NOT EXISTS cloud_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id TEXT NOT NULL REFERENCES cloud_machines(machine_id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  active_signals INTEGER DEFAULT 0,
  queue_depth INTEGER DEFAULT 0,
  cpu_usage DECIMAL(5,2) DEFAULT 0 CHECK (cpu_usage >= 0 AND cpu_usage <= 100),
  memory_usage DECIMAL(5,2) DEFAULT 0 CHECK (memory_usage >= 0 AND memory_usage <= 100),
  uptime_ms BIGINT DEFAULT 0,
  signals_processed_count INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  avg_signal_latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cloud_metrics_machine_timestamp ON cloud_metrics(machine_id, timestamp DESC);

-- 4. Cloud Cost Tracking
CREATE TABLE IF NOT EXISTS cloud_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  machine_id TEXT NOT NULL REFERENCES cloud_machines(machine_id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  runtime_hours DECIMAL(10,2) DEFAULT 0,
  estimated_cost DECIMAL(10,2) DEFAULT 0,
  signals_processed INTEGER DEFAULT 0,
  peak_cpu_usage DECIMAL(5,2),
  peak_memory_usage DECIMAL(5,2),
  UNIQUE(machine_id, date)
);

CREATE INDEX IF NOT EXISTS idx_cloud_costs_user_date ON cloud_costs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_costs_machine_date ON cloud_costs(machine_id, date DESC);

-- 5. Cloud Events Log
CREATE TABLE IF NOT EXISTS cloud_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id TEXT NOT NULL REFERENCES cloud_machines(machine_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('provision', 'start', 'stop', 'error', 'reconnect', 'health_check', 'config_update')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message TEXT,
  details JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_cloud_events_machine_timestamp ON cloud_events(machine_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_events_type_timestamp ON cloud_events(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_cloud_events_severity ON cloud_events(severity, timestamp DESC) WHERE severity IN ('error', 'critical');

-- 6. Enable RLS
ALTER TABLE cloud_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_events ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DROP POLICY IF EXISTS cloud_machines_user_policy ON cloud_machines;
CREATE POLICY cloud_machines_user_policy ON cloud_machines
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cloud_metrics_user_policy ON cloud_metrics;
CREATE POLICY cloud_metrics_user_policy ON cloud_metrics
  FOR ALL USING (
    machine_id IN (
      SELECT machine_id FROM cloud_machines WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS cloud_costs_user_policy ON cloud_costs;
CREATE POLICY cloud_costs_user_policy ON cloud_costs
  FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS cloud_events_user_policy ON cloud_events;
CREATE POLICY cloud_events_user_policy ON cloud_events
  FOR ALL USING (
    machine_id IN (
      SELECT machine_id FROM cloud_machines WHERE user_id = auth.uid()
    )
  );

-- 8. Functions
CREATE OR REPLACE FUNCTION increment_machine_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.version = OLD.version + 1;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_machine_version ON cloud_machines;
CREATE TRIGGER update_machine_version
  BEFORE UPDATE ON cloud_machines
  FOR EACH ROW
  EXECUTE FUNCTION increment_machine_version();

CREATE OR REPLACE FUNCTION record_cloud_event()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'provisioning' THEN
    INSERT INTO cloud_events (machine_id, event_type, message, user_id)
    VALUES (NEW.machine_id, 'provision', 'Machine provisioned', NEW.user_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      INSERT INTO cloud_events (machine_id, event_type, message, user_id, severity)
      VALUES (
        NEW.machine_id,
        CASE
          WHEN NEW.status = 'running' THEN 'start'
          WHEN NEW.status = 'stopped' THEN 'stop'
          WHEN NEW.status = 'error' THEN 'error'
          ELSE 'config_update'
        END,
        'Status changed from ' || OLD.status || ' to ' || NEW.status,
        NEW.user_id,
        CASE WHEN NEW.status = 'error' THEN 'error' ELSE 'info' END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS log_cloud_machine_changes ON cloud_machines;
CREATE TRIGGER log_cloud_machine_changes
  AFTER INSERT OR UPDATE ON cloud_machines
  FOR EACH ROW
  EXECUTE FUNCTION record_cloud_event();
