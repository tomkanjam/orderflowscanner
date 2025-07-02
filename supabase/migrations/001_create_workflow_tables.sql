-- Create workflow_schedules table
CREATE TABLE IF NOT EXISTS workflow_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_type TEXT NOT NULL CHECK (workflow_type IN ('signal_monitoring', 'position_management')),
  entity_id UUID NOT NULL, -- signal_id or position_id
  trader_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL, -- '1m', '5m', '15m', etc.
  
  -- Execution tracking
  last_run_at TIMESTAMPTZ,
  last_candle_time BIGINT, -- Timestamp of last processed candle
  consecutive_errors INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_workflow_schedules_active ON workflow_schedules(symbol, interval) WHERE is_active = true;
CREATE INDEX idx_workflow_schedules_entity ON workflow_schedules(workflow_type, entity_id);
CREATE INDEX idx_workflow_schedules_trader ON workflow_schedules(trader_id);

-- Create monitoring_decisions table
CREATE TABLE IF NOT EXISTS monitoring_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL,
  
  -- Market snapshot
  timestamp TIMESTAMPTZ NOT NULL,
  price DECIMAL NOT NULL,
  volume DECIMAL,
  
  -- AI Decision
  decision TEXT NOT NULL CHECK (decision IN ('enter', 'continue', 'abandon')),
  confidence DECIMAL NOT NULL,
  reasoning TEXT NOT NULL,
  
  -- Trade plan (if entering)
  trade_plan JSONB, -- {entry, stopLoss, takeProfit, positionSize}
  
  -- Technical context
  indicators JSONB, -- All indicator values at time
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_monitoring_decisions_signal ON monitoring_decisions(signal_id, timestamp DESC);
CREATE INDEX idx_monitoring_decisions_decision ON monitoring_decisions(decision);

-- Create position_management_decisions table
CREATE TABLE IF NOT EXISTS position_management_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL, -- References positions in CCXT schema
  signal_id UUID,
  
  -- Position state
  timestamp TIMESTAMPTZ NOT NULL,
  current_pnl DECIMAL NOT NULL,
  current_pnl_pct DECIMAL NOT NULL,
  position_size DECIMAL NOT NULL,
  
  -- Management decision
  action TEXT NOT NULL CHECK (action IN ('hold', 'adjust_sl', 'adjust_tp', 'reduce', 'close')),
  confidence DECIMAL NOT NULL,
  reasoning TEXT NOT NULL,
  
  -- Action details
  action_details JSONB, -- {newStopLoss, newTakeProfit, reduceAmount, etc.}
  
  -- Market context
  market_price DECIMAL NOT NULL,
  indicators JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_position_mgmt_position ON position_management_decisions(position_id, timestamp DESC);
CREATE INDEX idx_position_mgmt_signal ON position_management_decisions(signal_id) WHERE signal_id IS NOT NULL;
CREATE INDEX idx_position_mgmt_action ON position_management_decisions(action);

-- Create workflow_execution_logs table for debugging
CREATE TABLE IF NOT EXISTS workflow_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflow_schedules(id) ON DELETE CASCADE,
  
  execution_time TIMESTAMPTZ NOT NULL,
  candle_time BIGINT NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  execution_duration_ms INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_logs_workflow ON workflow_execution_logs(workflow_id, execution_time DESC);
CREATE INDEX idx_workflow_logs_errors ON workflow_execution_logs(success) WHERE success = false;

-- Enable Row Level Security
ALTER TABLE workflow_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE position_management_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_execution_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies (users can only see their own data)
-- Note: These assume auth.uid() returns the user's ID and there's a user_id column or join path

-- For workflow_schedules (via trader)
CREATE POLICY "Users can view own workflow schedules" ON workflow_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM traders t 
      WHERE t.id = workflow_schedules.trader_id 
      AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own workflow schedules" ON workflow_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM traders t 
      WHERE t.id = workflow_schedules.trader_id 
      AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own workflow schedules" ON workflow_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM traders t 
      WHERE t.id = workflow_schedules.trader_id 
      AND t.user_id = auth.uid()
    )
  );

-- For monitoring_decisions (via signal)
CREATE POLICY "Users can view own monitoring decisions" ON monitoring_decisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM signals s
      JOIN traders t ON t.id = s.trader_id
      WHERE s.id = monitoring_decisions.signal_id 
      AND t.user_id = auth.uid()
    )
  );

-- Note: Only system should insert monitoring decisions
CREATE POLICY "System can insert monitoring decisions" ON monitoring_decisions
  FOR INSERT WITH CHECK (true); -- In production, use service role

-- Similar policies for position_management_decisions and workflow_execution_logs...

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_workflow_schedules_updated_at BEFORE UPDATE ON workflow_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();