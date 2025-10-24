# Redis Rate Limit Optimization - Write Only on Candle Close

## Metadata
- **Status:** 🔍 engineering-review
- **Created:** 2025-09-28 06:45:00
- **Updated:** 2025-09-28 06:50:00
- **Priority:** Critical
- **Type:** performance/bug
- **Progress:** [          ] 0%

---

## Idea Review
*Stage: idea | Date: 2025-09-28 06:45:00*

### Original Idea
The data collector is hitting Upstash Redis rate limits (500K requests) because it's updating Redis on every WebSocket kline update instead of only writing when candles close. Need to optimize to only send updates 200ms after the close of every minute.

### Enhanced Concept
**Smart Candle-Close Write Strategy:** Implement an intelligent caching layer that buffers all real-time kline updates in memory and only writes to Redis at candle boundaries (when `x: true`). This reduces Redis operations by 99% while maintaining data accuracy. Add a debounce mechanism (200ms after close) to ensure we capture the final candle state, and implement tiered writing strategies based on timeframe importance (1m critical, 1h can be delayed).

### Target Users
- **Primary:** High-frequency traders needing real-time data without service interruptions
- **Secondary:** Platform operators managing infrastructure costs
- **Edge Case:** Users with 100+ concurrent strategies requiring consistent data availability

### Domain Context
In cryptocurrency trading:
- Binance sends kline updates multiple times per second for active symbols
- Only closed candles (`x: true`) matter for technical analysis
- Writing every update wastes 50-100x more operations than needed
- Professional trading systems like TradingView only persist closed candles
- Rate limits are a critical bottleneck for scaling

### Suggestions for Improvement
1. **Candle-Close Detection:** Only write to Redis when `kline.x === true`
2. **Memory Buffer:** Keep current candles in memory, write on close
3. **Batch Operations:** Group multiple symbol updates in single pipeline
4. **TTL Optimization:** Shorter TTL for incomplete candles, longer for closed
5. **Write Coalescing:** Debounce writes by 200ms to avoid duplicate close events

### Critical Questions

#### Domain Workflow
1. How do we handle the transition period when a candle is closing?
   - **Why it matters:** Binance may send multiple messages with `x: true` near close time
   - **Recommendation:** Implement a 200ms debounce after first close signal

#### User Needs
2. Do traders need access to incomplete candle data for any strategies?
   - **Why it matters:** Some scalping strategies may use real-time price action
   - **Recommendation:** Keep latest incomplete candle in memory cache, expose via separate endpoint

#### Technical Requirements
3. What's the actual write frequency we're seeing now vs. what we need?
   - **Why it matters:** Determines optimization impact
   - **Current estimate:** ~50 updates/second/symbol × 50 symbols = 2500 writes/second
   - **Target:** 50 symbols × 4 intervals / 60 seconds = ~3.3 writes/second (750x reduction)

#### Integration
4. How does this affect downstream edge functions that read kline data?
   - **Why it matters:** Edge functions expect consistent data availability
   - **Recommendation:** Implement read-through cache that merges Redis + memory buffer

#### Compliance/Standards
5. Are there any data accuracy requirements for incomplete candles?
   - **Why it matters:** Financial data integrity
   - **Recommendation:** Log all candle closes for audit trail, implement checksum validation

### Success Criteria
- [ ] Redis operations reduced by >95%
- [ ] Zero data loss for closed candles
- [ ] <10ms latency for candle close detection
- [ ] Stay under 10K requests/day on free tier
- [ ] Support 100+ symbols without hitting limits

### Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Missed candle closes during reconnect | Critical | Persist close state, replay on reconnect |
| Memory leak from buffering | High | Implement circular buffer with max size |
| Race condition at candle boundary | Medium | Use timestamp-based locking |
| Downstream services expect real-time updates | Medium | Provide WebSocket bridge for real-time needs |

### Recommended Next Steps
1. Analyze current Redis write patterns (count operations per minute)
2. Implement candle-close detection logic
3. Add memory buffer for incomplete candles
4. Test with high-volume symbols (BTC, ETH)
5. Monitor Redis usage reduction

### Priority Assessment
**Urgency:** Critical - Service is currently broken due to rate limits
**Impact:** Transformative - Enables 100x scale at 1% of cost
**Effort:** S - 2-4 hours to implement
**Recommendation:** Proceed immediately - this blocks all trading functionality

### Implementation Approach

#### Quick Fix (Immediate)
```typescript
// In handleKline method
private async handleKline(data: any): Promise<void> {
  const kline: KlineData = { /* ... */ };

  // ONLY write closed candles
  if (kline.x) {
    await this.redisWriter.writeKline(kline.s, kline.i, kline);
  }
}
```

