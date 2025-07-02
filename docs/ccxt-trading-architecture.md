# CCXT Real Trading Architecture

## Overview

This document outlines the architecture for integrating real cryptocurrency trading using the CCXT library. The system will handle order management, position tracking, and comprehensive event processing while maintaining security and reliability.

## Core Principles

1. **Exchange-Agnostic**: Support multiple exchanges through CCXT's unified API
2. **Event-Driven**: React to all trading events (fills, cancellations, modifications)
3. **P&L from Exchange**: Never calculate P&L locally - always use exchange data
4. **Audit Everything**: Complete trail of all orders, modifications, and executions
5. **Fail-Safe**: Graceful handling of errors, disconnections, and edge cases
6. **Security First**: Encrypted API keys, secure credential management

## Database Schema

### 1. Exchange Accounts
```sql
CREATE TABLE exchange_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  exchange_name TEXT NOT NULL, -- 'binance', 'bybit', 'okx', etc.
  account_name TEXT NOT NULL, -- User-friendly name
  api_key_encrypted TEXT NOT NULL, -- AES-256 encrypted
  api_secret_encrypted TEXT NOT NULL, -- AES-256 encrypted
  api_passphrase_encrypted TEXT, -- For exchanges that require it
  
  -- Exchange-specific settings
  testnet BOOLEAN DEFAULT false,
  default_type TEXT DEFAULT 'spot', -- 'spot', 'future', 'swap'
  position_mode TEXT, -- 'one-way', 'hedge'
  
  -- Permissions (what the API key can do)
  can_read BOOLEAN DEFAULT true,
  can_trade BOOLEAN DEFAULT false,
  can_withdraw BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, exchange_name, account_name)
);

-- Create index for active accounts
CREATE INDEX idx_exchange_accounts_active ON exchange_accounts(user_id, is_active);
```

### 2. Orders
```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
  trader_id UUID REFERENCES traders(id) ON DELETE SET NULL,
  
  -- Order identification
  exchange_order_id TEXT NOT NULL, -- Exchange's order ID
  client_order_id TEXT, -- Our custom order ID if supported
  
  -- Order details
  symbol TEXT NOT NULL,
  type TEXT NOT NULL, -- 'market', 'limit', 'stop', 'stop_limit', 'trailing_stop'
  side TEXT NOT NULL, -- 'buy', 'sell'
  
  -- Amounts and prices
  amount DECIMAL NOT NULL, -- Ordered amount
  price DECIMAL, -- Limit price (null for market orders)
  stop_price DECIMAL, -- Stop trigger price
  
  -- Execution details
  filled DECIMAL DEFAULT 0, -- Amount filled
  remaining DECIMAL, -- Amount remaining
  cost DECIMAL, -- Total cost (filled * average_price)
  average_price DECIMAL, -- Average fill price
  fee DECIMAL, -- Total fees paid
  fee_currency TEXT, -- Currency of the fee
  
  -- Status tracking
  status TEXT NOT NULL, -- 'pending', 'open', 'closed', 'canceled', 'expired', 'rejected'
  status_reason TEXT, -- Reason for rejection/cancellation
  
  -- Order flags
  reduce_only BOOLEAN DEFAULT false,
  post_only BOOLEAN DEFAULT false,
  is_stop_loss BOOLEAN DEFAULT false,
  is_take_profit BOOLEAN DEFAULT false,
  parent_order_id UUID, -- For linked orders (TP/SL)
  
  -- Timestamps from exchange
  exchange_timestamp TIMESTAMPTZ, -- When exchange created the order
  last_update_timestamp TIMESTAMPTZ, -- Last status update from exchange
  
  -- Our timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Raw data
  raw_order JSONB, -- Complete order data from exchange
  
  UNIQUE(exchange_account_id, exchange_order_id)
);

-- Indexes for performance
CREATE INDEX idx_orders_account_status ON orders(exchange_account_id, status);
CREATE INDEX idx_orders_symbol_status ON orders(symbol, status);
CREATE INDEX idx_orders_signal ON orders(signal_id) WHERE signal_id IS NOT NULL;
CREATE INDEX idx_orders_parent ON orders(parent_order_id) WHERE parent_order_id IS NOT NULL;
```

