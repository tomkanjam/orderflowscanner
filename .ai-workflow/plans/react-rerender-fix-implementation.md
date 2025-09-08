# React Re-render Memory Fix - Implementation Plan

## Overview
Complete the memory leak fix by addressing the root cause: excessive React re-renders triggering redundant ADD_TRADER messages. Phase 1 (worker-side deduplication) is complete and has reduced memory growth from 22.8 MB/s to ~2 MB/s. This plan covers Phases 2-3 to eliminate the root cause entirely.

Reference: `.ai-workflow/architecture/react-rerender-memory-fix-20250109.md`

## Prerequisites
- [x] Phase 1 complete (worker-side deduplication)
- [x] pnpm development environment
- [x] Access to browser DevTools for memory profiling
- [x] Current branch: `fix/worker-memory-leak`
- [ ] Baseline memory metrics recorded

## Implementation Phases

### Phase 2: Stable Trader References (1.5 hours)
**Objective:** Prevent unnecessary re-renders by making trader array reference stable

#### Chunk 2.1: Add Trader Equality Checker (20 min)
```
Files to create:
- apps/app/src/utils/traderEquality.ts

Actions:
1. Create areTraderArraysEqual function
2. Create isTraderEqual function for individual comparison
3. Export utility functions
4. Add comprehensive property checks

Code structure:
export function isTraderEqual(a: Trader, b: Trader): boolean {
  return a.id === b.id &&
         a.enabled === b.enabled &&
         a.name === b.name &&
         a.filter?.code === b.filter?.code &&
         a.filter?.refreshInterval === b.filter?.refreshInterval &&
         JSON.stringify(a.filter?.requiredTimeframes) === 
         JSON.stringify(b.filter?.requiredTimeframes);
}

export function areTraderArraysEqual(a: Trader[], b: Trader[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((trader, i) => isTraderEqual(trader, b[i]));
}

Test criteria:
- [ ] Functions compile without errors
- [ ] Equal traders return true
- [ ] Different traders return false
- [ ] Order matters in array comparison

Checkpoint: Equality functions ready for use
```

#### Chunk 2.2: Implement Stable References in App.tsx (30 min)
```
Files to modify:
- apps/app/App.tsx

Actions:
1. Import equality utilities
2. Add tradersRef using useRef
3. Create updateTraders callback with equality check
4. Replace direct setTraders calls with updateTraders
5. Add logging to track prevented updates

Code changes:
// Near line 67
const tradersRef = useRef<Trader[]>([]);

// New function around line 100
const updateTraders = useCallback((newTraders: Trader[]) => {
  if (!areTraderArraysEqual(tradersRef.current, newTraders)) {
    console.log('[App] Traders actually changed, updating state');
    tradersRef.current = newTraders;
    setTraders(newTraders);
  } else {
    console.log('[App] Traders unchanged, skipping state update');
  }
}, []);

// Replace setTraders at lines 376 and 385
updateTraders(updatedTraders);

Test criteria:
- [ ] App compiles and runs
- [ ] Console shows "skipping state update" messages
- [ ] Traders still update when actually changed
- [ ] useEffect triggers reduced by 80%+

Checkpoint: Stable references preventing unnecessary renders
```

#### Chunk 2.3: Optimize TraderManager Notifications (20 min)
```
Files to modify:
- apps/app/src/services/traderManager.ts

Actions:
1. Add debouncing to notifySubscribers
2. Batch multiple rapid updates
3. Only notify on actual changes
4. Add logging for notification frequency

Code additions:
private pendingNotification: NodeJS.Timeout | null = null;

private notifySubscribers() {
  // Clear any pending notification
  if (this.pendingNotification) {
    clearTimeout(this.pendingNotification);
  }
  
  // Debounce notifications by 50ms
  this.pendingNotification = setTimeout(() => {
    console.log('[TraderManager] Notifying subscribers');
    const traders = this.getTradersList();
    this._subscribers.forEach(callback => callback(traders));
    this.pendingNotification = null;
  }, 50);
}

Test criteria:
- [ ] Rapid updates batched into single notification
- [ ] No lost updates
- [ ] 50ms delay acceptable for UX
- [ ] Console shows reduced notification frequency

Checkpoint: TraderManager notifications optimized
```

