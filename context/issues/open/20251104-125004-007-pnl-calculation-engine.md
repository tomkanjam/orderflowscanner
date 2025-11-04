# Implement PnL Calculation Engine

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 12:50:04

## Context

Build real-time profit/loss tracking for open and closed positions. Calculate unrealized PnL for monitoring and realized PnL on position close.

**Key metrics:**
- Unrealized PnL (open positions)
- Realized PnL (closed positions)
- Win rate (% profitable trades)
- Average win/loss
- Total return %

## Linked Items

- Part of: `context/issues/open/20251104-125004-000-PROJECT-trade-execution-infrastructure.md`
- Depends on: `context/issues/open/20251104-125004-001-positions-schema-and-lifecycle.md`

## Progress

**Status:** Not started

## Spec

### Unrealized PnL (Open Positions)

**Calculation:**
```
Entry Value = entry_quantity * entry_price
Current Value = entry_quantity * current_price
Unrealized PnL = Current Value - Entry Value - Fees
Unrealized PnL % = (Unrealized PnL / Entry Value) * 100
```

**Implementation:**
```go
func (e *Engine) calculateUnrealizedPnL(position *Position, currentPrice float64) *PnL {
    currentValue := position.EntryQuantity * currentPrice
    pnl := currentValue - position.EntryValue - position.FeesPaid
    pnlPercent := (pnl / position.EntryValue) * 100

    return &PnL{
        PositionID:  position.ID,
        Type:        "unrealized",
        Value:       pnl,
        Percent:     pnlPercent,
        EntryValue:  position.EntryValue,
        CurrentValue: currentValue,
        UpdatedAt:   time.Now(),
    }
}
```

**Scheduled updates:**
```go
// Update unrealized PnL every 5 seconds for open positions
func (e *Engine) updateUnrealizedPnLLoop(ctx context.Context) {
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            e.updateAllUnrealizedPnL(ctx)
        }
    }
}

func (e *Engine) updateAllUnrealizedPnL(ctx context.Context) {
    // Get all open positions
    positions, err := e.supabase.GetOpenPositions(ctx)
    if err != nil {
        log.Printf("Error fetching open positions: %v", err)
        return
    }

    // Group by symbol to batch ticker requests
    bySymbol := make(map[string][]*Position)
    for _, pos := range positions {
        bySymbol[pos.Symbol] = append(bySymbol[pos.Symbol], pos)
    }

    // Fetch tickers and calculate PnL
    for symbol, positions := range bySymbol {
        ticker, err := e.binance.GetTicker(ctx, symbol)
        if err != nil {
            log.Printf("Error fetching ticker for %s: %v", symbol, err)
            continue
        }

        for _, pos := range positions {
            pnl := e.calculateUnrealizedPnL(pos, ticker.LastPrice)

            // Store in cache or publish via WebSocket
            e.cache.SetPnL(pos.ID, pnl)
            e.eventBus.PublishPnLUpdate(pnl)
        }
    }
}
```

### Realized PnL (Closed Positions)

**Calculation on position close:**
```go
func (e *Engine) finalizePosition(ctx context.Context, position *Position, exitPrice float64) error {
    exitValue := position.EntryQuantity * exitPrice
    realizedPnL := exitValue - position.EntryValue - position.FeesPaid
    realizedPnLPercent := (realizedPnL / position.EntryValue) * 100

    position.ExitPrice = exitPrice
    position.ExitValue = exitValue
    position.RealizedPnL = realizedPnL
    position.RealizedPnLPercent = realizedPnLPercent
    position.Status = "closed"
    position.ExitTime = time.Now()

    return e.supabase.UpdatePosition(ctx, position)
}
```

### Performance Metrics

**Database view for trader performance:**
```sql
CREATE VIEW trader_performance AS
SELECT
  trader_id,
  user_id,
  COUNT(*) FILTER (WHERE status = 'closed') AS total_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0) AS winning_trades,
  COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl < 0) AS losing_trades,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'closed' AND realized_pnl > 0)::DECIMAL /
    NULLIF(COUNT(*) FILTER (WHERE status = 'closed'), 0) * 100,
    2
  ) AS win_rate_percent,
  SUM(realized_pnl) FILTER (WHERE status = 'closed') AS total_realized_pnl,
  AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl > 0) AS avg_win,
  AVG(realized_pnl) FILTER (WHERE status = 'closed' AND realized_pnl < 0) AS avg_loss,
  MAX(realized_pnl) AS best_trade,
  MIN(realized_pnl) AS worst_trade,
  SUM(entry_value) FILTER (WHERE status = 'open') AS total_exposure
FROM positions
GROUP BY trader_id, user_id;
```

### Frontend Integration

**Real-time PnL updates via WebSocket:**
```typescript
// Subscribe to PnL updates for open positions
supabase
  .channel('pnl-updates')
  .on('broadcast', { event: 'pnl-update' }, (payload) => {
    const { positionId, value, percent } = payload
    updatePositionPnL(positionId, value, percent)
  })
  .subscribe()
```

**Display in positions table:**
```tsx
<Table>
  <TableRow>
    <TableCell>{position.symbol}</TableCell>
    <TableCell>${position.entry_value.toFixed(2)}</TableCell>
    <TableCell className={position.unrealized_pnl >= 0 ? 'text-green' : 'text-red'}>
      ${position.unrealized_pnl.toFixed(2)} ({position.unrealized_pnl_percent.toFixed(2)}%)
    </TableCell>
    <TableCell>{position.status}</TableCell>
  </TableRow>
</Table>
```

### PnL History

**Track PnL over time for charts:**
```sql
CREATE TABLE pnl_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id),

  pnl DECIMAL(20, 8) NOT NULL,
  pnl_percent DECIMAL(10, 4) NOT NULL,
  current_price DECIMAL(20, 8) NOT NULL,

  snapshot_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pnl_snapshots_position ON pnl_snapshots(position_id, snapshot_at DESC);
```

**Store hourly snapshots:**
```go
// Every hour, snapshot PnL for all open positions
func (e *Engine) snapshotPnL(ctx context.Context) {
    positions, _ := e.supabase.GetOpenPositions(ctx)

    for _, pos := range positions {
        ticker, _ := e.binance.GetTicker(ctx, pos.Symbol)
        pnl := e.calculateUnrealizedPnL(pos, ticker.LastPrice)

        e.supabase.CreatePnLSnapshot(ctx, &PnLSnapshot{
            PositionID:   pos.ID,
            PnL:          pnl.Value,
            PnLPercent:   pnl.Percent,
            CurrentPrice: ticker.LastPrice,
        })
    }
}
```

### Testing

**Unit tests:**
- PnL calculation accuracy (various scenarios)
- Win rate calculation
- Average win/loss calculation
- Edge cases (zero fees, exact breakeven)

**Integration tests:**
- Real-time updates work
- Snapshots stored correctly
- Performance view returns accurate data
- Frontend receives PnL updates

### Success Criteria

- [ ] Unrealized PnL calculated correctly for open positions
- [ ] Realized PnL calculated on position close
- [ ] Real-time updates every 5 seconds
- [ ] Performance metrics accurate (win rate, avg win/loss)
- [ ] PnL history tracked for charting
- [ ] Frontend displays PnL in real-time
- [ ] Database view for trader performance works
- [ ] No performance issues with 100+ open positions

### Effort Estimate

**2-3 days**
