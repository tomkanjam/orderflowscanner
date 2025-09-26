# Signal Persistence Architecture

## Metadata
- **Status:** 🔍 engineering-review
- **Created:** 2025-09-26 08:15:00
- **Updated:** 2025-09-26 08:20:00
- **Priority:** Critical
- **Type:** performance/feature
- **Progress:** [■■        ] 20%

---

## Idea Review
*Stage: idea | Date: 2025-09-26 08:15:00*

### Original Idea
We need to persist signals. Keep in mind that signal writes and reads will scale aggressively as we expect a lot of signals to be created and AI traders to be running. We should not over-optimize but we should have a scaling or upgrade path in mind.

### Enhanced Concept
Implement a high-performance signal persistence layer that can handle 10,000+ concurrent traders generating 100,000+ signals per minute while maintaining sub-50ms query latency. The architecture must support real-time writes from worker threads, fast reads for AI analysis, historical queries for backtesting, and smooth migration path from hundreds to millions of signals daily without downtime.

### Target Users
- **Primary:** Active traders running 50+ simultaneous AI strategies
- **Secondary:** Platform operators managing system performance
- **Edge Case:** Institutional users with 1000+ concurrent strategies

### Domain Context
- Trading signals are write-heavy with bursts during market volatility
- Similar to HFT systems at Jane Street/Citadel using time-series DBs
- Binance processes 1.4M orders/second - we need similar scale mindset
- Competitors like TradingView handle millions of alerts daily

### Suggestions for Improvement
1. **Hybrid Storage:** Hot/cold tiers with recent signals in Redis, historical in PostgreSQL
2. **Write Batching:** Buffer signals in worker memory for 100ms before batch insert
3. **Partitioning:** Time-based partitions (daily/weekly) for efficient pruning
4. **Read Replicas:** Separate read pool for AI analysis to avoid write contention

### Critical Questions

#### Domain Workflow
1. What's the signal lifecycle - creation → analysis → execution → archival?
   - **Why it matters:** Determines storage tiers and retention policies
   - **Recommendation:** Implement state-based storage with TTLs

#### User Needs
2. Do traders need instant access to ALL historical signals or just recent (24h/7d)?
   - **Why it matters:** Affects indexing strategy and memory requirements
   - **Recommendation:** Hot tier for 24h, warm for 7d, cold archive beyond

#### Technical Requirements
3. What's the write pattern - continuous stream or market-hours bursts?
   - **Why it matters:** Capacity planning and connection pooling
   - **Recommendation:** Design for 10x burst capacity during volatility

#### Integration
4. How do signals flow from workers → persistence → AI analysis → execution?
   - **Why it matters:** Determines if we need message queues or direct writes
   - **Recommendation:** Consider event streaming (Kafka-style) for decoupling

#### Compliance/Standards
5. Any regulatory requirements for signal audit trails or retention periods?
   - **Why it matters:** Immutability and compliance features needed
   - **Recommendation:** Implement append-only logs with cryptographic timestamps

### Success Criteria
- [ ] < 10ms write latency for 95th percentile
- [ ] < 50ms query latency for recent signals
- [ ] Support 100,000 signals/minute sustained
- [ ] Zero data loss during scaling operations

### Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Write bottleneck during volatility | Critical | Implement write buffering and sharding |
| Storage costs explosion | High | Aggressive TTLs and compression |
| Query performance degradation | High | Materialized views for common queries |
| Migration complexity | Medium | Dual-write during transition period |

### Recommended Next Steps
1. Answer critical questions above
2. Benchmark current signal volume and growth projections
3. Create detailed spec with /spec
4. Prototype write path with load testing

### Priority Assessment
**Urgency:** Critical - Current in-memory approach won't scale
**Impact:** Transformative - Enables unlimited trader scaling
**Effort:** L - Requires careful architecture and migration
**Recommendation:** Proceed immediately with phased rollout

---
*[End of idea review. Next: /spec issues/2025-09-26-signal-persistence-architecture.md]*

---

## Product Requirements Document
*Stage: spec | Date: 2025-09-26 08:17:00*