#### Chunk 2.4: Verify Phase 2 Impact (20 min)
```
Manual Testing Protocol:
1. Open Chrome DevTools > Memory
2. Take initial heap snapshot
3. Create and modify 5 traders rapidly
4. Monitor console for skip messages
5. Take final heap snapshot after 1 minute
6. Compare memory growth

Performance Metrics to Track:
- useEffect triggers per minute (target: < 5)
- State updates skipped (target: > 80%)
- Memory growth rate (target: < 0.5 MB/s)
- ADD_TRADER messages (target: < 10/min)

Test criteria:
- [ ] Memory growth < 0.5 MB/s
- [ ] 80%+ state updates prevented
- [ ] Console shows optimization working
- [ ] No functional regressions

Checkpoint: Phase 2 complete and verified
```

**Phase 2 Complete When:**
- Trader array reference stays stable unless actual changes
- Re-renders reduced by 80%+
- Memory growth < 0.5 MB/s
- All trader functionality intact

### Phase 3: Differential Updates (2 hours)
**Objective:** Only send changed traders to workers, not entire list

#### Chunk 3.1: Create Differential Update Tracker (30 min)
```
Files to create:
- apps/app/src/utils/DifferentialTracker.ts

Actions:
1. Create DifferentialTracker class
2. Track previous trader state
3. Compute additions, updates, removals
4. Export for use in hook

Class structure:
export class DifferentialTracker {
  private previous = new Map<string, TraderExecution>();
  
  computeChanges(current: Trader[]): {
    toAdd: TraderExecution[];
    toUpdate: TraderExecution[];
    toRemove: string[];
  } {
    // Implementation
  }
  
  private createTraderExecution(trader: Trader): TraderExecution {
    return {
      traderId: trader.id,
      filterCode: trader.filter?.code || '',
      refreshInterval: trader.filter?.refreshInterval || '1m',
      requiredTimeframes: trader.filter?.requiredTimeframes || ['1m']
    };
  }
}

Test criteria:
- [ ] Class compiles without errors
- [ ] Correctly identifies additions
- [ ] Correctly identifies updates
- [ ] Correctly identifies removals

Checkpoint: Differential tracker ready
```

#### Chunk 3.2: Integrate Differential Updates in Hook (45 min)
```
Files to modify:
- apps/app/hooks/useSharedTraderIntervals.ts

Actions:
1. Import DifferentialTracker
2. Create tracker instance with useRef
3. Replace bulk ADD_TRADER logic with differential
4. Send only changes to workers
5. Add extensive logging

Code changes at line 143:
const trackerRef = useRef(new DifferentialTracker());

// In useEffect around line 143
const changes = trackerRef.current.computeChanges(traders);

console.log(`[SharedTraderIntervals] Differential update: +${changes.toAdd.length}, ~${changes.toUpdate.length}, -${changes.toRemove.length}`);

// Only send necessary messages
changes.toAdd.forEach(trader => {
  worker.postMessage({ type: 'ADD_TRADER', data: trader });
});

changes.toUpdate.forEach(trader => {
  worker.postMessage({ type: 'UPDATE_TRADER', data: trader });
});

changes.toRemove.forEach(id => {
  worker.postMessage({ type: 'REMOVE_TRADER', traderId: id });
});

Test criteria:
- [ ] Only changed traders sent to workers
- [ ] Console shows differential counts
- [ ] Worker receives correct messages
- [ ] No duplicate ADD_TRADER for same trader

Checkpoint: Differential updates working
```

#### Chunk 3.3: Handle UPDATE_TRADER in Worker (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Enhance UPDATE_TRADER case handler
2. Only recompile if filter changed
3. Update trader properties efficiently
4. Add update-specific logging

Code changes around line 448:
case 'UPDATE_TRADER':
  const existing = this.traders.get(data.traderId);
  if (existing) {
    // Check if filter needs recompilation
    if (existing.filterCode !== data.filterCode) {
      console.log(`[Worker] Filter changed for ${data.traderId}, recompiling`);
      this.addTrader(data); // Reuse existing logic
    } else {
      console.log(`[Worker] Updating metadata only for ${data.traderId}`);
      // Update non-filter properties
      this.traders.set(data.traderId, {
        ...existing,
        refreshInterval: data.refreshInterval,
        requiredTimeframes: data.requiredTimeframes
      });
    }
  } else {
    // Trader doesn't exist, add it
    this.addTrader(data);
  }
  break;

