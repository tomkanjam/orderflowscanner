# Make pollForChanges Respect RUN_MODE

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-17 16:23:36

## Context

The `pollForChanges()` method in trader manager bypasses RUN_MODE logic by calling `GetAllTraders()`, which loads ALL enabled traders regardless of whether the app should run them. This causes the shared backend to incorrectly execute user traders.

**Evidence:**
- `backend/go-screener/internal/trader/manager.go:482` - calls `GetAllTraders()`
- `LoadTradersFromDB()` correctly respects RUN_MODE (lines 268-328)
- User trader "StochRSI Overbought Short" running on shared backend
- All signals have `fly_app_id: null`, `source: "cloud"` (from shared backend)

**Impact:** Shared backend processes user traders it shouldn't, defeating the purpose of dedicated Fly apps.

## Linked Items
- Part of: `context/issues/open/20251117-162336-001-PROJECT-fix-user-trader-execution-architecture.md`
- Related: End-to-end trader workflow implementation

## Progress

Ready to implement.

## Spec

### Current Bug

**File:** `backend/go-screener/internal/trader/manager.go`

**Lines 479-558:** `pollForChanges()` method
```go
func (m *Manager) pollForChanges() {
    // BUG: Loads ALL traders, ignoring RUN_MODE!
    allTraders, err := m.supabase.GetAllTraders(m.ctx)
    if err != nil {
        log.Printf("[Manager] Poll error: %v", err)
        return
    }
    // ... rest of polling logic
}
```

**Lines 268-328:** `LoadTradersFromDB()` correctly respects RUN_MODE
```go
runMode := os.Getenv("RUN_MODE")
if runMode == "" {
    runMode = "shared_backend"
}

if runMode == "user_dedicated" {
    allTraders, err = m.supabase.GetTraders(m.ctx, userID)
    // Filter out built-in traders
} else {
    allTraders, err = m.supabase.GetBuiltInTraders(m.ctx)
}
```

### Target Solution

Apply the same RUN_MODE logic in `pollForChanges()`:

```go
func (m *Manager) pollForChanges() {
    runMode := os.Getenv("RUN_MODE")
    if runMode == "" {
        runMode = "shared_backend"
    }

    var allTraders []types.Trader
    var err error

    if runMode == "user_dedicated" {
        // User-dedicated mode: Load only this user's traders
        userID := os.Getenv("USER_ID")
        if userID == "" {
            log.Printf("[Manager] ERROR: USER_ID required for user_dedicated mode")
            return
        }

        allTraders, err = m.supabase.GetTraders(m.ctx, userID)
        if err != nil {
            log.Printf("[Manager] Poll error: %v", err)
            return
        }

        // Filter out built-in traders
        var userTraders []types.Trader
        for _, trader := range allTraders {
            if !trader.IsBuiltIn && trader.Enabled {
                userTraders = append(userTraders, trader)
            }
        }
        allTraders = userTraders
    } else {
        // Shared backend mode: Load only built-in traders
        allTraders, err = m.supabase.GetBuiltInTraders(m.ctx)
        if err != nil {
            log.Printf("[Manager] Poll error: %v", err)
            return
        }
    }

    // Rest of polling logic (detect additions/removals)...
}
```

### Additional Enhancement: Check Enabled Status

Also add logic to remove disabled traders during polling:

```go
// After fetching traders, also check if existing traders became disabled
for traderID := range m.executor.GetLoadedTraders() {
    stillEnabled := false
    for _, t := range allTraders {
        if t.ID == traderID && t.Enabled {
            stillEnabled = true
            break
        }
    }

    if !stillEnabled {
        log.Printf("[Manager] Removing disabled trader: %s", traderID)
        m.executor.RemoveTrader(traderID)
    }
}
```

### Implementation Steps

1. Extract RUN_MODE logic into a helper method to avoid duplication
2. Update `pollForChanges()` to use the helper
3. Add disabled trader detection
4. Add comprehensive logging for poll operations
5. Test with both shared_backend and user_dedicated modes
6. Deploy to vyx-app (shared backend)
7. Deploy to vyx-user-35682909 (dedicated app)
8. Verify correct behavior via logs and database

### Success Criteria

- [ ] `pollForChanges()` respects RUN_MODE
- [ ] Shared backend only polls built-in traders
- [ ] Dedicated apps only poll user traders
- [ ] Disabled traders removed from memory immediately
- [ ] Logs clearly show which mode and which traders are being polled
- [ ] No user trader signals from shared backend

## Completion
**Closed:** 2025-11-18 10:32:00
**Outcome:** Success  
**Commits:** 4027253, 0856457, 9c0c202

**Resolution:**
Fixed pollForChanges() to respect RUN_MODE by applying the same logic used in LoadTradersFromDB(). Shared backend now only polls built-in traders, dedicated apps only poll user traders. Disabled trader filtering added during polling.
