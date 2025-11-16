# Fix Fly App Provisioning System Issues

**Type:** bug
**Initiative:** none
**Created:** 2025-11-16 09:44:57

## Context

The Fly app provisioning system for Pro/Elite users has multiple critical bugs preventing dedicated machines from generating signals. When investigating why tom@tomk.ca's signals weren't coming from their dedicated machine, discovered systematic provisioning failures.

## Linked Items

- Related: User-dedicated Fly app provisioning implementation

## Progress

**2025-11-16 09:45**: Issue identified and documented. Multiple fixes applied:
1. Fixed missing `log` import in backend/go-screener/pkg/supabase/client.go
2. Fixed provision-user-fly-app edge function to handle deleted records (reactivation logic)
3. Manually configured vyx-user-35682909 with correct environment variables

**Current Status**: Machine is running in user_dedicated mode but experiencing 401 auth errors when polling for traders. Need to verify SUPABASE_SERVICE_KEY and complete provisioning automation.

## Spec

### Problems Found

**1. Unique Constraint Violations on Reprovisioning**
- **File**: `supabase/functions/provision-user-fly-app/index.ts:30-35`
- **Issue**: When user downgrades then upgrades, function tries to INSERT new record but unique constraint on `fly_app_name` fails because deleted record still exists
- **Root Cause**: Query only checks for active apps (`.is("deleted_at", null)`), doesn't handle reactivation
- **Fix Applied**: Modified to fetch ALL records (including deleted), check for deleted record, and reactivate instead of inserting new

**2. Missing Import in Go Supabase Client**
- **File**: `backend/go-screener/pkg/supabase/client.go:9`
- **Issue**: Missing `log` package import caused build failures
- **Impact**: Any deployment to user-dedicated machines failed during Docker build
- **Fix Applied**: Added `"log"` to imports

**3. Environment Variables Not Persisted via Fly API**
- **File**: `supabase/functions/_shared/flyClient.ts:161-170`
- **Issue**: `deployFlyMachine()` sets `env` in machine config, but these are NOT persisted as secrets
- **Impact**: Machine restarts lose environment variables (USER_ID, RUN_MODE, SUPABASE_URL, SUPABASE_SERVICE_KEY)
- **Fix Needed**: Use Fly.io secrets API to persist environment variables

**4. Docker Image Tag Issues**
- **File**: `supabase/functions/provision-user-fly-app/index.ts:13`
- **Issue**: `DOCKER_IMAGE` env var set to `registry.fly.io/vyx-app:latest` but this tag doesn't exist
- **Impact**: Machines deploy with old image versions, missing recent code fixes
- **Fix Needed**: Either create `:latest` tag or use specific deployment tags

**5. Wrong Region Deployment**
- **Issue**: Initial machine deployed to `sjc` instead of `sin` (Singapore)
- **Impact**: Binance API requires Singapore region for best performance/compliance
- **Root Cause**: Fly.io API defaults to nearest region when not specified in machine config
- **Fix Needed**: Explicitly set `region: "sin"` in deployFlyMachine call

**6. Machine Size Mismatch**
- **Expected**: `shared-cpu-2x:512MB` (from fly.user-35682909.toml)
- **Actual**: `shared-cpu-4x:1024MB`
- **Root Cause**: Fly deploy command doesn't read size from toml, API defaults applied
- **Fix Needed**: Explicitly set guest.cpus and guest.memory_mb in deployFlyMachine

**7. Invalid SUPABASE_SERVICE_KEY**
- **Current Error**: `Poll error: unexpected status 401: {"message":"Invalid API key"}`
- **Issue**: Service role key not being correctly passed from edge function to Fly machine
- **Fix Needed**: Verify key format and use Fly secrets API for persistence

### Implementation Plan

1. **Update flyClient.ts to use Fly Secrets API** (lines 137-199)
   - Add new function `setFlySecrets(appName, secrets)` using `/v1/apps/{app}/secrets` endpoint
   - Modify `deployFlyMachine` to call setFlySecrets before machine creation
   - Ensure secrets include: USER_ID, RUN_MODE, SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY, BRAINTRUST_API_KEY, BRAINTRUST_PROJECT_ID, OPENROUTER_API_KEY

2. **Fix Docker Image Tagging**
   - Option A: Create `:latest` tag in registry that tracks main deployment
   - Option B: Modify provision function to use specific deployment tags from current vyx-app deployment
   - Recommendation: Use shared image registry with `:latest` tag updated on each deploy

3. **Enforce Singapore Region**
   - Modify `deployFlyMachine` call in provision-user-fly-app to explicitly set region: "sin"
   - Update flyClient.ts:142-183 to accept region parameter and include in machine config

4. **Fix Machine Sizing**
   - Update `deployFlyMachine` call to explicitly set:
     - `guest.cpus: 2`
     - `guest.memory_mb: 512`
     - `guest.cpu_kind: "shared"`

5. **Add Health Checks**
   - Implement health check endpoint in Go server (e.g., `/health`)
   - Add health check configuration to machine deployment
   - Monitor health status in user_fly_apps table

6. **Update Database on Success**
   - After successful deployment, update user_fly_apps with:
     - `machine_id` from Fly API response
     - `deployed_at` timestamp
     - `health_status: "healthy"`
     - `status: "active"`

7. **Add Retry Logic for Machine Provisioning**
   - Wrap machine creation and deployment in retry logic
   - Update retry_count in database
   - Log failures to user_fly_app_events

### Testing Checklist

- [ ] Test fresh provisioning (new user upgrade to Pro)
- [ ] Test reprovisioning (user downgrade then upgrade)
- [ ] Test reactivation of deleted app
- [ ] Verify signals generated with correct machine_id
- [ ] Verify traders loaded in user_dedicated mode
- [ ] Verify machine survives restart with correct env vars
- [ ] Test machine health monitoring
- [ ] Test in Singapore region
- [ ] Verify correct machine sizing

## Completion

(To be filled when issue is closed)
