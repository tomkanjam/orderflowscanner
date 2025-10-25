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

## Continuous Monitoring: Two Separate Workflows

### 1. Setup Monitoring (Conditional)
**Trigger:** Initial analysis returns decision="wait"
**Purpose:** Watch setup until it becomes tradeable or invalid
**Stops when:** Decision changes to "enter_trade" or "bad_setup"

```
Signal created → Initial analysis → decision="wait"
                                         ↓
                                   Start monitoring
                                         ↓
                    [Candle close] → Reanalyze → decision="wait"
                                         ↓
                                   Continue monitoring
                                         ↓
                    [Candle close] → Reanalyze → decision="enter_trade"
                                         ↓
                                   STOP monitoring → Open position
```

**Frequency:** Only ~20-30% of signals need this

### 2. Position Management (Always)
**Trigger:** Position opened (from either immediate entry or monitored setup)
**Purpose:** Actively manage trade (adjust SL/TP, scale out, close)
**Stops when:** Position fully closed

```
Position opened → Start management workflow
                         ↓
        [Candle close] → Manage position → action="hold"
                         ↓
        [Candle close] → Manage position → action="adjust_sl"
                         ↓
        [Candle close] → Manage position → action="reduce" (partial exit)
                         ↓
        [Candle close] → Manage position → action="close"
                         ↓
                   STOP management
```

**Frequency:** Every open position, every candle close

**Key Differences:**
- Setup monitoring: Watching for ENTRY opportunity
- Position management: Managing ACTIVE trade
- Different prompts, different decision types
- Setup monitoring can be skipped if immediate decision
- Position management always runs for open positions

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
1. Add decision listener to detect "wait" decisions from initial analysis
2. When decision="wait", create monitoring workflow in Go engine
3. Subscribe monitoring engine to `candle_close` events for monitored symbols
4. Implement HTTP client to call llm-proxy (analyze-signal operation)
5. Update registry to track which signals need reanalysis
6. Implement decision-based workflow termination:
   - decision="enter_trade" → stop monitoring, trigger order
   - decision="bad_setup" → stop monitoring, expire signal
   - decision="wait" → continue monitoring
7. Implement reanalysis limits (max 5 per signal, or trader-configured)

**Implementation approach:**

**Option A: Database trigger listens to signal_analyses**
```sql
-- After initial analysis is written to signal_analyses
CREATE TRIGGER on_analysis_decision
AFTER INSERT ON signal_analyses
FOR EACH ROW
WHEN (NEW.decision = 'wait')
EXECUTE FUNCTION notify_start_monitoring();
```
Then Go backend listens for PostgreSQL NOTIFY

**Option B: llm-proxy returns decision, caller creates workflow**
- Database trigger calls llm-proxy
- llm-proxy returns decision
- Database trigger checks decision
- If "wait", makes second HTTP call to Go backend to start monitoring

**Recommendation: Option A**
- Cleaner separation of concerns
- Go backend owns monitoring logic
- Database trigger only responsible for initial analysis

**Files to modify:**
- `supabase/migrations/029_monitoring_trigger.sql` (add decision listener)
- `backend/go-screener/internal/monitoring/engine.go` (PostgreSQL NOTIFY listener)
- `backend/go-screener/internal/monitoring/engine.go` (candle close listener)
- Add HTTP client for llm-proxy calls
- `backend/go-screener/internal/monitoring/adapters.go` (Supabase queries)

**Integration points:**
- ✅ Uses existing llm-proxy endpoint
- ✅ Uses existing signal_analyses table
- ✅ Reuses analyze-signal operation
- ✅ Decision-driven workflow creation

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

### Phase 1-2 Flow (Conditional Continuous Monitoring)
```
1. User creates signal
2. Signal INSERT → signals table
3. Database trigger fires (initial analysis)
4. Analysis returns decision (enter_trade | bad_setup | wait)
5. IF decision = "wait":
   a. Signal status → 'monitoring'
   b. Go monitoring engine creates workflow
   c. Binance WebSocket → candle close (interval matches trader.filter.interval)
   d. Monitoring engine → HTTP POST to llm-proxy (analyze-signal)
   e. Decision stored in signal_analyses
   f. If new decision='enter_trade' → create order, status='in_position', STOP monitoring
   g. If new decision='bad_setup' → status='expired', STOP monitoring
   h. If new decision='wait' → continue to next candle close (repeat from c)
6. IF decision = "enter_trade" (on first analysis):
   - Create order immediately, SKIP monitoring phase
7. IF decision = "bad_setup" (on first analysis):
   - Mark signal as expired immediately, SKIP monitoring phase
```

**Key Insight:** Monitoring is CONDITIONAL, not automatic!
- Only ~20-30% of signals will need continuous monitoring
- Most signals get immediate decision (enter or abandon)
- Much more efficient than analyzing every signal at every candle

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
- Cost: $0.055/day ($1.65/month)

**With Conditional Continuous Monitoring:**

Assumptions:
- 100 signals/day
- 20% need monitoring (decision="wait")
- Average 3 reanalyses before enter/abandon
- 80% get immediate decision (no monitoring)

**Breakdown:**
- Immediate decisions: 80 signals × 1100 tokens = 88,000 tokens
- Monitored setups: 20 signals × (1 initial + 3 reanalyses) × 1100 = 88,000 tokens
- **Total: 176,000 tokens/day**

**Position Management (separate):**
- Assume 10 positions/day
- Average 8 candles until close (8 reanalyses)
- 10 positions × 8 × 1100 = 88,000 tokens/day

**Grand Total with Full System:**
- Setup analysis + monitoring: 176,000 tokens/day
- Position management: 88,000 tokens/day
- **Combined: 264,000 tokens/day**

**Cost Impact:**
- 2.4x increase vs one-time only (not 5x!)
- At $0.50/1M tokens (Gemini 2.5 Flash): $0.132/day
- Monthly: ~$3.96 (very reasonable!)

**Why Much Lower Than Expected:**
- Most signals get immediate decision (no continuous monitoring needed)
- Only "wait" decisions trigger continuous analysis
- Position management is separate workflow (only for open positions)
- Natural throttling through decision gates

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

### Critical Correction: Conditional vs Universal Monitoring

**What I Initially Misunderstood:**
- ❌ Every signal gets monitored at every candle close
- ❌ High token usage (5x increase)

**What It Actually Is:**
- ✅ Only signals with decision="wait" get continuous monitoring (~20-30%)
- ✅ Most signals get immediate decision (enter or abandon)
- ✅ Moderate token usage (2.4x increase, ~$4/month)
- ✅ Two separate workflows:
  1. Setup monitoring (conditional, for "wait" decisions)
  2. Position management (always, for open positions)

**This Makes the System:**
- Much more efficient (natural throttling through decisions)
- More cost-effective than initially projected
- Easier to implement (fewer active monitors to track)
- Better aligned with actual trading behavior

---

## Next Steps

1. **Launch with current implementation** (one-time analysis)
2. **Post-launch:** Implement Phase 1-2 (candle close events + monitoring)
3. **Monitor:** Track token usage, analysis quality, user feedback
4. **Optimize:** Tune reanalysis limits, prompt quality, thresholds
5. **Expand:** Add position management (Phase 4) after trade execution ready
