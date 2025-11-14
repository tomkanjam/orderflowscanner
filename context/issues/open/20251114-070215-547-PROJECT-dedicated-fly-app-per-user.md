# Dedicated Fly App Per Pro/Elite User

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-14 07:02:15

## Context

Currently, all traders run in a shared Go backend server on Fly.io (`vyx-app`). This creates resource contention and limits our ability to scale user-specific execution.

**New Architecture:**
- Each Pro/Elite user gets a dedicated Fly APP (e.g., `vyx-user-abc123.fly.dev`)
- App is provisioned automatically when user is upgraded to Pro/Elite tier
- App runs 24/7 with user's traders isolated in their own execution environment
- Built-in (system) traders remain on shared backend app (`vyx-app`)
- Automatic deprovisioning when user downgrades to Free tier

**Benefits:**
- Complete resource isolation per user
- Independent scaling and monitoring
- Better security (no cross-user data access)
- Clearer cost attribution per user
- Simpler quota management

## Linked Items

- Initiative: End-to-end trader workflow implementation
- Related: Current Fly machine provisioning system (provision-machine edge function)

## Sub-issues

- [ ] `context/issues/open/20251114-070215-548-database-schema-user-fly-apps.md` - Database schema for tracking user Fly apps
- [ ] `context/issues/open/20251114-070215-549-fly-app-provisioning-api.md` - Fly API integration for app creation/deletion
- [ ] `context/issues/open/20251114-070215-550-tier-upgrade-trigger.md` - Auto-provision on tier upgrade trigger
- [ ] `context/issues/open/20251114-070215-551-user-specific-go-backend.md` - Configure Go backend to filter by user
- [ ] `context/issues/open/20251114-070215-552-deprovisioning-flow.md` - App deletion on tier downgrade
- [ ] `context/issues/open/20251114-070215-553-admin-monitoring-ui.md` - Admin UI for managing user apps
- [ ] `context/issues/open/20251114-070215-554-migration-existing-users.md` - Migrate existing Pro/Elite users to dedicated apps

## Progress

Project created. Ready to begin implementation.

## Spec

### Architecture Overview

```
User Signup → Free Tier (shared backend for built-in signals only)
     ↓
Upgrade to Pro/Elite
     ↓
Database Trigger → provision-user-fly-app Edge Function
     ↓
Fly API: Create App (vyx-user-{short-id}.fly.dev)
     ↓
Deploy same Go screener image with USER_ID env var
     ↓
App starts, loads only user's traders, connects to Supabase
     ↓
User's traders execute in isolated environment 24/7
     ↓
Downgrade to Free
     ↓
Database Trigger → deprovision-user-fly-app Edge Function
     ↓
Fly API: Delete App
     ↓
User back to shared backend (built-in signals only)
```

### Key Components

**1. Database Changes:**
- New table: `user_fly_apps` to track app name, status, region, costs
- Columns: user_id, fly_app_name, status, region, created_at, last_health_check, monthly_cost_estimate

**2. Fly API Operations:**
- Create Fly APP via API (not machine - full app with fly.toml)
- Deploy user-specific image with environment variables
- Monitor app health and status
- Delete app on downgrade

**3. Edge Functions:**
- `provision-user-fly-app` - Create and deploy user's Fly app
- `deprovision-user-fly-app` - Gracefully shut down and delete app
- `check-user-app-health` - Health monitoring endpoint

**4. Go Backend Changes:**
- Accept USER_ID environment variable
- Filter trader loading to only load user's traders (skip built-in)
- Initialize with user-specific Supabase context
- Report health metrics to tracking table

**5. Deprovisioning:**
- Triggered by tier downgrade (Elite/Pro → Free)
- Graceful shutdown of running traders
- Data retention in Supabase (signals, history preserved)
- App deletion via Fly API

**6. Admin Tools:**
- Dashboard showing all user apps and status
- Manual provision/deprovision controls
- Cost tracking per user
- Health monitoring alerts

### Implementation Phases

**Phase 1: Foundation (Issues 548-549)**
- Database schema for user_fly_apps
- Fly API client for app management
- Basic provision/deprovision edge functions

**Phase 2: Automation (Issues 550-551)**
- Database trigger on tier changes
- User-specific Go backend filtering
- Automatic app deployment

**Phase 3: Lifecycle Management (Issue 552)**
- Deprovisioning flow
- Error handling and retries
- State management

**Phase 4: Operations (Issues 553-554)**
- Admin monitoring UI
- Migrate existing Pro/Elite users
- Cost tracking and reporting

### Constraints

- Use existing Go screener Docker image (same codebase)
- Maintain backward compatibility with shared backend
- Built-in traders must stay on shared backend
- No user-facing UI changes (transparent to users)
- Fly app naming: `vyx-user-{short-user-id}` (8 chars max due to Fly limits)

### Success Criteria

- [ ] Pro/Elite users automatically get dedicated Fly app on upgrade
- [ ] App runs 24/7 with only user's traders executing
- [ ] Built-in traders continue working on shared backend
- [ ] Downgrade to Free tier automatically removes Fly app
- [ ] Admin can monitor all user apps in one dashboard
- [ ] Zero data loss during provision/deprovision
- [ ] Existing Pro/Elite users migrated successfully