### 3. Order Events (Audit Trail)
```sql
CREATE TABLE order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  
  event_type TEXT NOT NULL, -- 'created', 'modified', 'partially_filled', 'filled', 'canceled', 'expired', 'rejected'
  event_timestamp TIMESTAMPTZ NOT NULL,
  
  -- What changed
  old_status TEXT,
  new_status TEXT,
  old_filled DECIMAL,
  new_filled DECIMAL,
  old_remaining DECIMAL,
  new_remaining DECIMAL,
  old_price DECIMAL,
  new_price DECIMAL,
  
  -- Fill details (if applicable)
  fill_price DECIMAL,
  fill_amount DECIMAL,
  fill_fee DECIMAL,
  fill_fee_currency TEXT,
  
  -- Additional context
  reason TEXT,
  raw_event JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_order_events_order ON order_events(order_id, event_timestamp DESC);
```

### 4. Positions
```sql
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
  
  -- Position identification
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- 'long', 'short'
  
  -- Position details from exchange
  contracts DECIMAL NOT NULL, -- Number of contracts
  contract_size DECIMAL, -- Size of one contract
  entry_price DECIMAL NOT NULL, -- Average entry price
  mark_price DECIMAL, -- Current mark price
  liquidation_price DECIMAL, -- Liquidation price
  
  -- P&L from exchange (never calculate locally!)
  unrealized_pnl DECIMAL,
  realized_pnl DECIMAL,
  total_pnl DECIMAL, -- unrealized + realized
  pnl_percentage DECIMAL, -- ROI percentage
  
  -- Margin details
  initial_margin DECIMAL,
  maintenance_margin DECIMAL,
  margin_ratio DECIMAL,
  
  -- Position state
  status TEXT NOT NULL, -- 'open', 'closing', 'closed', 'liquidated'
  
  -- Risk management
  stop_loss_order_id UUID, -- Reference to stop loss order
  take_profit_order_id UUID, -- Reference to take profit order
  
  -- Timestamps
  opened_at TIMESTAMPTZ NOT NULL,
  closed_at TIMESTAMPTZ,
  last_update_at TIMESTAMPTZ,
  
  -- Raw data
  raw_position JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(exchange_account_id, symbol, side)
);

CREATE INDEX idx_positions_account_status ON positions(exchange_account_id, status);
CREATE INDEX idx_positions_signal ON positions(signal_id) WHERE signal_id IS NOT NULL;
```

### 5. Trade Executions (Fills)
```sql
CREATE TABLE trade_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  position_id UUID REFERENCES positions(id) ON DELETE SET NULL,
  exchange_account_id UUID REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  
  -- Trade identification
  exchange_trade_id TEXT NOT NULL,
  
  -- Execution details
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  price DECIMAL NOT NULL,
  amount DECIMAL NOT NULL,
  cost DECIMAL NOT NULL,
  fee DECIMAL,
  fee_currency TEXT,
  
  -- Trade type
  type TEXT, -- 'trade', 'funding', 'liquidation'
  is_maker BOOLEAN,
  
  -- Timestamps
  exchange_timestamp TIMESTAMPTZ NOT NULL,
  
  -- Raw data
  raw_trade JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(exchange_account_id, exchange_trade_id)
);

CREATE INDEX idx_trade_executions_order ON trade_executions(order_id);
CREATE INDEX idx_trade_executions_position ON trade_executions(position_id);
CREATE INDEX idx_trade_executions_timestamp ON trade_executions(exchange_timestamp DESC);
```

### 6. Exchange Sync State
```sql
CREATE TABLE exchange_sync_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_account_id UUID REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  
  -- Sync tracking
  sync_type TEXT NOT NULL, -- 'orders', 'positions', 'trades', 'balance'
  last_sync_at TIMESTAMPTZ,
  last_successful_sync_at TIMESTAMPTZ,
  
  -- WebSocket state
  ws_connected BOOLEAN DEFAULT false,
  ws_last_heartbeat TIMESTAMPTZ,
  ws_reconnect_count INTEGER DEFAULT 0,
  
  -- Error tracking
  consecutive_errors INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  
  -- Rate limiting
  requests_this_minute INTEGER DEFAULT 0,
  minute_start TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(exchange_account_id, sync_type)
);
```

