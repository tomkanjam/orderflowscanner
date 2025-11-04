# Remove Browser Version Implementation

**Type:** refactor
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 08:44:45

## Context

The application currently has TWO parallel implementations for continuous monitoring:

1. **Frontend/Browser Version** (July 2025):
   - `apps/app/src/services/workflowManager.ts`
   - `apps/app/src/services/klineEventBus.ts`
   - Client-side candle close event handling
   - Client-side AI analysis orchestration

2. **Go Backend Version** (October 2025):
   - `backend/go-screener/internal/monitoring/`
   - Server-side event handling
   - Server-side analysis orchestration via analysis engine

Having two implementations creates:
- Code duplication and maintenance burden
- Confusion about which system is active
- Potential for inconsistent behavior
- Increased complexity for debugging

The Go backend version is the correct architecture because:
- ✅ Centralized processing (no client-side compute)
- ✅ Works for all users (not just browser clients)
- ✅ Better security (API keys server-side only)
- ✅ Easier to scale and monitor
- ✅ Consistent with auto-trigger pattern (migration 028)

## Linked Items

- Part of: End-to-end trader workflow implementation initiative
- Related: `context/issues/open/20251025-102927-000-PROJECT-continuous-monitoring-system.md`
- Depends on: Continuous monitoring system (sub-issues 002-003)

## Progress

*Track progress here*

## Spec

### Files to Remove/Modify

**Remove Entirely:**
1. `apps/app/src/services/workflowManager.ts` (584 lines)
2. `apps/app/src/services/klineEventBus.ts` (120 lines)
3. `apps/app/src/components/WorkflowStatus.tsx` (if purely for browser workflows)

**Modify (Remove Browser Workflow References):**
1. `apps/app/src/components/ActivityPanel.tsx`
   - Remove import: `import { workflowManager, MonitoringDecision } from '../services/workflowManager'`
   - Remove calls to `workflowManager.getMonitoringDecisions()`
   - Fetch monitoring decisions directly from `monitoring_decisions` table via Supabase

2. `App.tsx` or main app initialization
   - Remove any `workflowManager.initialize()` or `.start()` calls
   - Remove any `klineEventBus` subscriptions

**Database Tables (KEEP - Go backend uses these):**
- ✅ `workflow_schedules` - Used by Go backend
- ✅ `monitoring_decisions` - Written by Go backend
- ✅ `position_management_decisions` - Will be used by Go backend

**Migration Files (KEEP):**
- ✅ `supabase/migrations/001_create_workflow_tables.sql` - Tables still needed

### Implementation Steps

#### Phase 1: Research and Inventory (30 min)
```bash
# Find all references to workflowManager
grep -rn "workflowManager" apps/app/src/ --include="*.tsx" --include="*.ts"

# Find all references to klineEventBus
grep -rn "klineEventBus" apps/app/src/ --include="*.tsx" --include="*.ts"

# Find WorkflowStatus component usage
grep -rn "WorkflowStatus" apps/app/src/ --include="*.tsx" --include="*.ts"
```

#### Phase 2: Remove Service Files (15 min)
```bash
rm apps/app/src/services/workflowManager.ts
rm apps/app/src/services/klineEventBus.ts
```

#### Phase 3: Update ActivityPanel (30 min)

**Before:**
```typescript
import { workflowManager, MonitoringDecision } from '../services/workflowManager';

// Later in component:
workflowManager.getMonitoringDecisions(selectedSignalId).then(decisions => {
  // ...
});
```

**After:**
```typescript
import { supabase } from '../config/supabase';

// Fetch directly from database:
const { data: decisions } = await supabase
  .from('monitoring_decisions')
  .select('*')
  .eq('signal_id', selectedSignalId)
  .order('timestamp', { ascending: false });
```

#### Phase 4: Remove Component (if needed) (15 min)

Check if `WorkflowStatus.tsx` is purely for browser workflows:
```bash
# If it only displays browser workflow state, remove it
rm apps/app/src/components/WorkflowStatus.tsx

# If it's used in UI, update imports in parent components
```

#### Phase 5: Clean App Initialization (15 min)

Remove any initialization code in `App.tsx`:
```typescript
// REMOVE these if present:
import { workflowManager } from './services/workflowManager';
workflowManager.initialize();
workflowManager.start();
```

#### Phase 6: Build and Test (30 min)
```bash
# Check TypeScript compilation
pnpm build

# Run the app
pnpm dev

# Verify:
# 1. App starts without errors
# 2. Signals table still works
# 3. Activity panel still shows data (from DB, not browser manager)
# 4. No console errors about missing workflowManager
```

### Success Criteria

- [ ] `workflowManager.ts` removed
- [ ] `klineEventBus.ts` removed
- [ ] No imports of removed files remain
- [ ] ActivityPanel fetches monitoring decisions from Supabase directly
- [ ] App builds without TypeScript errors
- [ ] App runs without runtime errors
- [ ] No browser-side candle close event handling remains
- [ ] Database tables intact (Go backend still needs them)
- [ ] WorkflowStatus component removed or updated appropriately

### Testing Plan

**Manual Testing:**
1. Start app with `pnpm dev`
2. Navigate to Signals tab
3. Click on a signal to view activity
4. Verify activity panel shows monitoring decisions (from database)
5. Check browser console - no errors
6. Verify traders still work
7. Verify signals still appear

**What Should Still Work:**
- ✅ Go backend monitoring (via `monitoring/engine.go`)
- ✅ Database trigger auto-analysis (migration 028)
- ✅ Reading monitoring decisions from database
- ✅ All existing functionality except browser-side workflow orchestration

**What Will No Longer Work:**
- ❌ Client-side candle close event handling (GOOD - Go does this now)
- ❌ Browser-based workflow scheduling (GOOD - Go does this now)
- ❌ WorkflowStatus live updates (if component showed browser state)

### Notes

**Why Remove Instead of Keep Both?**
- Browser version was a prototype/MVP approach
- Go backend is the production architecture
- Keeping both creates confusion and bugs
- Go version integrates better with existing auto-trigger (migration 028)

**Migration Path:**
Users don't need migration - the database tables and data remain intact. The Go backend will continue processing workflows using the same tables.

### Effort Estimate

**2-3 hours total**
- 30 min: Research and inventory
- 30 min: Remove service files and update imports
- 30 min: Update ActivityPanel to fetch from DB
- 30 min: Clean up WorkflowStatus and App initialization
- 30-60 min: Build, test, fix any issues
