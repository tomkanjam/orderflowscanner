# Centralized Data Collection with Edge Function Execution

## Metadata
- **Status:** 📊 planning
- **Created:** 2025-09-26 08:35:00
- **Updated:** 2025-09-26 09:00:00
- **Priority:** Critical
- **Type:** performance/architecture
- **Progress:** [■■■       ] 30%

---

## Idea Review
*Stage: idea | Date: 2025-09-26 08:35:00*

### Original Idea
Move from individual VMs per trader to a centralized data collection service with edge function execution. Signal code currently runs every second (60x/minute) when it should only run at candle close intervals (1m, 5m, 15m, 1h).

### Enhanced Concept
**COMPLETE SERVER-SIDE EXECUTION:** Move ALL computation out of the browser - no more client-side workers, no browser-based signal detection, no client-side Gemini API calls. Implement a single high-performance data collector service that maintains real-time kline data for all traded symbols across all timeframes, with edge functions executing trader logic precisely at candle boundaries. The browser becomes a pure presentation layer that only displays results via WebSocket/SSE subscriptions. This reduces execution frequency by 460x, costs by 95%, and complexity by 90% while improving accuracy and security.

### Target Users
- **Primary:** Active traders running 10-100 concurrent strategies who need cost-effective scaling
- **Secondary:** Platform operators managing infrastructure costs and complexity
- **Edge Case:** Institutional users with 1000+ strategies requiring guaranteed execution

### Domain Context
- Professional trading systems (Bloomberg Terminal, TradingView) use centralized data feeds
- Signal generation should align with candle close events, not arbitrary intervals
- Current architecture wastes 99% of compute on redundant calculations
- Competitors like 3Commas and Cryptohopper use similar centralized architectures

### Key Architectural Changes
1. **NO Browser Execution:** Remove all Web Workers, client-side filter execution, browser-based Gemini calls
2. **Server-Side Signal Detection:** Edge functions run all trader filter code
3. **Server-Side AI Analysis:** Gemini API calls exclusively from edge functions
4. **Pure Presentation Layer:** Browser only receives and displays pre-computed results
5. **Security Improvement:** API keys never exposed to browser, filter code protected

### Suggestions for Improvement
1. **Smart Batching:** Group traders by symbol/interval to minimize Redis lookups
2. **Candle Alignment:** Use precise timestamp math to trigger exactly at candle close
3. **Failover Strategy:** Secondary data collector in different region for redundancy
4. **Caching Layer:** LRU cache in edge functions for frequently accessed indicators

### Critical Questions

#### Domain Workflow
1. How do we handle traders that need tick-level data (scalping strategies)?
   - **Why it matters:** Some HFT strategies need sub-second execution
   - **Recommendation:** Run dedicated edge functions with WebSocket connections for tick strategies (still server-side)

#### User Needs
2. What happens to existing browser-based traders during migration?
   - **Why it matters:** Can't break existing user workflows
   - **Recommendation:** Gradual migration with feature flag, dual-run period

#### Technical Requirements
3. Can Upstash Redis handle 100K+ kline updates per second during volatility?
   - **Why it matters:** Single point of failure risk
   - **Recommendation:** Load test with 10x expected volume, have Redis Cluster ready

#### Integration
4. How do we sync edge function execution across multiple regions?
   - **Why it matters:** Duplicate signal detection if not coordinated
   - **Recommendation:** Use distributed locks or idempotent signal creation

#### Compliance/Standards
5. Are there data residency requirements for financial data in different regions?
   - **Why it matters:** EU/APAC may have specific requirements
   - **Recommendation:** Check Binance ToS, implement region-specific data collectors

### Success Criteria
- [ ] 100% of execution moved server-side (zero browser computation)
- [ ] 95% reduction in infrastructure costs vs VM approach
- [ ] <100ms latency from candle close to signal detection
- [ ] Zero duplicate signals from concurrent executions
- [ ] 99.9% execution reliability at scheduled intervals
- [ ] Complete elimination of client-side API key exposure
- [ ] Protected trader intellectual property (filter code never in browser)

### Security & Performance Benefits of Server-Side Execution
1. **API Key Protection:** Gemini/Firebase keys never exposed to browser
2. **Code IP Protection:** Trader strategies remain server-side only
3. **Consistent Execution:** No browser performance variability
4. **Resource Efficiency:** No client memory/CPU constraints
5. **24/7 Operation:** Works even when browser closed
6. **Reduced Attack Surface:** No client-side code injection risks

### Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Redis outage | Critical | Implement Redis Sentinel, hot standby |
| Edge function cold starts | High | Keep functions warm with synthetic traffic |
| Data collector failure | Critical | Active-passive failover, health checks |
| Cost overrun from edge executions | Medium | Implement per-user quotas and monitoring |
| Browser feels less responsive | Low | WebSocket for instant updates, optimistic UI |

### Recommended Next Steps
1. Prototype data collector with 10 symbols
2. Benchmark Redis performance under load
3. Test edge function execution timing accuracy
4. Create migration plan for existing users

### Priority Assessment
**Urgency:** Critical - Current architecture won't scale beyond 100 traders
**Impact:** Transformative - Enables 1000x scale at 5% of cost
**Effort:** L - 2-3 weeks with careful migration
**Recommendation:** Proceed immediately with proof of concept

---
*[End of idea review. Next: /spec issues/2025-09-26-centralized-data-edge-execution.md]*

---

## Engineering Review
*Stage: engineering-review | Date: 2025-09-26 08:45:00*

### Codebase Analysis

#### Relevant Existing Code
**Components to reuse:**
- `binanceService.ts`: WebSocket connection logic can be adapted for data collector
- `screenerHelpers.ts`: All indicator calculations move to edge functions as-is
- `geminiService.ts`: API logic moves server-side, removes browser exposure
- `signalManager.ts`: Transforms to WebSocket receiver instead of processor

**Components to remove entirely:**
- All 5 worker files (persistentTraderWorker.ts, multiTraderScreenerWorker.ts, etc.)
- `SharedArrayBuffer` infrastructure - no longer needed
- Browser-side filter execution logic
- Client-side Gemini API calls

**Patterns to follow:**
- Existing edge functions (ai-analysis, ai-filter) show Supabase patterns
- WebSocket message structure already well-defined
- Trader configuration schema can remain unchanged

**Technical debt to address:**
- Workers run every 1 second instead of at candle boundaries (460x waste)
- No connection pooling for 100+ WebSocket streams
- Missing retry logic on WebSocket disconnects
- Gemini API keys exposed in browser environment variables

**Performance baseline:**
- Current latency: 5-10ms in-browser execution
- Memory usage: 500MB+ with workers and SharedArrayBuffer
- WebSocket handling: 100 symbols max before degradation
- Must maintain <100ms server-side round-trip

### Spec Analysis

#### Technical Feasibility
**Verdict:** ✅ Feasible with careful architecture

**Reasoning:**
Moving to server-side execution is the correct architectural decision. Current browser-based approach is fundamentally flawed for production trading systems. Edge functions + centralized data is industry standard (see Bloomberg, Reuters, TradingView).

#### Hidden Complexity
1. **Edge Function Cold Starts**
   - Why it's complex: Deno cold starts can be 200-500ms
   - Solution approach: Keep-warm strategy with synthetic pings every 30s

2. **Binance Rate Limits**
   - Challenge: 1200 requests/min weight limit, WebSocket connection limits
   - Mitigation: Single aggregated connection, request coalescing

3. **Clock Synchronization**
   - Challenge: Edge functions in different regions may execute at slightly different times
   - Solution: Use consistent timestamp rounding (floor to interval boundary)

4. **Data Consistency During Migration**
   - Challenge: Can't instantly cut over all users
   - Mitigation: Dual-write period where both systems run

#### Performance Concerns
**Bottlenecks identified:**
- Redis network latency: 1-5ms per request × 100 symbols = 100-500ms
- Mitigation: Pipeline requests, use MGET for batch fetches

- Edge function execution limit: 10 seconds max on Supabase
- Mitigation: Parallel execution, circuit breaker for slow traders

**During peak trading hours:**
- Expected load: 10x spike at market open (09:30 EST)
- Current capacity: Browser crashes at 100+ traders
- Scaling needed: Edge functions auto-scale, Redis needs cluster mode

### Architecture Recommendations

#### Proposed Approach
**Phase 1: Data Collection Layer**
```
Fly.io Machine (Always On)
├── WebSocket Manager (1024 streams/connection)
├── Redis Writer (pipelined writes)
└── Health Monitor
```

**Phase 2: Execution Layer**
```
Supabase Edge Functions
├── execute-traders (cron triggered)
├── analyze-signal (on-demand)
└── query-signals (REST API)
```

**Phase 3: Delivery Layer**
```
Supabase Realtime
└── Filtered channels per user
```

