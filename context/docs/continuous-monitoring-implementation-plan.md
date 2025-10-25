# Continuous Monitoring Implementation Plan

**Created:** 2025-10-25
**Status:** Analysis & Planning

## Executive Summary

**Question:** Is our current auto-trigger implementation aligned with the continuous monitoring vision? Can we add it incrementally or do we need to re-architect?

**Answer:** ✅ **Strong alignment - incremental implementation is feasible**

The current auto-trigger implementation (database trigger → llm-proxy) is a **solid foundation** that aligns well with the future vision. The Go backend already has 70% of the continuous monitoring infrastructure in place. We can add the full system **incrementally without re-architecture**.

---

## Current Implementation Assessment

### ✅ What We Have (Production-Ready)

#### 1. Database Trigger Auto-Analysis (Migration 028)
```
Signal INSERT → Database Trigger → llm-proxy → signal_analyses table
```

**Strengths:**
- ✅ Proper gating (Elite tier + auto_analyze_signals)
- ✅ Full Braintrust instrumentation
- ✅ OpenRouter integration
- ✅ Proper error handling
- ✅ Database persistence (all required fields)
- ✅ Performance: 3.7-4.1s latency, ~1100 tokens

**Alignment with Vision:**
- ✅ Uses llm-proxy (same endpoint we'll use for continuous monitoring)
- ✅ analyze-signal operation is reusable
- ✅ Database schema supports continuous analysis (signal_analyses table)
- ✅ Already handles user gating

**Gap:**
- ❌ Only triggers ONCE on signal creation
- ❌ No candle-close event driven re-analysis
- ❌ No monitoring workflow scheduling

#### 2. Go Backend Infrastructure (70% Complete)

**Already Built:**
```go
// backend/go-screener/internal/monitoring/
- engine.go          // Monitoring engine with registry
- types.go           // MonitoringState struct
- registry.go        // Active monitor tracking
- adapters.go        // Supabase/Binance interfaces

// backend/go-screener/internal/eventbus/
- types.go           // CandleEvent, SignalEvent
- bus.go             // Event bus implementation
```

**Capabilities:**
- ✅ Event bus for candle events (`EventTypeCandleOpen`)
- ✅ Monitoring registry (track active signals)
- ✅ MonitoringState tracking (reanalysis count, last decision)
- ✅ Supabase adapter interfaces
- ✅ Binance market data interfaces
- ✅ Analysis queueing system

**Alignment with Vision:**
- ✅ Event-driven architecture (already has eventbus)
- ✅ Registry pattern matches `workflow_schedules` concept
- ✅ MonitoringState maps to workflow execution tracking
- ✅ Analysis engine interface exists

**Gaps:**
- ❌ Event bus listens for `candle_open` not `candle_close`
- ❌ No HTTP calls to llm-proxy yet (uses analysis queue)
- ❌ Not integrated with Binance WebSocket yet

---

## Architecture Alignment Analysis

### Current Stack vs. Vision

| Component | Current | Vision (automated-trading-workflows.md) | Alignment |
|-----------|---------|----------------------------------------|-----------|
| **Initial Analysis** | Database trigger → llm-proxy | Database trigger → llm-proxy | ✅ Perfect |
| **Continuous Monitoring** | None | Candle close → llm-proxy | ⚠️ Missing |
| **Event Source** | Database INSERT | WebSocket kline (isClosed=true) | ⚠️ Different |
| **Scheduler** | Database trigger | Event-driven (candle close) | ⚠️ Different |
| **Analysis Endpoint** | llm-proxy (analyze-signal) | llm-proxy (analyze-signal) | ✅ Perfect |
| **Decision Storage** | signal_analyses | monitoring_decisions | ⚠️ Different table |
| **State Tracking** | None | workflow_schedules | ❌ Missing |
| **Go Backend Role** | Market data provider | Orchestrator + market data | ⚠️ Partial |

### Key Insights

1. **llm-proxy is the right choice** - Current implementation already uses the same endpoint the vision describes
2. **Event architecture exists** - Go backend has event bus, just needs candle close events
3. **Database schema is close** - signal_analyses works, but workflow_schedules would help with state
4. **WebSocket integration needed** - Currently just storing klines, not emitting close events
5. **No re-architecture required** - Incremental additions will work

---

## Implementation Roadmap

### Phase 1: Enable Candle Close Events (Go Backend)
**Effort:** 2-3 days
**Complexity:** Low

**Tasks:**
1. Update WebSocket kline handler to emit `candle_close` events when `isClosed=true`
2. Add `EventTypeCandleClose` to eventbus types
3. Test event emission for all intervals (1m, 5m, 15m, 1h)

**Files to modify:**
- `backend/go-screener/internal/eventbus/types.go` (add CandleCloseEvent)
- WebSocket kline handler (emit events on close)

**No breaking changes** - additive only

---

### Phase 2: Monitoring Engine Integration
**Effort:** 3-5 days
**Complexity:** Medium

**Tasks:**
1. Subscribe monitoring engine to `candle_close` events
2. Implement HTTP client to call llm-proxy (analyze-signal operation)
3. Update registry to track which signals need reanalysis
4. Load active monitors from `signals` table (status='monitoring')
5. Implement reanalysis limits (max 5 per signal, or trader-configured)

**Files to modify:**
- `backend/go-screener/internal/monitoring/engine.go` (add candle close listener)
- Add HTTP client for llm-proxy calls
- `backend/go-screener/internal/monitoring/adapters.go` (Supabase queries)

**Integration points:**
- ✅ Uses existing llm-proxy endpoint
- ✅ Uses existing signal_analyses table
- ✅ Reuses analyze-signal operation

**No re-architecture needed** - extends current system

---

### Phase 3: Workflow State Management (Optional Enhancement)
**Effort:** 2-3 days
**Complexity:** Low

**Tasks:**
1. Create `workflow_schedules` table (from vision doc)
2. Update monitoring engine to use workflow_schedules for state
3. Add deduplication (prevent duplicate candle processing)
4. Add error tracking (consecutive_errors field)

**Why optional:**
- Current approach (loading from signals table) works for MVP
- workflow_schedules adds robustness but not critical for launch

**Files to add:**
- `supabase/migrations/029_create_workflow_schedules.sql`
- Update monitoring engine to persist state

---

### Phase 4: Position Management (Future)
**Effort:** 5-7 days
**Complexity:** High

**Tasks:**
1. Create `position_management_decisions` table
2. Add position monitoring workflow
3. Integrate with CCXT positions table
4. Implement management actions (adjust SL/TP, reduce, close)

**Why later:**
- Requires trade execution to be operational first
- Independent of setup monitoring
- Can reuse all infrastructure from Phases 1-3

---

## Database Schema Evolution

### Current (Production)
```sql
-- Existing tables
signals (id, trader_id, symbol, timestamp, price_at_signal, metadata)
signal_analyses (signal_id, trader_id, user_id, decision, confidence, reasoning, ...)
traders (auto_analyze_signals boolean)
```

### Phase 1-2 (No schema changes needed)
- Reuse existing tables
- Load active monitors from `signals WHERE status='monitoring'`

### Phase 3 (Optional - adds robustness)
```sql
CREATE TABLE workflow_schedules (
  id UUID PRIMARY KEY,
  workflow_type TEXT, -- 'signal_monitoring'
  entity_id UUID,     -- signal_id
  trader_id UUID,
  interval TEXT,
  symbol TEXT,
  last_run_at TIMESTAMPTZ,
  last_candle_time BIGINT, -- Deduplication
  consecutive_errors INTEGER,
  is_active BOOLEAN
);
```

### Phase 4 (Future)
```sql
CREATE TABLE monitoring_decisions (...);
CREATE TABLE position_management_decisions (...);
```

---

## Integration Flow

### Current Flow (One-Time Analysis)
```
1. User creates signal
2. Signal INSERT → signals table
3. Database trigger fires
4. HTTP POST to llm-proxy (analyze-signal)
5. Analysis stored in signal_analyses
```

### Phase 1-2 Flow (Continuous Monitoring)
```
1. User creates signal
2. Signal INSERT → signals table
3. Database trigger fires (initial analysis)
4. Signal status → 'monitoring'
5. Go monitoring engine loads signal
6. Binance WebSocket → candle close (interval matches trader.filter.interval)
7. Monitoring engine → HTTP POST to llm-proxy (analyze-signal)
8. Decision stored in signal_analyses
9. If decision='enter' → create order, status='in_position'
10. If decision='abandon' → status='expired'
11. If decision='continue' → wait for next candle close (go to step 6)
```

**Key Point:** Steps 1-5 are identical to current implementation!

---

## Risk Assessment

### Low Risk Items ✅
- Event bus integration (already built, just needs activation)
- llm-proxy HTTP calls (straightforward HTTP client)
- Candle close event emission (WebSocket already working)
- Using existing database tables (no migrations needed for MVP)

### Medium Risk Items ⚠️
- Preventing duplicate candle processing (needs careful timestamp tracking)
- Rate limiting llm-proxy calls (many signals × candle closes = high volume)
- Error handling in monitoring loop (failed analysis shouldn't crash engine)

### Mitigation Strategies
1. **Deduplication:** Track `last_candle_time` in MonitoringState
2. **Rate limiting:** Batch analyses, use semaphore/queue
3. **Error handling:** Implement retry logic with exponential backoff
4. **Monitoring:** Add metrics for analysis queue depth, error rates

---

## Cost Analysis

### Token Usage Projection

**Current (One-Time Analysis):**
- ~1100 tokens per signal
- Let's say 100 signals/day
- Total: 110,000 tokens/day

**With Continuous Monitoring (5 reanalyses per signal):**
- ~1100 tokens × 5 reanalyses = 5,500 tokens per signal
- 100 signals/day
- Total: 550,000 tokens/day

**Cost Impact:**
- 5x increase in token usage
- At $0.50/1M tokens (Gemini 2.5 Flash): $0.275/day
- Monthly: ~$8.25

**Optimization strategies:**
- Limit max reanalyses per signal (default: 5)
- Only reanalyze if price movement > threshold
- Use cheaper model for monitoring (same flash model is fine)

---

## Testing Strategy

### Phase 1 Testing (Candle Close Events)
```bash
# Verify events are emitted
1. Start Go backend
2. Subscribe to WebSocket (BTCUSDT, 1m)
3. Wait for candle close
4. Check logs: "Emitted candle_close event for BTCUSDT-1m"
```

### Phase 2 Testing (Monitoring Integration)
```bash
# End-to-end monitoring test
1. Create trader with auto_analyze_signals=true
2. Trigger signal (insert into signals table)
3. Check initial analysis (should exist in signal_analyses)
4. Wait for next candle close (e.g., 1 minute)
5. Check new analysis (should have timestamp = candle close time)
6. Repeat for 5 candles
7. Verify signal status changed appropriately
```

### Rollout Strategy
1. **Dev testing:** Run on test signals only (filter by trader_id)
2. **Canary:** Enable for 1 Elite user with auto_analyze_signals
3. **Gradual rollout:** Enable for all Elite users over 1 week
4. **Monitor:** Track error rates, latency, token usage

---

## Recommendations

### For MVP Launch (Next Week)

**Keep current implementation:**
- ✅ One-time analysis on signal creation is valuable
- ✅ Already working end-to-end
- ✅ Provides immediate value to Elite users
- ✅ Demonstrates AI analysis capability

**Add continuous monitoring later:**
- ⏰ Implement Phases 1-2 after launch (2 weeks post-launch)
- ⏰ Monitor initial usage patterns first
- ⏰ Gather user feedback on analysis quality

### For Post-Launch (Weeks 2-4)

**Phase 1-2 Implementation:**
- Week 2: Candle close events + monitoring engine
- Week 3: Testing + canary deployment
- Week 4: Full rollout to Elite users

**Rationale:**
- Proves product-market fit with simpler version first
- Allows time to optimize prompts based on initial feedback
- Reduces token costs during early launch

---

## Conclusion

### Answer to Original Question

**Is current implementation aligned?**
✅ **Yes** - The database trigger → llm-proxy architecture is exactly what the vision describes for the initial analysis step.

**Can we add continuous monitoring incrementally?**
✅ **Yes** - The Go backend has 70% of the infrastructure already built. We can:
1. Add candle close events (2-3 days)
2. Integrate monitoring engine with llm-proxy (3-5 days)
3. Deploy without re-architecting

**Do we need to re-architect?**
❌ **No** - The current implementation is a perfect foundation:
- Same llm-proxy endpoint
- Same analyze-signal operation
- Same database tables
- Just needs event-driven scheduling

### Strategic Path Forward

```
Current (Working) ──> Phase 1-2 (2 weeks) ──> Phase 3 (optional) ──> Phase 4 (future)
     ↓                      ↓                       ↓                      ↓
One-time analysis    Continuous monitoring    Workflow state      Position management
     MVP                  Full vision         Enhanced tracking    Active management
```

**The vision document describes the end state, but we can reach it incrementally without throwing away any current work.**

---

## Next Steps

1. **Launch with current implementation** (one-time analysis)
2. **Post-launch:** Implement Phase 1-2 (candle close events + monitoring)
3. **Monitor:** Track token usage, analysis quality, user feedback
4. **Optimize:** Tune reanalysis limits, prompt quality, thresholds
5. **Expand:** Add position management (Phase 4) after trade execution ready
