# Shared Go Backend Architecture - Implementation Plan

**Created:** 2025-10-11
**Status:** Planning
**Estimated Effort:** 80 hours (2 weeks)
**Risk Level:** Medium (90% code exists, clear requirements)

---

## Executive Summary

Migrating from per-user Fly machines to a shared multi-tenant Go backend that runs all users' traders in a single application. This eliminates Fly.io deployment complexity, reduces costs by 70%, and aligns with proven patterns for solo founders.

**Key Benefits:**
- **Cost Savings:** $60-90/month vs $285/month for 100 users (70% reduction)
- **Operational Simplicity:** Normal app deployment instead of Machines API complexity
- **Performance:** 500-1000 traders per machine, sub-10ms latency
- **Scalability:** Horizontal scaling with `fly scale count N`

**Key Risks & Mitigations:**
- **Risk:** Noisy neighbor (one trader consuming all resources)
  **Mitigation:** Goroutine resource quotas, CPU/memory limits per trader
- **Risk:** Database connection exhaustion
  **Mitigation:** Connection pooling (pgxpool), max 100 connections
- **Risk:** Signal duplication across machines
  **Mitigation:** PostgreSQL unique constraints on (trader_id, symbol, timestamp)

---

## Phase 0: UI Work Assessment

**Decision: SKIP Phase 0** - This is pure backend work. No UI changes required.

The frontend already calls:
- `/api/v1/traders` - Get traders
- `/api/v1/execute-filter` - Execute filters

We're adding new endpoints:
- `POST /api/v1/traders/{id}/start` - Start trader
- `POST /api/v1/traders/{id}/stop` - Stop trader
- `GET /api/v1/traders/{id}/status` - Get trader status

Frontend can integrate these endpoints after backend is complete.

---

## Phase 1: Foundation (40 hours)

Build the core trader lifecycle infrastructure.

### Task 1.1: Trader State Machine (6 hours)

**Files:**
- `backend/go-screener/internal/trader/types.go` (NEW)
- `backend/go-screener/internal/trader/state.go` (NEW)

**Actions:**
1. Define trader states: `stopped`, `starting`, `running`, `stopping`, `error`
2. Define allowed state transitions with validation
3. Add state change event handlers
4. Add error state recovery logic

**Code Structure:**
```go
// types.go
type TraderState string

const (
    StateStopped  TraderState = "stopped"
    StateStarting TraderState = "starting"
    StateRunning  TraderState = "running"
    StateStopping TraderState = "stopping"
    StateError    TraderState = "error"
)

type Trader struct {
    ID          string
    UserID      string
    State       TraderState
    Config      *TraderConfig
    LastError   error
    StartedAt   time.Time
    StoppedAt   time.Time
    SignalCount int64
    mu          sync.RWMutex
}

// state.go
func (t *Trader) TransitionTo(newState TraderState) error
func (t *Trader) CanTransition(to TraderState) bool
```