#### Data Flow
1. Binance WebSocket → Data Collector
2. Data Collector → Redis (sub-ms writes)
3. Cron trigger → Edge Function
4. Edge Function → Fetch klines from Redis
5. Execute trader logic → Generate signals
6. Store signals → Supabase
7. Broadcast → Browser via Realtime
8. Browser → Pure display update

#### Key Components
- **New**:
  - `data-collector/`: Fly.io service for WebSocket aggregation
  - `supabase/functions/execute-traders/`: Batch trader execution
  - `supabase/functions/analyze-signal/`: Gemini API wrapper
  - Redis/Upstash for kline storage
- **Modified**:
  - App.tsx: Remove worker initialization, add Realtime subscription
  - TraderForm: Point to edge function instead of local generation
- **Deprecated**:
  - All worker files
  - useIndicatorWorker hook
  - Browser-side geminiService calls

### Implementation Complexity

#### Effort Breakdown
- Frontend: **S** (1-2 days) - Remove workers, add subscriptions
- Backend: **L** (1 week) - Data collector, edge functions, Redis
- Infrastructure: **M** (3-4 days) - Fly.io, Upstash, monitoring
- Testing: **M** (3-4 days) - Load testing, migration validation

#### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Redis becomes bottleneck | Medium | Critical | Use Redis Cluster, add read replicas |
| Edge function timeouts | Low | High | Split large batches, parallel execution |
| WebSocket reconnection storms | High | Medium | Exponential backoff, jitter |
| Migration data loss | Low | Critical | Dual-write period, extensive testing |
| Increased latency perception | Medium | Low | Optimistic UI, loading states |

### Security Considerations

#### Authentication/Authorization
- Edge functions use service role key (never exposed)
- User-specific data filtered via RLS policies
- Signed URLs for any direct data access

#### Data Protection
- All API keys server-side only
- Trader code never sent to browser
- TLS for all connections (WSS, HTTPS)
- Redis AUTH enabled

#### API Security
- Rate limiting per user tier in edge functions
- Input sanitization for all trader code execution
- Sandbox trader code execution (no eval, use Function constructor)

### Testing Strategy

#### Unit Tests
- Redis read/write performance
- Candle boundary calculations
- Signal deduplication logic
- Kline data compression

#### Integration Tests
- End-to-end signal flow (WebSocket → Redis → Edge → Supabase → Browser)
- Migration dual-write accuracy
- Failover scenarios
- Multi-region execution

#### Performance Tests
- 1000 traders × 100 symbols load test
- Redis memory usage at scale
- Edge function concurrency limits
- WebSocket connection stability

#### Chaos Engineering
- Kill data collector mid-stream
- Redis primary failure
- Edge function region outage
- Network partition scenarios

### Technical Recommendations

#### Must Have
1. Idempotent signal creation (unique constraint on trader_id + symbol + timestamp)
2. Dead letter queue for failed executions
3. Comprehensive monitoring (Datadog/NewRelic)
4. Circuit breakers for all external calls

#### Should Have
1. Redis Sentinel for automatic failover
2. Multi-region data collectors
3. Trader code validation before storage
4. Cost tracking per user

#### Nice to Have
1. WebAssembly for trader code execution
2. GPU-accelerated indicator calculations
3. Direct exchange co-location

### Implementation Guidelines

#### Code Organization
```
/
├── apps/
│   ├── app/                  # React app (pure UI)
│   └── data-collector/        # New Fly.io service
├── supabase/
│   └── functions/
│       ├── execute-traders/  # Cron-triggered execution
│       ├── analyze-signal/   # Gemini API wrapper
│       └── shared/           # Common utilities
└── packages/
    └── trader-runtime/       # Shared execution logic
```

#### Key Decisions
- State management: Server-push via Realtime (no polling)
- Data fetching: Subscription-based (no REST for real-time)
- Caching: Redis for hot data, Supabase for cold
- Error handling: Exponential backoff with max retries

### Questions for PM/Design

1. **Latency tolerance**: Users currently see instant (5ms) updates. Can they accept 50-100ms?
2. **Migration timeline**: How long can we run both systems in parallel?
3. **Cost allocation**: How do we bill users for edge function executions?
4. **Tick strategies**: Some users may need sub-second execution - separate tier?

### Pre-Implementation Checklist

