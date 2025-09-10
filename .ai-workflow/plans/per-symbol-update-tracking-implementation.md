# Per-Symbol Update Tracking Implementation Plan

## Overview
Implementing per-symbol update tracking to optimize signal detection by only processing symbols with actual data changes. Currently processing ALL symbols when ANY update occurs, wasting ~90% CPU. This plan implements the architecture from `per-symbol-update-tracking-20250109.md`.

## Prerequisites
- [x] Architecture document reviewed and approved
- [x] SharedArrayBuffer support confirmed (already in use)
- [x] Atomics API available (standard in modern browsers)
- [ ] Create feature branch: `git checkout -b feat/per-symbol-update-tracking`
- [ ] Ensure dev environment running with `pnpm dev`

## Implementation Phases

### Phase 1: Foundation - Symbol Update Utilities (2 hours)

#### Chunk 1.1: Create Symbol Update Utilities (30 min)
```
Files to create:
- apps/app/src/utils/symbolUpdateUtils.ts
- apps/app/src/utils/symbolUpdateUtils.test.ts

Actions:
1. Create SymbolUpdateUtils class with static methods
2. Implement setUpdateFlag() with atomic operations
3. Implement clearUpdateFlag() with atomic operations
4. Implement hasUpdate() check method
5. Implement getUpdatedSymbols() to return all updated indices

Test criteria:
- [ ] Can set flag for symbol index 0
- [ ] Can set flag for symbol index 199
- [ ] Can clear individual flags
- [ ] Can get list of all updated symbols
- [ ] Atomic operations work correctly

Checkpoint: Run `pnpm test symbolUpdateUtils` - all tests pass
```

**Implementation:**
```typescript
// apps/app/src/utils/symbolUpdateUtils.ts
export class SymbolUpdateUtils {
  static setUpdateFlag(flags: Uint32Array, symbolIndex: number): void {
    const arrayIndex = Math.floor(symbolIndex / 32);
    const bitIndex = symbolIndex % 32;
    const mask = 1 << bitIndex;
    Atomics.or(flags, arrayIndex, mask);
  }
  
  static clearUpdateFlag(flags: Uint32Array, symbolIndex: number): void {
    const arrayIndex = Math.floor(symbolIndex / 32);
    const bitIndex = symbolIndex % 32;
    const mask = ~(1 << bitIndex);
    Atomics.and(flags, arrayIndex, mask);
  }
  
  static hasUpdate(flags: Uint32Array, symbolIndex: number): boolean {
    const arrayIndex = Math.floor(symbolIndex / 32);
    const bitIndex = symbolIndex % 32;
    const mask = 1 << bitIndex;
    return (Atomics.load(flags, arrayIndex) & mask) !== 0;
  }
  
  static getUpdatedSymbols(flags: Uint32Array, maxSymbols: number): number[] {
    const updated: number[] = [];
    for (let i = 0; i < maxSymbols; i++) {
      if (this.hasUpdate(flags, i)) {
        updated.push(i);
      }
    }
    return updated;
  }
  
  static clearAllFlags(flags: Uint32Array): void {
    for (let i = 0; i < flags.length; i++) {
      Atomics.store(flags, i, 0);
    }
  }
}
```

#### Chunk 1.2: Enhance SharedMarketData with Symbol Tracking (45 min)
```
Files to modify:
- apps/app/src/shared/SharedMarketData.ts

Actions:
1. Add symbolUpdateBuffer to constructor
2. Create Uint32Array views for update flags
3. Create Float64Array view for timestamps
4. Add to getSharedBuffers() return value
5. Modify updateTicker() to set symbol flag
6. Modify updateKlines() to set symbol flag
7. Add getUpdatedSymbols() method
8. Add clearSymbolUpdateFlags() method

Test criteria:
- [ ] SharedMarketData initializes with new buffer
- [ ] updateTicker() sets correct flag
- [ ] updateKlines() sets correct flag
- [ ] getUpdatedSymbols() returns correct symbols
- [ ] Existing functionality still works

Checkpoint: Run app with `pnpm dev`, verify no console errors
```

