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
- [x] `context/issues/open/20251025-102927-002-setup-monitoring-workflow.md` - ✅ Implement setup monitoring (conditional)
- [ ] `context/issues/open/20251025-102927-003-position-management-workflow.md` - Implement position management (always active)
- [ ] `context/issues/open/20251025-102927-004-workflow-state-management.md` - Add workflow_schedules table (optional enhancement)
- [ ] `context/issues/open/20251025-102927-005-testing-and-rollout.md` - End-to-end testing and gradual rollout

## Progress

**2025-10-25:** ✅ Sub-issue 001 completed - Candle close events now emitted from WebSocket
**2025-11-04:** ✅ Sub-issue 002 completed - Setup monitoring workflow fully implemented

**Current Status: SIGNAL MONITORING COMPLETE (40%)**

### Summary

The continuous monitoring system is **40% complete** with signal monitoring fully functional and production-ready. The remaining 60% (position management, testing, rollout) is blocked by missing trade execution infrastructure.

**Achievements:**
- Event-driven architecture using candle close events
- Simplified design using signal status as source of truth (no PostgreSQL NOTIFY)
- HTTP-based llm-proxy integration from Go backend
- Database triggers for automatic status management
- Conditional monitoring (only signals with decision="wait")

**Blockers:**
- Position management requires positions table, CCXT integration, and trade execution system
- These are separate initiatives beyond the scope of this monitoring project

**Recommendation:**
- Deploy signal monitoring to production (Phases 1-2 complete)
- Build trade execution infrastructure as separate project
- Return to Phases 3-5 once infrastructure exists

### What's Working (Production-Ready):
✅ **Candle close event infrastructure** - WebSocket emits events on candle completion
✅ **Setup monitoring workflow** - Signals with decision="wait" are continuously reanalyzed
✅ **Database automation** - Status updates automatically based on AI decisions
✅ **llm-proxy integration** - Go backend calls Edge Function for reanalysis
✅ **Simplified architecture** - Signal status is source of truth (no NOTIFY complexity)

### Architecture Summary:
```
Signal INSERT → Initial analysis (migration 028)
                     ↓
              decision="wait"?
                     ↓ YES
           signal.status="monitoring" (migration 032)
                     ↓
           Monitoring engine loads on startup
                     ↓
      [Candle Close] → Reanalyze via llm-proxy
                     ↓
           Store in signal_analyses
                     ↓
      decision changes → Status updates → Stop monitoring
```

### What's Pending:
⏳ **Sub-issue 003:** Position Management - Requires trade execution infrastructure (not yet built)
⏳ **Sub-issue 004:** Workflow State Management - Optional enhancement
⏳ **Sub-issue 005:** Testing and Rollout - Requires sub-issue 003 completion

### Blocker:
Position management requires:
- Positions table and CCXT integration
- Trade execution system
- New llm-proxy operation: "manage-position"

These are separate initiatives beyond this project's scope.

## Spec

### High-Level Architecture

```
✅ IMPLEMENTED - Signal Monitoring:
Signal INSERT → Database Trigger (028) → llm-proxy → signal_analyses table
                                                              ↓
                                                    decision="wait"?
                                                              ↓ YES
                                          Database Trigger (032) → signal.status="monitoring"
                                                              ↓
                                              Monitoring Engine loads on startup
                                                              ↓
                                          [Candle Close Event] → llm-proxy → decision
                                                                                  ↓
                                                              enter_trade → status="ready", STOP
                                                              bad_setup → status="expired", STOP
                                                              wait → Continue monitoring

⏳ BLOCKED - Position Management:
Position Opened → Go Management Engine
                          ↓
        [Candle Close Event] → llm-proxy → management decision
                                                    ↓
                                        hold | adjust_sl | adjust_tp | reduce | close

BLOCKER: Requires positions table, CCXT integration, trade execution system
```

### Key Design Decisions

1. **Conditional, not universal** - Only monitor signals with decision="wait" (~20-30%)
2. **Event-driven** - Candle close events trigger analysis, not timers
3. **Reuse llm-proxy** - Same analyze-signal endpoint for initial + monitoring
4. **Decision-based termination** - Workflows stop when decision changes or position closes
5. **Signal status as source of truth** - Database trigger updates status, engine loads from status field (simplified vs PostgreSQL NOTIFY)

### Implementation Phases

**✅ Phase 1:** Candle close events (COMPLETE)
- ✅ WebSocket emits candle close events with deduplication
- ✅ EventTypeCandleClose in eventbus
- ✅ SubscribeCandleClose() method working

**✅ Phase 2:** Setup monitoring (COMPLETE)
- ✅ Database trigger (032) auto-updates signal status based on decision
- ✅ Monitoring engine loads active monitors on startup
- ✅ Engine subscribes to candle close events
- ✅ HTTP client calls llm-proxy for reanalysis
- ✅ Decision changes terminate monitoring (via status update)
- ✅ Simplified architecture without PostgreSQL NOTIFY

**⏳ Phase 3:** Position management (BLOCKED)
- Requires: Positions table and schema
- Requires: CCXT integration for trade execution
- Requires: New llm-proxy operation "manage-position"
- Requires: Position lifecycle management

**⏳ Phase 4:** Workflow state (OPTIONAL - NOT STARTED)
- Create workflow_schedules table
- Add deduplication tracking
- Add error tracking

**⏳ Phase 5:** Testing & rollout (PENDING)
- Depends on Phase 3 completion
- End-to-end testing with real positions
- Canary deployment strategy
- Performance monitoring

### Success Criteria

**Signal Monitoring (Complete):**
- [x] Signals with decision="wait" get monitored at each candle close
- [x] Monitoring stops when decision changes to enter/abandon
- [x] No duplicate candle processing (deduplication working)
- [x] Users can see monitoring history in signal_analyses table
- [x] Database triggers auto-update signal status
- [x] Go backend calls llm-proxy for reanalysis

**Position Management (Blocked):**
- [ ] Open positions managed at each candle close until closed
- [ ] Trade execution system implemented
- [ ] Positions table and CCXT integration complete

**Quality & Performance (Not Yet Measured):**
- [ ] Error rate < 1% of monitoring executions
- [ ] Average latency < 5s per analysis
- [ ] Token usage matches projections (~264k/day)
- [ ] Braintrust traces captured for all analyses

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