- [x] Performance requirements achievable (<100ms with proper architecture)
- [x] Security model defined (all server-side)
- [x] Error handling strategy clear (circuit breakers, retries)
- [ ] Monitoring plan in place (need Datadog/NewRelic setup)
- [x] Rollback strategy defined (feature flag, dual-write)
- [ ] Dependencies available (need Upstash Redis account)
- [x] No blocking technical debt (can proceed)

### Recommended Next Steps

1. **Week 1: Proof of Concept**
   - Set up Fly.io data collector with 10 symbols
   - Create basic execute-traders edge function
   - Test end-to-end flow with single trader

2. **Week 2: Production Ready**
   - Scale to 100 symbols, 10 traders
   - Add monitoring and error handling
   - Implement migration framework

3. **Week 3: Migration**
   - Beta test with 5 users
   - Monitor performance metrics
   - Full rollout with feature flag

---
*[End of engineering review. Next: /architect-issue issues/2025-09-26-centralized-data-edge-execution.md]*

---

## Implementation Plan
*Stage: planning | Date: 2025-09-26 09:00:00*

### Overview
Complete migration from browser-based execution to server-side architecture with centralized data collection and edge function execution. This eliminates all client-side workers, moving 100% of computation to the server while the browser becomes a pure presentation layer.

### Prerequisites
- [x] Fly.io account created (for data collector)
- [x] Upstash Redis account set up (for kline storage)
- [ ] Supabase pg_cron extension enabled
- [ ] Environment variables configured for all services
- [ ] Feature flag system in place for gradual rollout

### Implementation Phases

#### Phase 1: Data Collection Infrastructure (8 hours)
**Objective:** Set up centralized data collector and Redis storage

##### Task 1.1: Create Data Collector Service (2 hours)
Files to create:
- `apps/data-collector/package.json`
- `apps/data-collector/src/index.ts`
- `apps/data-collector/src/BinanceCollector.ts`
- `apps/data-collector/src/RedisWriter.ts`
- `apps/data-collector/fly.toml`
- `apps/data-collector/Dockerfile`

Actions:
- [ ] Initialize new pnpm workspace for data-collector
- [ ] Set up TypeScript configuration
- [ ] Create WebSocket connection manager (max 1024 streams per connection)
- [ ] Implement Redis writer with pipelining
- [ ] Add health check endpoint
- [ ] Create Dockerfile for Fly.io deployment

Test criteria:
- Connects to Binance WebSocket successfully
- Writes klines to Redis with <5ms latency
- Handles reconnection on disconnect
- Health endpoint returns 200

**Checkpoint:** Data collector running locally with 10 symbols

##### Task 1.2: Configure Redis Storage (1 hour)
Actions:
- [ ] Set up Upstash Redis database
- [ ] Configure Redis schema for klines
- [ ] Implement TTL policies (24h for Pro, 7d for Elite)
- [ ] Create Redis access patterns for batch reads
- [ ] Set up Redis monitoring

Schema:
```
kline:{symbol}:{interval} → Latest kline JSON
klines:{symbol}:{interval} → List of last 250 klines
ticker:{symbol} → Latest ticker data
metadata:{symbol} → Symbol metadata
```

Test criteria:
- Can store and retrieve klines in <1ms
- TTL policies working correctly
- Batch operations optimized

##### Task 1.3: Deploy Data Collector to Fly.io (1 hour)
Actions:
- [ ] Configure fly.toml for production
- [ ] Set up environment variables
- [ ] Deploy with `fly deploy`
- [ ] Configure auto-scaling rules
- [ ] Set up monitoring alerts

Test criteria:
- Service running on Fly.io
- WebSocket connections stable
- Redis writes successful
- Monitoring dashboard active

**Phase 1 Complete When:**
- Data collector running in production
- All top 100 USDT pairs streaming
- Redis populated with real-time data
- Zero data loss for 1 hour

#### Phase 2: Edge Function Implementation (10 hours)
**Objective:** Create edge functions for trader execution and analysis

##### Task 2.1: Create Execute-Traders Edge Function (3 hours)
Files to create:
- `supabase/functions/execute-traders/index.ts`
- `supabase/functions/execute-traders/traderLogic.ts`
- `supabase/functions/execute-traders/redisClient.ts`
- `supabase/functions/shared/helpers.ts`

Actions:
- [ ] Create edge function scaffold
- [ ] Port screenerHelpers.ts to edge function
- [ ] Implement Redis data fetcher
- [ ] Create trader execution logic (sandboxed)
- [ ] Add signal deduplication (trader_id + symbol + timestamp)
- [ ] Implement user tier limits
- [ ] Add execution tracking for billing