**Key changes:**
```typescript
// In constructor
const SYMBOL_UPDATE_FLAGS_SIZE = Math.ceil(MAX_SYMBOLS / 32);
this.symbolUpdateBuffer = new SharedArrayBuffer(
  SYMBOL_UPDATE_FLAGS_SIZE * Uint32Array.BYTES_PER_ELEMENT +
  MAX_SYMBOLS * Float64Array.BYTES_PER_ELEMENT
);
this.symbolUpdateFlags = new Uint32Array(
  this.symbolUpdateBuffer, 
  0, 
  SYMBOL_UPDATE_FLAGS_SIZE
);
this.symbolUpdateTimestamps = new Float64Array(
  this.symbolUpdateBuffer,
  SYMBOL_UPDATE_FLAGS_SIZE * Uint32Array.BYTES_PER_ELEMENT,
  MAX_SYMBOLS
);

// In updateTicker()
SymbolUpdateUtils.setUpdateFlag(this.symbolUpdateFlags, symbolIndex);
this.symbolUpdateTimestamps[symbolIndex] = Date.now();

// In updateKlines()
SymbolUpdateUtils.setUpdateFlag(this.symbolUpdateFlags, symbolIndex);
this.symbolUpdateTimestamps[symbolIndex] = Date.now();
```

#### Chunk 1.3: Add Debug Logging (15 min)
```
Files to modify:
- apps/app/src/shared/SharedMarketData.ts

Actions:
1. Add DEBUG flag for symbol update tracking
2. Add logging in updateTicker() when flag is set
3. Add logging in updateKlines() when flag is set
4. Add summary log in getUpdatedSymbols()

Test criteria:
- [ ] Can toggle DEBUG flag
- [ ] Logs show which symbols are updated
- [ ] Logs show count of updated symbols

Checkpoint: See debug logs in console when DEBUG=true
```

**Phase 1 Complete When:**
- Symbol update utilities fully tested
- SharedMarketData tracks updates per symbol
- Debug logging confirms tracking works
- No impact on existing functionality
- All tests pass

### Phase 2: Worker Optimization (2.5 hours)

#### Chunk 2.1: Update Worker Data Structures (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Add symbolUpdateFlags view to worker
2. Add lastProcessedSymbols Set to track processed symbols
3. Initialize views from shared buffers in INIT handler
4. Add getUpdatedSymbols() helper method
5. Add debug logging for symbol tracking

Test criteria:
- [ ] Worker initializes with symbol update buffer
- [ ] Can read symbol update flags
- [ ] getUpdatedSymbols() returns correct indices

Checkpoint: Worker starts without errors
```

**Implementation:**
```typescript
// Add to PersistentTraderEngine class
private symbolUpdateFlags: Uint32Array | null = null;
private lastProcessedSymbols = new Set<number>();
private symbolUpdateStats = {
  totalChecks: 0,
  symbolsProcessed: 0,
  symbolsSkipped: 0
};

// In INIT handler
this.symbolUpdateFlags = new Uint32Array(data.symbolUpdateBuffer);

// Add method
private getUpdatedSymbols(): number[] {
  if (!this.symbolUpdateFlags || !this.config) return [];
  return SymbolUpdateUtils.getUpdatedSymbols(
    this.symbolUpdateFlags, 
    this.config.maxSymbols
  );
}
```

#### Chunk 2.2: Implement Selective Symbol Processing (45 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Modify runAllTraders() to check for updated symbols
2. Only iterate through updated symbol indices
3. Clear flags after processing each symbol
4. Update statistics for monitoring
5. Add fallback to process all if no tracking available

Test criteria:
- [ ] Only updated symbols are processed
- [ ] Flags are cleared after processing
- [ ] Statistics show efficiency gains
- [ ] Fallback works if tracking unavailable

Checkpoint: Console shows "Processing X/100 updated symbols"
```