## Service Architecture

### 1. Exchange Manager Service
```typescript
interface IExchangeManager {
  // Account management
  addExchangeAccount(userId: string, config: ExchangeAccountConfig): Promise<ExchangeAccount>;
  removeExchangeAccount(accountId: string): Promise<void>;
  getExchangeAccounts(userId: string): Promise<ExchangeAccount[]>;
  
  // Order operations
  createOrder(accountId: string, order: OrderRequest): Promise<Order>;
  cancelOrder(accountId: string, orderId: string): Promise<void>;
  modifyOrder(accountId: string, orderId: string, modifications: OrderModification): Promise<Order>;
  
  // Position operations
  getPositions(accountId: string): Promise<Position[]>;
  closePosition(accountId: string, symbol: string, side: 'long' | 'short'): Promise<Order>;
  
  // Sync operations
  syncOrders(accountId: string): Promise<void>;
  syncPositions(accountId: string): Promise<void>;
  syncTrades(accountId: string, since?: Date): Promise<void>;
}
```

### 2. CCXT Wrapper Service
```typescript
class CCXTService {
  private exchanges: Map<string, ccxt.Exchange> = new Map();
  private proExchanges: Map<string, ccxt.pro.Exchange> = new Map();
  
  async initializeExchange(account: ExchangeAccount): Promise<void> {
    const ExchangeClass = ccxt[account.exchangeName];
    const exchange = new ExchangeClass({
      apiKey: decrypt(account.apiKeyEncrypted),
      secret: decrypt(account.apiSecretEncrypted),
      password: account.apiPassphraseEncrypted ? decrypt(account.apiPassphraseEncrypted) : undefined,
      enableRateLimit: true,
      options: {
        defaultType: account.defaultType,
        // Exchange-specific options
      }
    });
    
    this.exchanges.set(account.id, exchange);
    
    // Initialize Pro (WebSocket) if available
    if (ccxt.pro[account.exchangeName]) {
      const ProExchangeClass = ccxt.pro[account.exchangeName];
      const proExchange = new ProExchangeClass({
        // Same config
      });
      this.proExchanges.set(account.id, proExchange);
    }
  }
  
  async createOrder(accountId: string, order: OrderRequest): Promise<ccxt.Order> {
    const exchange = this.getExchange(accountId);
    
    try {
      const ccxtOrder = await exchange.createOrder(
        order.symbol,
        order.type,
        order.side,
        order.amount,
        order.price,
        {
          stopLossPrice: order.stopLoss,
          takeProfitPrice: order.takeProfit,
          reduceOnly: order.reduceOnly,
          ...order.exchangeSpecificParams
        }
      );
      
      return ccxtOrder;
    } catch (error) {
      await this.handleExchangeError(accountId, error);
      throw error;
    }
  }
  
  // WebSocket monitoring
  async watchOrders(accountId: string, callback: (orders: ccxt.Order[]) => void): Promise<void> {
    const proExchange = this.proExchanges.get(accountId);
    if (!proExchange) throw new Error('WebSocket not available for this exchange');
    
    while (true) {
      try {
        const orders = await proExchange.watchOrders();
        callback(orders);
      } catch (error) {
        console.error('WebSocket error:', error);
        await this.handleWebSocketReconnection(accountId);
      }
    }
  }
}
```

