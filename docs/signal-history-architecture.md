# Signal History & Audit Trail Architecture

## Overview

This document outlines the architecture for implementing a comprehensive signal history and audit trail system using Supabase as the backend database. The system tracks all signal lifecycle events from creation through trade completion, providing full auditability and historical analysis capabilities. This architecture is designed to seamlessly integrate with the CCXT trading system for real order execution.

## Database Schema

### Core Tables

#### 1. `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. `traders`
```sql
CREATE TABLE traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  market TEXT NOT NULL,
  strategy TEXT NOT NULL,
  indicators JSONB NOT NULL,
  ai_analysis_limit INTEGER DEFAULT 10,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  
  -- Trading configuration
  default_exchange_account_id UUID, -- Links to exchange_accounts table
  position_size_type TEXT DEFAULT 'fixed', -- 'fixed', 'percentage', 'risk_based'
  position_size_value DECIMAL, -- Amount or percentage
  max_concurrent_positions INTEGER DEFAULT 1,
  
  -- Risk management defaults
  stop_loss_type TEXT, -- 'percentage', 'price', 'atr'
  stop_loss_value DECIMAL,
  take_profit_type TEXT, -- 'percentage', 'price', 'atr'
  take_profit_value DECIMAL,
  
  -- Performance tracking
  total_signals_generated INTEGER DEFAULT 0,
  successful_signals INTEGER DEFAULT 0,
  total_trades_executed INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_traders_user_id ON traders(user_id);
CREATE INDEX idx_traders_status ON traders(status);
```

#### 3. `signals`
```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id TEXT UNIQUE NOT NULL, -- e.g., "BTCUSDT-1234567890"
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  trader_id UUID REFERENCES traders(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'analyzing', 'rejected', 'monitoring', 'ready', 'in_position', 'closed', 'expired')),
  
  -- Signal creation data
  initial_price DECIMAL NOT NULL,
  current_price DECIMAL,
  price_change_pct DECIMAL,
  matched_conditions TEXT[],
  
  -- Analysis data
  analysis_result JSONB,
  analysis_confidence DECIMAL,
  analysis_trade_plan JSONB, -- {entry, stopLoss, takeProfit, positionSize}
  
  -- Monitoring data
  last_monitored_at TIMESTAMPTZ,
  monitoring_count INTEGER DEFAULT 0,
  monitoring_updates JSONB[], -- Array of monitoring snapshots
  
  -- Trading linkage (references CCXT schema)
  has_active_orders BOOLEAN DEFAULT false,
  has_open_position BOOLEAN DEFAULT false,
  total_orders_count INTEGER DEFAULT 0,
  successful_trades_count INTEGER DEFAULT 0,
  total_pnl DECIMAL DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  position_opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_user_id ON signals(user_id);
CREATE INDEX idx_signals_trader_id ON signals(trader_id);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX idx_signals_trading_status ON signals(has_active_orders, has_open_position);
```

#### 4. `signal_events`
```sql
CREATE TABLE signal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  
  -- Optional linkage to CCXT tables
  order_id UUID, -- References orders table in CCXT schema
  position_id UUID, -- References positions table in CCXT schema
  trade_execution_id UUID, -- References trade_executions table
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signal_events_signal_id ON signal_events(signal_id, created_at DESC);
CREATE INDEX idx_signal_events_type ON signal_events(event_type);
CREATE INDEX idx_signal_events_order ON signal_events(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_signal_events_position ON signal_events(position_id) WHERE position_id IS NOT NULL;
```

#### 5. `signal_monitoring_snapshots`
```sql
CREATE TABLE signal_monitoring_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  
  -- Market snapshot
  price DECIMAL NOT NULL,
  volume DECIMAL,
  price_change_1m DECIMAL,
  price_change_5m DECIMAL,
  
  -- Monitoring decision
  action TEXT NOT NULL, -- 'continue', 'ready', 'exit', 'stop_monitoring'
  confidence DECIMAL,
  reasoning TEXT,
  
  -- Technical indicators at time
  indicators JSONB, -- RSI, MACD, etc.
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_monitoring_snapshots_signal ON signal_monitoring_snapshots(signal_id, created_at DESC);
```