Test criteria:
- [ ] UPDATE_TRADER handled correctly
- [ ] Filter only recompiled when changed
- [ ] Metadata updates don't trigger compilation
- [ ] Console shows appropriate messages

Checkpoint: Worker handles updates efficiently
```

#### Chunk 3.4: Performance Validation (15 min)
```
Comprehensive Testing:
1. Start app with clean state
2. Create 10 traders
3. Enable/disable traders rapidly
4. Modify trader filters
5. Delete some traders
6. Monitor all metrics

Expected Results:
- ADD_TRADER: Only on actual new traders
- UPDATE_TRADER: Only on modifications
- REMOVE_TRADER: Only on deletions
- No redundant messages
- Memory growth near zero

Performance Targets:
- Message efficiency: 100% (no redundant messages)
- Memory growth: < 0.1 MB/s
- CPU usage: < 5% idle
- Response time: < 100ms

Test criteria:
- [ ] All targets met
- [ ] No functional regressions
- [ ] Console logs confirm efficiency
- [ ] Memory profiler shows stability

Checkpoint: Optimal performance achieved
```

**Phase 3 Complete When:**
- Only actual changes sent to workers
- Zero redundant messages
- Memory growth < 0.1 MB/s
- Perfect message efficiency

### Phase 4: Polish & Monitoring (45 min)
**Objective:** Add production-ready monitoring and cleanup

#### Chunk 4.1: Add Performance Metrics (20 min)
```
Files to modify:
- apps/app/hooks/useSharedTraderIntervals.ts

Actions:
1. Track message counts
2. Calculate efficiency metrics
3. Export getPerformanceMetrics function
4. Log warnings for anomalies

Code additions:
const metricsRef = useRef({
  addCount: 0,
  updateCount: 0,
  removeCount: 0,
  skipCount: 0,
  lastReset: Date.now()
});

const getPerformanceMetrics = useCallback(() => {
  const elapsed = (Date.now() - metricsRef.current.lastReset) / 1000;
  return {
    messagesPerSecond: (metricsRef.current.addCount + 
                       metricsRef.current.updateCount + 
                       metricsRef.current.removeCount) / elapsed,
    efficiency: metricsRef.current.skipCount / 
               (metricsRef.current.skipCount + metricsRef.current.addCount),
    ...metricsRef.current
  };
}, []);

Test criteria:
- [ ] Metrics tracked accurately
- [ ] Efficiency calculation correct
- [ ] Export works from hook
- [ ] Can reset metrics

Checkpoint: Monitoring in place
```

#### Chunk 4.2: Add Debug Mode (15 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts
- apps/app/hooks/useSharedTraderIntervals.ts

Actions:
1. Add DEBUG flag from environment
2. Conditional verbose logging
3. Performance timing in debug mode
4. Memory usage reporting

Code additions:
const DEBUG = import.meta.env.DEV && 
              localStorage.getItem('DEBUG_WORKERS') === 'true';

if (DEBUG) {
  console.log('[Worker] Detailed metrics:', {
    traders: this.traders.size,
    compiledFilters: this.compiledFilters.size,
    memoryMB: (performance.memory?.usedJSHeapSize || 0) / 1024 / 1024
  });
}

Test criteria:
- [ ] Debug mode toggleable
- [ ] Verbose logs only in debug
- [ ] Performance metrics visible
- [ ] No impact when disabled

Checkpoint: Debug capabilities added
```

#### Chunk 4.3: Final Integration Test (10 min)
```
Full System Test:
1. Enable debug mode: localStorage.setItem('DEBUG_WORKERS', 'true')
2. Run through complete user workflow:
   - Create traders
   - Trigger signals
   - Modify filters
   - Delete traders
3. Verify all optimizations active
4. Check final memory state

Success Criteria:
- [ ] Memory stable after 10 minutes
- [ ] All optimizations confirmed in logs
- [ ] Performance metrics within targets
- [ ] No user-visible issues

Checkpoint: Production ready
```