### 3. Order Lifecycle Manager
```typescript
class OrderLifecycleManager {
  constructor(
    private exchangeManager: IExchangeManager,
    private db: Database,
    private eventEmitter: EventEmitter
  ) {}
  
  async createOrderFromSignal(signal: Signal, account: ExchangeAccount): Promise<void> {
    // 1. Validate signal and account
    if (!signal.analysis?.tradePlan) {
      throw new Error('Signal has no trade plan');
    }
    
    // 2. Calculate position size based on risk management
    const positionSize = await this.calculatePositionSize(
      account,
      signal.symbol,
      signal.analysis.tradePlan
    );
    
    // 3. Create main order
    const mainOrder = await this.exchangeManager.createOrder(account.id, {
      symbol: signal.symbol,
      type: 'limit',
      side: signal.analysis.decision === 'buy' ? 'buy' : 'sell',
      amount: positionSize,
      price: signal.analysis.tradePlan.entry,
      reduceOnly: false
    });
    
    // 4. Store in database
    await this.db.orders.create({
      exchangeAccountId: account.id,
      signalId: signal.id,
      traderId: signal.traderId,
      exchangeOrderId: mainOrder.id,
      // ... other fields
    });
    
    // 5. Emit event
    this.eventEmitter.emit('order:created', {
      orderId: mainOrder.id,
      signalId: signal.id,
      accountId: account.id
    });
  }
  
  async handleOrderUpdate(accountId: string, orderUpdate: ccxt.Order): Promise<void> {
    // 1. Find existing order
    const existingOrder = await this.db.orders.findOne({
      exchangeAccountId: accountId,
      exchangeOrderId: orderUpdate.id
    });
    
    if (!existingOrder) {
      console.warn('Unknown order update:', orderUpdate.id);
      return;
    }
    
    // 2. Detect what changed
    const changes = this.detectOrderChanges(existingOrder, orderUpdate);
    
    // 3. Update database
    await this.db.orders.update(existingOrder.id, {
      status: orderUpdate.status,
      filled: orderUpdate.filled,
      remaining: orderUpdate.remaining,
      averagePrice: orderUpdate.average,
      // ... other fields
    });
    
    // 4. Create event record
    await this.db.orderEvents.create({
      orderId: existingOrder.id,
      eventType: this.determineEventType(changes),
      eventTimestamp: new Date(orderUpdate.timestamp),
      // ... change details
    });
    
    // 5. Handle specific events
    if (orderUpdate.status === 'closed' && orderUpdate.filled === orderUpdate.amount) {
      await this.handleOrderFilled(existingOrder, orderUpdate);
    } else if (orderUpdate.status === 'closed' && orderUpdate.filled > 0) {
      await this.handlePartialFill(existingOrder, orderUpdate);
    }
    
    // 6. Emit events
    this.eventEmitter.emit('order:updated', {
      orderId: existingOrder.id,
      changes,
      orderUpdate
    });
  }
  
  private async handleOrderFilled(order: Order, ccxtOrder: ccxt.Order): Promise<void> {
    // Create stop loss and take profit orders if configured
    if (order.signalId) {
      const signal = await this.db.signals.findOne(order.signalId);
      if (signal?.analysis?.tradePlan) {
        const { stopLoss, takeProfit } = signal.analysis.tradePlan;
        
        // Create stop loss
        if (stopLoss) {
          const slOrder = await this.exchangeManager.createOrder(order.exchangeAccountId, {
            symbol: order.symbol,
            type: 'stop',
            side: order.side === 'buy' ? 'sell' : 'buy',
            amount: order.filled,
            stopPrice: stopLoss,
            reduceOnly: true
          });
          
          await this.db.orders.update(order.id, {
            stopLossOrderId: slOrder.id
          });
        }
        
        // Create take profit
        if (takeProfit) {
          const tpOrder = await this.exchangeManager.createOrder(order.exchangeAccountId, {
            symbol: order.symbol,
            type: 'limit',
            side: order.side === 'buy' ? 'sell' : 'buy',
            amount: order.filled,
            price: takeProfit,
            reduceOnly: true
          });
          
          await this.db.orders.update(order.id, {
            takeProfitOrderId: tpOrder.id
          });
        }
      }
    }
  }
}
```