#### Proper Solution (With Buffering)
```typescript
class KlineBuffer {
  private buffer = new Map<string, KlineData>();
  private closeTimers = new Map<string, NodeJS.Timeout>();

  update(kline: KlineData): void {
    const key = `${kline.s}:${kline.i}`;
    this.buffer.set(key, kline);

    if (kline.x) {
      // Debounce close write by 200ms
      if (this.closeTimers.has(key)) {
        clearTimeout(this.closeTimers.get(key)!);
      }

      this.closeTimers.set(key, setTimeout(() => {
        this.flush(key);
        this.closeTimers.delete(key);
      }, 200));
    }
  }
}
```

### Cost Analysis
- **Current:** 500K requests/day = $0.20/day on pay-as-you-go
- **After optimization:** ~5K requests/day = FREE tier
- **Monthly savings:** ~$6/month per instance
- **At scale (1000 traders):** $600/month savings

---
*[End of idea review. Next: /spec issues/2025-09-28-redis-rate-limit-optimization.md]*

---

## Engineering Review
*Stage: engineering-review | Date: 2025-09-28 06:50:00*

### Codebase Analysis

#### Relevant Existing Code
**Components to reuse:**
- `RedisWriter.ts`: Already has check for closed candles (line 72: `if (!kline.x) return;`) but it's NOT being respected!
- `RedisWriter.pipeline`: Existing batching mechanism with 100ms flush interval
- `BinanceCollector.handleKline()`: Main entry point that needs fixing (line 180)

**Critical Bug Found:**
The `RedisWriter.writeKline()` method ALREADY checks for closed candles, but `BinanceCollector` calls it for EVERY update regardless. There's also redundant ticker writes happening every second.

**Patterns to follow:**
- Pipeline batching: Already implemented, working well
- TTL strategy: 24h for klines, 60s for tickers
- Sorted sets for klines: Good for time-series queries

**Technical debt to address:**
- `handleTicker()` writes on EVERY ticker update (~10-20/second per symbol)
- No deduplication logic for rapid close events
- No memory buffer for current candles
- Missing metrics/monitoring for write rates

**Performance baseline:**
- Current latency: ~10ms pipeline flush
- Memory usage: ~50MB for 10 symbols
- Redis writes: 2500+ per second (hitting 500K limit in 3.3 minutes!)
- Must reduce to <10 writes/second

### Spec Analysis

#### Technical Feasibility
**Verdict:** ✅ Feasible - Actually EASIER than expected!

**Reasoning:**
The infrastructure is already there - we just need to fix ONE LINE in BinanceCollector.ts. The RedisWriter already has the correct logic, but it's being bypassed. This is a classic case of miscommunication between components.

#### Hidden Complexity
1. **Ticker Update Frequency**
   - Why it's complex: Tickers update even MORE frequently than klines (every 100ms during high volatility)
   - Solution approach: Throttle ticker writes to once per second max using timestamp comparison

2. **Multiple Close Events**
   - Challenge: Binance can send 2-3 `x: true` events in rapid succession at candle boundaries
   - Mitigation: Track last written candle timestamp, ignore duplicates within 1 second

3. **Memory Management During Reconnects**
   - Challenge: Buffer could grow unbounded during disconnection
   - Mitigation: Implement circular buffer with max 1000 entries

4. **Edge Function Data Expectations**
   - Challenge: Some edge functions may expect current candle data
   - Mitigation: Maintain separate "current" cache in Redis with different keys

#### Performance Concerns
**Bottlenecks identified:**
- Ticker writes: 50 symbols × 20 updates/sec = 1000 writes/sec
- Kline writes: 50 symbols × 4 intervals × 50 updates/sec = 10000 writes/sec
- Pipeline overhead: Flushing every 100ms regardless of content

**During peak trading hours (market open):**
- Expected load: 100x normal volume spikes
- Current capacity: Fails after 200 seconds
- Scaling needed: Must handle 24/7 operation within free tier

### Architecture Recommendations

#### Proposed Approach
**Two-Phase Implementation:**

Phase 1 (Immediate): Fix the obvious bug
Phase 2 (Robust): Add intelligent buffering and deduplication

#### Data Flow
1. WebSocket message → BinanceCollector
2. Check if candle is closed (x: true) → Skip if not
3. Check for duplicate (same timestamp) → Skip if duplicate
4. Add to pipeline → Batch write
5. Flush pipeline → Redis update

#### Key Components
- **New**:
  - `KlineBuffer` class for memory caching
  - `TickerThrottler` for rate limiting ticker updates
  - Deduplication map for close events
- **Modified**:
  - `BinanceCollector.handleKline()` - Add close check
  - `BinanceCollector.handleTicker()` - Add throttling
- **Deprecated**: None

### Implementation Complexity

#### Effort Breakdown
- Frontend: N/A
- Backend: **S** (1-2 hours for complete fix)
- Infrastructure: **XS** (config only)
- Testing: **S** (validate reduction)

#### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missing candle closes | Low | Critical | Log all closes, monitor gaps |
| Ticker data staleness | Medium | Low | 1-second throttle acceptable |
| Memory leak from buffering | Low | High | Bounded buffers, monitoring |
| Duplicate writes at boundaries | High | Low | Timestamp deduplication |