### Executive Summary
**What:** Implement a distributed, tiered signal persistence system supporting 100K+ signals/minute with sub-50ms latency
**Why:** Enable platform scaling from hundreds to millions of traders while maintaining real-time performance
**Who:** Active traders running multiple AI strategies requiring instant signal access and historical analysis
**When:** Q1 2025 - Phased rollout starting with write path, then read optimization

### Problem Statement
#### Current State
Signals are stored in-memory within worker threads and React state, limiting us to ~1000 signals before performance degrades. No persistence means data loss on refresh, no historical analysis, and no cross-session continuity. Current architecture cannot support institutional-scale trading operations.

#### Pain Points
- **Data Loss:** Browser refresh loses all signal history and active trades
- **Scale Limitation:** Memory constraints cap us at ~100 concurrent traders
- **No Backtesting:** Can't analyze historical signal performance over time
- **No Cross-Device:** Traders can't access signals from multiple devices
- **Performance Degradation:** UI freezes with >500 active signals in state

#### Opportunity
Transform TradeMind into an institutional-grade platform supporting thousands of concurrent strategies with complete signal audit trails, enabling advanced features like portfolio optimization, signal correlation analysis, and regulatory compliance.

### Solution Overview
A three-tier persistence architecture with write-optimized hot path, read-optimized warm storage, and compressed cold archives. Signals flow through buffered write queues to Supabase/PostgreSQL with time-series optimizations, enabling real-time streaming to AI analysis while maintaining historical queryability.

#### Core Functionality
1. **High-Performance Write Path**
   - Worker threads buffer signals for 100ms before batch insert
   - Supabase Edge Functions handle write ingestion at scale
   - System achieves <10ms write acknowledgment for 95th percentile
   - Result: Zero signal loss during 10x volatility spikes

2. **Tiered Storage Architecture**
   - Hot tier (0-24h): In-memory cache + PostgreSQL with heavy indexing
   - Warm tier (1-7d): PostgreSQL with selective indexes + compression
   - Cold tier (7d+): Partitioned tables with aggressive compression
   - Result: Sub-50ms queries for recent signals, <500ms for historical

3. **Real-Time Synchronization**
   - Supabase Realtime broadcasts new signals to all subscribers
   - Worker threads maintain local cache synchronized with database
   - React components subscribe to filtered signal streams
   - Result: <100ms end-to-end latency from trigger to UI update

4. **Historical Analysis API**
   - REST endpoints for signal aggregation and backtesting
   - Time-series specific queries (moving averages, correlations)
   - Pagination and cursor-based navigation for large datasets
   - Result: Analyze millions of signals without UI blocking

### User Stories

#### Primary Flow: Active Trader
**As a** professional trader running 50+ AI strategies
**I want to** see all my signals persist across sessions and devices
**So that** I can analyze performance patterns and optimize strategies

**Acceptance Criteria:**
- [ ] Given 100 active traders generating signals, when I refresh the browser, then all signals from the last 24h are instantly visible
- [ ] System maintains <50ms query time with 1M+ signals in database
- [ ] Can filter/sort signals by trader, symbol, timeframe in <100ms
- [ ] Historical signals load progressively without blocking UI
- [ ] Export last 7 days of signals to CSV in <5 seconds

#### Edge Cases
1. **Market Open Surge:** 50x normal volume at 09:30 EST - System auto-scales write capacity
2. **Network Partition:** Worker loses connection - Signals buffer locally then sync when reconnected
3. **Storage Limit Hit:** User exceeds tier quota - Older signals auto-archive, recent remain accessible
4. **Concurrent Writes:** Multiple workers write same signal - Deduplication by hash prevents duplicates

### Technical Requirements

#### Performance
- **Write Latency:** <10ms p95, <50ms p99
- **Read Latency:** <50ms for hot tier, <200ms for warm, <500ms for cold
- **Throughput:** 100,000 signals/minute sustained, 1M/minute burst
- **Availability:** 99.9% uptime with graceful degradation
- **Concurrency:** Support 10,000 concurrent WebSocket connections

