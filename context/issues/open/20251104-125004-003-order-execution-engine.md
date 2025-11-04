# Build Order Execution Engine

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 12:50:04

## Context

Build the core order execution engine that takes signals with decision="enter_trade" and executes the complete workflow: validate → create position → submit order → track fill → update status.

This is the main orchestrator that coordinates CCXT, database, risk management, and monitoring.

## Linked Items

- Part of: `context/issues/open/20251104-125004-000-PROJECT-trade-execution-infrastructure.md`
- Depends on:
  - `context/issues/open/20251104-125004-001-positions-schema-and-lifecycle.md`
  - `context/issues/open/20251104-125004-002-ccxt-binance-integration.md`
  - `context/issues/open/20251104-125004-004-risk-management-system.md`
- Enables: `context/issues/open/20251025-102927-003-position-management-workflow.md`

## Progress

**Status:** Not started

## Spec

### Architecture

```
Signal (decision="enter_trade")
         ↓
   OrderExecutor.Execute()
         ↓
   1. Validate signal and trader
   2. Check risk limits (RiskManager)
   3. Decrypt API keys (Edge Function)
   4. Calculate position size
   5. Create position record (status="created")
   6. Submit order via CCXT
   7. Update position (status="submitting")
   8. Poll for order fill
   9. Update position (status="open")
   10. Emit position_opened event
   11. Monitoring engine starts
```

### OrderExecutor Service

**Location:** `backend/go-screener/internal/execution/executor.go`

