-- Create traders table
CREATE TABLE IF NOT EXISTS traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  mode TEXT CHECK (mode IN ('demo', 'live')) DEFAULT 'demo',
  exchange_config JSONB,
  filter JSONB NOT NULL,
  strategy JSONB NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX idx_traders_enabled ON traders(enabled);
CREATE INDEX idx_traders_mode ON traders(mode);

-- Add trader_id to signals table
ALTER TABLE signals 
ADD COLUMN IF NOT EXISTS trader_id UUID REFERENCES traders(id) ON DELETE CASCADE;

-- Add index for trader_id in signals
CREATE INDEX IF NOT EXISTS idx_signals_trader_id ON signals(trader_id);

-- Add trader_id and mode to trades table
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS mode TEXT CHECK (mode IN ('demo', 'live')) DEFAULT 'demo';

-- Add index for trader_id in trades
CREATE INDEX IF NOT EXISTS idx_trades_trader_id ON trades(trader_id);
CREATE INDEX IF NOT EXISTS idx_trades_mode ON trades(mode);

-- Create exchange_credentials table (for future use)
CREATE TABLE IF NOT EXISTS exchange_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  encrypted_api_secret TEXT NOT NULL,
  testnet BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(trader_id, exchange)
);

-- Create trade_audit_log table
CREATE TABLE IF NOT EXISTS trade_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES trades(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB,
  mode TEXT CHECK (mode IN ('demo', 'live')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_audit_log ENABLE ROW LEVEL SECURITY;

-- Traders: Allow authenticated users to manage their own traders
CREATE POLICY "Users can view their own traders" ON traders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can create traders" ON traders
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own traders" ON traders
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own traders" ON traders
  FOR DELETE USING (auth.role() = 'authenticated');

-- Exchange credentials: Strict access control
CREATE POLICY "Users can view their own exchange credentials" ON exchange_credentials
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage their own exchange credentials" ON exchange_credentials
  FOR ALL USING (auth.role() = 'authenticated');

-- Trade audit log: Read-only for users
CREATE POLICY "Users can view their own trade audit logs" ON trade_audit_log
  FOR SELECT USING (auth.role() = 'authenticated');

-- Functions to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER update_traders_updated_at BEFORE UPDATE ON traders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exchange_credentials_updated_at BEFORE UPDATE ON exchange_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();