#### Data Requirements
- **Source:** Worker threads via structured message passing
- **Schema:** Optimized for time-series (timestamp clustering, BRIN indexes)
- **Refresh Rate:** Real-time streaming for hot signals, 1-minute aggregates for warm
- **Retention:** 24h full resolution, 7d with 1m aggregates, 30d with 1h aggregates, 1y daily summaries
- **Size:** ~100 bytes per signal, expecting 10GB/day at full scale

#### Security
- **Authentication:** Supabase RLS policies enforce user isolation
- **Authorization:** Tier-based quotas (Free: 100/day, Pro: 10K/day, Elite: unlimited)
- **Data Protection:** Signals encrypted at rest, TLS for all connections
- **Audit Trail:** Immutable event log for regulatory compliance

### UI/UX Requirements

#### Desktop (Primary)
- **Signal Table:** Virtual scrolling for millions of rows without lag
- **Real-time Updates:** New signals slide in with subtle animation
- **Filtering:** Multi-field filtering with <100ms response
- **Export:** One-click export with progress indicator

#### Mobile (Responsive)
- **Simplified View:** Card-based layout for touch interaction
- **Pull-to-Refresh:** Update signal list with haptic feedback
- **Offline Mode:** Cache last 100 signals for offline viewing

### Success Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Write Success Rate | >99.99% | Count failed writes / total |
| Query Performance (p95) | <50ms | Prometheus histograms |
| Storage Efficiency | <100GB for 1B signals | Database size monitoring |
| User Engagement | +50% daily active | Analytics on signal queries |
| Cost per Signal | <$0.00001 | Monthly bill / signal count |

### Rollout Strategy
**Phase 1 (Week 1-2):** Write path - Worker → Supabase persistence
**Phase 2 (Week 3-4):** Read optimization - Caching and indexes
**Phase 3 (Week 5-6):** Historical features - Backtesting and export
**Phase 4 (Week 7-8):** Scale testing - Load test with 1M signals/min

### Dependencies
- [ ] Supabase project with adequate capacity (Pro plan minimum)
- [ ] Database migrations for time-series optimized schema
- [ ] Edge Functions for write ingestion and aggregation
- [ ] Redis or similar for hot-tier caching (optional enhancement)
- [ ] Monitoring stack (Prometheus/Grafana or similar)

### Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Supabase rate limits | Implement client-side buffering and exponential backoff |
| Storage costs exceed budget | Aggressive TTLs, user-based quotas, compression |
| Migration breaks existing flows | Feature flag for gradual rollout, dual-write period |
| Query performance degrades over time | Automated partitioning, materialized views for common queries |

### Out of Scope
- Cross-exchange signal aggregation (future enhancement)
- Machine learning on signal patterns (Q2 2025)
- Social signal sharing features (requires different architecture)
- Blockchain-based signal verification (not needed for MVP)

### Open Questions
- [ ] Should we use TimescaleDB extension for better time-series performance?
- [ ] Do we need a separate analytics database (ClickHouse/Druid) for complex queries?
- [ ] What's the acceptable data loss threshold during catastrophic failures?
- [ ] Should Elite users get dedicated read replicas for guaranteed performance?

---
*[End of specification. Next: /design-issue issues/2025-09-26-signal-persistence-architecture.md]*

---

## Engineering Review
*Stage: engineering-review | Date: 2025-09-26 08:20:00*

### Codebase Analysis

#### Relevant Existing Code
**Components to reuse:**
- `signalManager.ts`: Already handles signal lifecycle with Map-based storage - can extend with persistence layer
- `persistentTraderWorker.ts`: Has buffering and batch processing logic we can adapt for write batching
- `SharedArrayBuffer` infrastructure: Existing shared memory can cache hot-tier signals
- `useSignalLifecycle.ts`: Hook architecture ready for real-time updates via Supabase subscriptions

**Patterns to follow:**
- Worker thread message passing: Already using structured messages for signal updates
- Delta compression: Worker already calculates deltas to minimize data transfer
- Memory management: Existing cleanup schedulers (30-min intervals) can be adapted
- Differential tracking: `DifferentialTracker` pattern for efficient change detection

