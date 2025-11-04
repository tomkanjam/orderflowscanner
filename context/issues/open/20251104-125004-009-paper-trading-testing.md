# Paper Trading Testing and Validation

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 12:50:04

## Context

Comprehensive testing of paper trading system to validate the entire workflow before moving to real money. This is the final validation step for Phase 1.

**Goal:** Prove the system works correctly with 100+ simulated trades covering all scenarios.

## Linked Items

- Part of: `context/issues/open/20251104-125004-000-PROJECT-trade-execution-infrastructure.md` (Phase 1)
- Depends on:
  - `context/issues/open/20251104-125004-001-positions-schema-and-lifecycle.md`
  - `context/issues/open/20251104-125004-004-risk-management-system.md`
  - `context/issues/open/20251104-125004-006-paper-trading-mode.md`
  - `context/issues/open/20251104-125004-007-pnl-calculation-engine.md`
- Blocks: Phase 2 (real trading) - cannot proceed without validation

## Progress

**Status:** Not started

## Spec

### Testing Objectives

1. **Functional correctness** - All workflows execute as designed
2. **PnL accuracy** - Calculations match manual verification
3. **Risk enforcement** - Limits never violated
4. **State management** - Positions transition correctly
5. **Performance** - System handles load without issues
6. **Integration** - Works with monitoring and AI management

### Test Scenarios

**Basic Workflow (20 trades):**
- [ ] Signal → Position created → Order filled → Position open
- [ ] Position open → AI close decision → Position closed
- [ ] PnL calculated correctly (profit and loss)
- [ ] Signal status updated throughout

**Position Lifecycle (15 trades):**
- [ ] All states tested: created → submitting → open → closing → closed
- [ ] Failed order handling (simulated exchange errors)
- [ ] Partial fills (for multi-step closes)
- [ ] Position monitoring triggers correctly

**Risk Management (15 trades):**
- [ ] Position size limits enforced
- [ ] Daily loss limit triggers pause
- [ ] Max total exposure prevents new positions
- [ ] Emergency stop works instantly
- [ ] Risk check failures logged correctly

**PnL Calculations (20 trades):**
- [ ] Unrealized PnL updates in real-time
- [ ] Realized PnL accurate on close
- [ ] Fees calculated correctly
- [ ] Win rate calculation accurate
- [ ] Average win/loss correct

**Market Conditions (20 trades):**
- [ ] Trending market (strong directional)
- [ ] Ranging market (choppy)
- [ ] Volatile market (large swings)
- [ ] Low volume (wide spreads)
- [ ] High volume (tight spreads)

**Edge Cases (10 trades):**
- [ ] Exact breakeven trade (zero PnL)
- [ ] Position closed immediately after open
- [ ] Multiple positions same symbol
- [ ] Concurrent position management
- [ ] System restart with open positions

### Automated Test Suite

```go
// backend/go-screener/internal/execution/executor_test.go

func TestPaperTradingWorkflow(t *testing.T) {
    executor := setupTestExecutor()

    // Test basic workflow
    t.Run("BasicWorkflow", func(t *testing.T) {
        signal := createTestSignal("BTCUSDT", "enter_trade")

        position, err := executor.Execute(ctx, signal)
        require.NoError(t, err)
        assert.Equal(t, "open", position.Status)
        assert.True(t, position.IsPaperTrade)

        // Simulate AI close decision
        err = executor.ClosePosition(ctx, position.ID)
        require.NoError(t, err)

        // Verify closed
        position = executor.GetPosition(position.ID)
        assert.Equal(t, "closed", position.Status)
        assert.NotZero(t, position.RealizedPnL)
    })

    // Test risk limits
    t.Run("RiskLimits", func(t *testing.T) {
        // Set tight limit
        setRiskLimit(testUserID, "max_position_size_usdt", 10)

        // Try to open position larger than limit
        signal := createLargeSignal("ETHUSDT", 1000) // $1000 position

        _, err := executor.Execute(ctx, signal)
        assert.Error(t, err)
        assert.Contains(t, err.Error(), "position too large")
    })

    // Test PnL accuracy
    t.Run("PnLAccuracy", func(t *testing.T) {
        entryPrice := 45000.0
        exitPrice := 46000.0
        quantity := 0.1

        position := createTestPosition(entryPrice, quantity)
        closePosition(position, exitPrice)

        expectedPnL := (exitPrice - entryPrice) * quantity - fees
        assert.InDelta(t, expectedPnL, position.RealizedPnL, 0.01)
    })
}

func TestPaperTradingLoad(t *testing.T) {
    executor := setupTestExecutor()

    // Execute 100 trades in parallel
    var wg sync.WaitGroup
    errors := make(chan error, 100)

    for i := 0; i < 100; i++ {
        wg.Add(1)
        go func(i int) {
            defer wg.Done()

            signal := createTestSignal(fmt.Sprintf("TEST%dUSDT", i), "enter_trade")
            _, err := executor.Execute(ctx, signal)
            if err != nil {
                errors <- err
            }
        }(i)
    }

    wg.Wait()
    close(errors)

    // Check for errors
    var errCount int
    for err := range errors {
        t.Logf("Error: %v", err)
        errCount++
    }

    // Allow max 5% error rate
    assert.LessOrEqual(t, errCount, 5, "Too many errors in load test")
}
```