#### 6. Signal-Order Bridge Table
```sql
-- Links signals to CCXT orders
CREATE TABLE signal_orders (
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  order_id UUID NOT NULL, -- References orders.id in CCXT schema
  order_type TEXT NOT NULL, -- 'entry', 'stop_loss', 'take_profit', 'exit'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (signal_id, order_id)
);

CREATE INDEX idx_signal_orders_signal ON signal_orders(signal_id);
CREATE INDEX idx_signal_orders_order ON signal_orders(order_id);
```

#### 7. Signal-Position Bridge Table
```sql
-- Links signals to CCXT positions
CREATE TABLE signal_positions (
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  position_id UUID NOT NULL, -- References positions.id in CCXT schema
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  PRIMARY KEY (signal_id, position_id)
);

CREATE INDEX idx_signal_positions_signal ON signal_positions(signal_id);
CREATE INDEX idx_signal_positions_position ON signal_positions(position_id);
```

## Event Types and Structure

### Signal Events

```typescript
enum SignalEventType {
  // Lifecycle events
  CREATED = 'signal_created',
  STATUS_CHANGED = 'status_changed',
  EXPIRED = 'signal_expired',
  
  // Analysis events
  ANALYSIS_STARTED = 'analysis_started',
  ANALYSIS_COMPLETED = 'analysis_completed',
  ANALYSIS_FAILED = 'analysis_failed',
  
  // Monitoring events
  MONITORING_UPDATE = 'monitoring_update',
  MONITORING_ACTION = 'monitoring_action',
  
  // Trading events (link to CCXT)
  ORDER_CREATED = 'order_created',
  ORDER_FILLED = 'order_filled',
  ORDER_PARTIALLY_FILLED = 'order_partially_filled',
  ORDER_CANCELED = 'order_canceled',
  POSITION_OPENED = 'position_opened',
  POSITION_UPDATED = 'position_updated',
  POSITION_CLOSED = 'position_closed',
  
  // Risk events
  STOP_LOSS_TRIGGERED = 'stop_loss_triggered',
  TAKE_PROFIT_TRIGGERED = 'take_profit_triggered',
  TRAILING_STOP_UPDATED = 'trailing_stop_updated'
}
```

### Event Data Examples

```typescript
// Signal Created Event
{
  event_type: 'signal_created',
  event_data: {
    symbol: 'BTCUSDT',
    initial_price: 45000,
    matched_conditions: ['RSI < 30', 'Volume spike'],
    trader_id: 'uuid',
    source: 'trader_filter'
  }
}

// Order Created Event (links to CCXT)
{
  event_type: 'order_created',
  event_data: {
    order_type: 'entry',
    exchange: 'binance',
    exchange_order_id: 'ABC123',
    side: 'buy',
    amount: 0.01,
    price: 45000
  },
  order_id: 'uuid-from-ccxt-orders-table'
}

// Position Opened Event
{
  event_type: 'position_opened',
  event_data: {
    exchange: 'binance',
    contracts: 0.01,
    entry_price: 45000,
    stop_loss: 44100,
    take_profit: 46350
  },
  position_id: 'uuid-from-ccxt-positions-table'
}

// Position Closed Event with P&L
{
  event_type: 'position_closed',
  event_data: {
    exit_price: 46200,
    realized_pnl: 12.00,
    pnl_percentage: 2.67,
    exit_reason: 'take_profit',
    duration_minutes: 45
  },
  position_id: 'uuid-from-ccxt-positions-table'
}
```

## Implementation Strategy

### 1. Enhanced Database Service Layer

```typescript
// src/services/supabaseSignalService.ts
interface SupabaseSignalService {
  // Signal operations
  createSignal(signal: SignalCreateDTO): Promise<Signal>;
  updateSignal(id: string, updates: Partial<Signal>): Promise<Signal>;
  addSignalEvent(signalId: string, event: SignalEvent): Promise<void>;
  getSignalHistory(signalId: string): Promise<SignalEvent[]>;
  
  // Trading linkage
  linkSignalToOrder(signalId: string, orderId: string, orderType: string): Promise<void>;
  linkSignalToPosition(signalId: string, positionId: string): Promise<void>;
  updateSignalPnL(signalId: string, pnl: number): Promise<void>;
  
  // Monitoring
  addMonitoringSnapshot(signalId: string, snapshot: MonitoringSnapshot): Promise<void>;
  getMonitoringHistory(signalId: string, limit?: number): Promise<MonitoringSnapshot[]>;
  
  // Performance queries
  getSignalPerformance(signalId: string): Promise<SignalPerformance>;
  getTraderPerformance(traderId: string, timeRange?: TimeRange): Promise<TraderPerformance>;
}
```

