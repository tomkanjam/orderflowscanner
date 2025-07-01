# Signal History & Audit Trail Architecture

## Overview

This document outlines the architecture for implementing a comprehensive signal history and audit trail system using Supabase as the backend database. The system tracks all signal lifecycle events from creation through trade completion, providing full auditability and historical analysis capabilities.

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
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
  
  -- Monitoring data
  last_monitored_at TIMESTAMPTZ,
  monitoring_count INTEGER DEFAULT 0,
  
  -- Trade data (if entered)
  trade_id UUID REFERENCES trades(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_user_id ON signals(user_id);
CREATE INDEX idx_signals_trader_id ON signals(trader_id);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_signals_created_at ON signals(created_at DESC);
```

#### 4. `signal_events`
```sql
CREATE TABLE signal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signal_events_signal_id ON signal_events(signal_id);
CREATE INDEX idx_signal_events_created_at ON signal_events(created_at DESC);
CREATE INDEX idx_signal_events_type ON signal_events(event_type);
```

#### 5. `trades`
```sql
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  trader_id UUID REFERENCES traders(id) ON DELETE SET NULL,
  signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'open', 'closed', 'cancelled')),
  
  -- Entry data
  entry_price DECIMAL,
  entry_time TIMESTAMPTZ,
  position_size DECIMAL,
  
  -- Exit data
  exit_price DECIMAL,
  exit_time TIMESTAMPTZ,
  
  -- P&L
  realized_pnl DECIMAL,
  realized_pnl_pct DECIMAL,
  
  -- Risk management
  stop_loss DECIMAL,
  take_profit DECIMAL,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_signal_id ON trades(signal_id);
CREATE INDEX idx_trades_status ON trades(status);
```

## Event Types and Structure

### Signal Events

```typescript
interface SignalEvent {
  event_type: SignalEventType;
  event_data: Record<string, any>;
}

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
  
  // Price events
  PRICE_UPDATED = 'price_updated',
  PRICE_ALERT = 'price_alert',
  
  // Trade events
  TRADE_CREATED = 'trade_created',
  TRADE_ENTERED = 'trade_entered',
  TRADE_EXITED = 'trade_exited',
  STOP_LOSS_UPDATED = 'stop_loss_updated',
  TAKE_PROFIT_UPDATED = 'take_profit_updated'
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
    source: 'ai_screener'
  }
}

// Analysis Completed Event
{
  event_type: 'analysis_completed',
  event_data: {
    result: 'approved',
    confidence: 0.85,
    reasoning: 'Strong oversold conditions with volume confirmation',
    indicators: {
      rsi: 28.5,
      volume_ratio: 2.3
    }
  }
}

// Monitoring Update Event
{
  event_type: 'monitoring_update',
  event_data: {
    action: 'continue',
    current_price: 45200,
    price_change_pct: 0.44,
    reasoning: 'Conditions still valid, waiting for stronger confirmation',
    indicators: {
      rsi: 32.1,
      macd: { signal: -0.5, histogram: 0.1 }
    }
  }
}
```

## Implementation Strategy

### 1. Database Service Layer

```typescript
// src/services/supabaseService.ts
interface SupabaseService {
  // Signal operations
  createSignal(signal: SignalCreateDTO): Promise<Signal>;
  updateSignal(id: string, updates: Partial<Signal>): Promise<Signal>;
  addSignalEvent(signalId: string, event: SignalEvent): Promise<void>;
  getSignalHistory(signalId: string): Promise<SignalEvent[]>;
  
  // Trader operations
  createTrader(trader: TraderCreateDTO): Promise<Trader>;
  updateTrader(id: string, updates: Partial<Trader>): Promise<Trader>;
  
