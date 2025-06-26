-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'premium')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Strategies table
CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL, -- Natural language strategy description
  filter_code TEXT NOT NULL, -- Generated filter code
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('bad_setup', 'good_setup', 'monitoring', 'entered')),
  reasoning TEXT NOT NULL,
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  analysis JSONB NOT NULL, -- Full AI analysis data
  key_levels JSONB, -- Entry, stop loss, take profit levels
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique symbol per strategy for active items
  UNIQUE(strategy_id, symbol)
);

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  strategy_id UUID REFERENCES strategies(id) ON DELETE CASCADE,
  watchlist_id UUID REFERENCES watchlist(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price DECIMAL(20,8),
  current_price DECIMAL(20,8),
  stop_loss DECIMAL(20,8),
  take_profit JSONB, -- Array of TP levels
  position_size DECIMAL(20,8),
  trade_plan TEXT NOT NULL,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'closed')),
  closed_at TIMESTAMPTZ,
  pnl DECIMAL(20,8),
  pnl_percentage DECIMAL(8,4),
  close_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  watchlist_id UUID REFERENCES watchlist(id) ON DELETE CASCADE,
  trade_id UUID REFERENCES trades(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('setup_ready', 'enter_trade', 'stop_loss', 'take_profit', 'strategy_update')),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log for all changes
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_strategies_user_id ON strategies(user_id);
CREATE INDEX idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX idx_watchlist_strategy_id ON watchlist(strategy_id);
CREATE INDEX idx_watchlist_symbol ON watchlist(symbol);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_alerts_user_id ON alerts(user_id);
CREATE INDEX idx_alerts_is_read ON alerts(is_read);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_watchlist_updated_at BEFORE UPDATE ON watchlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (assuming auth.uid() returns the user's UUID)
-- Users can only see their own data
CREATE POLICY users_policy ON users
  FOR ALL USING (id = auth.uid());

CREATE POLICY strategies_policy ON strategies
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY watchlist_policy ON watchlist
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY trades_policy ON trades
  FOR ALL USING (user_id = auth.uid());

CREATE POLICY alerts_policy ON alerts
  FOR ALL USING (user_id = auth.uid());