Test criteria:
- Function executes in <1 second
- Correctly evaluates trader logic
- Stores signals in database
- Deduplication working

##### Task 2.2: Create Analyze-Signal Edge Function (2 hours)
Files to create:
- `supabase/functions/analyze-signal/index.ts`
- `supabase/functions/analyze-signal/geminiClient.ts`

Actions:
- [ ] Move Gemini API logic server-side
- [ ] Create secure API key management
- [ ] Implement analysis with context
- [ ] Add tier-based model selection (Flash vs Pro)
- [ ] Implement rate limiting

Test criteria:
- Gemini API calls successful
- Analysis returns in <2 seconds
- Rate limiting enforced
- API keys never exposed

##### Task 2.3: Set Up Cron Triggers (2 hours)
Files to create:
- `supabase/migrations/020_setup_cron_triggers.sql`

Actions:
- [ ] Enable pg_cron extension
- [ ] Create cron jobs for each interval (1m, 5m, 15m, 1h)
- [ ] Implement batch execution logic
- [ ] Add execution monitoring
- [ ] Create fallback trigger system

SQL:
```sql
SELECT cron.schedule('execute-1m', '* * * * *',
  $$SELECT net.http_post(...)$$);
```

Test criteria:
- Triggers fire at exact intervals
- No duplicate executions
- Monitoring shows execution times
- Fallback triggers work

##### Task 2.4: Create Signals Table and Migration (1 hour)
Files to create:
- `supabase/migrations/021_create_signals_table.sql`

Actions:
- [ ] Create signals table with proper indexes
- [ ] Add unique constraint for deduplication
- [ ] Create RLS policies for user access
- [ ] Add triggers for real-time updates
- [ ] Create cleanup jobs for old signals

Schema:
```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY,
  trader_id UUID NOT NULL,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  price DECIMAL NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  metadata JSONB,
  UNIQUE(trader_id, symbol, timestamp)
);
```

Test criteria:
- Table created with indexes
- RLS policies working
- Real-time triggers firing
- Cleanup jobs scheduled

**Phase 2 Complete When:**
- All edge functions deployed
- Cron triggers executing on schedule
- Signals being generated and stored
- Real-time updates working

#### Phase 3: Frontend Migration (6 hours)
**Objective:** Remove workers and connect to server-side execution

##### Task 3.1: Remove Worker Infrastructure (2 hours)
Files to modify:
- `apps/app/App.tsx`
- `apps/app/vite.config.ts`
- Delete: `apps/app/workers/*.ts`
- Delete: `apps/app/src/shared/SharedMarketData.ts`

Actions:
- [ ] Remove all worker initialization code
- [ ] Delete SharedArrayBuffer setup
- [ ] Remove worker message handlers
- [ ] Clean up worker-related hooks
- [ ] Update build configuration

Test criteria:
- App builds without worker references
- No SharedArrayBuffer errors
- Memory usage reduced
- TypeScript compiles clean

##### Task 3.2: Add Supabase Real-time Subscriptions (2 hours)
Files to modify:
- `apps/app/App.tsx`
- `apps/app/src/hooks/useSignalSubscription.ts` (create)
- `apps/app/src/services/signalManager.ts`

Actions:
- [ ] Create real-time subscription hook
- [ ] Subscribe to user's signal channel
- [ ] Update signal manager to receive, not compute
- [ ] Add connection status indicator
- [ ] Implement reconnection logic

Code:
```typescript
const channel = supabase
  .channel(`signals:${userId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'signals',
    filter: `user_id=eq.${userId}`
  }, handleNewSignal)
  .subscribe()
