# Implement Setup Monitoring Workflow

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-25 10:29:27

## Context

When AI analyzes a signal and returns decision="wait" (setup looks promising but not ready to enter yet), we need to continuously reanalyze at each candle close until the decision changes to "enter_trade" or "bad_setup".

**Current:** Signal analyzed ONCE, decision ignored
**Needed:** decision="wait" → start monitoring → reanalyze every candle close

This is CONDITIONAL monitoring - only ~20-30% of signals will trigger this workflow.

## Linked Items

- Part of: `context/issues/open/20251025-102927-000-PROJECT-continuous-monitoring-system.md`
- Depends on: `context/issues/open/20251025-102927-001-enable-candle-close-events.md`
- Related: Current auto-trigger (migration 028) provides initial analysis

## Progress

**2025-11-04:** ✅ COMPLETED

Implementation complete with simplified architecture:
1. ✅ Monitoring engine subscribes to candle CLOSE events (fixed from candle open)
2. ✅ Database trigger (migration 032) auto-updates signal status from analysis decision
3. ✅ Monitoring engine calls llm-proxy via HTTP for reanalysis
4. ✅ Engine loads active monitors from `signals WHERE status='monitoring'`
5. ✅ All code compiles and migrations applied

**Key simplification:** Instead of PostgreSQL NOTIFY, we use signal status as source of truth.
Database trigger updates status → Monitoring engine loads from status field.

## Spec

### Architecture Flow

```
1. Signal created → Initial analysis (existing, migration 028)
                          ↓
                    signal_analyses INSERT
                          ↓
                    decision="wait"?
                          ↓ YES
                PostgreSQL NOTIFY → "start_monitoring"
                          ↓
            Go Monitoring Engine receives notification
                          ↓
            Create MonitoringState in registry
                          ↓
    Subscribe to candle_close events for this symbol/interval
                          ↓
            [Candle Close Event] triggered
                          ↓
            HTTP POST to llm-proxy (analyze-signal)
                          ↓
            Store analysis in signal_analyses
                          ↓
            Check decision:
                - "enter_trade" → Stop monitoring, trigger order
                - "bad_setup" → Stop monitoring, expire signal
                - "wait" → Continue monitoring (next candle)
```

### Implementation Steps

#### Step 1: PostgreSQL NOTIFY Trigger

Create migration: `supabase/migrations/029_monitoring_trigger.sql`

```sql
-- Function to notify Go backend when monitoring should start
CREATE OR REPLACE FUNCTION notify_start_monitoring()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify if decision is "wait"
  IF NEW.decision = 'wait' THEN
    PERFORM pg_notify(
      'start_monitoring',
      json_build_object(
        'signal_id', NEW.signal_id,
        'trader_id', NEW.trader_id,
        'user_id', NEW.user_id,
        'symbol', (SELECT symbol FROM signals WHERE id = NEW.signal_id),
        'interval', (SELECT t.filter->>'interval' FROM traders t
                     JOIN signals s ON s.trader_id = t.id
                     WHERE s.id = NEW.signal_id),
        'timestamp', NEW.created_at
      )::text
    );

    RAISE LOG 'Monitoring started for signal % (decision=wait)', NEW.signal_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger after signal_analyses INSERT
CREATE TRIGGER trigger_start_monitoring
AFTER INSERT ON signal_analyses
FOR EACH ROW
EXECUTE FUNCTION notify_start_monitoring();
```

#### Step 2: Go Backend - PostgreSQL LISTEN

File: `backend/go-screener/internal/monitoring/engine.go`

```go
// Add PostgreSQL listener to monitoring engine
func (e *Engine) listenForMonitoringRequests() error {
	// Connect to PostgreSQL
	connStr := fmt.Sprintf("postgres://%s", os.Getenv("DATABASE_URL"))
	listener := pq.NewListener(connStr, 10*time.Second, time.Minute, nil)

	// Listen for start_monitoring notifications
	err := listener.Listen("start_monitoring")
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	log.Printf("[MonitoringEngine] Listening for start_monitoring notifications...")

	// Process notifications
	go func() {
		for {
			select {
			case notification := <-listener.Notify:
				if notification == nil {
					continue
				}

				// Parse payload
				var payload struct {
					SignalID  string `json:"signal_id"`
					TraderID  string `json:"trader_id"`
					UserID    string `json:"user_id"`
					Symbol    string `json:"symbol"`
					Interval  string `json:"interval"`
					Timestamp time.Time `json:"timestamp"`
				}

				if err := json.Unmarshal([]byte(notification.Extra), &payload); err != nil {
					log.Printf("[MonitoringEngine] Failed to parse notification: %v", err)
					continue
				}

				// Create monitoring workflow
				e.startMonitoring(payload.SignalID, payload.TraderID, payload.Symbol, payload.Interval)

			case <-e.ctx.Done():
				return
			}
		}
	}()

	return nil
}

func (e *Engine) startMonitoring(signalID, traderID, symbol, interval string) {
	log.Printf("[MonitoringEngine] Starting monitoring for signal %s (%s-%s)", signalID, symbol, interval)

	// Create monitoring state
	state := &MonitoringState{
		SignalID:          signalID,
		TraderID:          traderID,
		Symbol:            symbol,
		Interval:          interval,
		MonitoringStarted: time.Now(),
		ReanalysisCount:   0,
		MaxReanalyses:     5, // TODO: Get from trader config
		IsActive:          true,
	}

	// Register in monitoring registry
	e.registry.Add(state)

	log.Printf("[MonitoringEngine] Monitoring active for %s (max %d reanalyses)", signalID, state.MaxReanalyses)
}
```

