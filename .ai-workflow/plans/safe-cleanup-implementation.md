# Safe Cleanup Implementation Plan V2

## Overview
Safely clean up the per-symbol update tracking implementation by fixing underlying bugs FIRST, then removing obsolete code incrementally with testing after each phase.

### Context
- Previous cleanup (commit 0f94001) broke the app due to exposing a multi-interval fetching bug
- Currently rolled back to cb4647e with old implementation restored
- Goal: Remove ~856 lines of obsolete code while maintaining 90% CPU savings

## Prerequisites
- [x] App rolled back and functioning (commit cb4647e)
- [x] Build passing with old implementation
- [ ] Dev server running for immediate testing
- [ ] Browser console open to monitor errors

## Implementation Phases

### Phase 1: Fix the Root Cause Bug (45 min)
**Objective:** Fix the multi-interval fetching bug that caused the previous failure

#### Chunk 1.1: Analyze and fix fetchTopPairsAndInitialKlines calls (20 min)
```
Files to modify:
- apps/app/App.tsx (lines 540-577)

Actions:
1. Locate the problematic loop at line 546-550
2. Replace multiple fetchTopPairsAndInitialKlines calls with direct kline fetching
3. Reuse symbols from first call for all intervals
4. Add proper error handling per symbol

Code change:
- Change from: Calling fetchTopPairsAndInitialKlines for each interval
- Change to: Fetch klines directly using symbols from first call

Test criteria:
- [ ] pnpm build passes
- [ ] No TypeScript errors
- [ ] Console shows "Fetching data for interval:" logs

Checkpoint: App loads without "undefined symbol" errors
```

#### Chunk 1.2: Add resilient error handling (15 min)
```
Files to modify:
- apps/app/App.tsx (loadInitialData function)

Actions:
1. Wrap individual symbol fetches in try-catch
2. Continue processing if single symbol fails
3. Log failures without crashing app
4. Track successful vs failed fetches

Test criteria:
- [ ] App continues if one symbol fetch fails
- [ ] Failed symbols logged to console
- [ ] Successful symbols still load

Checkpoint: App resilient to partial fetch failures
```

#### Chunk 1.3: Test and verify fix (10 min)
```
Manual testing:
1. Start dev server: pnpm dev
2. Open browser console
3. Verify market data loads
4. Check for any "undefined" errors
5. Verify signals are generated
6. Test with different performance modes

Test criteria:
- [ ] Market data loads successfully
- [ ] No undefined symbol errors
- [ ] Workers receive data
- [ ] Signals generate properly
- [ ] All performance modes work

Checkpoint: Core bug is fixed
```

**Phase 1 Complete When:**
- Multi-interval fetching works correctly
- No undefined symbol errors
- App initializes reliably
- Create commit: "fix: Resolve multi-interval fetching bug"

### Phase 2: Remove Obsolete Hooks (30 min)
**Objective:** Remove old implementation files that are no longer needed

#### Chunk 2.1: Remove useIndividualTraderIntervals (10 min)
```
Files to modify:
- apps/app/hooks/useIndividualTraderIntervals.ts (DELETE)
- apps/app/App.tsx (remove import)

Actions:
1. Delete useIndividualTraderIntervals.ts
2. Remove import from App.tsx line 24
3. Update performance mode logic (lines 1117-1120)
4. Default 'individual' mode to 'shared'

Test criteria:
- [ ] pnpm build passes
- [ ] No import errors
- [ ] Performance mode selector still works

Checkpoint: First obsolete hook removed
```

#### Chunk 2.2: Remove useBatchedTraderIntervals (10 min)
```
Files to modify:
- apps/app/hooks/useBatchedTraderIntervals.ts (DELETE)
- apps/app/App.tsx (remove import)

Actions:
1. Delete useBatchedTraderIntervals.ts
2. Remove import from App.tsx line 25
3. Update performance mode logic
4. Default 'batched' mode to 'shared'

Test criteria:
- [ ] pnpm build passes
- [ ] App still loads
- [ ] Shared mode works

Checkpoint: Second obsolete hook removed
```

#### Chunk 2.3: Remove unused screenerWorker (10 min)
```
Files to modify:
- apps/app/workers/screenerWorker.ts (DELETE)
- apps/app/hooks/useScreenerWorker.ts (DELETE)

Actions:
1. Delete both files
2. Verify no imports remain
3. Check for any references

Test criteria:
- [ ] pnpm build passes
- [ ] No missing module errors
- [ ] Workers still function

Checkpoint: Obsolete worker removed
```

**Phase 2 Complete When:**
- All obsolete files deleted
- Build passing
- App fully functional
- Create commit: "cleanup: Remove obsolete hooks and workers"

### Phase 3: Simplify Performance Mode (20 min)
**Objective:** Remove performance mode selector since only shared mode remains

#### Chunk 3.1: Remove performance mode UI (10 min)
```
Files to modify:
- apps/app/components/PerformanceMonitor.tsx
- apps/app/App.tsx

Actions:
1. Remove mode selector from PerformanceMonitor
2. Remove performanceMode state from App.tsx
3. Always use useSharedTraderIntervals
4. Clean up related localStorage code

Test criteria:
- [ ] UI displays without mode selector
- [ ] Shared mode active by default
- [ ] No console errors

Checkpoint: UI simplified
```