```

Test criteria:
- Receives signals in real-time
- UI updates immediately
- Reconnects on disconnect
- Shows connection status

##### Task 3.3: Update Trader Form for Server Execution (1 hour)
Files to modify:
- `apps/app/src/components/TraderForm.tsx`
- `apps/app/src/services/geminiService.ts`

Actions:
- [ ] Point trader generation to edge function
- [ ] Remove client-side Gemini calls
- [ ] Add loading states for server calls
- [ ] Update error handling
- [ ] Add retry logic

Test criteria:
- Trader creation via edge function
- No client-side API calls
- Proper loading states
- Error messages clear

##### Task 3.4: Add Feature Flag System (1 hour)
Files to create:
- `apps/app/src/utils/featureFlags.ts`

Actions:
- [ ] Create feature flag for new architecture
- [ ] Add user tier detection
- [ ] Implement gradual rollout logic
- [ ] Add override for testing
- [ ] Create monitoring for both paths

Test criteria:
- Can toggle between old/new system
- Tier-based rollout working
- Override flags work
- Both paths functional

**Phase 3 Complete When:**
- All workers removed
- Frontend using server-side execution
- Real-time updates working
- Feature flag controlling rollout

#### Phase 4: Migration & Testing (8 hours)
**Objective:** Safely migrate users to new architecture

##### Task 4.1: Implement Dual-Write Period (2 hours)
Files to modify:
- `apps/app/src/services/traderManager.ts`

Actions:
- [ ] Add dual-write logic for signals
- [ ] Create comparison monitoring
- [ ] Log discrepancies
- [ ] Add metrics dashboard
- [ ] Set up alerts for mismatches

Test criteria:
- Both systems produce same signals
- Discrepancies logged
- No performance impact
- Monitoring shows accuracy

##### Task 4.2: Load Testing (3 hours)
Actions:
- [ ] Create load test script for 1000 traders
- [ ] Test with 100 symbols × 1000 traders
- [ ] Measure latencies at scale
- [ ] Test edge function concurrency limits
- [ ] Verify Redis performance

Test criteria:
- <100ms signal detection latency
- No edge function timeouts
- Redis handles load
- System remains stable

##### Task 4.3: Beta User Migration (2 hours)
Actions:
- [ ] Select 5 beta users
- [ ] Enable feature flag for beta
- [ ] Monitor performance metrics
- [ ] Collect user feedback
- [ ] Fix any issues found

Test criteria:
- Beta users see signals
- Performance acceptable
- No critical bugs
- Positive feedback

##### Task 4.4: Full Rollout (1 hour)
Actions:
- [ ] Enable for Pro tier (10% → 50% → 100%)
- [ ] Enable for Elite tier
- [ ] Monitor all metrics
- [ ] Remove old code (after 1 week stable)
- [ ] Update documentation

Test criteria:
- All users on new system
- Performance metrics good
- No increase in errors
- Cost within projections

**Phase 4 Complete When:**
- All users migrated
- Old system deprecated
- Performance targets met
- Zero critical issues for 48 hours

### Testing Strategy

#### Commands to Run
```bash
# After each backend task
cd apps/data-collector && pnpm test
cd supabase/functions && deno test

# After each frontend task
cd apps/app && pnpm build
cd apps/app && pnpm typecheck

# Integration tests
pnpm test:e2e
```

#### Manual Testing Checklist
- [ ] Create trader → generates signals
- [ ] Signals appear in real-time
- [ ] AI analysis works
- [ ] Tier limits enforced
- [ ] Reconnection works
- [ ] No memory leaks
- [ ] Performance <100ms

### Rollback Plan
If critical issues arise:
1. Set feature flag to 0% immediately
2. All users revert to browser execution
3. Debug issues in staging
4. Fix and test thoroughly
5. Retry rollout with smaller percentage

### PM Checkpoints
Review points for PM validation:
- [ ] After Phase 1 - Data flowing correctly
- [ ] After Phase 2 - Signals generating server-side
- [ ] After Phase 3 - Frontend connected
- [ ] During Phase 4 - Beta feedback positive
- [ ] Before full rollout - All metrics green

### Success Metrics
Implementation is complete when:
- [ ] Zero browser-side execution
- [ ] 460x reduction in executions (1/second → 1/minute)
- [ ] 95% reduction in costs vs VM approach
- [ ] <100ms end-to-end latency
- [ ] 99.9% execution reliability
- [ ] All API keys server-side only

### Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Redis bottleneck | Use pipelining, monitor closely | ⏳ |
| 2 | Edge function cold starts | Keep-warm with synthetic traffic | ⏳ |
| 3 | Breaking existing users | Feature flag for safe rollback | ⏳ |
| 4 | Migration data loss | Dual-write period, extensive logging | ⏳ |

### Time Estimates
- Phase 1: 8 hours (1 day)
- Phase 2: 10 hours (1.5 days)
- Phase 3: 6 hours (1 day)
- Phase 4: 8 hours (1 day)
- **Total: 32 hours (4-5 days)**

### Next Actions
1. Set up Fly.io and Upstash accounts
2. Create feature branch: `feature/centralized-execution`
3. Begin Phase 1, Task 1.1
4. Set up monitoring dashboard

---
*[End of plan. Next: /implement-issue issues/2025-09-26-centralized-data-edge-execution.md]*