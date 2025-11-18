# Fix SUPABASE_SERVICE_ROLE_KEY Environment Variable Naming

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-17 16:23:36

## Context

The Go screener code looks for `SUPABASE_SERVICE_KEY` but Fly secrets are set as `SUPABASE_SERVICE_ROLE_KEY`. This mismatch causes 401 Unauthorized errors preventing dedicated Fly apps from authenticating with Supabase.

**Evidence:**
- `backend/go-screener/pkg/config/config.go:51` - looks for `SUPABASE_SERVICE_KEY`
- `supabase/functions/provision-user-fly-app/index.ts:12` - correctly uses `SUPABASE_SERVICE_ROLE_KEY`
- Dedicated app logs: `Poll error: unexpected status 401: {"message":"Invalid API key"}`

**Impact:** User-dedicated Fly apps (vyx-user-35682909) cannot load traders or save signals.

## Linked Items
- Part of: `context/issues/open/20251117-162336-001-PROJECT-fix-user-trader-execution-architecture.md`
- Related: End-to-end trader workflow implementation

## Progress

Ready to implement.

## Spec

### Files to Update

**1. backend/go-screener/pkg/config/config.go**

Lines 51-60: Update environment variable name
```go
// Current (WRONG):
supabaseServiceKey := getEnv("SUPABASE_SERVICE_KEY", "")
if supabaseServiceKey == "" {
    if b64Key := getEnv("SUPABASE_SERVICE_KEY_B64", ""); b64Key != "" {
        // ...
    }
}

// Target (CORRECT):
supabaseServiceKey := getEnv("SUPABASE_SERVICE_ROLE_KEY", "")
if supabaseServiceKey == "" {
    if b64Key := getEnv("SUPABASE_SERVICE_ROLE_KEY_B64", ""); b64Key != "" {
        // ...
    }
}
```

Line 96: Update error message
```go
// Current:
return nil, fmt.Errorf("SUPABASE_SERVICE_KEY is required")

// Target:
return nil, fmt.Errorf("SUPABASE_SERVICE_ROLE_KEY is required")
```

**2. backend/go-screener/.env.example**

Update documentation to reflect correct variable name.

**3. backend/go-screener/README.md**

Update any references to `SUPABASE_SERVICE_KEY` → `SUPABASE_SERVICE_ROLE_KEY`.

**4. Fly.io Secrets**

Verify all apps have `SUPABASE_SERVICE_ROLE_KEY` set (already correct per user).

### Implementation Steps

1. Update config.go to use `SUPABASE_SERVICE_ROLE_KEY`
2. Update documentation files
3. Rebuild and redeploy vyx-user-35682909
4. Verify app starts without 401 errors
5. Check logs for successful Supabase connection
6. Commit changes

### Success Criteria

- [ ] Config.go uses `SUPABASE_SERVICE_ROLE_KEY` consistently
- [ ] Documentation updated
- [ ] Dedicated app deploys successfully
- [ ] No 401 errors in app logs
- [ ] App can load traders from database
- [ ] App can save signals to database

## Completion

**Closed:** 2025-11-18 10:31:00
**Outcome:** Success
**Commits:** 
- 4027253 - Initial fix adding SUPABASE_SERVICE_ROLE_KEY support
- 0856457 - Added backward compatibility for both old and new env var names
- 9c0c202 - Removed debug logging

**Resolution:** 
Fixed environment variable naming mismatch by supporting both SUPABASE_SERVICE_ROLE_KEY (correct) and SUPABASE_SERVICE_KEY (legacy) with full backward compatibility. Both apps now authenticate successfully with Supabase. No 401 errors in logs.