### 2. Integration with CCXT Trading

```typescript
// src/services/signalTradingBridge.ts
class SignalTradingBridge {
  constructor(
    private signalService: SupabaseSignalService,
    private exchangeManager: IExchangeManager,
    private eventEmitter: EventEmitter
  ) {}
  
  async executeSignalTrade(signalId: string, accountId: string): Promise<void> {
    // 1. Get signal with trade plan
    const signal = await this.signalService.getSignal(signalId);
    if (!signal.analysis_trade_plan) {
      throw new Error('Signal has no trade plan');
    }
    
    // 2. Create entry order via CCXT
    const entryOrder = await this.exchangeManager.createOrder(accountId, {
      symbol: signal.symbol,
      type: 'limit',
      side: signal.analysis_trade_plan.side,
      amount: signal.analysis_trade_plan.positionSize,
      price: signal.analysis_trade_plan.entry
    });
    
    // 3. Link order to signal
    await this.signalService.linkSignalToOrder(
      signalId, 
      entryOrder.id, 
      'entry'
    );
    
    // 4. Record event
    await this.signalService.addSignalEvent(signalId, {
      event_type: SignalEventType.ORDER_CREATED,
      event_data: {
        order_type: 'entry',
        exchange_order_id: entryOrder.exchangeOrderId,
        amount: entryOrder.amount,
        price: entryOrder.price
      },
      order_id: entryOrder.id
    });
    
    // 5. Update signal status
    await this.signalService.updateSignal(signalId, {
      has_active_orders: true,
      total_orders_count: signal.total_orders_count + 1
    });
  }
  
  async handleOrderFilled(orderId: string, ccxtOrder: any): Promise<void> {
    // Find associated signal
    const signalOrder = await this.db.query(`
      SELECT s.* FROM signals s
      JOIN signal_orders so ON s.id = so.signal_id
      WHERE so.order_id = $1
    `, [orderId]);
    
    if (!signalOrder) return;
    
    const signal = signalOrder[0];
    
    // Record fill event
    await this.signalService.addSignalEvent(signal.id, {
      event_type: SignalEventType.ORDER_FILLED,
      event_data: {
        order_type: signalOrder.order_type,
        fill_price: ccxtOrder.average,
        fill_amount: ccxtOrder.filled
      },
      order_id: orderId
    });
    
    // If this was an entry order, create SL/TP orders
    if (signalOrder.order_type === 'entry') {
      await this.createProtectionOrders(signal, ccxtOrder);
    }
  }
  
  async handlePositionUpdate(positionId: string, position: any): Promise<void> {
    // Find associated signal
    const signalPosition = await this.db.query(`
      SELECT s.* FROM signals s
      JOIN signal_positions sp ON s.id = sp.signal_id
      WHERE sp.position_id = $1
    `, [positionId]);
    
    if (!signalPosition) return;
    
    const signal = signalPosition[0];
    
    // Update signal P&L
    await this.signalService.updateSignalPnL(
      signal.id, 
      position.totalPnl
    );
    
    // Record position update
    await this.signalService.addSignalEvent(signal.id, {
      event_type: SignalEventType.POSITION_UPDATED,
      event_data: {
        unrealized_pnl: position.unrealizedPnl,
        pnl_percentage: position.pnlPercentage,
        mark_price: position.markPrice
      },
      position_id: positionId
    });
  }
}
```

### 3. Real-time Synchronization

```typescript
// Subscribe to both signal and trading updates
class RealtimeSyncService {
  async initialize(userId: string) {
    // Signal updates
    const signalChannel = supabase
      .channel('signals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'signals',
          filter: `user_id=eq.${userId}`
        },
        (payload) => this.handleSignalUpdate(payload)
      );
    
    // Signal events
    const eventChannel = supabase
      .channel('signal_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signal_events'
        },
        (payload) => this.handleNewEvent(payload)
      );
    
    // Subscribe to CCXT events
    this.eventEmitter.on('order:updated', this.handleOrderUpdate.bind(this));
    this.eventEmitter.on('position:updated', this.handlePositionUpdate.bind(this));
    
    await Promise.all([
      signalChannel.subscribe(),
      eventChannel.subscribe()
    ]);
  }
}
```

### 4. Performance Analytics Queries