```go
package execution

import (
    "context"
    "fmt"
    "time"

    "github.com/vyx/go-screener/internal/eventbus"
    "github.com/vyx/go-screener/pkg/ccxt"
    "github.com/vyx/go-screener/pkg/types"
)

type Executor struct {
    ccxt        *ccxt.Client
    supabase    SupabaseClient
    riskMgr     *RiskManager
    eventBus    *eventbus.EventBus
    config      *Config
}

type Config struct {
    MaxExecutionTime  time.Duration // Max time to wait for order fill
    PollInterval      time.Duration // How often to check order status
    DefaultSlippage   float64       // Max acceptable slippage %
    PaperTradeMode    bool          // If true, simulate orders
}

// Execute takes a signal and executes the full trade workflow
func (e *Executor) Execute(ctx context.Context, signal *types.Signal) (*Position, error) {
    // 1. Validate signal
    if err := e.validateSignal(signal); err != nil {
        return nil, fmt.Errorf("invalid signal: %w", err)
    }

    // 2. Get trader and user info
    trader, err := e.supabase.GetTrader(ctx, signal.TraderID)
    if err != nil {
        return nil, fmt.Errorf("get trader: %w", err)
    }

    // 3. Check risk limits
    if err := e.riskMgr.CheckLimits(ctx, trader, signal); err != nil {
        return nil, fmt.Errorf("risk check failed: %w", err)
    }

    // 4. Calculate position size
    posSize, err := e.calculatePositionSize(ctx, trader, signal)
    if err != nil {
        return nil, fmt.Errorf("calculate position size: %w", err)
    }

    // 5. Get API keys (decrypted)
    apiKey, secret, err := e.getAPIKeys(ctx, trader.UserID)
    if err != nil {
        return nil, fmt.Errorf("get API keys: %w", err)
    }

    // 6. Create position record
    position := &Position{
        UserID:      trader.UserID,
        TraderID:    trader.ID,
        SignalID:    signal.ID,
        Symbol:      signal.Symbol,
        Side:        "long", // TODO: Support short
        Status:      "created",
        StopLoss:    posSize.StopLoss,
        TakeProfit:  posSize.TakeProfit,
        MaxLossUSDT: posSize.MaxLoss,
        IsPaperTrade: e.config.PaperTradeMode,
    }

    if err := e.supabase.CreatePosition(ctx, position); err != nil {
        return nil, fmt.Errorf("create position: %w", err)
    }

    // 7. Submit order
    if err := e.submitOrder(ctx, position, posSize, apiKey, secret); err != nil {
        // Mark position as failed
        position.Status = "failed"
        position.FailureReason = err.Error()
        e.supabase.UpdatePosition(ctx, position)
        return nil, fmt.Errorf("submit order: %w", err)
    }

    // 8. Wait for fill and update position
    if err := e.waitForFill(ctx, position); err != nil {
        return nil, fmt.Errorf("wait for fill: %w", err)
    }

    // 9. Emit position opened event (triggers monitoring)
    e.eventBus.PublishPositionOpened(&eventbus.PositionOpenedEvent{
        PositionID: position.ID,
        UserID:     position.UserID,
        Symbol:     position.Symbol,
        Timestamp:  time.Now(),
    })

    return position, nil
}

func (e *Executor) validateSignal(signal *types.Signal) error {
    if signal.Status != "ready" {
        return fmt.Errorf("signal not ready: %s", signal.Status)
    }

    // Check if signal already has a position
    existing, err := e.supabase.GetPositionBySignalID(signal.ID)
    if err == nil && existing != nil {
        return fmt.Errorf("signal already has position: %s", existing.ID)
    }

    return nil
}

func (e *Executor) calculatePositionSize(ctx context.Context, trader *types.Trader, signal *types.Signal) (*PositionSize, error) {
    // Get account balance
    balance, err := e.supabase.GetUserBalance(ctx, trader.UserID)
    if err != nil {
        return nil, err
    }

    // Get current price
    ticker, err := e.ccxt.FetchTicker(signal.Symbol)
    if err != nil {
        return nil, err
    }

    // Get trader's position size config (% of portfolio or fixed USDT)
    sizeConfig := trader.RiskConfig.PositionSize

    var positionValueUSDT float64
    if sizeConfig.Type == "percent" {
        positionValueUSDT = balance.Total * sizeConfig.Value / 100
    } else {
        positionValueUSDT = sizeConfig.Value
    }

    // Calculate quantity
    quantity := positionValueUSDT / ticker.Last

    // Round to exchange's precision
    quantity = roundToExchangePrecision(quantity, signal.Symbol)

    // Calculate stop loss and take profit prices
    stopLoss := ticker.Last * (1 - trader.RiskConfig.StopLossPercent/100)
    takeProfit := ticker.Last * (1 + trader.RiskConfig.TakeProfitPercent/100)

    // Calculate max loss (for risk check)
    maxLoss := quantity * (ticker.Last - stopLoss)

    return &PositionSize{
        Quantity:   quantity,
        Price:      ticker.Last,
        ValueUSDT:  positionValueUSDT,
        StopLoss:   stopLoss,
        TakeProfit: takeProfit,
        MaxLoss:    maxLoss,
    }, nil
}

func (e *Executor) submitOrder(ctx context.Context, position *Position, size *PositionSize, apiKey, secret string) error {
    // Update position status
    position.Status = "submitting"
    if err := e.supabase.UpdatePosition(ctx, position); err != nil {
        return err
    }

    // Paper trade mode: Simulate order
    if e.config.PaperTradeMode {
        return e.simulateOrder(ctx, position, size)
    }

    // Real order via CCXT
    order, err := e.ccxt.CreateOrder(
        apiKey,
        secret,
        position.Symbol,
        "market", // TODO: Support limit orders
        "buy",    // TODO: Support sell for shorts
        size.Quantity,
        0, // Market order has no price
    )
    if err != nil {
        return err
    }

    // Store order in database
    dbOrder := &Order{
        PositionID:      position.ID,
        UserID:          position.UserID,
        BinanceOrderID:  order.ID,
        Symbol:          position.Symbol,
        Side:            "buy",
        Type:            "market",
        Quantity:        size.Quantity,
        FilledQuantity:  order.Filled,
        AvgFillPrice:    order.Price,
        Status:          mapOrderStatus(order.Status),
        IsPaperTrade:    false,
        RawResponse:     order.Info,
        SubmittedAt:     time.Now(),
    }

    if err := e.supabase.CreateOrder(ctx, dbOrder); err != nil {
        return err
    }

    // Update position with order details
    position.EntryOrderID = order.ID

    return nil
}

func (e *Executor) waitForFill(ctx context.Context, position *Position) error {
    timeout := time.After(e.config.MaxExecutionTime)
    ticker := time.NewTicker(e.config.PollInterval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()

        case <-timeout:
            return fmt.Errorf("order fill timeout after %v", e.config.MaxExecutionTime)

        case <-ticker.C:
            // Fetch order from database (updated by order tracker)
            order, err := e.supabase.GetOrderByBinanceID(ctx, position.EntryOrderID)
            if err != nil {
                return err
            }

            if order.Status == "filled" {
                // Update position with fill details
                position.Status = "open"
                position.EntryPrice = order.AvgFillPrice
                position.EntryQuantity = order.FilledQuantity
                position.EntryValue = order.TotalValue
                position.FeesPaid = order.Fees
                position.EntryTime = order.FilledAt

                if err := e.supabase.UpdatePosition(ctx, position); err != nil {
                    return err
                }

                return nil
            }

            if order.Status == "failed" || order.Status == "cancelled" {
                return fmt.Errorf("order failed: %s", order.ErrorMessage)
            }

            // Still filling, continue polling
        }
    }
}

func (e *Executor) simulateOrder(ctx context.Context, position *Position, size *PositionSize) error {
    // Paper trade: Simulate instant fill at current price
    order := &Order{
        PositionID:     position.ID,
        UserID:         position.UserID,
        Symbol:         position.Symbol,
        Side:           "buy",
        Type:           "market",
        Quantity:       size.Quantity,
        FilledQuantity: size.Quantity,
        AvgFillPrice:   size.Price,
        TotalValue:     size.ValueUSDT,
        Fees:           size.ValueUSDT * 0.001, // Simulate 0.1% fee
        Status:         "filled",
        IsPaperTrade:   true,
        SubmittedAt:    time.Now(),
        FilledAt:       time.Now(),
    }

    if err := e.supabase.CreateOrder(ctx, order); err != nil {
        return err
    }

    // Update position
    position.Status = "open"
    position.EntryPrice = order.AvgFillPrice
    position.EntryQuantity = order.FilledQuantity
    position.EntryValue = order.TotalValue
    position.FeesPaid = order.Fees
    position.EntryTime = order.FilledAt

    return e.supabase.UpdatePosition(ctx, position)
}

func (e *Executor) getAPIKeys(ctx context.Context, userID string) (string, string, error) {
    // Call Edge Function to decrypt API keys
    // TODO: Implement after sub-issue 005
    if e.config.PaperTradeMode {
        return "paper-key", "paper-secret", nil
    }

    return "", "", fmt.Errorf("API key decryption not implemented")
}
```