**Phase 4 Complete When:**
- Comprehensive monitoring in place
- Debug mode available
- All metrics within targets
- Ready for production

## Testing Strategy

### Unit Tests
```bash
# After each chunk
pnpm build                    # Ensure no compilation errors
pnpm dev                      # Test in development mode

# Check specific functionality
# In browser console:
localStorage.setItem('DEBUG_WORKERS', 'true');
location.reload();
```

### Integration Tests
1. **Re-render Prevention Test**
   - Modify traders rapidly
   - Verify 80%+ updates skipped
   - Check console for "skipping state update"

2. **Differential Update Test**
   - Add 5 traders → expect 5 ADD_TRADER
   - Modify 2 traders → expect 2 UPDATE_TRADER
   - Delete 1 trader → expect 1 REMOVE_TRADER
   - No other messages sent

3. **Memory Stability Test**
   - Run for 30 minutes with active traders
   - Memory growth < 30 MB total
   - No performance degradation

### Manual Testing
```javascript
// Browser console commands for testing

// Check current memory
console.log(`Memory: ${(performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);

// Force garbage collection (if --enable-precise-memory-info)
if (global.gc) global.gc();

// Get performance metrics (after Phase 4)
window.getWorkerMetrics?.();
```

## Rollback Plan
If issues arise:
1. `git stash` - Save current work
2. `git checkout 59e9157` - Return to Phase 1 (working deduplication)
3. `pnpm install && pnpm dev` - Restart environment
4. Document specific issue for investigation
5. Can incrementally apply phases

### Safe Checkpoints
- After Phase 2: `git commit -m "feat: Add stable trader references"`
- After Phase 3: `git commit -m "feat: Implement differential updates"`
- After Phase 4: `git commit -m "feat: Add monitoring and polish"`

## PM Checkpoints
Points where PM should review:
- [ ] After Phase 2 - Re-renders prevented, memory improved
- [ ] After Phase 3 - Differential updates working, near-zero growth
- [ ] After Phase 4 - Production ready with monitoring
- [ ] Before merge - All tests passing, metrics confirmed

## Success Metrics
How we know it's working:
- [ ] Memory growth < 0.1 MB/s (currently ~2 MB/s)
- [ ] useEffect triggers < 5/minute (currently 20+)
- [ ] ADD_TRADER messages < 10/minute (currently 80+)
- [ ] State update efficiency > 80%
- [ ] No functional regressions
- [ ] Signal detection unchanged
- [ ] Performance smooth with 20+ traders

## Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 2 | Breaking trader updates | Test each change incrementally | ⏳ |
| 2 | Missing legitimate updates | Comprehensive equality checks | ⏳ |
| 3 | Differential logic bugs | Extensive logging and testing | ⏳ |
| 3 | Worker message ordering | Atomic operations, sequence tracking | ⏳ |
| 4 | Performance overhead from metrics | Conditional debug mode | ⏳ |

## Time Estimate
- Phase 2: 1.5 hours
- Phase 3: 2 hours  
- Phase 4: 45 minutes
- Buffer: 30 minutes
- **Total: 4.25 hours**

## Next Actions
Immediate steps to begin Phase 2:
1. Create `apps/app/src/utils/traderEquality.ts`
2. Implement equality functions
3. Test with sample trader objects
4. Begin Chunk 2.2 - App.tsx modifications

## Implementation Notes
- **Phase 1 Complete**: Worker deduplication reduced growth to ~2 MB/s
- **Root Cause**: TraderManager notifies on every small change
- **Key Insight**: Most "updates" are identical data
- **Approach**: Prevent updates at multiple levels (React, Worker, Messages)
- **Testing**: Use console logs extensively before removing

## Command Reference
```bash
# Build and test
pnpm build
pnpm dev

# Git commands for checkpoints
git add -A
git commit -m "feat: [description]"
git diff HEAD~1  # Review changes

# Memory profiling
# Chrome: DevTools > Memory > Take Heap Snapshot
# Firefox: about:memory

# Debug mode
localStorage.setItem('DEBUG_WORKERS', 'true')
localStorage.removeItem('DEBUG_WORKERS')
```

This plan systematically addresses the root cause while maintaining safety and testability at each step.