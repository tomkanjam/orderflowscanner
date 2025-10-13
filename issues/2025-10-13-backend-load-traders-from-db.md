# Implement LoadTradersFromDB() to Enable Trader Execution

## Metadata
- **Status:** 🚧 implementing
- **Created:** 2025-10-13T16:35:00Z
- **Type:** backend
- **Progress:** [======    ] 40%

---

## Technical Planning
*Stage: planning | Date: 2025-10-13T16:35:00Z*

### Task Description
Complete the implementation of `LoadTradersFromDB()` in `/backend/go-screener/internal/trader/manager.go` to load traders from Supabase into the runtime registry. Currently, this method is a stub that returns 0 traders, preventing any traders from being started or executed.

**Current behavior:**
- Traders exist in Supabase database (3 built-in traders confirmed)
- Traders can be fetched via API (`/api/v1/traders`)
- StartTrader API fails with "Trader not found" because registry is empty
- `registry_size` metric always shows 0

**Why this matters:**
Users cannot start traders because they're never loaded into memory. The event-driven execution architecture requires traders to be in the registry before they can subscribe to candle events and generate signals.

### Technical Context
- **Current state:**
  - `LoadTradersFromDB()` is a TODO stub (lines 235-251 in manager.go)
  - Returns success but logs "Loaded 0 traders"
  - Supabase client has working methods: `GetBuiltInTraders()`, `GetTraders(userID)`
  - Traders are stored with double-encoded JSON filter field (handled by `Trader.GetFilter()`)

- **Desired state:**
  - Load all built-in traders on server startup
  - Optionally load user traders that were previously running (stored state)
  - Create `Trader` instances from database records with proper filter code parsing
  - Register all loaded traders in the registry
  - Traders available for Start/Stop via API

- **Affected systems:**
  - `internal/trader/manager.go` - LoadTradersFromDB() implementation
  - `internal/trader/trader.go` - Trader instance creation from DB records
  - `pkg/supabase/client.go` - Already working (recently fixed snake_case column names)
  - `pkg/types/types.go` - Trader struct with GetFilter() method (already implemented)
  - Event bus and executor - Already set up and waiting for traders

### Critical Questions

1. **Trader loading strategy**: Should we load ALL traders or only specific ones on startup?
   - Built-in traders only?
   - Built-in + user traders that were running when server shutdown?
   - All traders but don't auto-start them?

2. **Filter code handling**: How do we convert the database Trader record into an executable Trader instance?
   - Parse `filter.code` field (contains JavaScript filter code)
   - Do we validate/compile the code on load or defer to first execution?
   - How to handle traders with Go vs JavaScript filter code (language field)?

3. **State restoration**: Should traders auto-start if they were running before shutdown?
   - Is there a `trader_state` table tracking which traders were running?
   - Or do we just load them into registry but leave them stopped?
   - What about user preferences for auto-start?

4. **Error handling**: How do we handle traders that fail to load?
   - Skip and log, or fail entire startup?
   - What if filter code is invalid?
   - What about missing required data (symbols, timeframes)?

5. **Startup sequence**: When should `LoadTradersFromDB()` be called?
   - Is it already called somewhere (need to verify)?
   - Should it be in server.Start() before engines start?
   - Does it need to complete before the candle scheduler starts?

6. **Built-in trader ownership**: The 3 built-in traders have empty `user_id` - how do we handle this?
   - Create synthetic user IDs?
   - Allow empty user_id for system traders?
   - How does quota enforcement work for built-in traders?

### Key Considerations

**Migration concerns:**
- First deployment will load traders for the first time
- Need to handle case where database has many traders (performance)
- Consider pagination if trader count grows large

**Monitoring needs:**
- Log how many traders loaded successfully
- Expose metric for "traders_loaded_from_db"
- Track failures and skipped traders

---

## System Architecture
*Stage: architecture | Date: 2025-10-13T18:00:00Z*

### Overview

The `LoadTradersFromDB()` implementation will transform database Trader records into runtime Trader instances and register them in the Manager's registry. This enables traders to be started via the API and subscribe to candle events for signal generation.

### Architecture Decisions

#### 1. Trader Loading Strategy
**Decision**: Load only **built-in traders** on startup, load user traders **on-demand** via API.

**Rationale**:
- Built-in traders are system-maintained strategies that should always be available
- User traders require user context (tier, preferences) which isn't available at startup
- Loading all user traders would create unnecessary memory pressure
- Users trigger trader starts via API, which can load-on-demand

**Implementation**:
- `LoadTradersFromDB()` calls `supabase.GetBuiltInTraders()`
- Loads only traders with `is_built_in = true`
- User traders are loaded when first accessed via API (lazy loading)