### Manual Testing Checklist

**Verification per trade:**
- [ ] Entry price matches market data
- [ ] Slippage simulation realistic (0-0.1%)
- [ ] Fees calculated (0.1% Binance fee)
- [ ] Position stored with correct data
- [ ] Signal status updated
- [ ] Paper balance updated
- [ ] Monitoring workflow triggered
- [ ] PnL displayed in frontend
- [ ] All database triggers fired

**Risk scenarios:**
- [ ] Hit daily loss limit → trading paused
- [ ] Hit max exposure → new positions rejected
- [ ] Emergency stop → all activity halted
- [ ] Resume trading → works correctly

**Integration with monitoring:**
- [ ] Position opened → monitoring starts
- [ ] AI returns "close" decision → position closes
- [ ] AI returns "adjust_sl" → stop loss updated
- [ ] AI returns "hold" → position continues

### Performance Benchmarks

**Targets:**
- [ ] Average execution time < 500ms (signal → position opened)
- [ ] PnL update latency < 100ms
- [ ] Can handle 50+ concurrent positions
- [ ] Database queries optimized (< 10ms avg)
- [ ] Memory usage reasonable (< 100MB for 100 positions)

**Load test:**
```bash
# Execute 100 paper trades in 1 minute
for i in {1..100}; do
  curl -X POST /api/execute-signal \
    -H "Content-Type: application/json" \
    -d "{\"signal_id\": \"test-signal-$i\"}"
  sleep 0.6
done
```

### Data Validation

**Compare against manual calculations:**
- [ ] Pick 10 random trades
- [ ] Manually calculate PnL
- [ ] Compare with database values
- [ ] Verify 100% match

**Database consistency:**
- [ ] Every position has at least one order
- [ ] Order quantities sum to position quantity
- [ ] All closed positions have realized PnL
- [ ] Paper balances sum correctly
- [ ] No orphaned records

### Frontend Testing

**UI verification:**
- [ ] Positions table shows all paper trades
- [ ] Real-time PnL updates work
- [ ] Paper balance displayed correctly
- [ ] Win rate and stats accurate
- [ ] Charts render correctly
- [ ] Filtering and sorting work

**User experience:**
- [ ] Clear indication of paper mode
- [ ] Performance metrics visible
- [ ] Can view trade history
- [ ] Can see current positions
- [ ] Notifications work

### Success Criteria

**Must pass before Phase 2:**
- [ ] 100+ paper trades executed successfully
- [ ] < 5% error rate
- [ ] All PnL calculations verified accurate
- [ ] Risk limits never violated
- [ ] All state transitions correct
- [ ] Performance benchmarks met
- [ ] Integration with monitoring validated
- [ ] Frontend displays all data correctly
- [ ] No memory leaks or crashes
- [ ] Code review approved

**Bonus (nice to have):**
- [ ] 1000+ trades stress test passed
- [ ] Multi-user testing (5+ paper traders)
- [ ] 24-hour continuous operation
- [ ] Detailed performance profiling

### Documentation

Create testing report:

```markdown
# Paper Trading Validation Report

## Test Summary
- Total Trades: 124
- Successful: 120 (96.8%)
- Failed: 4 (3.2%)
- Average PnL: +2.3%
- Win Rate: 58.3%

## Performance
- Avg execution time: 342ms
- PnL update latency: 67ms
- Max concurrent positions: 63
- Database query avg: 8.2ms

## Issues Found
1. Race condition in position close (fixed in commit abc123)
2. PnL calculation rounding error (fixed in commit def456)
3. Risk limit check missing edge case (fixed in commit ghi789)

## Conclusion
✅ System ready for Phase 2 (real trading)
```

### Effort Estimate

**3-5 days**
- Day 1: Set up automated test suite
- Day 2-3: Execute 100+ trades, identify and fix bugs
- Day 4: Manual testing and verification
- Day 5: Documentation and phase approval