### Order Status Tracker

Separate goroutine that polls Binance for order status updates:

```go
// OrderTracker polls exchange for order status
type OrderTracker struct {
    ccxt     *ccxt.Client
    supabase SupabaseClient
    interval time.Duration
}

func (t *OrderTracker) Start(ctx context.Context) {
    ticker := time.NewTicker(t.interval)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            t.updatePendingOrders(ctx)
        }
    }
}

func (t *OrderTracker) updatePendingOrders(ctx context.Context) {
    // Get all orders in 'submitted' or 'partially_filled' status
    orders, err := t.supabase.GetPendingOrders(ctx)
    if err != nil {
        log.Printf("Error fetching pending orders: %v", err)
        return
    }

    for _, order := range orders {
        // Get API keys for this user
        apiKey, secret, err := getAPIKeys(ctx, order.UserID)
        if err != nil {
            log.Printf("Error getting API keys: %v", err)
            continue
        }

        // Fetch order from exchange
        exchangeOrder, err := t.ccxt.FetchOrder(apiKey, secret, order.BinanceOrderID, order.Symbol)
        if err != nil {
            log.Printf("Error fetching order %s: %v", order.BinanceOrderID, err)
            continue
        }

        // Update order in database
        order.FilledQuantity = exchangeOrder.Filled
        order.AvgFillPrice = exchangeOrder.Price
        order.Status = mapOrderStatus(exchangeOrder.Status)

        if exchangeOrder.Status == "closed" {
            order.FilledAt = time.Now()
        }

        if err := t.supabase.UpdateOrder(ctx, order); err != nil {
            log.Printf("Error updating order: %v", err)
        }
    }
}
```

### Integration with Monitoring

When position opens, emit event for monitoring engine:

```go
// In eventbus/types.go
type PositionOpenedEvent struct {
    PositionID string
    UserID     string
    TraderID   string
    Symbol     string
    Timestamp  time.Time
}

// In monitoring/engine.go
func (e *Engine) Start() error {
    // ... existing code ...

    // Subscribe to position opened events
    positionCh := e.eventBus.SubscribePositionOpened()
    go e.positionOpenedEventLoop(positionCh)

    return nil
}

func (e *Engine) positionOpenedEventLoop(ch <-chan *eventbus.PositionOpenedEvent) {
    for event := range ch {
        // Create position management workflow
        e.startPositionManagement(event.PositionID, event.Symbol)
    }
}
```

### Testing Strategy

**Unit tests:**
- Position size calculation accuracy
- Order validation logic
- Status mapping (CCXT → database)
- Error handling for each failure mode

**Integration tests (paper trade):**
- Full execution flow: signal → position → order → fill
- Position status updates correctly
- Events emitted at right times
- Multiple concurrent executions don't interfere

**Integration tests (testnet):**
- Real Binance testnet execution
- Order actually submitted and filled
- Balance updated correctly
- Error handling (insufficient funds, invalid symbol)

### Success Criteria

- [ ] Can execute full workflow from signal to open position
- [ ] Position size calculated correctly based on trader config
- [ ] Risk checks enforced before order submission
- [ ] Orders tracked from submission to fill
- [ ] Position status updated at each stage
- [ ] Events emitted to trigger monitoring
- [ ] Paper trade mode works without API keys
- [ ] Testnet mode executes real orders
- [ ] Error handling works for all failure modes
- [ ] Performance: < 5s from signal to position opened

### Effort Estimate

**5-7 days**
- Day 1-2: OrderExecutor core logic
- Day 3: Order status tracking
- Day 4: Position size calculation and risk integration
- Day 5: Paper trade mode
- Day 6: Testing and integration
- Day 7: Testnet validation and bug fixes
