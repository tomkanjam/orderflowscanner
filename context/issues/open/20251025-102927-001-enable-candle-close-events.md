# Enable Candle Close Event Emission

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-25 10:29:27

## Context

The Go backend currently receives WebSocket kline updates from Binance and stores them in memory, but does NOT emit events when candles close. The continuous monitoring system needs candle close events to trigger reanalysis at the right moments.

**Current:** WebSocket receives klines → stores in memory → (nothing emitted)
**Needed:** WebSocket receives klines → stores in memory → emits candle_close event when isClosed=true

This is the foundation for both setup monitoring and position management workflows.

## Linked Items

- Part of: `context/issues/open/20251025-102927-000-PROJECT-continuous-monitoring-system.md`
- Depends on: Nothing (foundational)
- Blocks: Sub-issues 002 (setup monitoring) and 003 (position management)

## Progress

*Track progress here*

## Spec

### What Needs to Change

**1. Add CandleCloseEvent Type**

File: `backend/go-screener/internal/eventbus/types.go`

```go
// Add new event type
const (
	EventTypeCandleOpen   EventType = "candle_open"
	EventTypeCandleClose  EventType = "candle_close"  // NEW
	EventTypeSignalCreated EventType = "signal_created"
	EventTypeSignalUpdated EventType = "signal_updated"
)

// Add new event struct
type CandleCloseEvent struct {
	Symbol      string
	Interval    string
	Kline       types.Kline  // The just-closed candle
	CloseTime   time.Time    // When it closed
}
```

**2. Emit Event on Candle Close**

File: WebSocket kline handler (need to find the exact file)

```go
// Pseudocode - actual implementation may vary
func handleKlineUpdate(symbol string, interval string, kline types.Kline, isClosed bool) {
	// Existing logic - store kline
	storeKline(symbol, interval, kline)

	// NEW - emit close event
	if isClosed {
		eventBus.Publish(eventbus.EventTypeCandleClose, &eventbus.CandleCloseEvent{
			Symbol:    symbol,
			Interval:  interval,
			Kline:     kline,
			CloseTime: time.Unix(kline.CloseTime/1000, 0),
		})
	}
}
```

**3. Verify Event Emission**

Add logging to confirm events are being emitted:

```go
if isClosed {
	log.Printf("[WebSocket] Candle closed: %s-%s at %s", symbol, interval, closeTime)
	// emit event...
}
```

### Files to Modify

1. `backend/go-screener/internal/eventbus/types.go` - Add CandleCloseEvent
2. WebSocket kline handler - Emit events on close (need to locate exact file)
3. Possibly `backend/go-screener/internal/eventbus/bus.go` - Ensure event type is handled

### Testing

**Unit Test:**
```go
func TestCandleCloseEventEmission(t *testing.T) {
	bus := eventbus.NewEventBus()
	received := false

	// Subscribe to candle close events
	bus.Subscribe(eventbus.EventTypeCandleClose, func(event interface{}) {
		closeEvent := event.(*eventbus.CandleCloseEvent)
		assert.Equal(t, "BTCUSDT", closeEvent.Symbol)
		assert.Equal(t, "1m", closeEvent.Interval)
		received = true
	})

	// Simulate candle close
	handleKlineUpdate("BTCUSDT", "1m", testKline, true) // isClosed=true

	assert.True(t, received, "Should receive candle close event")
}
```

**Integration Test:**
1. Connect to Binance WebSocket (BTCUSDT, 1m interval)
2. Subscribe to candle_close events in Go backend
3. Wait for 1 minute (one candle to close)
4. Verify event was emitted with correct symbol, interval, kline data

**Manual Verification:**
```bash
# Start Go backend with debug logging
# Watch logs for "Candle closed: BTCUSDT-1m at ..."
# Should see one log per candle close per symbol/interval
```

### Success Criteria

- [ ] CandleCloseEvent type added to eventbus
- [ ] Events emitted when isClosed=true from WebSocket
- [ ] Events contain: symbol, interval, complete kline, close time
- [ ] Unit tests pass
- [ ] Integration test confirms events for live data
- [ ] Logging shows events being emitted (visible in logs)
- [ ] No performance degradation (event emission is lightweight)

### Notes

**Important considerations:**

1. **Event frequency:** With many symbols and intervals, this could be hundreds of events per minute
2. **Performance:** Event emission must be non-blocking
3. **Deduplication:** Each candle should only emit ONE close event (track by timestamp)
4. **Subscriber readiness:** Make sure event bus can handle subscribers that aren't ready yet

**Deduplication strategy:**
```go
// Track last closed candle to prevent duplicates
lastClosedCandles := make(map[string]int64) // key: "BTCUSDT-1m", value: closeTime

if isClosed {
	key := fmt.Sprintf("%s-%s", symbol, interval)
	if lastClosedCandles[key] != kline.CloseTime {
		lastClosedCandles[key] = kline.CloseTime
		eventBus.Publish(...)  // Only emit if not duplicate
	}
}
```

### Effort Estimate

**2-3 days**
- Day 1: Add event type, locate WebSocket handler, implement emission
- Day 2: Unit tests, integration tests, deduplication logic
- Day 3: Manual testing with live WebSocket, verify performance
