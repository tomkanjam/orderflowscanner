# Historical Candle Scanning for New Traders

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-24 09:29:00

## Context

When users create a new trader, they currently have to wait for the next interval boundary (1m, 5m, 15m, etc.) before seeing any signals. This creates a poor UX where:
- New traders appear "inactive" until first signal
- Users can't validate their filter logic immediately
- No historical context for what signals would have been generated

The previous browser-based signal engine supported scanning historical candles to show users what signals would have been generated in the past. The UI components for this still exist in the codebase, but the functionality was lost during the Golang backend migration.

**User Value:**
- **Immediate feedback** - See signals within seconds of creating trader
- **Filter validation** - Verify filter logic works as expected on recent market data
- **Historical context** - Understand signal frequency and quality before committing
- **Confidence building** - New users see immediate results rather than empty tables

## Linked Items
- Part of: End-to-end trader workflow implementation initiative
- Related: Golang backend migration (completed)

## Progress
Starting deep investigation and spec phase.

## Current State

### What Exists:

**Frontend UI Components (Functional):**
- `apps/app/src/components/TraderSignalsTable.tsx:21-35` - Displays both live and historical signals with visual separation
- `apps/app/components/ChartDisplay.tsx:450-520` - Renders signal markers on historical candles
- `apps/app/src/components/SignalHistorySidebar.tsx` - Shows signal timeline and context

**Frontend Hooks (Broken - Stubs):**
- `apps/app/hooks/useHistoricalScanner.ts` - Hook for single trader historical scanning
  - Uses Web Worker for non-blocking execution
  - Implements deduplication logic (10-200 bar threshold)
  - Supports configurable lookback (20-1500 bars)
  - **Problem**: Worker implementation is a stub
- `apps/app/hooks/useMultiTraderHistoricalScanner.ts` - Multi-trader scanning hook
  - Scans all enabled traders against historical data
  - Progress reporting and cancellation support
  - **Problem**: Worker implementation is a stub

**Frontend Workers (Broken - Stubs):**
- `apps/app/workers/historicalScannerWorker.ts` - **STUB** - Lost during migration
- `apps/app/workers/multiTraderHistoricalScannerWorker.ts` - **STUB** - Lost during migration

**Golang Backend (No Historical Scanning):**
- `backend/go-screener/internal/trader/executor.go:165-285` - Event-driven filter execution
  - Executes filters only on new candles (candle close events)
  - Has access to kline cache with up to 500 historical candles per symbol/interval
  - No endpoint or function for historical scanning
- `backend/go-screener/pkg/cache/klines.go` - Kline cache system
  - Stores 500+ candles per symbol/interval in memory
  - Cache populated from Binance REST API on bootstrap
  - Updated real-time via WebSocket
- `backend/go-screener/pkg/yaegi/executor.go` - Go code interpreter for filter execution
  - Can execute trader filter code with 1-second timeout
  - Used for validation and live signal generation

**Database:**
- `signals` table exists but has no `is_historical` flag or equivalent
- No separate `historical_signals` table
- Frontend expects `HistoricalSignal` interface:
  ```typescript
  interface HistoricalSignal {
    id: string;
    symbol: string;
    barIndex: number;        // Index in kline array
    klineTimestamp: number;  // Candle open time
    isHistorical: true;      // Type discriminator
    barsAgo?: number;        // Distance from current bar
    price: number;
    volume: number;
    indicators?: {...};      // Optional indicator snapshot
  }
  ```

### What's Missing:

1. **Backend historical scan capability** - No function to execute filter against past candles
2. **Database schema** - No storage for historical signals
3. **API endpoint** - No way for frontend to request or trigger historical scan
4. **Worker implementation** - Stub workers can't execute Go filter code in browser
5. **Trader lifecycle integration** - No automatic scan on trader creation/enable

## Design Options Analysis

### Option 1: Backend Synchronous Scan on Trader Creation ⭐ **RECOMMENDED**

**Flow:**
1. User creates/enables trader
2. Backend transitions trader to `StateStarting`
3. **NEW**: Execute `ScanHistoricalCandles(trader, 100)` before `StateRunning`
4. Store results in database with `is_historical=true`
5. Transition to `StateRunning`
6. Frontend fetches and displays historical + live signals together

