# Fix User Trader Execution Architecture

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-17 16:23:36

## Context

User traders are incorrectly executing on the shared backend (vyx-app) instead of user-dedicated Fly apps. Investigation revealed three critical architecture bugs:

1. **Environment Variable Mismatch**: Go code looks for `SUPABASE_SERVICE_KEY` but Fly secrets use `SUPABASE_SERVICE_ROLE_KEY`, causing 401 authentication errors
2. **RUN_MODE Bypass**: `pollForChanges()` loads ALL traders via `GetAllTraders()`, ignoring RUN_MODE separation logic
3. **Disabled Traders Still Running**: No mechanism to remove disabled traders from memory during polling

**Evidence:**
- User trader "StochRSI Overbought Short" disabled Nov 15, still generating signals Nov 17
- All signals have `fly_app_id: null`, `source: "cloud"` (from shared backend)
- Dedicated app (vyx-user-35682909) has 401 Unauthorized errors from Supabase
- Shared backend running user traders it shouldn't process

## Linked Items
- Part of: End-to-end trader workflow implementation initiative
- Related: `context/issues/open/20251116-094457-fix-fly-app-provisioning.md`

## Sub-issues
- [ ] `context/issues/open/20251117-162336-002-fix-supabase-service-role-key-naming.md` - Fix env var naming mismatch (Priority 1 - CRITICAL)
- [ ] `context/issues/open/20251117-162336-003-make-poll-respect-run-mode.md` - Update pollForChanges to respect RUN_MODE (Priority 2 - CRITICAL)
- [ ] `context/issues/open/20251117-162336-004-restart-shared-backend.md` - Clear disabled trader from memory (Priority 3)
- [ ] `context/issues/open/20251117-162336-005-verify-trader-execution.md` - End-to-end verification (Priority 4)

## Progress

**Status:** Planning complete, ready to implement

## Spec

### Architecture Fix Overview

**Current Broken State:**
```
Shared Backend (vyx-app)         User Dedicated App (vyx-user-35682909)
  ├─ RUN_MODE: unset                ├─ RUN_MODE: user_dedicated
  ├─ Should: built-in only          ├─ Should: user traders only
  ├─ Actually: ALL traders          ├─ Actually: 401 errors (broken)
  └─ pollForChanges() bug           └─ Wrong env var name
```

**Target Fixed State:**
```
Shared Backend (vyx-app)         User Dedicated App (vyx-user-35682909)
  ├─ RUN_MODE: shared_backend       ├─ RUN_MODE: user_dedicated
  ├─ Loads: built-in only           ├─ Loads: user traders only
  ├─ Polls: built-in only           ├─ Polls: user traders only
  └─ Signals: fly_app_id=null       └─ Signals: fly_app_id=<id>
```

### Implementation Sequence

1. **Fix authentication** (Sub-issue #2) - Enables dedicated app to function
2. **Fix polling logic** (Sub-issue #3) - Prevents architecture violations
3. **Clean current state** (Sub-issue #4) - Removes running disabled trader
4. **Verify end-to-end** (Sub-issue #5) - Confirms correct behavior

### Success Criteria

- [ ] Dedicated app authenticates successfully with Supabase
- [ ] Shared backend only processes built-in traders
- [ ] User traders only execute on dedicated apps
- [ ] Signals from user traders have `fly_app_id` populated
- [ ] Disabled traders stop immediately when toggled off
- [ ] No 401 errors in any app logs