```sql
-- Create materialized view for signal performance
CREATE MATERIALIZED VIEW signal_performance_analytics AS
WITH signal_orders AS (
  SELECT 
    s.id as signal_id,
    s.symbol,
    s.trader_id,
    s.created_at as signal_created_at,
    COUNT(DISTINCT o.id) as total_orders,
    COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'closed') as completed_orders
  FROM signals s
  LEFT JOIN signal_orders so ON s.id = so.signal_id
  LEFT JOIN orders o ON so.order_id = o.id
  GROUP BY s.id
),
signal_positions AS (
  SELECT 
    s.id as signal_id,
    COUNT(DISTINCT p.id) as total_positions,
    SUM(p.realized_pnl) as total_realized_pnl,
    AVG(p.pnl_percentage) as avg_pnl_percentage,
    MAX(p.unrealized_pnl + p.realized_pnl) as max_pnl,
    MIN(p.unrealized_pnl + p.realized_pnl) as min_pnl
  FROM signals s
  LEFT JOIN signal_positions sp ON s.id = sp.signal_id
  LEFT JOIN positions p ON sp.position_id = p.id
  GROUP BY s.id
)
SELECT 
  s.*,
  so.total_orders,
  so.completed_orders,
  sp.total_positions,
  sp.total_realized_pnl,
  sp.avg_pnl_percentage,
  sp.max_pnl,
  sp.min_pnl,
  CASE 
    WHEN sp.total_realized_pnl > 0 THEN 'profitable'
    WHEN sp.total_realized_pnl < 0 THEN 'loss'
    ELSE 'breakeven'
  END as outcome
FROM signal_orders so
JOIN signal_positions sp ON so.signal_id = sp.signal_id
JOIN signals s ON s.id = so.signal_id;

-- Refresh every hour
CREATE INDEX idx_signal_performance_signal ON signal_performance_analytics(signal_id);
CREATE INDEX idx_signal_performance_trader ON signal_performance_analytics(trader_id);
```

## Security Considerations

### Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_monitoring_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_positions ENABLE ROW LEVEL SECURITY;

-- Users can only see their own signals
CREATE POLICY "Users view own signals" ON signals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users create own signals" ON signals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own signals" ON signals
  FOR UPDATE USING (auth.uid() = user_id);

-- Signal events inherit signal permissions
CREATE POLICY "Users view signal events" ON signal_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM signals 
      WHERE signals.id = signal_events.signal_id 
      AND signals.user_id = auth.uid()
    )
  );
```

## Migration Strategy

### Phase 1: Core Signal Tables
1. Create signals and related tables
2. Implement basic CRUD operations
3. Add event recording
4. Set up RLS policies

### Phase 2: Trading Integration
1. Create bridge tables (signal_orders, signal_positions)
2. Implement SignalTradingBridge service
3. Connect to CCXT event system
4. Add P&L tracking

### Phase 3: Analytics & Performance
1. Create materialized views
2. Build performance queries
3. Add monitoring snapshots
4. Implement analytics API

### Phase 4: Real-time Features
1. Set up Supabase real-time
2. Implement cross-device sync
3. Add WebSocket event bridging
4. Enable collaborative features

## Benefits

1. **Complete Audit Trail**: Every signal and trading action is recorded
2. **P&L Attribution**: Track performance from signal to final trade
3. **Risk Analysis**: Historical data for risk modeling
4. **Strategy Optimization**: Data-driven strategy improvements
5. **Regulatory Compliance**: Full audit trail for reporting
6. **Multi-Exchange Support**: Unified view across all exchanges
7. **Real-time Sync**: Live updates across all connected clients

## Performance Optimizations

1. **Batch Operations**: Group events for efficient insertion
2. **Materialized Views**: Pre-compute analytics queries
3. **Partitioning**: Partition large tables by date
4. **Archival Strategy**: Move old data to cold storage
5. **Connection Pooling**: Reuse database connections
6. **Selective Replication**: Only sync active data

## Future Enhancements

1. **Advanced Analytics**
   - Win rate by market conditions
   - Optimal position sizing analysis
   - Strategy correlation analysis

2. **Machine Learning**
   - Signal quality prediction
   - Optimal entry/exit timing
   - Risk-adjusted position sizing

3. **Social Trading**
   - Share successful strategies
   - Copy trading functionality
   - Performance leaderboards

4. **Advanced Reporting**
   - Tax reporting
   - Performance attribution
   - Risk-adjusted returns