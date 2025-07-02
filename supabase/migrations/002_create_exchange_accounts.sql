-- Create exchange accounts table for storing encrypted API credentials
CREATE TABLE IF NOT EXISTS public.exchange_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  exchange TEXT NOT NULL, -- binance, bybit, okx, etc.
  is_testnet BOOLEAN DEFAULT false,
  api_key TEXT NOT NULL, -- Encrypted
  api_secret TEXT NOT NULL, -- Encrypted
  password TEXT, -- Some exchanges require password (encrypted)
  subaccount TEXT, -- Subaccount name if applicable
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add RLS policies
ALTER TABLE public.exchange_accounts ENABLE ROW LEVEL SECURITY;

-- Users can only see their own exchange accounts
CREATE POLICY "Users can view own exchange accounts" ON public.exchange_accounts
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own exchange accounts
CREATE POLICY "Users can insert own exchange accounts" ON public.exchange_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own exchange accounts
CREATE POLICY "Users can update own exchange accounts" ON public.exchange_accounts
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own exchange accounts
CREATE POLICY "Users can delete own exchange accounts" ON public.exchange_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_exchange_accounts_user_id ON public.exchange_accounts(user_id);
CREATE INDEX idx_exchange_accounts_exchange ON public.exchange_accounts(exchange);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_exchange_accounts_updated_at
  BEFORE UPDATE ON public.exchange_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create orders table for tracking trade execution
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY, -- Exchange order ID
  signal_id TEXT, -- Reference to signal that triggered the order
  exchange_account_id UUID REFERENCES public.exchange_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  type TEXT NOT NULL CHECK (type IN ('market', 'limit', 'stop', 'stop_limit')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'open', 'closed', 'canceled', 'expired', 'rejected')),
  price DECIMAL(20, 8),
  average_price DECIMAL(20, 8),
  quantity DECIMAL(20, 8) NOT NULL,
  filled DECIMAL(20, 8) DEFAULT 0,
  remaining DECIMAL(20, 8),
  cost DECIMAL(20, 8),
  fee_currency TEXT,
  fee_cost DECIMAL(20, 8),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add RLS policies for orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own orders" ON public.orders
  FOR UPDATE USING (auth.uid() = user_id);

-- Create indexes for orders
CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_signal_id ON public.orders(signal_id);
CREATE INDEX idx_orders_exchange_account_id ON public.orders(exchange_account_id);
CREATE INDEX idx_orders_symbol ON public.orders(symbol);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at DESC);

-- Add trigger for orders updated_at
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create positions table for tracking open positions
CREATE TABLE IF NOT EXISTS public.positions (
  id TEXT PRIMARY KEY, -- Position ID (symbol + timestamp for demo, exchange ID for live)
  exchange_account_id UUID REFERENCES public.exchange_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  contracts DECIMAL(20, 8) NOT NULL,
  entry_price DECIMAL(20, 8) NOT NULL,
  mark_price DECIMAL(20, 8),
  liquidation_price DECIMAL(20, 8),
  unrealized_pnl DECIMAL(20, 8) DEFAULT 0,
  realized_pnl DECIMAL(20, 8) DEFAULT 0,
  percentage DECIMAL(10, 2) DEFAULT 0,
  margin DECIMAL(20, 8),
  maintenance_margin DECIMAL(20, 8),
  margin_ratio DECIMAL(10, 4),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Add RLS policies for positions
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own positions" ON public.positions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own positions" ON public.positions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own positions" ON public.positions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own positions" ON public.positions
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for positions
CREATE INDEX idx_positions_user_id ON public.positions(user_id);
CREATE INDEX idx_positions_exchange_account_id ON public.positions(exchange_account_id);
CREATE INDEX idx_positions_symbol ON public.positions(symbol);
CREATE INDEX idx_positions_created_at ON public.positions(created_at DESC);

-- Add trigger for positions updated_at
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();