**Test Criteria:**
- [ ] State transitions enforce valid paths (e.g., stopped → starting → running)
- [ ] Invalid transitions return errors (e.g., running → starting)
- [ ] State changes are thread-safe (concurrent transitions don't corrupt state)
- [ ] Error state can transition back to stopped

**Checkpoint:** PM validates state machine behavior with unit tests

**Time Estimate:** 6 hours

---

### Task 1.2: Trader Registry (8 hours)

**Files:**
- `backend/go-screener/internal/trader/registry.go` (NEW)
- `backend/go-screener/internal/trader/registry_test.go` (NEW)

**Actions:**
1. Create in-memory registry with `sync.Map` for O(1) lookups
2. Add methods: `Register()`, `Unregister()`, `Get()`, `List()`, `GetByUser()`
3. Add auto-cleanup for stopped traders after 5 minutes
4. Add metrics: active traders count, traders by state

**Code Structure:**
```go
type Registry struct {
    traders sync.Map // map[string]*Trader
    metrics *Metrics
}

func NewRegistry() *Registry
func (r *Registry) Register(trader *Trader) error
func (r *Registry) Unregister(id string) error
func (r *Registry) Get(id string) (*Trader, bool)
func (r *Registry) List() []*Trader
func (r *Registry) GetByUser(userID string) []*Trader
func (r *Registry) GetByState(state TraderState) []*Trader
```

**Test Criteria:**
- [ ] Registry handles concurrent register/unregister without deadlocks
- [ ] `GetByUser()` returns only that user's traders
- [ ] Auto-cleanup removes stopped traders after 5 minutes
- [ ] Metrics accurately reflect active trader counts

**Checkpoint:** PM validates registry with concurrent operations test

**Time Estimate:** 8 hours

---

### Task 1.3: Trader Executor (12 hours)

**Files:**
- `backend/go-screener/internal/trader/executor.go` (NEW)
- `backend/go-screener/internal/trader/executor_test.go` (NEW)

**Actions:**
1. Create goroutine-based executor that runs trader filter loop
2. Integrate with existing Yaegi interpreter for dynamic code execution
3. Add screening interval handling (default: 60 seconds)
4. Add graceful cancellation with context.Context
5. Add panic recovery to prevent trader crashes from taking down server

**Code Structure:**
```go
type Executor struct {
    yaegi   *yaegi.Executor
    binance *binance.Client
    supabase *supabase.Client
}

func NewExecutor(yaegi *yaegi.Executor, binance *binance.Client, supabase *supabase.Client) *Executor
func (e *Executor) Start(ctx context.Context, trader *Trader) error
func (e *Executor) executeFilterLoop(ctx context.Context, trader *Trader)
func (e *Executor) executeFilter(trader *Trader) ([]Signal, error)
func (e *Executor) saveSignals(signals []Signal) error
```

**Test Criteria:**
- [ ] Executor runs filter code in loop with correct interval
- [ ] Context cancellation stops executor within 1 second
- [ ] Panics in filter code are recovered and logged (trader moves to error state)
- [ ] Signals are saved to database with deduplication

**Checkpoint:** PM validates executor with sample "Bearish Breakout" trader

**Time Estimate:** 12 hours

---

### Task 1.4: Trader Manager (14 hours)

**Files:**
- `backend/go-screener/internal/trader/manager.go` (NEW)
- `backend/go-screener/internal/trader/manager_test.go` (NEW)

**Actions:**
1. Create `TraderManager` that orchestrates registry + executor
2. Add `Start(traderID)`, `Stop(traderID)`, `GetStatus(traderID)` methods
3. Add goroutine pool management (max 1000 concurrent traders)
4. Add graceful shutdown (handle SIGTERM, stop all traders within 30s)
5. Add auto-restart on crash (move to error state, retry after 60s)

**Code Structure:**
```go
type Manager struct {
    registry  *Registry
    executor  *Executor
    pool      *goroutine.Pool
    config    *config.Config
    ctx       context.Context
    cancel    context.CancelFunc
    wg        sync.WaitGroup
}

func NewManager(cfg *config.Config, executor *Executor) *Manager
func (m *Manager) Start(traderID string) error
func (m *Manager) Stop(traderID string) error
func (m *Manager) StopAll() error
func (m *Manager) GetStatus(traderID string) (*TraderStatus, error)
func (m *Manager) LoadTradersFromDB() error
func (m *Manager) Shutdown(timeout time.Duration) error
```

**Test Criteria:**
- [ ] Manager starts trader and transitions state correctly
- [ ] Manager stops trader and cleans up goroutine
- [ ] `StopAll()` stops all traders within 30 seconds
- [ ] Manager respects goroutine pool limits (max 1000)
- [ ] Auto-restart recovers crashed traders after 60s

**Checkpoint:** PM validates manager with 10 concurrent traders

**Time Estimate:** 14 hours

---

## Phase 2: Production Readiness (20 hours)

Add reliability, observability, and resource management.

### Task 2.1: API Endpoints (8 hours)

**Files:**
- `backend/go-screener/internal/server/trader_handlers.go` (NEW)
- `backend/go-screener/internal/server/routes.go` (MODIFY)

**Actions:**
1. Add HTTP handlers for trader lifecycle:
   - `POST /api/v1/traders/{id}/start` - Start trader (authenticated, tier-gated)
   - `POST /api/v1/traders/{id}/stop` - Stop trader (authenticated, owner only)
   - `GET /api/v1/traders/{id}/status` - Get trader status (authenticated, owner only)
   - `GET /api/v1/traders/active` - List active traders (authenticated)
2. Add authentication middleware (verify Supabase JWT)
3. Add authorization middleware (verify user owns trader, check tier limits)
4. Add rate limiting (max 10 requests/minute per user)

**Code Structure:**
```go
// trader_handlers.go
type TraderHandler struct {
    manager *trader.Manager
    supabase *supabase.Client
}

func (h *TraderHandler) StartTrader(w http.ResponseWriter, r *http.Request)
func (h *TraderHandler) StopTrader(w http.ResponseWriter, r *http.Request)
func (h *TraderHandler) GetTraderStatus(w http.ResponseWriter, r *http.Request)
func (h *TraderHandler) ListActiveTraders(w http.ResponseWriter, r *http.Request)
```

**Test Criteria:**
- [ ] Unauthenticated requests return 401 Unauthorized
- [ ] User cannot start another user's trader (403 Forbidden)
- [ ] Pro tier user cannot start 11th trader (403 Forbidden - quota exceeded)
- [ ] Elite tier user can start unlimited traders
- [ ] Rate limiting blocks >10 requests/minute

**Checkpoint:** PM tests API with Postman/curl

**Time Estimate:** 8 hours

---

### Task 2.2: Resource Quotas (6 hours)

**Files:**
- `backend/go-screener/internal/trader/quotas.go` (NEW)
- `backend/go-screener/pkg/semaphore/semaphore.go` (NEW)

**Actions:**
1. Create two-level semaphore system:
   - Global semaphore: max 1000 active traders across all users
   - Per-user semaphore: Pro = 10 traders, Elite = unlimited
2. Add quota enforcement in `Manager.Start()`
3. Add metrics: quota usage, quota rejections

**Code Structure:**
```go
type QuotaManager struct {
    global   *semaphore.Weighted // Max 1000 traders globally
    perUser  sync.Map            // map[userID]*semaphore.Weighted
    tiers    map[string]int64    // tier → max traders
}

func NewQuotaManager(globalMax int64) *QuotaManager
func (q *QuotaManager) Acquire(userID, tier string) error
func (q *QuotaManager) Release(userID string)
func (q *QuotaManager) GetUsage(userID string) (current, max int64)
```

**Test Criteria:**
- [ ] Global quota blocks 1001st trader (regardless of tier)
- [ ] Pro user blocked at 11th trader
- [ ] Elite user can exceed 10 traders
- [ ] Released quota allows new trader to start
- [ ] Metrics track quota rejections

**Checkpoint:** PM validates quota enforcement with 100 concurrent users

**Time Estimate:** 6 hours

---

### Task 2.3: Observability (6 hours)

**Files:**
- `backend/go-screener/internal/trader/metrics.go` (NEW)
- `backend/go-screener/internal/server/metrics_handler.go` (MODIFY)

**Actions:**
1. Add Prometheus metrics:
   - `traders_active{state}` - Active traders by state
   - `traders_total` - Total traders started (counter)
   - `trader_errors_total{reason}` - Errors by reason
   - `trader_signals_total` - Signals generated (counter)
   - `trader_execution_duration_seconds` - Filter execution time histogram
2. Add structured logging with trader ID context
3. Add health check that includes trader manager status

**Code Structure:**
```go
type Metrics struct {
    ActiveTraders   *prometheus.GaugeVec
    TotalTraders    prometheus.Counter
    ErrorsTotal     *prometheus.CounterVec
    SignalsTotal    prometheus.Counter
    ExecutionTime   prometheus.Histogram
}

func NewMetrics() *Metrics
func (m *Metrics) RecordTraderState(state TraderState, delta int)
func (m *Metrics) RecordError(reason string)
func (m *Metrics) RecordSignal()
func (m *Metrics) RecordExecution(duration time.Duration)
```

**Test Criteria:**
- [ ] Metrics endpoint `/metrics` returns Prometheus-formatted data
- [ ] Active traders metric matches actual running count
- [ ] Execution time histogram tracks filter loop duration
- [ ] Error metrics increment on trader crashes
- [ ] Health check shows manager status

**Checkpoint:** PM verifies metrics in Grafana dashboard

**Time Estimate:** 6 hours

---

## Phase 3: Integration (12 hours)

Connect to existing systems and migrate from per-user machines.

### Task 3.1: Database Schema (2 hours)

**Files:**
- `backend/go-screener/migrations/005_trader_state.sql` (NEW)

**Actions:**
1. Add `trader_state` table to track running traders:
   ```sql
   CREATE TABLE trader_state (
       trader_id UUID PRIMARY KEY REFERENCES traders(id),
       user_id UUID NOT NULL REFERENCES users(id),
       state TEXT NOT NULL CHECK (state IN ('stopped', 'starting', 'running', 'stopping', 'error')),
       machine_id TEXT, -- For tracking which Fly machine is running this trader
       started_at TIMESTAMPTZ,
       stopped_at TIMESTAMPTZ,
       last_error TEXT,
       signal_count BIGINT DEFAULT 0,
       updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE INDEX idx_trader_state_user ON trader_state(user_id);
   CREATE INDEX idx_trader_state_machine ON trader_state(machine_id);
   ```

2. Add unique constraint to signals table to prevent duplicates:
   ```sql
   ALTER TABLE signals
   ADD CONSTRAINT unique_signal
   UNIQUE (trader_id, symbol, triggered_at);
   ```

**Test Criteria:**
- [ ] Migration runs successfully on test database
- [ ] Unique constraint prevents duplicate signal inserts
- [ ] State transitions update `trader_state` table correctly

**Checkpoint:** PM verifies schema in Supabase Studio

**Time Estimate:** 2 hours

---

### Task 3.2: Server Integration (4 hours)

**Files:**
- `backend/go-screener/internal/server/server.go` (MODIFY)
- `backend/go-screener/cmd/server/main.go` (MODIFY)

**Actions:**
1. Initialize `TraderManager` in server startup
2. Add graceful shutdown hook for manager
3. Wire up trader handlers to router
4. Load existing traders from database on startup

**Code Changes:**
```go
// server.go
type Server struct {
    config          *config.Config
    router          *mux.Router
    httpServer      *http.Server
    binanceClient   *binance.Client
    supabaseClient  *supabase.Client
    yaegiExecutor   *yaegi.Executor
    traderManager   *trader.Manager  // NEW
    corsHandler     *cors.Cors
    startTime       time.Time
}

// main.go
func main() {
    // ... existing setup ...

    // Initialize trader manager
    executor := trader.NewExecutor(yaegiExec, binanceClient, supabaseClient)
    traderManager := trader.NewManager(cfg, executor)

    // Load traders from database
    if err := traderManager.LoadTradersFromDB(); err != nil {
        log.Fatal(err)
    }

    // Start server
    server := server.New(cfg, binanceClient, supabaseClient, yaegiExec, traderManager)

    // Graceful shutdown
    sigChan := make(chan os.Signal, 1)
    signal.Notify(sigChan, syscall.SIGTERM, syscall.SIGINT)
    go func() {
        <-sigChan
        ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
        defer cancel()
        traderManager.Shutdown(ctx.Timeout)
        server.Shutdown(ctx)
    }()

    server.Start()
}
```

**Test Criteria:**
- [ ] Server starts with trader manager initialized
- [ ] Traders from database are loaded on startup
- [ ] SIGTERM triggers graceful shutdown (stops all traders within 30s)
- [ ] Health check includes trader manager status

**Checkpoint:** PM validates server startup and shutdown behavior

**Time Estimate:** 4 hours

---

### Task 3.3: Edge Function Migration (4 hours)

**Files:**
- `supabase/functions/provision-machine/index.ts` (MODIFY)
- `supabase/functions/start-trader/index.ts` (NEW)
- `supabase/functions/stop-trader/index.ts` (NEW)

**Actions:**
1. Create new Edge Functions that call Go backend API:
   - `start-trader` → `POST /api/v1/traders/{id}/start`
   - `stop-trader` → `POST /api/v1/traders/{id}/stop`
2. Update `provision-machine` to call `start-trader` after creating machine (backward compatibility)
3. Add retry logic for API calls (max 3 retries with exponential backoff)

**Code Structure:**
```typescript
// start-trader/index.ts
Deno.serve(async (req: Request) => {
  const { traderId } = await req.json();

  // Call Go backend API
  const response = await fetch(`${GO_BACKEND_URL}/api/v1/traders/${traderId}/start`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to start trader: ${response.statusText}`);
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