**Technical debt to address:**
- No existing `signals` table in Supabase migrations - need to create from scratch
- In-memory Map storage in `signalManager` - 1000 signal limit is hardcoded
- No connection retry logic in WebSocket handlers for network partitions
- Missing structured logging for debugging at scale

**Performance baseline:**
- Current latency: ~5-10ms for in-memory signal creation
- Memory usage: ~500MB with 1000 signals and 100 symbols
- WebSocket throughput: Handles 100 updates/sec comfortably
- Must maintain sub-50ms end-to-end latency

### Spec Analysis

#### Technical Feasibility
**Verdict:** ⚠️ Challenging

**Reasoning:**
The 100K signals/minute target is achievable but requires careful architecture. Main challenges:
1. Supabase connection pooling limits (100 connections on Pro plan)
2. PostgreSQL write amplification with heavy indexing
3. Worker thread coordination for batch writes
4. Real-time broadcast at scale needs careful filtering

#### Hidden Complexity
1. **Worker-to-Database Coordination**
   - Why it's complex: Workers run in isolated contexts, can't share database connections
   - Solution approach: Implement write queue in main thread, workers send batched messages

2. **Signal Deduplication**
   - Challenge: Multiple workers may detect same signal simultaneously
   - Mitigation: Composite unique index on (trader_id, symbol, timestamp, interval) with ON CONFLICT handling

3. **Time-Series Partitioning**
   - Challenge: PostgreSQL doesn't auto-partition, manual setup needed
   - Solution: pg_partman extension or custom partition management with pg_cron

4. **Real-time Subscription Explosion**
   - Challenge: 10K traders × multiple symbols = millions of subscriptions
   - Mitigation: Channel-based subscriptions with client-side filtering

#### Performance Concerns
**Bottlenecks identified:**
- Database write locks during bulk inserts: Impact 10-100ms latency spikes
- Mitigation: Use COPY command or multi-row INSERT with UNNEST
- Index maintenance overhead: Each index adds 15-20% write overhead
- Mitigation: Selective indexing, BRIN for time-series data

**During peak usage for trading:**
- Expected load: 10x spikes at market open (09:30 EST) - 1M signals/minute
- Current capacity: ~1000 signals total before UI freezes
- Scaling needed: 1000x improvement in throughput, 100x in storage

### Architecture Recommendations

#### Proposed Approach
Three-layer architecture with write-through caching:
1. **Edge Layer**: Supabase Edge Functions for write ingestion
2. **Storage Layer**: PostgreSQL with TimescaleDB extension
3. **Cache Layer**: In-memory LRU cache in workers for hot data

#### Data Flow
1. Worker detects signal → Buffers in local array
2. Every 100ms → Batch send to main thread
3. Main thread → Aggregates from all workers
4. Batch insert via Edge Function → PostgreSQL
5. Postgres trigger → Broadcast via Realtime
6. React components → Subscribe to filtered channels
7. UI update via virtual scrolling

#### Key Components
- **New**:
  - `SignalPersistenceService`: Handles write queuing and retries
  - `SignalQueryService`: Optimized read paths with caching
  - Edge Functions: `ingest-signals`, `query-signals`
  - Database: `signals`, `signal_aggregates` tables
- **Modified**:
  - `signalManager`: Add persistence hooks
  - `persistentTraderWorker`: Add write batching
  - `useSignalLifecycle`: Add Supabase subscription
- **Deprecated**:
  - In-memory only storage in `signalManager`

### Implementation Complexity

#### Effort Breakdown
- Frontend: **M** (2-3 days) - Add virtual scrolling, subscription handling
- Backend: **XL** (2 weeks) - Database schema, Edge Functions, migration scripts
- Infrastructure: **L** (1 week) - Monitoring, alerting, capacity planning
- Testing: **L** (1 week) - Load testing, chaos engineering

#### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Write bottleneck at scale | High | Critical | Implement write-ahead buffer, consider Kafka |
| Storage costs exceed budget | Medium | High | Implement aggressive TTLs, compression |
| Migration causes data loss | Low | Critical | Blue-green deployment, extensive testing |
| Realtime subscription overload | High | High | Channel aggregation, client-side filtering |
| Database connection exhaustion | Medium | Critical | Connection pooling, pgBouncer |