### 4. Position Synchronization Service
```typescript
class PositionSyncService {
  async syncPositions(accountId: string): Promise<void> {
    const exchange = this.ccxtService.getExchange(accountId);
    
    try {
      // 1. Fetch current positions from exchange
      const exchangePositions = await exchange.fetchPositions();
      
      // 2. Get our stored positions
      const storedPositions = await this.db.positions.find({
        exchangeAccountId: accountId,
        status: 'open'
      });
      
      // 3. Reconcile differences
      for (const exchangePos of exchangePositions) {
        const stored = storedPositions.find(p => 
          p.symbol === exchangePos.symbol && 
          p.side === exchangePos.side
        );
        
        if (!stored) {
          // New position detected
          await this.createPositionRecord(accountId, exchangePos);
        } else {
          // Update existing position
          await this.updatePositionRecord(stored.id, exchangePos);
        }
      }
      
      // 4. Mark closed positions
      for (const stored of storedPositions) {
        const stillOpen = exchangePositions.find(p => 
          p.symbol === stored.symbol && 
          p.side === stored.side
        );
        
        if (!stillOpen) {
          await this.closePositionRecord(stored.id);
        }
      }
      
      // 5. Update sync state
      await this.db.exchangeSyncState.upsert({
        exchangeAccountId: accountId,
        syncType: 'positions',
        lastSyncAt: new Date(),
        lastSuccessfulSyncAt: new Date()
      });
      
    } catch (error) {
      await this.handleSyncError(accountId, 'positions', error);
      throw error;
    }
  }
  
  private async updatePositionRecord(positionId: string, exchangePos: any): Promise<void> {
    await this.db.positions.update(positionId, {
      contracts: exchangePos.contracts,
      markPrice: exchangePos.markPrice,
      liquidationPrice: exchangePos.liquidationPrice,
      unrealizedPnl: exchangePos.unrealizedPnl,
      realizedPnl: exchangePos.realizedPnl,
      totalPnl: (exchangePos.unrealizedPnl || 0) + (exchangePos.realizedPnl || 0),
      pnlPercentage: exchangePos.percentage,
      marginRatio: exchangePos.marginRatio,
      lastUpdateAt: new Date(),
      rawPosition: exchangePos
    });
  }
}
```

## Event Flow

### Order Creation Flow
```
1. Signal triggers entry condition
   ↓
2. Risk management validates position size
   ↓
3. Create order via CCXT
   ↓
4. Store order in database
   ↓
5. Start monitoring order status
   ↓
6. Create audit event
```

### Order Update Flow
```
1. WebSocket receives order update
   ↓
2. Find matching order in database
   ↓
3. Detect changes (status, fills, etc.)
   ↓
4. Update order record
   ↓
5. Create order event for audit
   ↓
6. Trigger dependent actions (SL/TP creation)
   ↓
7. Emit events for UI updates
```

### Position Monitoring Flow
```
1. REST API sync every 30 seconds
   ↓
2. WebSocket for real-time P&L updates
   ↓
3. Reconcile exchange data with local state
   ↓
4. Update position records
   ↓
5. Check risk limits
   ↓
6. Emit position updates
```

## Security Considerations

### API Key Management
```typescript
// Encryption using AES-256-GCM
class CredentialManager {
  private encryptionKey: Buffer;
  
  constructor() {
    // Key derived from environment variable + user salt
    this.encryptionKey = this.deriveKey(
      process.env.MASTER_ENCRYPTION_KEY,
      userSalt
    );
  }
  
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }
  
  decrypt(ciphertext: string): string {
    const buffer = Buffer.from(ciphertext, 'base64');
    
    const iv = buffer.slice(0, 16);
    const tag = buffer.slice(16, 32);
    const encrypted = buffer.slice(32);
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    
    return decipher.update(encrypted) + decipher.final('utf8');
  }
}
```

### Permission Validation
```typescript
async function validateOrderPermissions(
  userId: string,
  accountId: string,
  action: 'create' | 'modify' | 'cancel'
): Promise<void> {
  const account = await db.exchangeAccounts.findOne({
    id: accountId,
    userId: userId,
    isActive: true
  });
  
  if (!account) {
    throw new Error('Exchange account not found or inactive');
  }
  
  if (!account.canTrade && action === 'create') {
    throw new Error('Account does not have trading permissions');
  }
  
  // Additional checks...
}
```

## Error Handling