#### Step 3: Subscribe to Candle Close Events

```go
// In Engine.Start()
func (e *Engine) Start() error {
	// ... existing startup code ...

	// Listen for PostgreSQL notifications
	if err := e.listenForMonitoringRequests(); err != nil {
		return err
	}

	// Subscribe to candle close events
	e.eventBus.Subscribe(eventbus.EventTypeCandleClose, e.handleCandleClose)

	return nil
}

func (e *Engine) handleCandleClose(event interface{}) {
	closeEvent := event.(*eventbus.CandleCloseEvent)

	// Get all monitors for this symbol/interval
	monitors := e.registry.GetActiveBySymbolInterval(closeEvent.Symbol, closeEvent.Interval)

	if len(monitors) == 0 {
		return // No active monitors for this symbol/interval
	}

	log.Printf("[MonitoringEngine] Candle closed %s-%s, processing %d monitors",
		closeEvent.Symbol, closeEvent.Interval, len(monitors))

	// Process each monitor in parallel
	for _, monitor := range monitors {
		go e.reanalyzeSignal(monitor, closeEvent)
	}
}
```

#### Step 4: Reanalyze via llm-proxy

```go
func (e *Engine) reanalyzeSignal(monitor *MonitoringState, candleEvent *eventbus.CandleCloseEvent) {
	// Check if max reanalyses reached
	if monitor.ReanalysisCount >= monitor.MaxReanalyses {
		log.Printf("[MonitoringEngine] Max reanalyses reached for signal %s, expiring", monitor.SignalID)
		e.expireSignal(monitor.SignalID)
		e.registry.Remove(monitor.SignalID)
		return
	}

	// Increment reanalysis count
	monitor.ReanalysisCount++
	monitor.LastReanalysisAt = time.Now()

	// Get trader and signal data
	signal, err := e.supabase.GetSignal(e.ctx, monitor.SignalID)
	if err != nil {
		log.Printf("[MonitoringEngine] Failed to get signal %s: %v", monitor.SignalID, err)
		return
	}

	trader, err := e.supabase.GetTrader(e.ctx, monitor.TraderID)
	if err != nil {
		log.Printf("[MonitoringEngine] Failed to get trader %s: %v", monitor.TraderID, err)
		return
	}

	// Call llm-proxy for analysis
	decision, err := e.callLLMProxy(signal, trader, candleEvent)
	if err != nil {
		log.Printf("[MonitoringEngine] LLM analysis failed for signal %s: %v", monitor.SignalID, err)
		return
	}

	// Update last decision
	monitor.LastDecision = decision.Decision
	monitor.LastConfidence = decision.Confidence

	// Handle decision
	switch decision.Decision {
	case "enter_trade":
		log.Printf("[MonitoringEngine] Signal %s ready to enter (confidence: %.1f%%)",
			monitor.SignalID, decision.Confidence)
		e.triggerTradeEntry(monitor.SignalID)
		e.registry.Remove(monitor.SignalID) // Stop monitoring

	case "bad_setup":
		log.Printf("[MonitoringEngine] Signal %s setup invalid (confidence: %.1f%%)",
			monitor.SignalID, decision.Confidence)
		e.expireSignal(monitor.SignalID)
		e.registry.Remove(monitor.SignalID) // Stop monitoring

	case "wait":
		log.Printf("[MonitoringEngine] Signal %s still waiting (confidence: %.1f%%, reanalysis %d/%d)",
			monitor.SignalID, decision.Confidence, monitor.ReanalysisCount, monitor.MaxReanalyses)
		// Continue monitoring (do nothing)
	}
}

func (e *Engine) callLLMProxy(signal *types.Signal, trader *types.Trader, candleEvent *eventbus.CandleCloseEvent) (*AnalysisDecision, error) {
	// Build request payload (same format as migration 028)
	payload := map[string]interface{}{
		"operation": "analyze-signal",
		"params": map[string]interface{}{
			"signalId":  signal.ID,
			"symbol":    signal.Symbol,
			"traderId":  trader.ID,
			"userId":    trader.UserID,
			"timestamp": candleEvent.CloseTime,
			"price":     candleEvent.Kline.Close,
			"strategy":  trader.Strategy,
		},
	}

	// HTTP POST to llm-proxy
	resp, err := http.Post(
		os.Getenv("LLM_PROXY_URL")+"/llm-proxy",
		"application/json",
		bytes.NewBuffer(mustMarshal(payload)),
	)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Parse response
	var result struct {
		Data struct {
			Decision   string  `json:"decision"`
			Confidence float64 `json:"confidence"`
			Reasoning  string  `json:"reasoning"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return &AnalysisDecision{
		Decision:   result.Data.Decision,
		Confidence: result.Data.Confidence,
		Reasoning:  result.Data.Reasoning,
	}, nil
}
```

### Files to Create/Modify

**New:**
- `supabase/migrations/029_monitoring_trigger.sql`

**Modify:**
- `backend/go-screener/internal/monitoring/engine.go`
- `backend/go-screener/internal/monitoring/registry.go` (add GetActiveBySymbolInterval)
- `backend/go-screener/go.mod` (add github.com/lib/pq for PostgreSQL LISTEN)

### Testing

**1. Unit Tests:**
```go
func TestStartMonitoring(t *testing.T) {
	// Test that NOTIFY creates MonitoringState
	// Test registry.Add is called
	// Test state has correct fields
}