**Test Criteria:**
- [ ] `start-trader` successfully calls Go backend and starts trader
- [ ] `stop-trader` successfully calls Go backend and stops trader
- [ ] Retry logic handles transient failures (503 Service Unavailable)
- [ ] Edge Functions return proper error messages on failure

**Checkpoint:** PM tests Edge Functions with sample trader

**Time Estimate:** 4 hours

---

### Task 3.4: Frontend Integration (2 hours)

**Files:**
- `apps/app/src/services/traderService.ts` (MODIFY)

**Actions:**
1. Update `traderService.ts` to call new Edge Functions:
   - `startTrader(traderId)` → calls `start-trader` Edge Function
   - `stopTrader(traderId)` → calls `stop-trader` Edge Function
   - `getTraderStatus(traderId)` → calls `GET /api/v1/traders/{id}/status`
2. Add error handling for quota exceeded (show upgrade prompt)
3. Add loading states for start/stop actions

**Code Changes:**
```typescript
// traderService.ts
export async function startTrader(traderId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('start-trader', {
    body: { traderId },
  });

  if (error) {
    if (error.message.includes('quota exceeded')) {
      throw new Error('You have reached your trader limit. Upgrade to Elite for unlimited traders.');
    }
    throw error;
  }
}

export async function stopTrader(traderId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('stop-trader', {
    body: { traderId },
  });

  if (error) throw error;
}

export async function getTraderStatus(traderId: string): Promise<TraderStatus> {
  const response = await fetch(`${GO_BACKEND_URL}/api/v1/traders/${traderId}/status`, {
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
    },
  });

  if (!response.ok) throw new Error('Failed to get trader status');

  return response.json();
}
```