**Implementation:**
```typescript
private runAllTraders() {
  const startTime = performance.now();
  const results: any[] = [];
  
  // Get updated symbols
  const updatedSymbolIndices = this.getUpdatedSymbols();
  
  if (updatedSymbolIndices.length === 0) {
    // No updates, skip processing
    return;
  }
  
  console.log(`[Worker] Processing ${updatedSymbolIndices.length}/${this.symbolMap.size} updated symbols`);
  
  for (const [traderId, trader] of this.traders) {
    const filterFunction = this.compiledFilters.get(traderId);
    if (!filterFunction) continue;
    
    // Only process updated symbols
    for (const symbolIndex of updatedSymbolIndices) {
      const symbol = this.symbolMap.get(symbolIndex);
      if (!symbol) continue;
      
      // Run trader for this symbol
      // ... existing logic ...
    }
  }
  
  // Clear processed flags
  for (const symbolIndex of updatedSymbolIndices) {
    SymbolUpdateUtils.clearUpdateFlag(this.symbolUpdateFlags!, symbolIndex);
  }
  
  // Update stats
  this.symbolUpdateStats.totalChecks++;
  this.symbolUpdateStats.symbolsProcessed += updatedSymbolIndices.length;
  this.symbolUpdateStats.symbolsSkipped += (this.symbolMap.size - updatedSymbolIndices.length);
  
  const executionTime = performance.now() - startTime;
  const efficiency = ((this.symbolMap.size - updatedSymbolIndices.length) / this.symbolMap.size * 100).toFixed(1);
  console.log(`[Worker] Execution: ${executionTime.toFixed(2)}ms, CPU saved: ${efficiency}%`);
}
```

#### Chunk 2.3: Add Performance Monitoring (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Add performance metrics collection
2. Track symbols processed vs skipped
3. Calculate CPU savings percentage
4. Add periodic stats reporting (every 10 checks)
5. Include in worker status response

Test criteria:
- [ ] Metrics are collected correctly
- [ ] Stats show in console every 10 checks
- [ ] CPU savings percentage is accurate
- [ ] Status includes efficiency metrics

Checkpoint: See efficiency stats: "CPU saved: 85%"
```

#### Chunk 2.4: Optimize Message Passing (45 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Only send results for processed symbols
2. Add metadata about skipped symbols
3. Include efficiency stats in results
4. Reduce message size for unchanged symbols
5. Add compressed result format option

Test criteria:
- [ ] Messages only include updated symbol results
- [ ] Message size reduced when few updates
- [ ] Main thread receives efficiency stats
- [ ] No missing results

Checkpoint: Network tab shows smaller message sizes
```

**Phase 2 Complete When:**
- Workers only process updated symbols
- Flags are properly cleared after processing
- Performance metrics show CPU savings
- Messages are optimized for size
- All existing tests still pass

### Phase 3: Testing and Validation (1.5 hours)

#### Chunk 3.1: Unit Tests for Symbol Updates (30 min)
```
Files to create/modify:
- apps/app/src/utils/symbolUpdateUtils.test.ts

Actions:
1. Test flag setting for various symbol indices
2. Test flag clearing
3. Test concurrent flag operations
4. Test boundary conditions (index 0, 199)
5. Test getUpdatedSymbols with various patterns

Test command:
pnpm test symbolUpdateUtils

Test criteria:
- [ ] All edge cases covered
- [ ] Atomic operations verified
- [ ] 100% code coverage

Checkpoint: All unit tests pass
```

#### Chunk 3.2: Integration Testing (30 min)
```
Files to create:
- apps/app/src/shared/SharedMarketData.test.ts

Actions:
1. Test update tracking with real market data
2. Verify flags set on ticker updates
3. Verify flags set on kline updates
4. Test clearing flags
5. Test with rapid updates to same symbol

Test criteria:
- [ ] Tracking works with real data flow
- [ ] No race conditions
- [ ] Flags properly managed

Checkpoint: Integration tests pass
```

#### Chunk 3.3: Performance Benchmarking (30 min)
```
Actions:
1. Create benchmark script
2. Measure baseline (process all symbols)
3. Measure optimized (process only updated)
4. Calculate CPU savings
5. Document results

Test criteria:
- [ ] 80%+ reduction in filter executions
- [ ] 50%+ reduction in CPU usage
- [ ] No increase in latency
- [ ] Memory overhead < 5KB

Checkpoint: Benchmark shows expected improvements
```

**Phase 3 Complete When:**
- All unit tests pass
- Integration tests verify correctness
- Performance benchmarks meet targets
- No regressions in existing functionality

### Phase 4: Production Readiness (1 hour)

#### Chunk 4.1: Add Feature Flag (20 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts
- apps/app/src/shared/SharedMarketData.ts

