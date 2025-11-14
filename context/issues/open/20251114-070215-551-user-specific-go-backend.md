# Configure Go Backend to Filter by User

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-14 07:02:15

## Context

Modify Go screener backend to run in "user-dedicated mode" where it only loads and executes traders belonging to a specific user. Built-in traders should NOT run on user-dedicated instances.

## Linked Items

- Part of: `context/issues/open/20251114-070215-547-PROJECT-dedicated-fly-app-per-user.md`

## Progress

Spec phase.

## Spec

### Environment Variable

Add new environment variable to distinguish run modes:

```bash
# Shared backend (current vyx-app) - runs built-in traders only
RUN_MODE=shared_backend
USER_ID=

# User-dedicated app - runs only that user's traders
RUN_MODE=user_dedicated
USER_ID=<uuid>
```

### Code Changes

**File:** `backend/go-screener/internal/trader/registry.go`

Modify `LoadTradersFromDB()` to filter by user:

```go
func (r *Registry) LoadTradersFromDB(ctx context.Context) error {
    runMode := os.Getenv("RUN_MODE")
    userID := os.Getenv("USER_ID")

    var query string
    var args []interface{}

    if runMode == "user_dedicated" {
        if userID == "" {
            return fmt.Errorf("USER_ID required for user_dedicated mode")
        }
        // Load only this user's traders (exclude built-in)
        query = `
            SELECT id, user_id, name, description, interval, filter,
                   ownership_type, is_built_in, created_at, updated_at
            FROM traders
            WHERE user_id = $1
              AND is_built_in = false
              AND deleted_at IS NULL
        `
        args = []interface{}{userID}
        log.Printf("Loading traders for user: %s (user_dedicated mode)", userID)
    } else {
        // Shared backend mode - load only built-in traders
        query = `
            SELECT id, user_id, name, description, interval, filter,
                   ownership_type, is_built_in, created_at, updated_at
            FROM traders
            WHERE is_built_in = true
              AND deleted_at IS NULL
        `
        log.Printf("Loading built-in traders (shared_backend mode)")
    }

    rows, err := r.db.Query(ctx, query, args...)
    if err != nil {
        return fmt.Errorf("failed to query traders: %w", err)
    }
    defer rows.Close()

    // Rest of loading logic remains same...
    for rows.Next() {
        var trader Trader
        err := rows.Scan(
            &trader.ID,
            &trader.UserID,
            &trader.Name,
            &trader.Description,
            &trader.Interval,
            &trader.Filter,
            &trader.OwnershipType,
            &trader.IsBuiltIn,
            &trader.CreatedAt,
            &trader.UpdatedAt,
        )
        if err != nil {
            log.Printf("Failed to scan trader: %v", err)
            continue
        }

        // Validate and add to registry
        if err := r.AddTrader(ctx, &trader); err != nil {
            log.Printf("Failed to add trader %s: %v", trader.ID, err)
            continue
        }
    }

    log.Printf("Loaded %d traders in %s mode", len(r.traders), runMode)
    return nil
}
```

**File:** `backend/go-screener/cmd/server/main.go`

Add startup logging:

```go
func main() {
    runMode := os.Getenv("RUN_MODE")
    if runMode == "" {
        runMode = "shared_backend" // Default to shared mode
    }

    log.Printf("Starting server in %s mode", runMode)

    if runMode == "user_dedicated" {
        userID := os.Getenv("USER_ID")
        if userID == "" {
            log.Fatal("USER_ID required for user_dedicated mode")
        }
        log.Printf("Running dedicated instance for user: %s", userID)
    }

    // Rest of main() remains same...
}
```

### Trader Polling

Update polling logic to maintain user filter:

**File:** `backend/go-screener/internal/trader/registry.go`

```go
func (r *Registry) startPolling(ctx context.Context) {
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
            // Reload traders from DB (respects RUN_MODE filter)
            if err := r.LoadTradersFromDB(ctx); err != nil {
                log.Printf("Failed to reload traders: %v", err)
            }
        }
    }
}
```

### Signal Storage

No changes needed - signals already include `user_id` field. User-dedicated instances will naturally create signals with their user's ID.

### Health Reporting

Add health endpoint that reports user info:

**File:** `backend/go-screener/internal/server/handlers.go`

```go
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
    runMode := os.Getenv("RUN_MODE")
    userID := os.Getenv("USER_ID")

    traderCount := len(s.traderRegistry.GetAllTraders())

    response := map[string]interface{}{
        "status":       "healthy",
        "run_mode":     runMode,
        "user_id":      userID,
        "trader_count": traderCount,
        "timestamp":    time.Now().UTC(),
    }

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(response)
}
```

### Testing

**Test 1: Shared Backend Mode (Built-in traders only)**
```bash
export RUN_MODE=shared_backend
export USER_ID=
go run cmd/server/main.go
# Should load only built-in traders
```

**Test 2: User-Dedicated Mode (User traders only)**
```bash
export RUN_MODE=user_dedicated
export USER_ID=550e8400-e29b-41d4-a716-446655440000
go run cmd/server/main.go
# Should load only traders for that user, excluding built-in
```

**Verify Queries:**
```sql
-- Shared mode query
SELECT COUNT(*) FROM traders WHERE is_built_in = true AND deleted_at IS NULL;

-- User-dedicated mode query
SELECT COUNT(*) FROM traders
WHERE user_id = '<user-id>'
  AND is_built_in = false
  AND deleted_at IS NULL;
```

### Backward Compatibility

If `RUN_MODE` is not set, default to `shared_backend` mode to maintain current behavior. Existing `vyx-app` deployment will continue to work without changes.