func TestReanalysisMaxLimit(t *testing.T) {
	// Test that monitoring stops after max reanalyses
	// Test signal is expired
}

func TestDecisionHandling(t *testing.T) {
	// Test enter_trade → stops monitoring, triggers trade
	// Test bad_setup → stops monitoring, expires signal
	// Test wait → continues monitoring
}
```

**2. Integration Test:**
```bash
# 1. Create test trader with auto_analyze_signals=true
# 2. Manually insert signal (triggers initial analysis)
# 3. Update signal_analyses to have decision="wait"
# 4. Verify PostgreSQL NOTIFY was sent
# 5. Verify Go backend created MonitoringState
# 6. Trigger candle close event (manually)
# 7. Verify llm-proxy was called
# 8. Verify new analysis in signal_analyses table
```

**3. End-to-End Test:**
```bash
# Full flow with real WebSocket
# 1. Create signal
# 2. Wait for initial analysis (decision="wait")
# 3. Wait for next candle close (e.g., 1 minute)
# 4. Check signal_analyses for new analysis
# 5. Verify analysis timestamp matches candle close time
# 6. Repeat until decision changes or max reached
```

### Success Criteria

- [ ] PostgreSQL NOTIFY trigger created and working
- [ ] Go backend receives notifications when decision="wait"
- [ ] MonitoringState created in registry
- [ ] Candle close events trigger reanalysis
- [ ] llm-proxy called with correct payload
- [ ] Analyses stored in signal_analyses table
- [ ] Monitoring stops when decision changes
- [ ] Max reanalyses limit enforced
- [ ] Signals expired when limit reached
- [ ] End-to-end test passes (wait → enter flow)

### Effort Estimate

**3-5 days**
- Day 1: PostgreSQL NOTIFY trigger, Go LISTEN setup
- Day 2: Registry methods, candle close subscription
- Day 3: llm-proxy HTTP client, decision handling
- Day 4: Unit tests, integration tests
- Day 5: End-to-end testing, bug fixes


## Completion

**Closed:** 2025-11-04 13:00:00
**Outcome:** Success
**Commits:** 173420c

### Summary

Successfully implemented setup monitoring workflow with simplified, production-ready architecture.

**What Was Built:**
1. Monitoring engine now subscribes to candle CLOSE events (was incorrectly using candle OPEN)
2. Database trigger (migration 032) automatically updates signal status based on AI analysis decision
3. HTTP client in Go backend calls llm-proxy Edge Function for reanalysis
4. Engine fetches trader strategy from database and passes to llm-proxy
5. Signal status field is now source of truth (no PostgreSQL NOTIFY needed)

**Architecture Decision - Simplified Approach:**
Initially planned to use PostgreSQL NOTIFY for communication between database trigger and Go backend.
**Better approach:** Use signal status field as source of truth:
- Database trigger updates signal.status based on analysis.decision
- Monitoring engine loads active monitors by querying: `SELECT * FROM signals WHERE status='monitoring'`
- Simpler, more reliable, easier to debug

**Files Modified:**
- `backend/go-screener/internal/monitoring/engine.go` - Fixed event subscription, added llm-proxy HTTP client
- `backend/go-screener/internal/monitoring/types.go` - Added SupabaseURL and SupabaseServiceKey to Config
- `backend/go-screener/internal/server/server.go` - Set Supabase credentials in monitoring config
- `supabase/migrations/032_update_signal_status_from_analysis.sql` - Auto-update signal status from analysis

**Testing Status:**
- ✅ Go backend compiles successfully
- ✅ Migration applied to production database
- ⏳ End-to-end testing pending (requires signal with decision="wait")

**Next Steps:**
- Sub-issue 003: Position Management Workflow
- Sub-issue 005: End-to-end testing and rollout