### Exchange Error Categories
1. **Rate Limits**: Exponential backoff with jitter
2. **Network Errors**: Retry with circuit breaker
3. **Exchange Errors**: Parse and handle specifically
4. **Insufficient Balance**: Notify user, don't retry
5. **Invalid Order**: Log details, don't retry

### Recovery Strategies
```typescript
class ErrorRecovery {
  async handleOrderError(error: any, context: OrderContext): Promise<void> {
    if (error instanceof ccxt.RateLimitExceeded) {
      await this.handleRateLimit(context);
    } else if (error instanceof ccxt.NetworkError) {
      await this.scheduleRetry(context, this.calculateBackoff(context.retryCount));
    } else if (error instanceof ccxt.InsufficientFunds) {
      await this.notifyInsufficientFunds(context);
    } else if (error instanceof ccxt.InvalidOrder) {
      await this.logInvalidOrder(context, error);
    } else {
      await this.handleUnknownError(context, error);
    }
  }
}
```

## Performance Optimizations

### 1. Batch Operations
```typescript
// Batch multiple orders for the same symbol
async function createBatchOrders(orders: OrderRequest[]): Promise<Order[]> {
  const grouped = groupBy(orders, 'symbol');
  const results = [];
  
  for (const [symbol, symbolOrders] of grouped) {
    if (exchange.has['createOrders']) {
      // Use batch endpoint if available
      const batchResult = await exchange.createOrders(symbolOrders);
      results.push(...batchResult);
    } else {
      // Fall back to sequential
      for (const order of symbolOrders) {
        results.push(await exchange.createOrder(order));
      }
    }
  }
  
  return results;
}
```

### 2. Caching Strategy
- Cache exchange capabilities (has.createOrder, etc.)
- Cache symbol information (precision, limits)
- Cache recent trades for duplicate detection
- Use Redis for distributed caching

### 3. Connection Pooling
- Maintain persistent WebSocket connections
- Reuse HTTP connections
- Implement connection health checks

## Monitoring and Observability

### Key Metrics
1. **Order Metrics**
   - Orders created/canceled per minute
   - Fill rate and average fill time
   - Slippage statistics

2. **Position Metrics**
   - Open positions by symbol
   - Total P&L by time period
   - Position duration statistics

3. **System Metrics**
   - API rate limit usage
   - WebSocket connection uptime
   - Sync lag time

### Logging Strategy
```typescript
// Structured logging for all trading operations
logger.info('Order created', {
  orderId: order.id,
  exchangeOrderId: order.exchangeOrderId,
  userId: userId,
  accountId: accountId,
  symbol: order.symbol,
  side: order.side,
  amount: order.amount,
  price: order.price,
  timestamp: new Date().toISOString()
});
```

## Migration Path

### Phase 1: Foundation (Week 1-2)
1. Create database schema
2. Implement credential management
3. Build CCXT wrapper service
4. Add exchange account CRUD

### Phase 2: Order Management (Week 3-4)
1. Implement order creation
2. Add order monitoring
3. Build order lifecycle manager
4. Create audit trail

### Phase 3: Position Tracking (Week 5-6)
1. Implement position sync
2. Add P&L tracking
3. Build position monitoring
4. Add risk management

### Phase 4: Integration (Week 7-8)
1. Connect to signal system
2. Add automated trading
3. Implement safety checks
4. Complete testing

## Testing Strategy

### Unit Tests
- Mock CCXT responses
- Test order state transitions
- Validate encryption/decryption
- Test error handling

### Integration Tests
- Use exchange sandboxes
- Test full order lifecycle
- Validate WebSocket handling
- Test recovery scenarios

### Load Tests
- Simulate high-frequency updates
- Test concurrent operations
- Validate rate limit handling
- Measure sync performance

## Future Enhancements

1. **Advanced Order Types**
   - OCO (One-Cancels-Other) orders
   - Iceberg orders
   - TWAP/VWAP execution

2. **Portfolio Management**
   - Multi-exchange aggregation
   - Rebalancing strategies
   - Performance analytics

3. **Risk Management**
   - Dynamic position sizing
   - Portfolio heat maps
   - Correlation analysis

4. **Machine Learning**
   - Optimal execution timing
   - Slippage prediction
   - Fee optimization