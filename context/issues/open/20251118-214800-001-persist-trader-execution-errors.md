# Persist Trader Execution Errors to Database

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-18 21:48:00

## Context

Currently trader execution errors are only stored in memory (backend/go-screener/internal/trader/types.go:72). When the Go process restarts or trader is reloaded, error history is lost. Users have no visibility into past failures.

## Linked Items

- Part of: `context/issues/open/20251118-214800-000-PROJECT-trader-error-recovery-system.md`

## Progress

Not started.

## Spec

### Database Schema Changes

**Option 1: Add columns to traders table** (simpler, less flexible)
```sql
ALTER TABLE traders ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS last_error_type TEXT;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS error_count INTEGER DEFAULT 0;
ALTER TABLE traders ADD COLUMN IF NOT EXISTS consecutive_errors INTEGER DEFAULT 0;
```

**Option 2: Create separate error history table** (recommended, better audit trail)
```sql
CREATE TABLE trader_execution_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID REFERENCES traders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Error details
  error_type TEXT NOT NULL, -- 'compilation', 'runtime', 'timeout', 'panic'
  error_message TEXT NOT NULL,
  stack_trace TEXT,

  -- Execution context
  trigger_interval TEXT, -- e.g. '5m'
  symbols_processed INTEGER,
  execution_duration_ms INTEGER,

  -- Code that failed
  filter_code_snapshot TEXT, -- snapshot of the code that failed

  -- Recovery attempts
  auto_regeneration_triggered BOOLEAN DEFAULT false,
  regeneration_count INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  -- For tracking repeated errors
  error_hash TEXT -- hash of error message for grouping
);

CREATE INDEX idx_trader_errors_trader ON trader_execution_errors(trader_id);
CREATE INDEX idx_trader_errors_user ON trader_execution_errors(user_id);
CREATE INDEX idx_trader_errors_type ON trader_execution_errors(error_type);
CREATE INDEX idx_trader_errors_unresolved ON trader_execution_errors(trader_id, resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX idx_trader_errors_hash ON trader_execution_errors(error_hash);

-- RLS policies
ALTER TABLE trader_execution_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trader errors" ON trader_execution_errors
  FOR SELECT USING (auth.uid() = user_id);
```

### Go Backend Changes

**Update SetError in backend/go-screener/internal/trader/state.go:**

```go
// SetError transitions to error state, records error, and persists to DB
func (t *Trader) SetError(err error, errorType string, ctx ExecutionContext) error {
    t.mu.Lock()
    t.lastError = err
    t.errorCount++
    traderID := t.ID
    userID := t.UserID
    t.mu.Unlock()

    // Record error metric
    RecordError(traderID, errorType)

    // Persist error to database (async, don't block trader)
    go func() {
        if err := t.persistError(err, errorType, ctx); err != nil {
            log.Printf("[Trader] Failed to persist error for %s: %v", traderID, err)
        }
    }()

    return t.TransitionTo(StateError)
}

// ExecutionContext holds context about the execution that failed
type ExecutionContext struct {
    TriggerInterval     string
    SymbolsProcessed    int
    ExecutionDurationMs int64
    FilterCodeSnapshot  string
}

// persistError saves error to database
func (t *Trader) persistError(err error, errorType string, ctx ExecutionContext) error {
    errorHash := hashError(err.Error())

    errorRecord := &types.TraderExecutionError{
        TraderID:            t.ID,
        UserID:              t.UserID,
        ErrorType:           errorType,
        ErrorMessage:        err.Error(),
        StackTrace:          getStackTrace(err),
        TriggerInterval:     ctx.TriggerInterval,
        SymbolsProcessed:    ctx.SymbolsProcessed,
        ExecutionDurationMs: ctx.ExecutionDurationMs,
        FilterCodeSnapshot:  ctx.FilterCodeSnapshot,
        ErrorHash:           errorHash,
        CreatedAt:           time.Now(),
    }

    return t.supabase.InsertTraderError(context.Background(), errorRecord)
}

// hashError creates a hash for grouping similar errors
func hashError(errMsg string) string {
    // Remove line numbers, timestamps, and variable names to group similar errors
    normalized := regexp.MustCompile(`\d+`).ReplaceAllString(errMsg, "X")
    h := sha256.Sum256([]byte(normalized))
    return hex.EncodeToString(h[:8]) // Use first 8 bytes for short hash
}
```

**Update executor.go error handling:**

```go
// In executeTrader function (executor.go:198-205)
defer func() {
    if r := recover(); r != nil {
        err := fmt.Errorf("panic in trader %s: %v", trader.ID, r)
        log.Printf("[Executor] %v", err)

        ctx := ExecutionContext{
            TriggerInterval:     triggerInterval,
            SymbolsProcessed:    len(symbols),
            ExecutionDurationMs: time.Since(startTime).Milliseconds(),
            FilterCodeSnapshot:  trader.Config.FilterCode,
        }

        _ = trader.SetError(err, "panic", ctx)
    }
}()
```

### Supabase Client Methods

Add to `backend/go-screener/pkg/supabase/client.go`:

```go
// InsertTraderError persists a trader execution error
func (c *Client) InsertTraderError(ctx context.Context, err *types.TraderExecutionError) error {
    endpoint := fmt.Sprintf("%s/rest/v1/trader_execution_errors", c.baseURL)

    body, _ := json.Marshal(err)
    req, _ := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewBuffer(body))
    req.Header.Set("apikey", c.apiKey)
    req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.apiKey))
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("Prefer", "return=minimal")

    resp, err := c.httpClient.Do(req)
    if err != nil {
        return fmt.Errorf("failed to insert trader error: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
        body, _ := io.ReadAll(resp.Body)
        return fmt.Errorf("failed to insert trader error: %s - %s", resp.Status, string(body))
    }

    return nil
}

// GetTraderErrors retrieves error history for a trader
func (c *Client) GetTraderErrors(ctx context.Context, traderID string, limit int) ([]*types.TraderExecutionError, error) {
    // Implementation...
}
```

### Testing Strategy

1. **Unit tests**: Test error hashing, serialization
2. **Integration tests**: Verify DB writes, query performance
3. **Load tests**: 100+ errors/sec for high-frequency traders
4. **Grafana dashboard**: Track error persistence failures

### Metrics to Track

- `trader_error_persist_success_total`
- `trader_error_persist_failures_total`
- `trader_error_persist_duration_seconds`

### Acceptance Criteria

- ✅ Errors persisted to DB within 1 second of occurrence
- ✅ Full stack trace and execution context captured
- ✅ Error history queryable via API
- ✅ No impact on trader execution performance (async writes)
- ✅ Grafana dashboard shows error persistence health
