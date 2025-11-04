# Design Positions Schema and Lifecycle

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 12:50:04

## Context

Need database schema to track positions (open trades) and their complete lifecycle from creation through closure. This is the foundation for all trade execution.

**Requirements:**
- Track position state (created → submitting → open → closing → closed)
- Store entry/exit prices, quantities, PnL
- Link to parent signal and trader
- Support partial fills and scale-in/out
- Full audit trail with timestamps

## Linked Items

- Part of: `context/issues/open/20251104-125004-000-PROJECT-trade-execution-infrastructure.md`
- Blocks: All other trade execution sub-issues
- Related: `context/issues/open/20251025-102927-003-position-management-workflow.md`

## Progress

**Status:** Not started

## Spec

### Database Schema

**positions table:**
```sql
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  trader_id UUID NOT NULL REFERENCES traders(id),
  signal_id UUID NOT NULL REFERENCES signals(id),

  -- Position details
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
  status VARCHAR(20) NOT NULL CHECK (status IN
    ('created', 'submitting', 'open', 'monitoring', 'closing', 'closed', 'failed')),

  -- Entry details
  entry_price DECIMAL(20, 8),
  entry_quantity DECIMAL(20, 8),
  entry_value DECIMAL(20, 8), -- USDT value at entry
  entry_time TIMESTAMPTZ,
  entry_order_id VARCHAR(100), -- Binance order ID

  -- Exit details
  exit_price DECIMAL(20, 8),
  exit_quantity DECIMAL(20, 8),
  exit_value DECIMAL(20, 8),
  exit_time TIMESTAMPTZ,
  exit_order_id VARCHAR(100),

  -- PnL
  realized_pnl DECIMAL(20, 8), -- Final PnL in USDT
  realized_pnl_percent DECIMAL(10, 4), -- % return
  fees_paid DECIMAL(20, 8), -- Total fees (entry + exit)

  -- Risk management
  stop_loss_price DECIMAL(20, 8),
  take_profit_price DECIMAL(20, 8),
  max_loss_usdt DECIMAL(20, 8), -- Risk limit for this position

  -- Metadata
  is_paper_trade BOOLEAN DEFAULT false,
  failure_reason TEXT,
  metadata JSONB, -- Flexible storage for additional data

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_positions_trader_id ON positions(trader_id);
CREATE INDEX idx_positions_signal_id ON positions(signal_id);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_symbol ON positions(symbol);
CREATE INDEX idx_positions_created_at ON positions(created_at DESC);
```

