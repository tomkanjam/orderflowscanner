# Implement Risk Management System

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 12:50:04

## Context

Build risk management system to enforce position size limits, daily loss limits, and other safety controls before allowing trade execution.

**Critical:** This prevents catastrophic losses from AI errors, bugs, or market conditions.

## Linked Items

- Part of: `context/issues/open/20251104-125004-000-PROJECT-trade-execution-infrastructure.md`
- Blocks: `context/issues/open/20251104-125004-003-order-execution-engine.md`

## Progress

**Status:** Not started

## Spec

### Risk Limits Schema

```sql
CREATE TABLE risk_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  trader_id UUID REFERENCES traders(id), -- NULL = account-wide

  -- Position sizing
  max_position_size_usdt DECIMAL(20, 8), -- Max per position
  max_position_size_percent DECIMAL(5, 2), -- Max % of portfolio
  max_total_exposure_usdt DECIMAL(20, 8), -- Max across all positions
  min_position_size_usdt DECIMAL(20, 8), -- Avoid dust

  -- Loss limits
  daily_loss_limit_usdt DECIMAL(20, 8),
  daily_loss_limit_percent DECIMAL(5, 2),
  max_drawdown_percent DECIMAL(5, 2), -- From peak

  -- Order safety
  max_order_size_usdt DECIMAL(20, 8),
  max_price_deviation_percent DECIMAL(5, 2), -- From market
  min_order_interval_seconds INT, -- Rate limiting

  -- Stop loss requirements
  require_stop_loss BOOLEAN DEFAULT true,
  max_stop_loss_percent DECIMAL(5, 2),

  -- Emergency controls
  trading_paused BOOLEAN DEFAULT false,
  pause_reason TEXT,
  paused_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_risk_limits_user_trader
  ON risk_limits(user_id, COALESCE(trader_id, '00000000-0000-0000-0000-000000000000'::uuid));
```

### RiskManager Service

```go
type RiskManager struct {
    supabase SupabaseClient
}

type RiskCheck struct {
    Passed bool
    Reason string
    Limits *RiskLimits
}

func (r *RiskManager) CheckLimits(ctx context.Context, trader *Trader, signal *Signal, size *PositionSize) (*RiskCheck, error) {
    limits, err := r.getRiskLimits(ctx, trader)
    if err != nil {
        return nil, err
    }

    // Check if trading paused
    if limits.TradingPaused {
        return &RiskCheck{false, "trading paused: " + limits.PauseReason, limits}, nil
    }

    // Check position size
    if size.ValueUSDT > limits.MaxPositionSizeUSDT {
        return &RiskCheck{false, fmt.Sprintf("position too large: %.2f > %.2f",
            size.ValueUSDT, limits.MaxPositionSizeUSDT), limits}, nil
    }

    // Check total exposure
    totalExposure, err := r.getTotalExposure(ctx, trader.UserID)
    if err != nil {
        return nil, err
    }

    if totalExposure+size.ValueUSDT > limits.MaxTotalExposureUSDT {
        return &RiskCheck{false, "total exposure limit exceeded", limits}, nil
    }

    // Check daily loss limit
    dailyLoss, err := r.getDailyLoss(ctx, trader.UserID)
    if err != nil {
        return nil, err
    }

    if dailyLoss >= limits.DailyLossLimitUSDT {
        // Auto-pause trading
        r.pauseTrading(ctx, trader.UserID, "daily loss limit reached")
        return &RiskCheck{false, "daily loss limit reached", limits}, nil
    }

    // Check stop loss requirement
    if limits.RequireStopLoss && size.StopLoss == 0 {
        return &RiskCheck{false, "stop loss required", limits}, nil
    }

    // All checks passed
    return &RiskCheck{true, "", limits}, nil
}

func (r *RiskManager) getTotalExposure(ctx context.Context, userID string) (float64, error) {
    positions, err := r.supabase.GetOpenPositions(ctx, userID)
    if err != nil {
        return 0, err
    }

    var total float64
    for _, p := range positions {
        total += p.EntryValue
    }
    return total, nil
}

func (r *RiskManager) getDailyLoss(ctx context.Context, userID string) (float64, error) {
    // Sum realized PnL of all positions closed today
    start := time.Now().Truncate(24 * time.Hour)
    positions, err := r.supabase.GetPositionsClosedSince(ctx, userID, start)
    if err != nil {
        return 0, err
    }

    var loss float64
    for _, p := range positions {
        if p.RealizedPnL < 0 {
            loss += -p.RealizedPnL
        }
    }
    return loss, nil
}

func (r *RiskManager) pauseTrading(ctx context.Context, userID, reason string) error {
    return r.supabase.UpdateRiskLimits(ctx, userID, map[string]interface{}{
        "trading_paused": true,
        "pause_reason":   reason,
        "paused_at":      time.Now(),
    })
}
```

### Default Risk Limits

When user signs up or creates first trader:

```sql
INSERT INTO risk_limits (user_id, max_position_size_usdt, max_total_exposure_usdt, daily_loss_limit_usdt)
VALUES ($1, 100, 500, 50); -- Conservative defaults
```

### Emergency Stop All

```go
func (r *RiskManager) EmergencyStopAll(ctx context.Context, userID string) error {
    // 1. Pause all trading
    if err := r.pauseTrading(ctx, userID, "emergency stop"); err != nil {
        return err
    }

    // 2. Cancel all open orders
    orders, err := r.supabase.GetOpenOrders(ctx, userID)
    if err != nil {
        return err
    }

    for _, order := range orders {
        if err := r.ccxt.CancelOrder(order.BinanceOrderID, order.Symbol); err != nil {
            log.Printf("Failed to cancel order %s: %v", order.BinanceOrderID, err)
        }
    }

    // 3. Close all positions (optional - maybe too aggressive)
    // ...

    return nil
}
```

### Success Criteria

- [ ] Risk limits enforced before every order
- [ ] Daily loss limit triggers auto-pause
- [ ] Emergency stop cancels all orders instantly
- [ ] Position size calculated respecting limits
- [ ] Total exposure tracked across all positions
- [ ] Trading can be paused/resumed manually
- [ ] Audit log of all risk limit violations

### Effort Estimate

**3-4 days**