#### 2. Database Model to Runtime Model Conversion
**Challenge**: `types.Trader` (database) vs `trader.Trader` (runtime) are different structs.

**Solution**: Create a converter function `convertDBTraderToRuntime()`:

```go
func convertDBTraderToRuntime(dbTrader *types.Trader) (*Trader, error) {
    // Parse filter using GetFilter() method
    filter, err := dbTrader.GetFilter()
    if err != nil {
        return nil, fmt.Errorf("failed to parse filter: %w", err)
    }

    // Create TraderConfig from filter
    config := &TraderConfig{
        FilterCode:        filter.Code,
        ScreeningInterval: 5 * time.Minute, // Default
        Symbols:           []string{},      // Empty = screen all top symbols
        Timeframes:        filter.RequiredTimeframes,
        Indicators:        convertIndicators(filter.Indicators),
        MaxSignalsPerRun:  10,              // Default limit
        TimeoutPerRun:     5 * time.Second, // Default timeout
    }

    // Create runtime Trader
    return NewTrader(
        dbTrader.ID,
        dbTrader.UserID,
        dbTrader.Name,
        dbTrader.Description,
        config,
    ), nil
}

func convertIndicators(dbIndicators []types.IndicatorConfig) []IndicatorConfig {
    result := make([]IndicatorConfig, len(dbIndicators))
    for i, ind := range dbIndicators {
        result[i] = IndicatorConfig{
            Type:       ind.Name, // Map Name to Type
            Parameters: ind.Params,
        }
    }
    return result
}
```

#### 3. Filter Code Handling
**Decision**: Validate filter code during load, but **defer compilation** to first execution.

**Rationale**:
- Yaegi validation is lightweight (syntax check only)
- Full compilation happens in Executor when trader is started
- Invalid filter code causes load failure = trader won't be registered
- This prevents broken traders from entering the system

**Implementation**:
```go
// In LoadTradersFromDB(), after converting:
if err := m.yaegi.ValidateCode(trader.Config.FilterCode); err != nil {
    log.Printf("[Manager] Skipping trader %s: invalid filter code: %v", trader.ID, err)
    continue // Skip this trader, continue loading others
}
```

**Note**: Need to add Yaegi executor to Manager struct.

#### 4. State Restoration Strategy
**Decision**: Load traders in **Stopped state**, do NOT auto-start.

**Rationale**:
- State persistence (`trader_state` table) doesn't exist yet
- Auto-starting all built-in traders could overwhelm the system on cold starts
- Users can manually start traders via API after server is running
- Future enhancement: Add `trader_state` table for persistence

**Implementation**:
- All loaded traders initialized with `state: StateStopped`
- `NewTrader()` already defaults to `StateStopped`
- No calls to `Manager.Start()` in `LoadTradersFromDB()`

#### 5. Built-in Trader User ID Handling
**Decision**: Allow **empty `user_id`** for built-in traders, use synthetic value `"system"` for quota tracking.

**Rationale**:
- Built-in traders have `user_id = ""` in database (confirmed)
- Quota system requires a user ID string
- Using `"system"` allows quota tracking without database changes
- System user can have special quota rules (e.g., no limits)

**Implementation**:
```go
func (m *Manager) LoadTradersFromDB() error {
    builtInTraders, err := m.supabase.GetBuiltInTraders(m.ctx)
    // ...
    for _, dbTrader := range builtInTraders {
        // Handle empty user_id for built-in traders
        userID := dbTrader.UserID
        if userID == "" {
            userID = "system" // Synthetic user ID for quota tracking
        }

        trader, err := convertDBTraderToRuntime(dbTrader)
        trader.UserID = userID // Override with system ID if needed
        // ...
    }
}
```

#### 6. Error Handling Strategy
**Decision**: **Graceful degradation** - skip failed traders, continue loading.

**Rationale**:
- One bad trader shouldn't prevent the entire server from starting
- Log failures for debugging
- Track success/failure counts in metrics
- Return success even if some traders fail to load

**Implementation**:
```go
func (m *Manager) LoadTradersFromDB() error {
    loaded := 0
    failed := 0

    for _, dbTrader := range builtInTraders {
        trader, err := convertDBTraderToRuntime(dbTrader)
        if err != nil {
            log.Printf("[Manager] Failed to convert trader %s: %v", dbTrader.ID, err)
            failed++
            continue // Skip, but don't fail entire operation
        }

        if err := m.RegisterTrader(trader); err != nil {
            log.Printf("[Manager] Failed to register trader %s: %v", trader.ID, err)
            failed++
            continue
        }

        loaded++
    }

    log.Printf("[Manager] Loaded %d traders from database (%d failed)", loaded, failed)
    return nil // Success even if some failed
}
```

#### 7. Startup Sequence Integration
**Decision**: Call `LoadTradersFromDB()` **after** Event Bus starts, **before** Executor starts.