**Implementation:**
```go
// In backend/go-screener/internal/trader/manager.go

func (m *Manager) Start(traderID string, userTier ...string) error {
    // ... existing quota and validation logic ...

    // Transition to starting
    trader.TransitionTo(StateStarting)

    // NEW: Scan historical candles before going live
    if m.config.HistoricalScanEnabled {
        log.Printf("[Trader %s] Scanning last %d candles...", traderID, m.config.HistoricalScanBars)
        if err := m.scanHistoricalCandles(trader, m.config.HistoricalScanBars); err != nil {
            log.Printf("[Trader %s] Historical scan failed: %v (continuing anyway)", traderID, err)
            // Don't fail trader start if scan fails - it's a bonus feature
        }
    }

    // Continue with normal startup
    m.executor.Add(trader)
    trader.TransitionTo(StateRunning)
    return nil
}

func (m *Manager) scanHistoricalCandles(trader *Trader, lookbackBars int) error {
    // 1. Get symbols from trader config or top 100
    // 2. Fetch last N candles from cache for trader's interval
    // 3. Execute filter for each candle (oldest to newest)
    // 4. Collect matches
    // 5. Batch insert to database with is_historical=true
    // 6. Return error if critical failure (don't block trader start)
}
```

**Pros:**
- ✅ Centralized in backend (single source of truth)
- ✅ Reuses existing filter execution infrastructure (Yaegi)
- ✅ Leverages kline cache (no API calls)
- ✅ Results persisted in database
- ✅ Consistent with event-driven architecture
- ✅ 100 candles × filter execution = ~200-500ms (fast enough)
- ✅ No browser performance impact

**Cons:**
- ⚠️ Adds ~0.5-2 seconds to trader startup time
- ⚠️ Need database migration for `is_historical` column
- ⚠️ Complexity in deduplication if scan re-runs

**Estimated Effort:** 1-2 days (backend + database + frontend integration)

---

### Option 2: Frontend Worker Scan (Fix Stubs)

**Flow:**
1. User creates trader
2. Frontend initiates Web Worker
3. Worker fetches last 100 candles from `/api/v1/klines/{symbol}/{interval}`
4. Worker executes filter code in browser (convert Go → JS or use WASM)
5. Display results ephemerally (not stored)

**Pros:**
- ✅ No backend changes needed
- ✅ Immediate results in UI
- ✅ No database storage required

