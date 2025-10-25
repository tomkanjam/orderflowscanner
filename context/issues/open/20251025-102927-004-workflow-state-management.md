# Add Workflow State Management

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-25 10:29:27

## Context

Currently, the monitoring engine tracks active workflows in-memory (via registry). This works for MVP but has limitations:
- State lost on restart (need to reload from database)
- No persistent deduplication (could process same candle twice)
- No error tracking across restarts
- Harder to debug and monitor workflow health

Adding persistent workflow_schedules table improves robustness and observability.

**Note:** This is OPTIONAL for MVP. The system works without it by loading active monitors from signals/positions tables on startup.

## Linked Items

- Part of: `context/issues/open/20251025-102927-000-PROJECT-continuous-monitoring-system.md`
- Depends on: Sub-issues 002 (setup monitoring) and/or 003 (position management)
- Related: Vision doc describes this table in `automated-trading-workflows.md`

## Progress

*Track progress here*

## Spec

### What This Adds

**Without workflow_schedules:**
```go
// On startup, load from source tables
activeMonitors := loadFromSignalsTable()  // WHERE status='monitoring'
activePositions := loadFromPositionsTable()  // WHERE status='open'
```

**Pros:** Simple, minimal database overhead
**Cons:** No deduplication, no error tracking, harder to debug

**With workflow_schedules:**
```go
// On startup, load from workflow_schedules
activeWorkflows := loadFromWorkflowSchedules()  // WHERE is_active=true
```

**Pros:**
- Deduplication via last_candle_time
- Error tracking via consecutive_errors
- Auto-disable after repeated failures
- Better debugging (see exact state)
- Audit trail (when workflows started/stopped)

**Cons:** Additional table to maintain

### Database Schema

Create migration: `supabase/migrations/031_workflow_schedules.sql`

```sql
CREATE TABLE workflow_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Workflow identification
  workflow_type TEXT NOT NULL CHECK (workflow_type IN ('signal_monitoring', 'position_management')),
  entity_id UUID NOT NULL,  -- signal_id or position_id
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,

  -- Candle configuration
  interval TEXT NOT NULL,  -- '1m', '5m', etc. - which candles trigger this
  symbol TEXT NOT NULL,    -- Denormalized for performance

  -- Execution tracking
  last_run_at TIMESTAMPTZ,
  last_candle_time BIGINT,  -- Timestamp of last processed candle (deduplication)
  execution_count INTEGER DEFAULT 0,
  consecutive_errors INTEGER DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,

  -- Workflow state
  is_active BOOLEAN DEFAULT true,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  stopped_at TIMESTAMPTZ,
  stop_reason TEXT,  -- 'decision_changed', 'max_reanalyses', 'position_closed', 'error_limit', etc.

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_workflow_schedules_active
  ON workflow_schedules(symbol, interval)
  WHERE is_active = true;

CREATE INDEX idx_workflow_schedules_entity
  ON workflow_schedules(workflow_type, entity_id);

CREATE INDEX idx_workflow_schedules_trader
  ON workflow_schedules(trader_id, is_active);

-- Function to update updated_at on modification
CREATE OR REPLACE FUNCTION update_workflow_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_workflow_schedules_updated_at
BEFORE UPDATE ON workflow_schedules
FOR EACH ROW
EXECUTE FUNCTION update_workflow_schedules_updated_at();
```

### Integration with Monitoring Engine

**Modify:** `backend/go-screener/internal/monitoring/engine.go`