Actions:
1. Add USE_SYMBOL_UPDATE_TRACKING flag
2. Conditionally enable tracking
3. Add runtime toggle capability
4. Default to enabled
5. Add flag to worker config

Test criteria:
- [ ] Can toggle feature on/off
- [ ] Works correctly when disabled
- [ ] No errors in either mode

Checkpoint: Feature flag controls behavior
```

#### Chunk 4.2: Error Handling and Fallbacks (20 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Add try-catch around flag operations
2. Fallback to processing all symbols on error
3. Log errors but don't crash
4. Add recovery mechanism
5. Test with corrupted flags

Test criteria:
- [ ] Graceful degradation on errors
- [ ] Fallback works correctly
- [ ] Errors are logged
- [ ] System remains stable

Checkpoint: System handles errors gracefully
```

#### Chunk 4.3: Documentation and Monitoring (20 min)
```
Files to create/modify:
- README.md (add performance section)
- apps/app/src/utils/symbolUpdateUtils.ts (add JSDoc)

Actions:
1. Document the optimization
2. Add performance metrics to README
3. Create monitoring dashboard config
4. Add debug commands
5. Document feature flag

Test criteria:
- [ ] Documentation is clear
- [ ] Metrics are visible
- [ ] Debug tools work

Checkpoint: Documentation complete
```

**Phase 4 Complete When:**
- Feature flag enables safe rollout
- Error handling prevents crashes
- Documentation helps future maintenance
- Monitoring shows improvements

## Testing Strategy

### Unit Tests
```bash
# After each utility change
pnpm test symbolUpdateUtils

# After SharedMarketData changes
pnpm test SharedMarketData

# Full test suite
pnpm test
```

### Integration Tests
1. Start the app: `pnpm dev`
2. Open browser console
3. Enable debug: `localStorage.setItem('DEBUG_SYMBOL_UPDATES', 'true')`
4. Watch for "Processing X/100 updated symbols" logs
5. Verify CPU usage reduction in Task Manager/Activity Monitor

### Manual Testing
1. Start app with single symbol updating
2. Verify only that symbol is processed
3. Add more symbols gradually
4. Confirm efficiency scales correctly
5. Test with all symbols updating (worst case)

## Rollback Plan
If issues arise:
1. Set feature flag to false: `USE_SYMBOL_UPDATE_TRACKING = false`
2. If critical: `git revert HEAD`
3. Redeploy without optimization
4. Investigate issues offline
5. Fix and re-deploy when ready

## PM Checkpoints
- [ ] **After Phase 1** - Foundation ready, no visible changes
- [ ] **After Phase 2** - Workers optimized, see CPU reduction
- [ ] **After Phase 3** - All tests passing, metrics documented
- [ ] **Before Phase 4** - Confirm feature flag approach

## Success Metrics
- ✅ 80%+ reduction in unnecessary filter executions
- ✅ 50%+ reduction in worker CPU usage
- ✅ Console shows "CPU saved: X%" with X > 80
- ✅ No increase in signal detection latency
- ✅ All existing tests continue to pass
- ✅ Memory overhead under 5KB
- ✅ No console errors in production mode

## Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Breaking SharedArrayBuffer setup | Test thoroughly before proceeding | ⏳ |
| 2 | Missing symbol updates | Keep global counter as backup | ⏳ |
| 3 | Performance regression | Benchmark before/after each change | ⏳ |
| 4 | Production instability | Feature flag for quick disable | ⏳ |

## Time Estimate
- Phase 1: 2 hours
- Phase 2: 2.5 hours
- Phase 3: 1.5 hours
- Phase 4: 1 hour
- **Total: 7 hours**

## Next Actions
1. Create feature branch: `git checkout -b feat/per-symbol-update-tracking`
2. Start with Phase 1, Chunk 1.1 - Create symbolUpdateUtils.ts
3. Run tests after each chunk
4. Commit after each successful chunk
5. Push branch and create PR after Phase 2

## Notes
- Keep global update counter for backward compatibility
- Clear flags immediately after processing for correctness
- Use atomic operations exclusively for thread safety
- Monitor performance metrics in production
- Consider extending to per-interval tracking in future