**Cons:**
- ❌ Filter code is now Go, not JavaScript (can't execute in browser)
- ❌ Would need Go → JS transpilation or WASM compiler
- ❌ Different execution environment = potential inconsistencies
- ❌ Browser performance impact
- ❌ Results not persisted (lost on refresh)
- ❌ Duplicates filter execution logic across backend/frontend

**Estimated Effort:** 3-5 days (complex, high risk)

---

### Option 3: Backend On-Demand API Endpoint

**Flow:**
1. User creates trader (normal startup)
2. Frontend calls new endpoint: `POST /api/v1/traders/{id}/scan-historical`
3. Backend executes scan synchronously, returns results (no storage)
4. Frontend displays results ephemerally

**Pros:**
- ✅ On-demand (no automatic overhead)
- ✅ Reuses backend filter execution
- ✅ User controls when to scan

**Cons:**
- ⚠️ API latency (500ms-2s roundtrip)
- ❌ Results not persisted
- ⚠️ Need to re-scan after navigation
- ⚠️ Requires extra user action (worse UX than auto-scan)

**Estimated Effort:** 1 day (simpler than Option 1)

---

### Option 4: Async Job Queue

**Flow:**
1. User creates trader
2. Enqueue background job for historical scan
3. Worker processes job asynchronously
4. Store results in database
5. Frontend polls or uses realtime subscription for results

**Pros:**
- ✅ Non-blocking trader creation
- ✅ Scalable with job queue
- ✅ Can scan deeper history (500+ candles) without timeout

**Cons:**
- ❌ Most complex implementation
- ❌ Need job queue infrastructure (Redis, etc.)
- ❌ Delayed results (could be 5-30 seconds)
- ❌ Over-engineered for 100-candle scans

**Estimated Effort:** 3-4 days (overkill)

---

## Recommended Approach: Option 1 (Backend Synchronous Scan)

**Rationale:**
- 100 candles is small enough for synchronous execution
- Backend already has all infrastructure (cache, executor, database)
- Best UX - results appear immediately with trader
- Persistent results survive page refresh
- Reuses proven filter execution logic

**Trade-off:** Adds ~0.5-2 seconds to trader startup, but this is acceptable for the value provided.

## Spec

### 1. Backend Implementation

#### 1.1 Configuration

Add to `backend/go-screener/pkg/config/config.go`:

```go
type Config struct {
    // ... existing fields ...

    // Historical scanning
    HistoricalScanEnabled bool `env:"HISTORICAL_SCAN_ENABLED" envDefault:"true"`
    HistoricalScanBars    int  `env:"HISTORICAL_SCAN_BARS" envDefault:"100"`
    HistoricalScanMaxBars int  `env:"HISTORICAL_SCAN_MAX_BARS" envDefault:"500"`
}
```

Environment variables:
- `HISTORICAL_SCAN_ENABLED=true` - Global feature flag
- `HISTORICAL_SCAN_BARS=100` - Default lookback
- `HISTORICAL_SCAN_MAX_BARS=500` - Safety limit

#### 1.2 Manager Integration

File: `backend/go-screener/internal/trader/manager.go`

**Modify `Start()` method:**

```go
func (m *Manager) Start(traderID string, userTier ...string) error {
    // ... existing validation ...

    trader.TransitionTo(StateStarting)

    // Historical scan (NEW)
    if m.config.HistoricalScanEnabled {
        lookback := m.config.HistoricalScanBars
        log.Printf("[Trader %s] Scanning last %d candles for interval %s",
            traderID, lookback, trader.Config.Interval)

        startTime := time.Now()
        signalCount, err := m.scanHistoricalCandles(trader, lookback)
        elapsed := time.Since(startTime)

        if err != nil {
            log.Printf("[Trader %s] Historical scan failed after %v: %v",
                traderID, elapsed, err)
            // Continue anyway - historical scan is optional
        } else {
            log.Printf("[Trader %s] Historical scan complete: %d signals in %v",
                traderID, signalCount, elapsed)
        }
    }

    // Continue normal startup
    m.executor.Add(trader)
    trader.TransitionTo(StateRunning)
    return nil
}
```

**Add new method `scanHistoricalCandles()`:**

```go
func (m *Manager) scanHistoricalCandles(trader *Trader, lookbackBars int) (int, error) {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    // Validate lookback
    if lookbackBars > m.config.HistoricalScanMaxBars {
        lookbackBars = m.config.HistoricalScanMaxBars
    }
    if lookbackBars <= 0 {
        return 0, nil
    }

    // Get symbols to scan
    symbols := trader.Config.Symbols
    if len(symbols) == 0 {
        // Default to top 100 symbols
        var err error
        symbols, err = m.executor.binanceClient.GetTopSymbols(ctx, 100, 100000.0)
        if err != nil {
            return 0, fmt.Errorf("failed to get symbols: %w", err)
        }
    }

    interval := trader.Config.Interval
    historicalSignals := []types.Signal{}

    // Process each symbol
    for _, symbol := range symbols {
        // Fetch klines from cache
        klines, err := m.executor.klineCache.Get(symbol, interval, lookbackBars)
        if err != nil {
            log.Printf("[Historical Scan] Failed to get klines for %s: %v", symbol, err)
            continue
        }

        if len(klines) == 0 {
            continue
        }

        // Get current ticker for reference (use cached or fetch)
        ticker, err := m.executor.tickerCache.Get(symbol)
        if err != nil {
            log.Printf("[Historical Scan] Failed to get ticker for %s: %v", symbol, err)
            continue
        }

        // Iterate through historical candles (oldest to newest)
        for barIndex, kline := range klines {
            // Build market data for this specific candle
            marketData := &types.MarketData{
                Symbol: symbol,
                Ticker: types.TickerData{
                    LastPrice:          kline.Close, // Use candle close as price
                    PriceChangePercent: 0,            // Calculate if needed
                    QuoteVolume:        kline.QuoteAssetVolume,
                },
                Klines: map[string][]types.Kline{
                    interval: klines[:barIndex+1], // Only candles up to this point
                },
            }

            // Execute filter with timeout
            matches, err := m.yaegi.ExecuteFilterWithTimeout(
                trader.Config.FilterCode,
                marketData,
                500*time.Millisecond, // Shorter timeout for historical
            )

            if err != nil {
                log.Printf("[Historical Scan] Filter error for %s at bar %d: %v",
                    symbol, barIndex, err)
                continue
            }

            if matches {
                // Create historical signal
                signal := types.Signal{
                    ID:          generateSignalID(),
                    TraderID:    trader.ID,
                    UserID:      trader.UserID,
                    Symbol:      symbol,
                    TriggeredAt: time.UnixMilli(kline.OpenTime),
                    Price:       kline.Close,
                    Volume:      kline.QuoteAssetVolume,
                    IsHistorical: true,  // NEW FLAG
                    BarIndex:    barIndex,
                    Metadata: map[string]interface{}{
                        "barIndex":        barIndex,
                        "klineTimestamp":  kline.OpenTime,
                        "barsAgo":         len(klines) - barIndex - 1,
                    },
                    CreatedAt: time.Now(),
                }

                historicalSignals = append(historicalSignals, signal)
            }
        }
    }

    // Batch insert to database
    if len(historicalSignals) > 0 {
        if err := m.supabase.CreateSignalsBatch(ctx, historicalSignals); err != nil {
            return 0, fmt.Errorf("failed to save historical signals: %w", err)
        }
    }

    return len(historicalSignals), nil
}
```

#### 1.3 Database Schema Changes

**Migration file:** `supabase/migrations/XXX_add_historical_signals.sql`

```sql
-- Add is_historical flag to signals table
ALTER TABLE signals
ADD COLUMN is_historical BOOLEAN NOT NULL DEFAULT false;

-- Add bar_index for historical signals
ALTER TABLE signals
ADD COLUMN bar_index INTEGER;

-- Index for efficient historical signal queries
CREATE INDEX idx_signals_historical ON signals(trader_id, is_historical, triggered_at DESC);

-- Index for signal display ordering
CREATE INDEX idx_signals_triggered_at ON signals(triggered_at DESC)
WHERE is_historical = false;

-- Comments
COMMENT ON COLUMN signals.is_historical IS 'True if signal was generated from historical candle scan, false for live signals';
COMMENT ON COLUMN signals.bar_index IS 'Index of candle in historical kline array (0 = oldest, N = newest). Null for live signals.';
```

**Update types:** `backend/go-screener/pkg/types/types.go`

```go
type Signal struct {
    ID          string                 `json:"id"`
    TraderID    string                 `json:"trader_id"`
    UserID      string                 `json:"user_id"`
    Symbol      string                 `json:"symbol"`
    TriggeredAt time.Time              `json:"triggered_at"`
    Price       float64                `json:"price"`
    Volume      float64                `json:"volume"`
    Metadata    map[string]interface{} `json:"metadata"`
    CreatedAt   time.Time              `json:"created_at"`

    // NEW: Historical signal fields
    IsHistorical bool `json:"is_historical"` // True if from historical scan
    BarIndex     *int `json:"bar_index"`     // Index in kline array (nullable)
}
```

#### 1.4 Supabase Client Update

File: `backend/go-screener/pkg/supabase/client.go`

**Modify `CreateSignalsBatch()`** to handle new fields:

```go
func (c *Client) CreateSignalsBatch(ctx context.Context, signals []types.Signal) error {
    if len(signals) == 0 {
        return nil
    }

    // Convert signals to database format
    rows := make([]map[string]interface{}, len(signals))
    for i, signal := range signals {
        rows[i] = map[string]interface{}{
            "id":            signal.ID,
            "trader_id":     signal.TraderID,
            "user_id":       signal.UserID,
            "symbol":        signal.Symbol,
            "triggered_at":  signal.TriggeredAt,
            "price":         signal.Price,
            "volume":        signal.Volume,
            "metadata":      signal.Metadata,
            "created_at":    signal.CreatedAt,
            "is_historical": signal.IsHistorical, // NEW
            "bar_index":     signal.BarIndex,     // NEW
        }
    }

    // Batch insert
    _, err := c.supabase.From("signals").Insert(rows, false, "", "", "").Execute()
    return err
}
```

### 2. Frontend Integration

#### 2.1 Update Signal Fetching

File: `apps/app/src/hooks/useTraderSignals.ts` (or wherever signals are fetched)

```typescript
// Fetch both historical and live signals
const { data: signals } = useQuery({
  queryKey: ['trader-signals', traderId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('trader_id', traderId)
      .order('triggered_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    // Separate historical and live signals
    const historical = data?.filter(s => s.is_historical) || [];
    const live = data?.filter(s => !s.is_historical) || [];

    return { historical, live, all: data };
  },
});
```

#### 2.2 Update Signal Display

File: `apps/app/src/components/TraderSignalsTable.tsx`

```typescript
// Already has visual separation for historical signals!
// Just need to ensure historical signals are passed in

{historicalSignals.length > 0 && (
  <>
    <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/50">
      📊 Historical Signals (from last {lookbackBars} candles)
    </div>
    {historicalSignals.map(signal => (
      <HistoricalSignalRow
        key={signal.id}
        signal={signal}
        barsAgo={signal.metadata?.barsAgo}
      />
    ))}
  </>
)}
```

#### 2.3 Loading State During Scan

File: `apps/app/src/components/TraderCard.tsx`

```typescript
// Show loading indicator during trader startup
{trader.state === 'starting' && (
  <div className="flex items-center gap-2 text-sm text-muted-foreground">
    <Loader2 className="h-3 w-3 animate-spin" />
    Scanning last 100 candles...
  </div>
)}
```

### 3. Edge Cases & Handling

#### 3.1 Cache Miss Scenario

**Problem:** Cache doesn't have 100 candles for a symbol

**Solution:**
```go
// In scanHistoricalCandles()
klines, err := m.executor.klineCache.Get(symbol, interval, lookbackBars)
if err != nil || len(klines) < 10 {
    // Fallback to REST API if cache insufficient
    klines, err = m.executor.binanceClient.GetKlines(ctx, symbol, interval, lookbackBars)
    if err != nil {
        log.Printf("Failed to fetch klines for %s: %v", symbol, err)
        continue // Skip this symbol
    }
}
```

#### 3.2 Slow Filter Code

**Problem:** User's filter code takes >500ms per candle

**Solution:**
- Per-candle timeout of 500ms (enforced by Yaegi)
- If filter times out, log warning and continue
- Global scan timeout of 10 seconds
- If scan takes >10s total, abort and continue trader startup

#### 3.3 Trader Re-enabled

**Problem:** User disables then re-enables trader - should we re-scan?

**Solution:**
```go
// Option A: Always re-scan (simple)
if m.config.HistoricalScanEnabled {
    m.scanHistoricalCandles(trader, lookback)
}

// Option B: Skip if historical signals already exist (optimal)
existingHistoricalCount, _ := m.supabase.GetHistoricalSignalCount(trader.ID)
if existingHistoricalCount == 0 && m.config.HistoricalScanEnabled {
    m.scanHistoricalCandles(trader, lookback)
}
```

**Recommendation:** Option A (always re-scan) for consistency, unless performance becomes issue

#### 3.4 Filter Code Updated

**Problem:** User edits filter code - historical signals now outdated

**Solution:**
```go
// When filter code is updated, delete old historical signals
func (m *Manager) UpdateTraderFilter(traderID, newFilterCode string) error {
    // Delete historical signals for this trader
    m.supabase.DeleteHistoricalSignals(traderID)

    // Update filter code
    // ... existing logic ...

    // Re-scan if trader is running
    trader, _ := m.registry.Get(traderID)
    if trader.GetState() == StateRunning {
        m.scanHistoricalCandles(trader, m.config.HistoricalScanBars)
    }

    return nil
}
```

#### 3.5 Deduplication

**Problem:** Multiple scans could create duplicate historical signals

**Solution:**
```sql
-- Add unique constraint to prevent duplicates
CREATE UNIQUE INDEX idx_unique_historical_signal
ON signals(trader_id, symbol, triggered_at)
WHERE is_historical = true;

-- Use UPSERT in batch insert
INSERT INTO signals (...) VALUES (...)
ON CONFLICT (trader_id, symbol, triggered_at)
DO NOTHING;
```

### 4. API Endpoint (Optional)

**Endpoint:** `POST /api/v1/traders/{id}/scan-historical`

**Purpose:** Allow manual triggering of historical scan (admin tool)

```go
// In backend/go-screener/internal/server/server.go
func (s *Server) handleScanHistorical(w http.ResponseWriter, r *http.Request) {
    traderID := chi.URLParam(r, "id")

    // Parse request
    var req struct {
        LookbackBars int `json:"lookback_bars"`
    }
    json.NewDecoder(r.Body).Decode(&req)

    if req.LookbackBars == 0 {
        req.LookbackBars = 100
    }

    // Get trader
    trader, exists := s.manager.registry.Get(traderID)
    if !exists {
        http.Error(w, "Trader not found", http.StatusNotFound)
        return
    }

    // Execute scan
    signalCount, err := s.manager.scanHistoricalCandles(trader, req.LookbackBars)
    if err != nil {
        http.Error(w, err.Error(), http.StatusInternalServerError)
        return
    }

    // Return results
    json.NewEncoder(w).Encode(map[string]interface{}{
        "success":      true,
        "signal_count": signalCount,
        "lookback_bars": req.LookbackBars,
    })
}
```

### 5. Testing Strategy

#### 5.1 Unit Tests

**File:** `backend/go-screener/internal/trader/manager_test.go`

```go
func TestScanHistoricalCandles(t *testing.T) {
    // Test cases:
    // 1. Normal scan with 100 candles
    // 2. Cache miss fallback to REST API
    // 3. Filter timeout handling
    // 4. Empty kline data
    // 5. Multiple symbols
    // 6. Deduplication
}

func TestHistoricalScanIntegration(t *testing.T) {
    // Integration test:
    // 1. Create trader
    // 2. Start trader (should auto-scan)
    // 3. Verify signals in database
    // 4. Verify is_historical flag
    // 5. Verify bar_index values
}
```

#### 5.2 Browser Testing

**Test Scenarios:**
1. Create new trader → verify historical signals appear in table
2. Verify chart displays historical signal markers
3. Verify signal sidebar shows historical context
4. Verify loading indicator during scan
5. Verify error handling if scan fails
6. Test with empty cache (no signals expected)
7. Test filter code timeout (should not block trader start)

#### 5.3 Performance Testing

**Metrics to measure:**
- Scan duration for 100 candles × 100 symbols
- Database insert time for batch signals
- Memory usage during scan
- Trader startup delay (should be <2 seconds)

**Target Performance:**
- 100 candles × 100 symbols × simple filter = ~500ms
- 100 candles × 100 symbols × complex filter = ~2s
- Database batch insert of 1000 signals = ~200ms

### 6. Configuration & Rollout

#### 6.1 Feature Flag

```bash
# Fly.io secrets
fly secrets set HISTORICAL_SCAN_ENABLED=true
fly secrets set HISTORICAL_SCAN_BARS=100
```

#### 6.2 Gradual Rollout

**Phase 1:** Enable for Elite tier only
- Lower risk (fewer users)
- Collect performance metrics
- Gather user feedback

**Phase 2:** Enable for Pro tier
- Monitor database growth
- Ensure no performance degradation

**Phase 3:** Enable for all tiers
- Full rollout after validation

### 7. Monitoring & Observability

**Prometheus Metrics:**
```go
// Add to backend/go-screener/internal/trader/metrics.go
var (
    historicalScanDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "trader_historical_scan_duration_seconds",
            Help: "Duration of historical candle scans",
        },
        []string{"trader_id", "interval"},
    )

    historicalSignalsCreated = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "trader_historical_signals_created_total",
            Help: "Total historical signals created",
        },
        []string{"trader_id"},
    )
)
```

**Logging:**
```go
log.Printf("[Historical Scan] Trader %s: %d signals found in %v",
    traderID, signalCount, elapsed)
```

### 8. Documentation

**User-facing:**
- Add tooltip in UI: "Historical signals show where your filter would have triggered in the last 100 candles"
- Add FAQ: "Why do I see historical signals?" → Explain feature

**Developer-facing:**
- Update architecture docs with historical scan flow diagram
- Add comments in code explaining deduplication strategy
- Document database schema changes

## Completion Criteria

- [ ] Backend can scan historical candles on trader start
- [ ] Historical signals stored in database with `is_historical=true`
- [ ] Frontend displays historical signals in table with visual distinction
- [ ] Chart displays historical signal markers
- [ ] Historical scan completes in <2 seconds for typical trader
- [ ] Database migration deployed successfully
- [ ] Unit tests passing
- [ ] Browser testing complete
- [ ] Performance metrics within targets
- [ ] Documentation updated
- [ ] Feature flag deployed to production
- [ ] Monitoring dashboards show scan metrics
- [ ] No degradation in trader startup reliability

## Next Steps

1. **Review & Approve** this spec
2. **Create sub-issues** for:
   - Database migration
   - Backend implementation
   - Frontend integration
   - Testing
3. **Estimate** timeline (recommended: 2-3 days)
4. **Begin implementation** with database migration first