**Test Criteria:**
- [ ] Start button calls `startTrader()` and shows loading state
- [ ] Stop button calls `stopTrader()` and disables during operation
- [ ] Quota exceeded shows upgrade prompt
- [ ] Trader status updates in real-time (polling every 5 seconds)

**Checkpoint:** PM tests UI integration end-to-end

**Time Estimate:** 2 hours

---

## Phase 4: Polish (8 hours)

Edge cases, performance tuning, documentation.

### Task 4.1: Error Handling (3 hours)

**Files:**
- `backend/go-screener/internal/trader/executor.go` (MODIFY)
- `backend/go-screener/internal/trader/manager.go` (MODIFY)

**Actions:**
1. Add comprehensive error handling:
   - Database connection failures → retry with exponential backoff
   - Binance API rate limits → implement jitter backoff
   - Yaegi compilation errors → move trader to error state with detailed message
   - Signal save failures → log and continue (don't crash trader)
2. Add circuit breaker for Binance API (open after 5 consecutive failures)
3. Add dead letter queue for failed signals (save to `signals_failed` table)

**Test Criteria:**
- [ ] Database reconnection recovers within 30 seconds
- [ ] Binance rate limit triggers backoff (doesn't crash trader)
- [ ] Yaegi compilation errors are logged with line numbers
- [ ] Circuit breaker opens after 5 failures, closes after 60s

**Checkpoint:** PM validates error scenarios with fault injection

**Time Estimate:** 3 hours

---

### Task 4.2: Performance Optimization (3 hours)

**Files:**
- `backend/go-screener/internal/trader/executor.go` (MODIFY)
- `backend/go-screener/internal/trader/manager.go` (MODIFY)

**Actions:**
1. Add batch signal insertion (insert 100 signals at once instead of one-by-one)
2. Add connection pooling for Supabase (max 100 connections)
3. Add caching for trader configurations (5-minute TTL)
4. Optimize goroutine scheduling (use `runtime.GOMAXPROCS`)

**Code Changes:**
```go
// executor.go
func (e *Executor) saveSignals(signals []Signal) error {
    // Batch insert instead of one-by-one
    const batchSize = 100
    for i := 0; i < len(signals); i += batchSize {
        end := i + batchSize
        if end > len(signals) {
            end = len(signals)
        }
        batch := signals[i:end]
        if err := e.supabase.InsertSignals(batch); err != nil {
            return err
        }
    }
    return nil
}
```

**Test Criteria:**
- [ ] Batch insertion reduces database round-trips by 100x
- [ ] Connection pool prevents "too many connections" errors under load
- [ ] Cached configurations reduce database queries by 90%
- [ ] CPU usage stays under 50% with 500 active traders

**Checkpoint:** PM runs load test with 500 concurrent traders

**Time Estimate:** 3 hours

---

### Task 4.3: Documentation (2 hours)

**Files:**
- `docs/shared-backend-deployment.md` (NEW)
- `backend/go-screener/README.md` (MODIFY)

**Actions:**
1. Document deployment process:
   - Building Go backend: `fly deploy -a vyx-app -c server/fly-machine/fly.toml`
   - Scaling: `fly scale count 3` (add more machines)
   - Monitoring: Grafana dashboard URLs, key metrics to watch
2. Document trader lifecycle API
3. Document troubleshooting guide:
   - "Trader stuck in starting state" → Check logs for Yaegi compilation errors
   - "Quota exceeded" → Check user tier and current usage
   - "High memory usage" → Check for memory leaks in filter code

**Test Criteria:**
- [ ] Documentation includes complete deployment workflow
- [ ] API documentation has curl examples for each endpoint
- [ ] Troubleshooting guide covers common issues

**Checkpoint:** PM reviews documentation for completeness

**Time Estimate:** 2 hours

---

## Risk Tracking

### High-Risk Areas

1. **Database Connection Pool Exhaustion**
   - **Risk:** 1000 traders × 1 connection each = 1000 connections (exceeds Supabase limit)
   - **Mitigation:** Use shared connection pool (max 100 connections) with pgxpool
   - **Test:** Load test with 500 traders, monitor connection count

2. **Signal Deduplication Across Machines**
   - **Risk:** Multiple machines generate duplicate signals for same trader
   - **Mitigation:** PostgreSQL unique constraint on (trader_id, symbol, triggered_at)
   - **Test:** Run same trader on 2 machines, verify only 1 signal inserted

3. **Graceful Shutdown During Deployments**
   - **Risk:** SIGTERM kills machine mid-signal-insertion, losing data
   - **Mitigation:** 30-second grace period, context cancellation, flush signals before exit
   - **Test:** Deploy during active trading, verify no signal loss

### Medium-Risk Areas

1. **Goroutine Pool Overflow**
   - **Risk:** >1000 concurrent traders causes goroutine explosion
   - **Mitigation:** Semaphore-based goroutine pool (max 1000)
   - **Test:** Attempt to start 1001st trader, verify rejection

2. **Yaegi Compilation Performance**
   - **Risk:** Complex filter code takes >1s to compile, blocking trader startup
   - **Mitigation:** Compile on first run, cache compiled code for subsequent executions
   - **Test:** Benchmark compilation time for 100 different filters

### Low-Risk Areas

1. **Tier Enforcement**
   - **Risk:** Pro user bypasses 10-trader limit
   - **Mitigation:** Database-backed quota checks + middleware enforcement
   - **Test:** Unit tests for quota manager

---

## Migration Strategy

### Phase 3a: Parallel Operation (Week 1)

**Goal:** Run both systems side-by-side for validation

**Steps:**
1. Deploy shared Go backend to new Fly app: `vyx-shared-backend`
2. Update Edge Functions to call shared backend (with fallback to per-user machines)
3. Enable shared backend for 10% of Elite users (feature flag)
4. Monitor metrics: signal counts, error rates, latency

**Success Criteria:**
- [ ] Shared backend generates same signals as per-user machines
- [ ] No increase in error rates
- [ ] Latency <100ms for start/stop operations

### Phase 3b: Full Migration (Week 2)

**Goal:** Migrate all users to shared backend

**Steps:**
1. Enable shared backend for 100% of Elite users
2. Enable shared backend for Pro users
3. Stop provisioning new per-user machines (deprecate "Create Machine" button)
4. Decommission existing per-user machines (allow 7-day grace period)

**Success Criteria:**
- [ ] All traders running on shared backend
- [ ] Zero per-user machines remaining
- [ ] Cost reduced to target ($60-90/month for 100 users)

---

## Testing Checklist

### Unit Tests
- [ ] State machine transitions
- [ ] Registry concurrent operations
- [ ] Quota enforcement
- [ ] Signal deduplication

### Integration Tests
- [ ] API endpoints (auth, authorization, rate limiting)
- [ ] Database operations (insert signals, load traders)
- [ ] Graceful shutdown (SIGTERM handling)

### Load Tests
- [ ] 500 concurrent traders (target: CPU <50%, memory <2GB)
- [ ] 1000 signal insertions/second (target: latency <100ms)
- [ ] 100 concurrent API requests (target: p99 latency <500ms)

### End-to-End Tests
- [ ] Create trader in UI → Start trader → Verify signals generated
- [ ] Stop trader → Verify signals stop generating
- [ ] Deploy new version → Verify zero signal loss during rollout

---

## Deployment Workflow

### Initial Deployment
```bash
# 1. Build new shared backend image
fly deploy -a vyx-shared-backend -c backend/go-screener/fly.toml

# 2. Run database migrations
supabase db push

# 3. Deploy Edge Functions
supabase functions deploy start-trader
supabase functions deploy stop-trader

# 4. Update frontend environment variables
# GO_BACKEND_URL=https://vyx-shared-backend.fly.dev
pnpm build && fly deploy -a vyx-app-frontend
```

### Scaling
```bash
# Add more machines (horizontal scaling)
fly scale count 3 -a vyx-shared-backend

# Increase machine resources (vertical scaling)
fly scale vm shared-cpu-2x -a vyx-shared-backend
fly scale memory 1024 -a vyx-shared-backend
```

### Monitoring
```bash
# View logs
fly logs -a vyx-shared-backend

# Check metrics
curl https://vyx-shared-backend.fly.dev/metrics

# View Grafana dashboard
https://grafana.yourcompany.com/d/traders
```

---

## Success Metrics

### Performance Targets
- **Latency:** <10ms filter execution (p50), <50ms (p99)
- **Throughput:** 1000 signals/second per machine
- **CPU Usage:** <50% with 500 traders
- **Memory Usage:** <2GB with 500 traders

### Operational Targets
- **Cost:** $60-90/month for 100 users (vs $285 today)
- **Deployment Time:** <5 minutes from code push to live
- **Downtime:** 0 seconds during deployments (rolling updates)
- **Error Rate:** <0.1% signal generation failures

### Business Targets
- **Time to Market:** 2 weeks (80 hours)
- **Scalability:** Support 500-1000 users on single machine
- **Developer Velocity:** Solo founder can deploy without DevOps expertise

---

## Next Steps

1. **Review Plan:** PM validates phasing, time estimates, test criteria
2. **Kick Off Phase 1:** Start with Task 1.1 (Trader State Machine)
3. **Daily Standups:** 15-minute sync to track progress and blockers
4. **Phase Checkpoints:** PM validates each phase before proceeding to next

**Ready to Start?** Reply "proceed" to begin Phase 1, Task 1.1.

---

**Estimated Timeline:**
- **Week 1:** Phase 1 (Foundation) + Phase 2 (Production Readiness)
- **Week 2:** Phase 3 (Integration + Migration) + Phase 4 (Polish)

**Total: 80 hours over 2 weeks (full-time)**