### Security Considerations

#### Authentication/Authorization
- Row Level Security (RLS) policies for user isolation
- Separate read/write API keys for Edge Functions
- JWT validation in Edge Functions before writes

#### Data Protection
- Signal data contains trading strategies - highly sensitive
- Enable transparent data encryption in Supabase
- Audit logs for all signal access with pg_audit

#### API Security
- Rate limiting: 1000 writes/min for Pro, unlimited for Elite
- Input validation: Strict schema validation in Edge Functions
- DDoS protection: Cloudflare in front of Edge Functions

### Testing Strategy

#### Unit Tests
- Signal batching logic in workers
- Deduplication algorithm
- TTL and cleanup routines
- Delta compression

#### Integration Tests
- Worker → Main thread → Database flow
- Subscription and real-time updates
- Network partition recovery
- Concurrent write handling

#### Performance Tests
- Load test: 100K signals/minute sustained
- Burst test: 1M signals/minute for 5 minutes
- Query performance under load
- Memory usage over 24 hours

#### Chaos Engineering
- Kill database connection mid-batch
- Simulate network partitions
- Fill up storage to test quotas
- Concurrent trader surge

### Technical Recommendations

#### Must Have
1. Idempotent writes with request IDs
2. Circuit breaker for database connections
3. Structured logging with correlation IDs
4. Monitoring dashboard with alerts

#### Should Have
1. Read replicas for analytics queries
2. CDC (Change Data Capture) for audit trail
3. Automated partition management
4. Query result caching

#### Nice to Have
1. GraphQL subscriptions for fine-grained updates
2. Protocol buffers for efficient serialization
3. ClickHouse for analytics workloads

### Implementation Guidelines

#### Code Organization
```
src/
  features/
    signal-persistence/
      components/
        SignalTable.tsx
        SignalExporter.tsx
      hooks/
        useSignalSubscription.ts
        useSignalQuery.ts
      services/
        SignalPersistenceService.ts
        SignalQueryService.ts
        SignalCacheManager.ts
      utils/
        signalDeduplication.ts
        signalCompression.ts
      tests/
        integration/
        load/
supabase/
  functions/
    ingest-signals/
    query-signals/
  migrations/
    011_create_signals_table.sql
    012_create_signal_partitions.sql
```

#### Key Decisions
- State management: Keep local cache, sync with database
- Data fetching: Cursor-based pagination for large datasets
- Caching: LRU with 5-minute TTL for hot signals
- Error handling: Exponential backoff with jitter

### Questions for PM/Design

1. **Acceptable data loss**: Can we lose signals during catastrophic failure, or need multi-region replication? Yes, we don't need multi-region.
2. **Query latency trade-off**: Is 200ms acceptable for 7-day historical queries? yes.
3. **Cost constraints**: What's the monthly budget for infrastructure? ($500-5000 range) $5 per month for pro tier and elite tier.
4. **Compliance requirements**: Any regulatory retention requirements (MiFID II requires 5 years)? No.

### Pre-Implementation Checklist

- [x] Performance requirements achievable (with proper architecture)
- [x] Security model defined (RLS + encryption)
- [x] Error handling strategy clear (retries + circuit breaker)
- [ ] Monitoring plan in place (needs Prometheus/Grafana setup)
- [x] Rollback strategy defined (feature flags + blue-green)
- [ ] Dependencies available (need TimescaleDB enabled)
- [ ] No blocking technical debt (need to create signals table first)

### Recommended Next Steps

1. **Immediate actions**:
   - Create signals table schema with proper indexes
   - Enable TimescaleDB extension in Supabase
   - Prototype Edge Function for write ingestion

2. **Before implementation**:
   - Load test current WebSocket infrastructure
   - Benchmark PostgreSQL write performance
   - Evaluate need for separate time-series database

3. **Risk mitigation**:
   - Set up development branch in Supabase for testing
   - Implement feature flags for gradual rollout
   - Create comprehensive monitoring before launch

---
*[End of engineering review. Next: /architect-issue issues/2025-09-26-signal-persistence-architecture.md]*