**Rationale**:
- Event Bus must exist before traders are registered (no dependency on events yet)
- Executor subscribes to Event Bus, so Event Bus must start first
- Traders must be loaded before Executor starts (executor doesn't need them immediately)
- Scheduler can start after traders are loaded (triggers events that executor will process)

**Current startup order** (from `server.go:213-259`):
```
1. Event Bus Start
2. Trader Executor Start
3. Candle Scheduler Start
```

**New startup order**:
```
1. Event Bus Start
2. Manager.LoadTradersFromDB()  ← INSERT HERE
3. Trader Executor Start
4. Candle Scheduler Start
```

**Implementation location**: `internal/server/server.go`, `Start()` method around line 220.

---

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Server Startup                                                  │
│                                                                 │
│  1. EventBus.Start()                                            │
│         ↓                                                       │
│  2. Manager.LoadTradersFromDB()                                 │
│         ├─→ Supabase.GetBuiltInTraders()                        │
│         │      └─→ []types.Trader (DB format)                   │
│         ├─→ For each DB trader:                                 │
│         │      ├─→ dbTrader.GetFilter() (parse double-JSON)     │
│         │      ├─→ convertDBTraderToRuntime()                   │
│         │      │      └─→ Create TraderConfig from filter       │
│         │      │      └─→ Create runtime Trader instance        │
│         │      ├─→ Yaegi.ValidateCode() (syntax check)          │
│         │      └─→ Registry.Register(trader)                    │
│         │             └─→ Update metrics, store in sync.Map     │
│         └─→ Log: "Loaded N traders (M failed)"                  │
│         ↓                                                       │
│  3. Executor.Start()                                            │
│         └─→ Subscribe to candle events                          │
│         ↓                                                       │
│  4. Scheduler.Start()                                           │
│         └─→ Publish candle events to EventBus                   │
│                                                                 │
│ ════════════════════════════════════════════════════════════════│
│                                                                 │
│ Runtime (User starts trader via API)                            │
│                                                                 │
│  API: POST /api/v1/traders/:id/start                            │
│         ↓                                                       │
│  Manager.Start(traderID)                                        │
│         ├─→ Registry.Get(traderID) ✅ (trader is loaded)        │
│         ├─→ Check quotas                                        │
│         ├─→ Executor.AddTrader()                                │
│         │      └─→ Yaegi.ValidateCode() (validate before run)   │
│         └─→ Trader state: Stopped → Starting → Running          │
│                                                                 │
│ ════════════════════════════════════════════════════════════════│
│                                                                 │
│ Signal Generation (Candle event triggers trader)                │
│                                                                 │
│  Scheduler publishes CandleEvent{symbol, interval}              │
│         ↓                                                       │
│  EventBus → Executor.candleEventLoop                            │
│         ↓                                                       │
│  Executor.handleCandleEvent()                                   │
│         ├─→ Find traders matching interval                      │
│         └─→ For each trader:                                    │
│                ├─→ Fetch market data (tickers, klines)          │
│                ├─→ Yaegi.ExecuteFilter(filterCode, marketData)  │
│                ├─→ If match: Create Signal                      │
│                ├─→ Supabase.CreateSignal()                      │
│                └─→ AnalysisEngine.QueueAnalysis()               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Component Changes

#### 1. **Manager struct** (`internal/trader/manager.go`)

**Add Yaegi executor field**:
```go
type Manager struct {
    config   *config.Config
    registry *Registry
    executor *Executor
    supabase *supabase.Client
    quotas   *QuotaManager
    yaegi    *yaegi.Executor  // ← ADD THIS

    // ... rest unchanged
}
```

**Update constructor**:
```go
func NewManager(
    cfg *config.Config,
    executor *Executor,
    supabase *supabase.Client,
    yaegi *yaegi.Executor,  // ← ADD PARAMETER
) *Manager {
    // ... existing code ...
    return &Manager{
        config:   cfg,
        registry: registry,
        executor: executor,
        supabase: supabase,
        quotas:   quotas,
        yaegi:    yaegi,  // ← STORE IT
        // ... rest unchanged
    }
}
```

#### 2. **LoadTradersFromDB() implementation** (`internal/trader/manager.go:235-251`)

Replace stub with full implementation (see pseudocode in Decision #6).

#### 3. **Server startup** (`internal/server/server.go:213-259`)

Insert `LoadTradersFromDB()` call:
```go
func (s *Server) Start() error {
    log.Printf("[Server] Starting server on %s", s.httpServer.Addr)

    // ... Supabase health check ...

    // Start Event Bus
    if err := s.eventBus.Start(); err != nil {
        return fmt.Errorf("failed to start event bus: %w", err)
    }

    // ← INSERT HERE
    // Load traders from database
    if err := s.traderManager.LoadTradersFromDB(); err != nil {
        // Log warning but don't fail server startup
        log.Printf("[Server] Warning: Failed to load traders from DB: %v", err)
    }

    // Start Trader Executor
    if err := s.traderExecutor.Start(); err != nil {
        return fmt.Errorf("failed to start trader executor: %w", err)
    }

    // ... rest unchanged
}
```

#### 4. **Server constructor** (`internal/server/server.go`)

Update `traderManager` creation to pass `yaegi`:
```go
func NewServer(cfg *config.Config, ...) *Server {
    // ... existing code ...

    traderManager := trader.NewManager(
        cfg,
        traderExecutor,
        supabaseClient,
        yaegiExecutor,  // ← ADD THIS ARGUMENT
    )

    // ... rest unchanged
}
```

---

### Metrics and Monitoring

#### New Prometheus Metrics

1. **`traders_loaded_from_db_total`** (Counter)
   - Labels: `status` (success|failed)
   - Tracks how many traders were loaded successfully vs failed

2. **`traders_load_duration_seconds`** (Histogram)
   - Measures how long `LoadTradersFromDB()` takes
   - Helps detect performance issues with large trader counts

#### Existing Metrics (already implemented)

- `registry_size` - Updated automatically when traders are registered
- `traders_total{user_id}` - Incremented for each trader loaded

#### Logging Requirements

**Success path**:
```
[Manager] Loading traders from database
[Manager] Loaded 3 traders from database (0 failed)
```

**Partial failure**:
```
[Manager] Loading traders from database
[Manager] Failed to convert trader abc-123: invalid filter code: syntax error at line 5
[Manager] Failed to register trader def-456: trader already registered
[Manager] Loaded 1 traders from database (2 failed)
```

**Complete failure** (Supabase down):
```
[Manager] Loading traders from database
[Manager] Failed to fetch built-in traders: supabase API error: 503 Service Unavailable
[Manager] Loaded 0 traders from database (0 failed)
```

---

### Migration Considerations

#### First Deployment Checklist

1. **Database verification**: Confirm built-in traders exist in `traders` table
   ```sql
   SELECT id, name, is_built_in, user_id FROM traders WHERE is_built_in = true;
   ```

2. **Filter field validation**: Ensure `filter` field is properly JSON-encoded
   ```go
   // Test GetFilter() works for all built-in traders
   for _, trader := range builtInTraders {
       _, err := trader.GetFilter()
       // Should not error
   }
   ```

3. **Server startup logs**: Watch for `LoadTradersFromDB()` output
   ```
   [Manager] Loading traders from database
   [Manager] Loaded 3 traders from database (0 failed)
   [Server] ✅ Server started successfully
   ```

4. **Metrics check**: Verify `registry_size` metric shows correct count
   ```bash
   curl http://localhost:8080/api/v1/metrics | grep registry_size
   # Should show 3 if 3 built-in traders loaded
   ```

5. **API test**: Confirm traders can be started
   ```bash
   curl -X POST http://localhost:8080/api/v1/traders/:id/start
   # Should succeed with 200 OK
   ```

#### Performance at Scale

**Current**: 3 built-in traders
**Expected growth**: Up to 100 built-in traders in future

**Optimization strategy** (for future):
- If trader count grows large (>1000), add pagination to `GetBuiltInTraders()`
- Consider caching converted traders (database → runtime) to avoid re-parsing
- Add database index on `is_built_in` column for faster queries
- Monitor `traders_load_duration_seconds` metric to detect slowdowns

---

### Testing Strategy

#### Unit Tests

1. **Test `convertDBTraderToRuntime()`**
   - Valid trader with all fields
   - Trader with double-encoded filter
   - Trader with missing required fields
   - Trader with invalid filter code

2. **Test `LoadTradersFromDB()` scenarios**
   - Success: All traders load successfully
   - Partial failure: Some traders fail to load
   - Complete failure: Supabase is down
   - Empty database: No built-in traders found

#### Integration Tests

1. **End-to-end startup test**
   - Start server with test database
   - Verify traders are loaded
   - Verify traders can be started via API
   - Verify signals are generated on candle events

2. **Metrics validation**
   - Check `registry_size` increases after load
   - Check `traders_loaded_from_db_total` counter
   - Check `traders_load_duration_seconds` histogram

---

### Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Invalid filter code in database | Medium | High | Validate code during load, skip bad traders |
| Supabase down at startup | Low | Medium | Log warning but don't fail server startup |
| Double-encoded JSON parsing fails | Low | High | GetFilter() handles both formats, well-tested |
| Empty user_id breaks quota system | High | Medium | Use "system" synthetic ID for built-in traders |
| Memory pressure from loading all traders | Low (3 traders) | Low | Monitor metrics, add pagination if needed |
| Built-in traders auto-start and overwhelm system | Medium | High | Load in Stopped state, require manual start |

---

### Open Questions

1. **Should we add a `trader_state` table for persistence?**
   - Not required for MVP - users can restart traders after deployment
   - Future enhancement for better UX

2. **How to handle built-in trader updates?**
   - Current: Manual database updates
   - Future: Migration scripts to update filter code

3. **Should we support loading user traders on startup?**
   - No for MVP - complicates quota enforcement
   - Consider for future if users request "always-on" traders

---

## Implementation Plan
*Stage: planning | Date: 2025-10-13T18:15:00Z*

### Overview
Implement `LoadTradersFromDB()` to load built-in traders from Supabase into the Manager registry on server startup. This enables traders to be started via API and subscribe to candle events for signal generation. The implementation involves adding Yaegi to Manager, creating converter functions, implementing the loader, and integrating into the startup sequence.

### Prerequisites
- [x] Architecture approved (documented above)
- [x] Supabase client methods working (`GetBuiltInTraders()`)
- [x] `types.Trader.GetFilter()` method implemented
- [x] Yaegi executor available in server
- [ ] Development environment ready (Go 1.21+)
- [ ] Access to test Supabase instance

### Implementation Phases

#### Phase 1: Add Yaegi to Manager (30 minutes)
**Objective:** Extend Manager struct to include Yaegi executor for filter validation

##### Task 1.1: Update Manager struct (10 min)
Files to modify:
- `backend/go-screener/internal/trader/manager.go:17-36`

Actions:
- [x] Add `yaegi *yaegi.Executor` field to Manager struct (line 21 after supabase) <!-- ✅ 2025-10-13 18:30 -->
- [x] Import `github.com/vyx/go-screener/pkg/yaegi` package <!-- ✅ 2025-10-13 18:30 -->

Test criteria:
- Code compiles without errors
- Manager struct includes yaegi field

**Checkpoint:** Manager struct has yaegi field ✅

##### Task 1.2: Update Manager constructor (15 min)
Files to modify:
- `backend/go-screener/internal/trader/manager.go:38-59`

Actions:
- [x] Add `yaegi *yaegi.Executor` parameter to `NewManager()` function signature (line 39) <!-- ✅ 2025-10-13 18:31 -->
- [x] Store yaegi in Manager struct: `yaegi: yaegi,` (around line 52) <!-- ✅ 2025-10-13 18:31 -->
- [x] Update all callers of `NewManager()` (only server.go, next task) <!-- ✅ 2025-10-13 18:32 -->

Test criteria:
- Code compiles without errors
- Constructor accepts yaegi parameter
- Yaegi is stored in Manager

**Checkpoint:** Constructor signature updated ✅

##### Task 1.3: Update server.go to pass Yaegi (5 min)
Files to modify:
- `backend/go-screener/internal/server/server.go:122`

Actions:
- [x] Change line 122 to pass yaegiExec parameter <!-- ✅ 2025-10-13 18:32 -->

Test criteria:
- Code compiles without errors
- Server passes yaegiExecutor to Manager

**Phase 1 Complete When:**
- [x] Manager has yaegi field <!-- ✅ 2025-10-13 18:33 -->
- [x] Constructor updated with yaegi parameter <!-- ✅ 2025-10-13 18:33 -->
- [x] Server passes yaegi to Manager <!-- ✅ 2025-10-13 18:33 -->
- [x] Code compiles: `cd backend/go-screener && go build ./...` <!-- ✅ 2025-10-13 18:33 -->

---

#### Phase 2: Create Converter Functions (45 minutes)
**Objective:** Implement functions to convert database Trader to runtime Trader

##### Task 2.1: Implement convertIndicators helper (15 min)
Files to modify:
- `backend/go-screener/internal/trader/manager.go` (add after line 328, end of file)

Actions:
- [x] Add `convertIndicators()` helper function: <!-- ✅ 2025-10-13 18:35 -->
  ```go
  // convertIndicators converts database indicator configs to runtime configs
  func convertIndicators(dbIndicators []types.IndicatorConfig) []IndicatorConfig {
      if len(dbIndicators) == 0 {
          return []IndicatorConfig{}
      }

      result := make([]IndicatorConfig, len(dbIndicators))
      for i, ind := range dbIndicators {
          result[i] = IndicatorConfig{
              Type:       ind.Name, // Map Name to Type
              Parameters: ind.Params,
          }
      }
      return result
  }
  ```

Test criteria:
- Function compiles
- Handles empty slice
- Maps Name → Type correctly

**Checkpoint:** Helper function compiles

##### Task 2.2: Implement convertDBTraderToRuntime (30 min)
Files to modify:
- `backend/go-screener/internal/trader/manager.go` (add before convertIndicators)

Actions:
- [x] Add `convertDBTraderToRuntime()` function: <!-- ✅ 2025-10-13 18:35 -->
  ```go
  // convertDBTraderToRuntime converts a database Trader to a runtime Trader instance
  func convertDBTraderToRuntime(dbTrader *types.Trader) (*Trader, error) {
      if dbTrader == nil {
          return nil, fmt.Errorf("dbTrader is nil")
      }

      // Parse filter using GetFilter() method (handles double-encoded JSON)
      filter, err := dbTrader.GetFilter()
      if err != nil {
          return nil, fmt.Errorf("failed to parse filter: %w", err)
      }

      // Validate filter has required fields
      if filter.Code == "" {
          return nil, fmt.Errorf("filter code is empty")
      }

      // Create TraderConfig from filter
      config := &TraderConfig{
          FilterCode:        filter.Code,
          ScreeningInterval: 5 * time.Minute, // Default
          Symbols:           []string{},      // Empty = screen all top symbols
          Timeframes:        filter.RequiredTimeframes,
          Indicators:        convertIndicators(filter.Indicators),
          MaxSignalsPerRun:  10,              // Default limit
          TimeoutPerRun:     5 * time.Second, // Default timeout
      }

      // Handle empty user_id for built-in traders
      userID := dbTrader.UserID
      if userID == "" {
          userID = "system" // Synthetic user ID for quota tracking
      }

      // Create runtime Trader using NewTrader constructor
      return NewTrader(
          dbTrader.ID,
          userID,
          dbTrader.Name,
          dbTrader.Description,
          config,
      ), nil
  }
  ```

Test criteria:
- Function compiles
- Handles nil input gracefully
- Parses filter correctly
- Maps fields properly
- Handles empty user_id

**Phase 2 Complete When:**
- [x] Both converter functions implemented <!-- ✅ 2025-10-13 18:36 -->
- [x] Code compiles: `go build ./internal/trader` <!-- ✅ 2025-10-13 18:36 -->
- [x] Functions handle edge cases (nil, empty strings) <!-- ✅ 2025-10-13 18:36 -->

---

#### Phase 3: Implement LoadTradersFromDB (1 hour)
**Objective:** Replace stub with full implementation

##### Task 3.1: Add metrics tracking (15 min)
Files to modify:
- `backend/go-screener/internal/trader/metrics.go:6-24`

Actions:
- [ ] Add new Prometheus counters after existing metrics:
  ```go
  // TradersLoadedFromDB tracks traders loaded from database
  TradersLoadedFromDB = promauto.NewCounterVec(
      prometheus.CounterOpts{
          Name: "traders_loaded_from_db_total",
          Help: "Total number of traders loaded from database",
      },
      []string{"status"}, // success, failed
  )

  // TradersLoadDuration tracks time to load traders
  TradersLoadDuration = promauto.NewHistogram(
      prometheus.HistogramOpts{
          Name:    "traders_load_duration_seconds",
          Help:    "Duration of LoadTradersFromDB operation",
          Buckets: prometheus.DefBuckets,
      },
  )
  ```

Test criteria:
- Metrics compile
- Labels defined correctly

**Checkpoint:** Metrics added

##### Task 3.2: Implement LoadTradersFromDB (45 min)
Files to modify:
- `backend/go-screener/internal/trader/manager.go:235-251`

Actions:
- [ ] Replace stub with full implementation:
  ```go
  // LoadTradersFromDB loads traders from the database and registers them
  // This is called on server startup to restore trader state
  func (m *Manager) LoadTradersFromDB() error {
      startTime := time.Now()
      log.Printf("[Manager] Loading traders from database")

      // Track success/failure counts
      loaded := 0
      failed := 0

      // Fetch built-in traders from Supabase
      builtInTraders, err := m.supabase.GetBuiltInTraders(m.ctx)
      if err != nil {
          log.Printf("[Manager] Failed to fetch built-in traders: %v", err)
          TradersLoadDuration.Observe(time.Since(startTime).Seconds())
          return nil // Don't fail server startup, just log
      }

      log.Printf("[Manager] Found %d built-in traders in database", len(builtInTraders))

      // Convert and register each trader
      for _, dbTrader := range builtInTraders {
          // Convert database model to runtime model
          trader, err := convertDBTraderToRuntime(&dbTrader)
          if err != nil {
              log.Printf("[Manager] Failed to convert trader %s (%s): %v",
                  dbTrader.ID, dbTrader.Name, err)
              failed++
              TradersLoadedFromDB.WithLabelValues("failed").Inc()
              continue // Skip this trader, continue with others
          }

          // Validate filter code syntax (lightweight check)
          if err := m.yaegi.ValidateCode(trader.Config.FilterCode); err != nil {
              log.Printf("[Manager] Skipping trader %s (%s): invalid filter code: %v",
                  trader.ID, trader.Name, err)
              failed++
              TradersLoadedFromDB.WithLabelValues("failed").Inc()
              continue // Skip this trader
          }

          // Register trader in registry
          if err := m.RegisterTrader(trader); err != nil {
              log.Printf("[Manager] Failed to register trader %s (%s): %v",
                  trader.ID, trader.Name, err)
              failed++
              TradersLoadedFromDB.WithLabelValues("failed").Inc()
              continue
          }

          loaded++
          TradersLoadedFromDB.WithLabelValues("success").Inc()
          log.Printf("[Manager] ✅ Loaded trader: %s (%s)", trader.ID, trader.Name)
      }

      // Record load duration
      duration := time.Since(startTime)
      TradersLoadDuration.Observe(duration.Seconds())

      // Log summary
      log.Printf("[Manager] Loaded %d traders from database (%d failed) in %v",
          loaded, failed, duration)

      return nil // Always return success (graceful degradation)
  }
  ```

Test criteria:
- Function compiles
- Fetches traders from Supabase
- Converts each trader
- Validates filter code
- Registers successfully
- Logs appropriately
- Records metrics
- Handles errors gracefully

**Phase 3 Complete When:**
- [ ] LoadTradersFromDB() fully implemented
- [ ] Metrics tracking added
- [ ] Code compiles: `go build ./internal/trader`
- [ ] Logs provide clear feedback

---

#### Phase 4: Integrate into Server Startup (15 minutes)
**Objective:** Call LoadTradersFromDB during server startup sequence

##### Task 4.1: Add LoadTradersFromDB to startup (15 min)
Files to modify:
- `backend/go-screener/internal/server/server.go:226-253`

Actions:
- [ ] Insert LoadTradersFromDB call after Event Bus starts, before Executor starts
- [ ] Modify `Start()` method around line 230:
  ```go
  // Start Event Bus
  if err := s.eventBus.Start(); err != nil {
      return fmt.Errorf("failed to start event bus: %w", err)
  }

  // ← INSERT HERE
  // Load traders from database
  log.Printf("[Server] Loading traders from database...")
  if err := s.traderManager.LoadTradersFromDB(); err != nil {
      // Log warning but don't fail server startup (graceful degradation)
      log.Printf("[Server] ⚠️  Warning: Failed to load traders from DB: %v", err)
  }

  // Start Analysis Engine (if available)
  if s.analysisEngine != nil {
      if err := s.analysisEngine.Start(); err != nil {
          return fmt.Errorf("failed to start analysis engine: %w", err)
      }
  }
  // ... rest unchanged
  ```

Test criteria:
- Code compiles
- LoadTradersFromDB called in correct order
- Server doesn't fail if LoadTradersFromDB has issues
- Logs show loader executing

**Phase 4 Complete When:**
- [ ] LoadTradersFromDB integrated into startup
- [ ] Positioned correctly in startup sequence
- [ ] Code compiles: `cd backend/go-screener && go build`
- [ ] Graceful degradation implemented

---

#### Phase 5: Testing & Validation (1 hour)
**Objective:** Verify implementation works end-to-end

##### Task 5.1: Build and test compilation (10 min)
Actions:
- [ ] Build the project:
  ```bash
  cd backend/go-screener
  go build -o bin/go-screener ./cmd/server
  ```
- [ ] Fix any compilation errors
- [ ] Run static analysis:
  ```bash
  go vet ./...
  gofmt -w .
  ```

Test criteria:
- Build succeeds with no errors
- No vet warnings
- Code is formatted

**Checkpoint:** Clean build

##### Task 5.2: Manual startup test (20 min)
Actions:
- [ ] Start the server:
  ```bash
  ./bin/go-screener
  ```
- [ ] Check startup logs for LoadTradersFromDB output:
  ```
  [Manager] Loading traders from database
  [Manager] Found 3 built-in traders in database
  [Manager] ✅ Loaded trader: <id> (<name>)
  [Manager] ✅ Loaded trader: <id> (<name>)
  [Manager] ✅ Loaded trader: <id> (<name>)
  [Manager] Loaded 3 traders from database (0 failed) in 245ms
  ```
- [ ] Check for errors or warnings
- [ ] Verify server starts successfully

Test criteria:
- Server starts without errors
- Traders are loaded
- Logs show successful load
- No panics or crashes

**Checkpoint:** Server starts with traders loaded

##### Task 5.3: Verify registry state (15 min)
Actions:
- [ ] Check metrics endpoint:
  ```bash
  curl http://localhost:8080/metrics | grep registry_size
  # Should show: registry_size 3

  curl http://localhost:8080/metrics | grep traders_loaded_from_db_total
  # Should show: traders_loaded_from_db_total{status="success"} 3
  ```
- [ ] Check manager metrics API:
  ```bash
  curl http://localhost:8080/api/v1/traders/metrics
  # Should show registry with 3 traders
  ```

Test criteria:
- `registry_size` metric shows correct count
- `traders_loaded_from_db_total` shows successes
- Metrics API returns trader data

**Checkpoint:** Metrics confirm traders loaded

##### Task 5.4: Test trader start API (15 min)
Actions:
- [ ] Get list of traders:
  ```bash
  curl http://localhost:8080/api/v1/traders | jq
  ```
- [ ] Copy a trader ID from response
- [ ] Attempt to start trader (requires auth, may need to mock or create token):
  ```bash
  curl -X POST http://localhost:8080/api/v1/traders/<TRADER_ID>/start \
    -H "Authorization: Bearer <TOKEN>"
  ```
- [ ] Check response (should be 200 OK, not 404)
- [ ] Verify trader transitions from Stopped → Starting → Running

Test criteria:
- GET /traders returns loaded traders
- POST /traders/:id/start finds trader (not 404)
- Trader successfully starts
- State transitions correctly

**Phase 5 Complete When:**
- [ ] Clean build with no errors
- [ ] Server starts successfully
- [ ] Traders loaded from database
- [ ] Metrics show correct counts
- [ ] Traders can be started via API
- [ ] No runtime errors or panics

---

### Testing Strategy

#### Commands to Run After Each Phase
```bash
# After Phase 1-4 (compilation check)
cd backend/go-screener
go build ./...
go vet ./...

# After Phase 5 (full test)
go build -o bin/go-screener ./cmd/server
./bin/go-screener
```

#### Manual Testing Checklist
- [ ] Server starts without errors
- [ ] LoadTradersFromDB logs appear
- [ ] Built-in traders are loaded (check count)
- [ ] `registry_size` metric shows correct count
- [ ] `traders_loaded_from_db_total` metric increments
- [ ] Traders appear in GET /api/v1/traders
- [ ] Traders can be started via POST /api/v1/traders/:id/start
- [ ] Invalid filter code is skipped (test with bad trader if possible)
- [ ] Empty database case doesn't crash server

#### Edge Cases to Test
1. **Empty database**: No built-in traders
   - Expected: Logs "Found 0 built-in traders", server continues

2. **Invalid filter code**: Trader has syntax error in filter
   - Expected: Trader skipped, logged, others load successfully

3. **Supabase down**: Database unavailable
   - Expected: Error logged, server continues, 0 traders loaded

4. **Duplicate trader ID**: Attempt to register same trader twice
   - Expected: Second registration fails, logged, continues

### Rollback Plan
If critical issues arise:
1. **Revert commits**:
   ```bash
   git log --oneline  # Find commit before changes
   git revert <commit-hash>
   ```
2. **Quick fix**: Comment out LoadTradersFromDB call in server.go
3. **Deploy previous version**: Use previous Docker image
4. **Document issues**: Add findings to issue file

### Success Metrics
Implementation is complete when:
- [ ] All 5 phases completed with checkboxes checked
- [ ] Code compiles with 0 errors
- [ ] Server starts successfully
- [ ] 3 built-in traders loaded from database
- [ ] `registry_size` metric = 3
- [ ] `traders_loaded_from_db_total{status="success"}` = 3
- [ ] Traders can be started via API (not 404)
- [ ] No runtime errors in logs
- [ ] Graceful degradation works (tested with Supabase down)

### Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Manager constructor breaks existing code | Only one caller (server.go), easy to fix | ⏳ |
| 2 | Converter fails on double-encoded JSON | GetFilter() already handles this, tested | ⏳ |
| 3 | Invalid filter code crashes server | Validate before register, skip bad traders | ⏳ |
| 4 | LoadTradersFromDB blocks startup | Uses timeout, returns quickly even on error | ⏳ |
| 5 | Traders don't actually work after loading | Test start API to verify full lifecycle | ⏳ |

### Time Estimates
- Phase 1: 30 minutes (Manager + Yaegi integration)
- Phase 2: 45 minutes (Converter functions)
- Phase 3: 1 hour (LoadTradersFromDB implementation)
- Phase 4: 15 minutes (Server startup integration)
- Phase 5: 1 hour (Testing & validation)
- **Total: 3.5 hours**

### Next Actions
1. Begin Phase 1, Task 1.1 (Add Yaegi to Manager struct)
2. Work through phases sequentially
3. Test after each phase
4. Document any issues encountered

---

*Ready for implementation. Next: /implement issues/2025-10-13-backend-load-traders-from-db.md*