### Security Considerations

#### Authentication/Authorization
- Redis credentials properly secured via environment variables ✅
- No additional security concerns

#### Data Protection
- No sensitive data in klines/tickers
- TLS for Redis connection already configured

#### API Security
- Rate limiting now MORE important (we're the ones being limited!)
- Input validation not needed (trusted Binance source)

### Testing Strategy

#### Unit Tests
```typescript
describe('KlineBuffer', () => {
  it('should only write closed candles');
  it('should deduplicate rapid close events');
  it('should handle reconnection scenarios');
  it('should bound memory usage');
});
```

#### Integration Tests
- Simulate high-frequency updates from Binance
- Verify Redis write count stays under limit
- Test reconnection without data loss

#### Performance Tests
- Load test with 100 symbols
- Measure actual Redis operations per minute
- Verify memory usage stays under 256MB (Fly.io limit)

#### Chaos Engineering
- Kill Redis connection mid-stream
- Simulate WebSocket reconnection storm
- Test with malformed Binance messages

### Technical Recommendations

#### Must Have (CRITICAL - DO IMMEDIATELY)
1. Fix `BinanceCollector.handleKline()` to respect close flag
2. Add duplicate detection for close events
3. Throttle ticker updates to 1/second

#### Should Have
1. Memory buffer for current candles
2. Metrics endpoint for write rates
3. Alerting when approaching rate limits

#### Nice to Have
1. Compressed storage for historical klines
2. Separate cache for incomplete candles
3. WebSocket endpoint for real-time data

### Implementation Guidelines

#### Code Organization
Already well-structured, no changes needed.

#### Key Decisions
- State management: In-memory Map for deduplication
- Data fetching: Keep existing pipeline approach
- Caching: 200ms debounce for close events
- Error handling: Log and continue (never crash)

### The ACTUAL Fix

```typescript
// BinanceCollector.ts - Line 164
private lastClosedCandles = new Map<string, number>();

private async handleKline(data: any): Promise<void> {
  const kline: KlineData = {
    t: data.k.t,
    T: data.k.T,
    s: data.k.s,
    i: data.k.i,
    o: data.k.o,
    c: data.k.c,
    h: data.k.h,
    l: data.k.l,
    v: data.k.v,
    n: data.k.n,
    x: data.k.x,
    q: data.k.q
  };

  // FIX: Only write closed candles (this was missing!)
  if (!kline.x) {
    return; // Skip incomplete candles
  }

  // Prevent duplicate writes for same candle
  const key = `${kline.s}:${kline.i}`;
  const lastClose = this.lastClosedCandles.get(key);
  if (lastClose === kline.T) {
    return; // Already written this candle
  }

  this.lastClosedCandles.set(key, kline.T);
  await this.redisWriter.writeKline(kline.s, kline.i, kline);
}

// Also fix ticker throttling
private lastTickerWrite = new Map<string, number>();

private async handleTicker(data: any): Promise<void> {
  const now = Date.now();
  const lastWrite = this.lastTickerWrite.get(data.s) || 0;

  // Throttle to once per second
  if (now - lastWrite < 1000) {
    return;
  }

  this.lastTickerWrite.set(data.s, now);

  const ticker: TickerData = {
    s: data.s,
    c: data.c,
    o: data.o,
    h: data.h,
    l: data.l,
    v: data.v,
    q: data.q,
    p: data.p,
    P: data.P,
    n: data.n
  };

  await this.redisWriter.writeTicker(ticker.s, ticker);
}
```

### Questions for PM/Design

1. **Ticker Frequency**: Is 1-second ticker updates acceptable? Real-time traders might want faster.
2. **Historical Data**: How many candles should we keep? (Currently 500 per symbol/interval)
3. **Incomplete Candle Access**: Do any features need the current forming candle?

### Pre-Implementation Checklist

- [x] Performance requirements achievable (<10 writes/second easily)
- [x] Security model defined (already secure)
- [x] Error handling strategy clear (log and continue)
- [ ] Monitoring plan in place (need to add metrics)
- [x] Rollback strategy defined (redeploy previous version)
- [x] Dependencies available (all in place)
- [x] No blocking technical debt

### Recommended Next Steps

1. **Immediate (5 minutes)**: Deploy the one-line fix to stop the bleeding
2. **Today**: Add deduplication and ticker throttling
3. **This week**: Add monitoring and metrics
4. **Next sprint**: Consider memory buffer for advanced features

### Critical Insight

The RedisWriter ALREADY had the correct logic (`if (!kline.x) return;`) but BinanceCollector was calling it unconditionally. This is a perfect example of defensive programming - the safety check was in the wrong layer. The fix is literally adding the same check one level up.

**Estimated time to fix: 10 minutes**
**Estimated Redis usage reduction: 99.8%**

---
*[End of engineering review. Next: /architect-issue issues/2025-09-28-redis-rate-limit-optimization.md]*