  // Query operations
  getActiveSignals(userId: string): Promise<Signal[]>;
  getSignalsByStatus(userId: string, status: string): Promise<Signal[]>;
  getTraderPerformance(traderId: string): Promise<PerformanceMetrics>;
}
```

### 2. Event Recording Integration

```typescript
// Modify existing signalManager.ts
class SignalManager {
  async createSignal(result: FilterResult, source: SignalSource): Promise<Signal> {
    const signal = /* existing signal creation logic */;
    
    // Record to Supabase
    const dbSignal = await supabaseService.createSignal({
      signal_id: signal.id,
      symbol: signal.symbol,
      initial_price: signal.initialPrice,
      matched_conditions: signal.matchedConditions,
      trader_id: source.traderId,
      status: 'new'
    });
    
    // Record creation event
    await supabaseService.addSignalEvent(dbSignal.id, {
      event_type: SignalEventType.CREATED,
      event_data: {
        symbol: signal.symbol,
        initial_price: signal.initialPrice,
        matched_conditions: signal.matchedConditions,
        source: source.type
      }
    });
    
    return signal;
  }
  
  async updateSignalStatus(signalId: string, newStatus: string): Promise<void> {
    // Update local state
    // ...
    
    // Update database
    await supabaseService.updateSignal(signalId, { status: newStatus });
    
    // Record status change event
    await supabaseService.addSignalEvent(signalId, {
      event_type: SignalEventType.STATUS_CHANGED,
      event_data: {
        old_status: oldStatus,
        new_status: newStatus,
        timestamp: new Date().toISOString()
      }
    });
  }
}
```

### 3. Real-time Subscriptions

```typescript
// Subscribe to signal updates
const signalSubscription = supabase
  .channel('signals')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'signals',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      // Update local state with database changes
      handleSignalUpdate(payload);
    }
  )
  .subscribe();
```

### 4. Query Patterns

```typescript
// Get complete signal history
async function getSignalAuditTrail(signalId: string) {
  const { data: signal } = await supabase
    .from('signals')
    .select(`
      *,
      signal_events (
        event_type,
        event_data,
        created_at
      ),
      trades (
        id,
        status,
        entry_price,
        exit_price,
        realized_pnl
      )
    `)
    .eq('id', signalId)
    .single();
    
  return signal;
}

// Get trader performance metrics
async function getTraderMetrics(traderId: string, timeRange: string) {
  const { data: signals } = await supabase
    .from('signals')
    .select(`
      *,
      trades (
        realized_pnl,
        realized_pnl_pct
      )
    `)
    .eq('trader_id', traderId)
    .gte('created_at', getTimeRangeStart(timeRange));
    
  return calculateMetrics(signals);
}
```

## Security Considerations

### Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users can view own data" ON signals
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own data" ON signals
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own data" ON signals
  FOR UPDATE USING (auth.uid() = user_id);
```

## Migration Strategy

### Phase 1: Database Setup
1. Create Supabase project
2. Run migration scripts to create tables
3. Set up RLS policies
4. Configure authentication

### Phase 2: Service Integration
1. Implement SupabaseService
2. Add event recording to existing managers
3. Set up real-time subscriptions
4. Add error handling and retry logic

### Phase 3: UI Integration
1. Add history views for signals
2. Create audit trail component
3. Add performance dashboards
4. Implement export functionality

## Benefits

1. **Complete Auditability**: Every signal action is recorded with timestamp and context
2. **Performance Analysis**: Historical data enables backtesting and strategy optimization
3. **Debugging**: Full event history helps diagnose issues
4. **Compliance**: Audit trails for regulatory requirements
5. **Real-time Sync**: Multiple devices stay synchronized
6. **Scalability**: Supabase handles scaling automatically
7. **Offline Support**: Local state with background sync

## Performance Considerations

1. **Batch Events**: Group multiple events for batch insertion
2. **Archival**: Move old events to archive tables after 90 days
3. **Indexes**: Proper indexing on frequently queried columns
4. **Pagination**: Use cursor-based pagination for large result sets
5. **Caching**: Cache frequently accessed data locally
6. **Selective Sync**: Only sync active signals in real-time

## Future Enhancements

1. **Analytics Dashboard**: Aggregate metrics and visualizations
2. **Export API**: Export signal history to CSV/JSON
3. **Webhooks**: Notify external systems of signal events
4. **Machine Learning**: Use historical data for signal quality prediction
5. **Social Features**: Share successful strategies with other users