```go
// When creating workflow
func (e *Engine) startMonitoring(signalID, traderID, userID, symbol, interval string) {
	// Create in-memory state (existing)
	state := &MonitoringState{...}
	e.registry.Add(state)

	// NEW: Create persistent workflow schedule
	workflowID, err := e.supabase.CreateWorkflowSchedule(e.ctx, &WorkflowSchedule{
		WorkflowType: "signal_monitoring",
		EntityID:     signalID,
		TraderID:     traderID,
		UserID:       userID,
		Symbol:       symbol,
		Interval:     interval,
		IsActive:     true,
	})

	if err != nil {
		log.Printf("[MonitoringEngine] Failed to create workflow schedule: %v", err)
		// Continue anyway (in-memory still works)
	} else {
		state.WorkflowID = workflowID  // Link in-memory state to DB record
	}
}

// When processing candle close
func (e *Engine) reanalyzeSignal(monitor *MonitoringState, candleEvent *eventbus.CandleCloseEvent) {
	// NEW: Check deduplication
	if e.shouldSkipCandle(monitor, candleEvent) {
		return  // Already processed this candle
	}

	// ... existing reanalysis logic ...

	// NEW: Update workflow schedule
	if monitor.WorkflowID != "" {
		e.supabase.UpdateWorkflowSchedule(e.ctx, monitor.WorkflowID, &WorkflowUpdate{
			LastRunAt:       time.Now(),
			LastCandleTime:  candleEvent.Kline.CloseTime,
			ExecutionCount:  monitor.ReanalysisCount,
			ConsecutiveErrors: 0,  // Reset on success
		})
	}
}

// NEW: Deduplication check
func (e *Engine) shouldSkipCandle(monitor *MonitoringState, candleEvent *eventbus.CandleCloseEvent) bool {
	if monitor.WorkflowID == "" {
		return false  // No workflow schedule, can't deduplicate
	}

	workflow, err := e.supabase.GetWorkflowSchedule(e.ctx, monitor.WorkflowID)
	if err != nil {
		return false  // On error, don't skip (let it try)
	}

	// Skip if we already processed this exact candle
	if workflow.LastCandleTime == candleEvent.Kline.CloseTime {
		log.Printf("[MonitoringEngine] Skipping duplicate candle %d for signal %s",
			candleEvent.Kline.CloseTime, monitor.SignalID)
		return true
	}

	return false
}

// When stopping workflow
func (e *Engine) stopMonitoring(signalID string, reason string) {
	e.registry.Remove(signalID)

	// NEW: Mark workflow as inactive
	if monitor := e.registry.Get(signalID); monitor != nil && monitor.WorkflowID != "" {
		e.supabase.UpdateWorkflowSchedule(e.ctx, monitor.WorkflowID, &WorkflowUpdate{
			IsActive:   false,
			StoppedAt:  time.Now(),
			StopReason: reason,
		})
	}
}

// Error handling
func (e *Engine) handleReanalysisError(monitor *MonitoringState, err error) {
	if monitor.WorkflowID == "" {
		return  // No workflow schedule to update
	}

	// Update error tracking
	consecutiveErrors := monitor.ConsecutiveErrors + 1

	e.supabase.UpdateWorkflowSchedule(e.ctx, monitor.WorkflowID, &WorkflowUpdate{
		ConsecutiveErrors: consecutiveErrors,
		LastError:         err.Error(),
		LastErrorAt:       time.Now(),
	})

	// Auto-disable after too many errors
	if consecutiveErrors >= 5 {
		log.Printf("[MonitoringEngine] Disabling workflow %s after %d consecutive errors",
			monitor.WorkflowID, consecutiveErrors)

		e.supabase.UpdateWorkflowSchedule(e.ctx, monitor.WorkflowID, &WorkflowUpdate{
			IsActive:   false,
			StopReason: "error_limit_exceeded",
			StoppedAt:  time.Now(),
		})

		e.registry.Remove(monitor.SignalID)

		// Notify user
		e.notifyUser(monitor.UserID, "workflow_disabled", fmt.Sprintf(
			"Workflow disabled for signal %s after %d consecutive errors",
			monitor.SignalID, consecutiveErrors))
	}
}
```

### Files to Create/Modify

**New:**
- `supabase/migrations/031_workflow_schedules.sql`

**Modify:**
- `backend/go-screener/internal/monitoring/engine.go`
- `backend/go-screener/internal/monitoring/position_manager.go` (same pattern)
- `backend/go-screener/internal/monitoring/adapters.go` (Supabase methods)

### Testing

**1. Deduplication Test:**
```go
func TestDeduplication(t *testing.T) {
	// Process candle at time T
	// Try to process same candle again
	// Verify second call is skipped
	// Verify only one analysis created
}
```

**2. Error Tracking Test:**
```go
func TestConsecutiveErrors(t *testing.T) {
	// Simulate 5 consecutive failures
	// Verify workflow disabled after 5th
	// Verify user notified
}
```

**3. Persistence Test:**
```go
func TestWorkflowPersistence(t *testing.T) {
	// Create workflow
	// Restart monitoring engine
	// Verify workflow reloaded from database
	// Verify monitoring continues
}
```

### Success Criteria

- [ ] workflow_schedules table created
- [ ] Workflows created when monitoring/management starts
- [ ] last_candle_time updated on each execution
- [ ] Deduplication prevents duplicate processing
- [ ] Error tracking updates consecutive_errors
- [ ] Workflows auto-disabled after 5 consecutive errors
- [ ] Users notified when workflow disabled
- [ ] Workflows persist across engine restarts
- [ ] is_active flag prevents double-processing

### Notes

**When to implement:**
- After sub-issues 002 and 003 are working
- Before production rollout (adds robustness)
- Can be added incrementally (doesn't break existing code)

**Benefits vs cost:**
- **Benefits:** Deduplication, error tracking, audit trail, better debugging
- **Cost:** Additional database table, more complex code
- **Verdict:** Worth it for production, optional for MVP testing

### Effort Estimate

**2-3 days**
- Day 1: Database schema, migration
- Day 2: Integration with monitoring engine + position manager
- Day 3: Testing (deduplication, error tracking, persistence)