#### Chunk 3.2: Clean up App.tsx (10 min)
```
Files to modify:
- apps/app/App.tsx

Actions:
1. Remove performanceMode state (line ~1105)
2. Remove handlePerformanceModeChange
3. Simplify hook selection (lines 1117-1128)
4. Direct use of useSharedTraderIntervals

Test criteria:
- [ ] Build passes
- [ ] App initializes correctly
- [ ] Signals generate

Checkpoint: Code simplified
```

**Phase 3 Complete When:**
- Performance mode selector removed
- Only shared implementation active
- App functioning normally
- Create commit: "cleanup: Remove performance mode selector"

### Phase 4: Clean Debug Statements (20 min)
**Objective:** Make debug logging conditional without removing useful diagnostics

#### Chunk 4.1: Clean SharedMarketData logs (10 min)
```
Files to modify:
- apps/app/src/shared/SharedMarketData.ts

Actions:
1. Replace console.log with internal debug flag
2. Keep critical error logging
3. Add DEBUG_MODE flag check
4. Preserve performance tracking

Test criteria:
- [ ] Less console spam
- [ ] Errors still logged
- [ ] Debug mode toggleable

Checkpoint: SharedMarketData cleaned
```

#### Chunk 4.2: Clean DifferentialTracker logs (10 min)
```
Files to modify:
- apps/app/src/utils/DifferentialTracker.ts

Actions:
1. Add debug property (default false)
2. Wrap logs in if (this.debug) checks
3. Keep summary logging
4. Preserve error logging

Test criteria:
- [ ] Reduced console output
- [ ] Can enable debug if needed
- [ ] Critical info preserved

Checkpoint: DifferentialTracker cleaned
```

**Phase 4 Complete When:**
- Console output reduced
- Debug mode configurable
- Critical logs preserved
- Create commit: "cleanup: Make debug logging conditional"

### Phase 5: Extract Constants (15 min)
**Objective:** Extract magic numbers to centralized constants file

#### Chunk 5.1: Create constants file (10 min)
```
Files to create:
- apps/app/src/shared/constants.ts

Actions:
1. Create constants.ts with shared memory configs
2. Extract MAX_SYMBOLS, MAX_KLINES_PER_SYMBOL
3. Extract buffer sizes and intervals
4. Add documentation

Test criteria:
- [ ] File created with exports
- [ ] Values match originals
- [ ] Well documented

Checkpoint: Constants centralized
```

#### Chunk 5.2: Update imports (5 min)
```
Files to modify:
- apps/app/src/shared/SharedMarketData.ts

Actions:
1. Import from constants.ts
2. Replace magic numbers
3. Verify values unchanged

Test criteria:
- [ ] Build passes
- [ ] App functions normally
- [ ] No behavior changes

Checkpoint: Constants integrated
```

**Phase 5 Complete When:**
- Magic numbers extracted
- Constants documented
- App functioning
- Create commit: "cleanup: Extract magic numbers to constants"

## Testing Strategy

### After Each Phase
```bash
# Build check
pnpm build

# Start dev server
pnpm dev

# Manual verification checklist:
1. App loads without errors
2. Market data displays
3. Signals generate
4. Charts work
5. No console errors
```

### Final Integration Test
1. Clear browser cache
2. Fresh app load
3. Create and enable trader
4. Verify signal generation
5. Check CPU usage (should be ~10% of original)
6. Test for 5 minutes continuous operation

## Rollback Plan
If any phase fails:
```bash
# Revert last commit
git reset --hard HEAD~1

# Or revert to specific safe point
git reset --hard [commit-hash]

# Reinstall dependencies if needed
pnpm install
```

## PM Checkpoints
Review and test after:
- [ ] Phase 1 - Bug fixed, app stable
- [ ] Phase 2 - Old code removed
- [ ] Phase 3 - UI simplified
- [ ] Phase 4 - Debug cleaned
- [ ] Phase 5 - Constants extracted

## Success Metrics
- [ ] Build passing with no warnings
- [ ] ~856 lines of code removed
- [ ] CPU usage remains at ~10% of original
- [ ] No functionality lost
- [ ] Console output reduced by 80%+
- [ ] All tests passing

## Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Breaking data fetch | Test thoroughly before proceeding | ⏳ |
| 2 | Missing dependencies | Check imports before deleting | ⏳ |
| 3 | Breaking UI | Keep backup of component | ⏳ |
| 4 | Losing debug capability | Make conditional, not remove | ⏳ |
| 5 | Wrong constant values | Verify each replacement | ⏳ |

## Time Estimate
- Phase 1: 45 minutes (critical bug fix)
- Phase 2: 30 minutes (remove old code)
- Phase 3: 20 minutes (simplify UI)
- Phase 4: 20 minutes (clean debug)
- Phase 5: 15 minutes (extract constants)
- **Total: 2 hours 10 minutes**

## Next Actions
1. Ensure dev server is running
2. Open browser with console
3. Begin Phase 1, Chunk 1.1 - Fix multi-interval fetching
4. Test thoroughly before proceeding to Phase 2

## Emergency Contacts
If critical issues arise:
1. Rollback immediately
2. Document exact error
3. Review with PM before retry
4. Consider smaller phases if needed