**orders table:**
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Order details
  binance_order_id VARCHAR(100), -- Exchange order ID
  client_order_id VARCHAR(100), -- Our tracking ID
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL CHECK (side IN ('buy', 'sell')),
  type VARCHAR(20) NOT NULL CHECK (type IN ('market', 'limit', 'stop_loss', 'take_profit')),

  -- Quantities
  quantity DECIMAL(20, 8) NOT NULL,
  filled_quantity DECIMAL(20, 8) DEFAULT 0,
  price DECIMAL(20, 8), -- Limit price (null for market)

  -- Status
  status VARCHAR(20) NOT NULL CHECK (status IN
    ('created', 'submitted', 'partially_filled', 'filled', 'cancelled', 'failed')),

  -- Execution details
  avg_fill_price DECIMAL(20, 8),
  total_value DECIMAL(20, 8), -- filled_quantity * avg_fill_price
  fees DECIMAL(20, 8),

  -- Metadata
  is_paper_trade BOOLEAN DEFAULT false,
  error_message TEXT,
  raw_response JSONB, -- Full exchange response

  submitted_at TIMESTAMPTZ,
  filled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_position_id ON orders(position_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_binance_order_id ON orders(binance_order_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
```

**trades table (individual fills):**
```sql
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id),
  position_id UUID NOT NULL REFERENCES positions(id),

  -- Trade details
  binance_trade_id VARCHAR(100),
  symbol VARCHAR(20) NOT NULL,
  side VARCHAR(10) NOT NULL,

  -- Execution
  price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  value DECIMAL(20, 8) NOT NULL, -- price * quantity
  fee DECIMAL(20, 8),
  fee_asset VARCHAR(10),

  -- Metadata
  is_paper_trade BOOLEAN DEFAULT false,
  executed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_order_id ON trades(order_id);
CREATE INDEX idx_trades_position_id ON trades(position_id);
CREATE INDEX idx_trades_executed_at ON trades(executed_at DESC);
```

### Position Lifecycle State Machine

```
CREATED: Position record created, no orders submitted yet
   ↓ (submit entry order)
SUBMITTING: Entry order sent to exchange
   ↓ (order filled)           ↓ (order failed)
OPEN: Position active         FAILED: Entry failed
   ↓ (AI monitoring starts)
MONITORING: AI actively managing position
   ↓ (submit exit order)
CLOSING: Exit order submitted
   ↓ (order filled)           ↓ (order failed)
CLOSED: Position finalized    FAILED: Exit failed
```

**State transition rules:**
- `created` → `submitting` (when entry order submitted)
- `submitting` → `open` (when entry order filled)
- `submitting` → `failed` (when entry order fails)
- `open` → `monitoring` (when AI position management starts)
- `open` → `closing` (when exit order submitted)
- `monitoring` → `closing` (when exit order submitted)
- `closing` → `closed` (when exit order filled)
- `closing` → `failed` (when exit order fails)

### Database Triggers

**Update updated_at timestamp:**
```sql
CREATE TRIGGER update_positions_updated_at
  BEFORE UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Emit position state change events:**
```sql
CREATE OR REPLACE FUNCTION notify_position_state_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM pg_notify(
      'position_state_change',
      json_build_object(
        'position_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'user_id', NEW.user_id,
        'symbol', NEW.symbol
      )::text
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_position_state_change
  AFTER UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION notify_position_state_change();
```

**Auto-update signal status when position opens/closes:**
```sql
CREATE OR REPLACE FUNCTION update_signal_from_position()
RETURNS TRIGGER AS $$
BEGIN
  -- Position opened → signal status = 'in_position'
  IF NEW.status = 'open' AND OLD.status != 'open' THEN
    UPDATE signals
    SET status = 'in_position', updated_at = NOW()
    WHERE id = NEW.signal_id;
  END IF;

  -- Position closed → signal status = 'completed'
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    UPDATE signals
    SET status = 'completed', closed_at = NOW(), updated_at = NOW()
    WHERE id = NEW.signal_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_signal_from_position
  AFTER UPDATE ON positions
  FOR EACH ROW
  EXECUTE FUNCTION update_signal_from_position();
```

### Row Level Security (RLS)

```sql
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- Users can only see their own positions
CREATE POLICY positions_select_own
  ON positions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY positions_insert_own
  ON positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY positions_update_own
  ON positions FOR UPDATE
  USING (auth.uid() = user_id);

-- Same for orders and trades
CREATE POLICY orders_select_own
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY orders_insert_own
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY trades_select_own
  ON trades FOR SELECT
  USING (position_id IN (SELECT id FROM positions WHERE user_id = auth.uid()));
```

### Testing Plan

**Unit tests:**
- State transition validation (can't go from created → closed)
- PnL calculation accuracy
- Fee calculation
- Partial fill handling

**Integration tests:**
- Create position → submit order → update status
- Database triggers fire correctly
- RLS policies enforce user isolation
- Concurrent position updates don't corrupt data

### Success Criteria

- [ ] Migration creates all tables successfully
- [ ] All indexes created for query performance
- [ ] State machine enforced via CHECK constraints
- [ ] Database triggers emit events on state changes
- [ ] RLS policies prevent cross-user data access
- [ ] Can create position, submit order, track fill, calculate PnL
- [ ] Signal status updates automatically when position opens/closes

### Effort Estimate

**3-4 days**
- Day 1: Schema design, write migration
- Day 2: Database triggers and RLS policies
- Day 3: Testing and validation
- Day 4: Documentation and code review
