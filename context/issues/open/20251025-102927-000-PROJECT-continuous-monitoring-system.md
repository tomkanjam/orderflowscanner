# Implement Continuous Monitoring System

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-25 10:29:27

## Context

Currently we have basic auto-trigger AI analysis (migration 028) that analyzes signals ONCE on creation. The continuous monitoring system will add **conditional** monitoring and position management workflows that analyze at each candle close based on AI decisions.

**Vision Document:** `context/docs/automated-trading-workflows.md`
**Implementation Plan:** `context/docs/continuous-monitoring-implementation-plan.md`

### Two Workflows

1. **Setup Monitoring (Conditional)**
   - Triggered when initial analysis returns decision="wait"
   - Reanalyzes at each candle close
   - Stops when decision changes to "enter_trade" or "bad_setup"
   - Affects ~20-30% of signals

2. **Position Management (Always Active)**
   - Triggered when position opens
   - Analyzes at each candle close to manage trade
   - Stops when position fully closed
   - Affects 100% of open positions

### Why This Matters

**Current limitation:** Signals analyzed once, no follow-up
**With continuous monitoring:**
- Watch promising setups that aren't ready yet ("wait" decisions)
- Actively manage open positions (adjust SL/TP, scale out, close)
- AI makes decisions with latest market data at each candle close

**Token cost:** ~2.4x increase (~$4/month for 100 signals/day) - very reasonable due to conditional triggering

## Linked Items

- Part of: End-to-end trader workflow implementation initiative
- Related: `context/issues/closed/20251025-084409-fix-ai-analysis-trigger-integration.md` (initial auto-trigger)
- Vision: `context/docs/automated-trading-workflows.md`
- Plan: `context/docs/continuous-monitoring-implementation-plan.md`

## Sub-issues

- [x] `context/issues/closed/20251025-102927-001-enable-candle-close-events.md` - ✅ Enable candle close event emission (Go backend)
- [ ] `context/issues/open/20251025-102927-002-setup-monitoring-workflow.md` - Implement setup monitoring (conditional)
- [ ] `context/issues/open/20251025-102927-003-position-management-workflow.md` - Implement position management (always active)
- [ ] `context/issues/open/20251025-102927-004-workflow-state-management.md` - Add workflow_schedules table (optional enhancement)
- [ ] `context/issues/open/20251025-102927-005-testing-and-rollout.md` - End-to-end testing and gradual rollout

## Progress

**2025-10-25:** ✅ Sub-issue 001 completed - Candle close events now emitted from WebSocket

## Spec

### High-Level Architecture

```
Current (Working):
Signal INSERT → Database Trigger → llm-proxy → signal_analyses table
                                                      ↓
                                            decision (enter_trade | bad_setup | wait)

Phase 1-3 (Setup Monitoring):
                                            decision="wait"
                                                      ↓
                                         PostgreSQL NOTIFY
                                                      ↓
                                         Go Monitoring Engine
                                                      ↓
                        [Candle Close Event] → llm-proxy → decision
                                                                ↓
                                                    enter_trade → Open position, STOP
                                                    bad_setup → Expire signal, STOP
                                                    wait → Continue monitoring

Phase 4 (Position Management):
Position Opened → Go Management Engine
                          ↓
        [Candle Close Event] → llm-proxy → management decision
                                                    ↓
                                        hold | adjust_sl | adjust_tp | reduce | close
```

### Key Design Decisions

1. **Conditional, not universal** - Only monitor signals with decision="wait"
2. **Event-driven** - Candle close events trigger analysis, not timers
3. **Reuse llm-proxy** - Same analyze-signal endpoint for initial + monitoring
4. **Decision-based termination** - Workflows stop when decision changes or position closes
5. **PostgreSQL NOTIFY** - Database communicates decisions to Go backend

### Implementation Phases

**Phase 1:** Candle close events (2-3 days)
- Update WebSocket handler to emit candle close events
- Add EventTypeCandleClose to eventbus

**Phase 2:** Setup monitoring (3-5 days)
- Add PostgreSQL NOTIFY trigger on signal_analyses (decision="wait")
- Go engine listens for NOTIFY, creates monitoring workflow
- Subscribe to candle close events for monitored symbols
- Call llm-proxy on each candle close
- Terminate workflow based on decision

**Phase 3:** Position management (5-7 days)
- Listen for position opened events
- Create management workflow
- Call llm-proxy for trade management decisions
- Execute management actions (adjust SL/TP, reduce, close)

**Phase 4:** Workflow state (2-3 days, optional)
- Create workflow_schedules table
- Add deduplication (last_candle_time)
- Add error tracking (consecutive_errors)

**Phase 5:** Testing & rollout (3-5 days)
- End-to-end testing with test signals
- Canary deployment (1 Elite user)
- Gradual rollout over 1 week
- Monitor error rates, latency, token usage

### Success Criteria

- [ ] Signals with decision="wait" get monitored at each candle close
- [ ] Monitoring stops when decision changes to enter/abandon
- [ ] Open positions managed at each candle close until closed
- [ ] No duplicate candle processing (deduplication working)
- [ ] Error rate < 1% of monitoring executions
- [ ] Average latency < 5s per analysis
- [ ] Token usage matches projections (~264k/day)
- [ ] Braintrust traces captured for all analyses
- [ ] Users can see monitoring history in signal_analyses table

### Non-Goals (For This Project)

- ❌ Re-architecting current auto-trigger (it works, keep it!)
- ❌ Manual trader creation changes (separate concern)
- ❌ Trade execution implementation (depends on this, but not part of it)
- ❌ Frontend monitoring UI (can add later)

### Rollout Strategy

1. **Dev testing** - Test signals only (specific trader_id)
2. **Canary** - Enable for 1 Elite user with auto_analyze_signals
3. **Gradual** - Enable for all Elite users over 1 week
4. **Monitor** - Track metrics, gather feedback, optimize
