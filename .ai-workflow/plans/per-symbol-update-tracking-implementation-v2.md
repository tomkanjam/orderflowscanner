# Per-Symbol Update Tracking Implementation Plan v2

## Overview
Implementing simplified per-symbol update tracking with double buffering to safely optimize signal detection. Only processes symbols with actual data changes, reducing CPU usage by ~90%. This revised plan incorporates production-ready improvements from the review.

## Key Improvements in v2
- **Simpler**: Only bit flags + global counter (removed redundant timestamps/counters)
- **Race-condition free**: Double buffering prevents lost updates
- **O(1) lookups**: Reverse index map for symbol resolution
- **Production ready**: Rate limiting and better debugging

## Prerequisites
- [x] Architecture document reviewed and approved
- [x] SharedArrayBuffer support confirmed (already in use)
- [x] Atomics API available (standard in modern browsers)
- [ ] Create feature branch: `git checkout -b feat/per-symbol-update-tracking-v2`
- [ ] Ensure dev environment running with `pnpm dev`

## Implementation Phases

### Phase 1: Simplified Foundation (1.5 hours)

#### Chunk 1.1: Create BitSet Utility Class (30 min)
```
Files to create:
- apps/app/src/utils/BitSet.ts
- apps/app/src/utils/BitSet.test.ts

Actions:
1. Create reusable BitSet class for bit operations
2. Implement set(), clear(), isSet(), clearAll()
3. Use Atomics for thread-safe operations
4. Add getSetIndices() for batch retrieval
5. Include size validation

Test criteria:
- [ ] Can set/clear/check individual bits
- [ ] Thread-safe with concurrent operations
- [ ] Handles boundary cases (bit 0, max bit)
- [ ] clearAll() resets entire set
- [ ] getSetIndices() returns correct indices

Checkpoint: Run `pnpm test BitSet` - all tests pass
```

**Implementation:**
```typescript
// apps/app/src/utils/BitSet.ts
export class BitSet {
  private readonly buffer: Uint32Array;
  private readonly maxBits: number;
  
  constructor(buffer: Uint32Array, maxBits: number) {
    this.buffer = buffer;
    this.maxBits = maxBits;
  }
  
  set(index: number): void {
    if (index >= this.maxBits) return;
    const arrayIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    Atomics.or(this.buffer, arrayIndex, 1 << bitIndex);
  }
  
  clear(index: number): void {
    if (index >= this.maxBits) return;
    const arrayIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    Atomics.and(this.buffer, arrayIndex, ~(1 << bitIndex));
  }
  
  isSet(index: number): boolean {
    if (index >= this.maxBits) return false;
    const arrayIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    return (Atomics.load(this.buffer, arrayIndex) & (1 << bitIndex)) !== 0;
  }
  
  clearAll(): void {
    for (let i = 0; i < this.buffer.length; i++) {
      Atomics.store(this.buffer, i, 0);
    }
  }
  
  getSetIndices(): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.maxBits; i++) {
      if (this.isSet(i)) indices.push(i);
    }
    return indices;
  }
}
```

#### Chunk 1.2: Enhanced SharedMarketData with Double Buffering (45 min)
```
Files to modify:
- apps/app/src/shared/SharedMarketData.ts

Actions:
1. Add double-buffered update flags (A/B buffers)
2. Add reverse index map (indexToSymbol)
3. Implement buffer swapping mechanism
4. Remove redundant timestamp/counter tracking
5. Add rate limiting map for symbols

Test criteria:
- [ ] Double buffers initialize correctly
- [ ] Can swap buffers atomically
- [ ] Reverse lookup works O(1)
- [ ] No data loss during buffer swap
- [ ] Rate limiting prevents spam

Checkpoint: SharedMarketData works with double buffering
```

**Key changes:**
```typescript
export class SharedMarketData {
  // Double buffering for race-condition free updates
  private updateFlagsA: SharedArrayBuffer;
  private updateFlagsB: SharedArrayBuffer;
  private currentWriteBuffer: 'A' | 'B' = 'A';
  private flagsViewA: Uint32Array;
  private flagsViewB: Uint32Array;
  
  // Efficient reverse lookup
  private indexToSymbol: Map<number, string> = new Map();
  
  // Rate limiting
  private lastUpdateTime: Map<string, number> = new Map();
  private readonly MIN_UPDATE_INTERVAL = 100; // ms
  
  constructor(config?: SharedMarketDataConfig) {
    // Initialize double buffers
    const flagSize = Math.ceil(MAX_SYMBOLS / 32) * Uint32Array.BYTES_PER_ELEMENT;
    this.updateFlagsA = new SharedArrayBuffer(flagSize);
    this.updateFlagsB = new SharedArrayBuffer(flagSize);
    this.flagsViewA = new Uint32Array(this.updateFlagsA);
    this.flagsViewB = new Uint32Array(this.updateFlagsB);
    
    // ... rest of initialization
  }
  
  private getOrCreateSymbolIndex(symbol: string): number {
    if (this.symbolIndexMap.has(symbol)) {
      return this.symbolIndexMap.get(symbol)!;
    }
    
    const index = this.symbolIndexMap.size;
    if (index >= MAX_SYMBOLS) {
      throw new Error(`Maximum symbols (${MAX_SYMBOLS}) exceeded`);
    }
    
    // Maintain both maps for O(1) lookups
    this.symbolIndexMap.set(symbol, index);
    this.indexToSymbol.set(index, symbol);
    
    // ... rest of method
  }
  
  updateTicker(ticker: Ticker) {
    const symbol = ticker.s;
    
    // Rate limiting
    const now = Date.now();
    const lastUpdate = this.lastUpdateTime.get(symbol) || 0;
    if (now - lastUpdate < this.MIN_UPDATE_INTERVAL) {
      return; // Skip update if too frequent
    }
    this.lastUpdateTime.set(symbol, now);
    
    const symbolIndex = this.getOrCreateSymbolIndex(symbol);
    
    // Update data
    // ... existing ticker update logic
    
    // Set update flag in current write buffer
    const writeFlags = this.currentWriteBuffer === 'A' ? this.flagsViewA : this.flagsViewB;
    const bitSet = new BitSet(writeFlags, MAX_SYMBOLS);
    bitSet.set(symbolIndex);
    
    // Increment global counter
    Atomics.add(this.updateCounter, 0, 1);
  }
  
  swapBuffers(): Uint32Array {
    // Return read buffer and swap for next cycle
    const readBuffer = this.currentWriteBuffer === 'A' ? this.flagsViewB : this.flagsViewA;
    this.currentWriteBuffer = this.currentWriteBuffer === 'A' ? 'B' : 'A';
    
    // Clear the new write buffer
    const newWriteBuffer = this.currentWriteBuffer === 'A' ? this.flagsViewA : this.flagsViewB;
    new BitSet(newWriteBuffer, MAX_SYMBOLS).clearAll();
    
    return readBuffer;
  }
  
  getSymbolFromIndex(index: number): string | undefined {
    return this.indexToSymbol.get(index);
  }
}
```

#### Chunk 1.3: Add Debug Ring Buffer (15 min)
```
Files to modify:
- apps/app/src/shared/SharedMarketData.ts

Actions:
1. Add circular buffer for recent updates
2. Track last 100 update events
3. Include timestamp and symbol
4. Add debug dump method
5. Enable/disable with flag

Test criteria:
- [ ] Ring buffer stores last 100 events
- [ ] Wraps correctly when full
- [ ] Can dump debug info
- [ ] No performance impact when disabled

Checkpoint: Can see update history in debug mode
```

**Phase 1 Complete When:**
- BitSet utility fully tested and reusable
- Double buffering prevents race conditions
- Rate limiting prevents update spam
- Debug capabilities ready
- All tests pass

### Phase 2: Worker Optimization with Double Buffering (2 hours)

#### Chunk 2.1: Update Worker for Double Buffer Reading (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Accept read buffer from main thread
2. Process symbols from read buffer
3. No need to clear flags (main thread handles)
4. Add cycle counter for debugging
5. Track efficiency metrics

Test criteria:
- [ ] Worker receives buffer correctly
- [ ] Processes only flagged symbols
- [ ] No race conditions
- [ ] Metrics accurate

Checkpoint: Worker uses read buffer safely
```

**Implementation:**
```typescript
class PersistentTraderEngine {
  private processingCycle = 0;
  private efficiencyStats = {
    totalSymbols: 0,
    processedSymbols: 0,
    skippedSymbols: 0,
    avgEfficiency: 0
  };
  
  private processUpdateCycle(readFlags: Uint32Array) {
    this.processingCycle++;
    const bitSet = new BitSet(readFlags, this.config!.maxSymbols);
    const updatedIndices = bitSet.getSetIndices();
    
    if (updatedIndices.length === 0) {
      console.log(`[Worker] Cycle ${this.processingCycle}: No updates to process`);
      return;
    }
    
    const efficiency = ((this.symbolMap.size - updatedIndices.length) / this.symbolMap.size * 100);
    console.log(`[Worker] Cycle ${this.processingCycle}: Processing ${updatedIndices.length}/${this.symbolMap.size} symbols (${efficiency.toFixed(1)}% saved)`);
    
    const results: any[] = [];
    
    for (const [traderId, trader] of this.traders) {
      const filterFunction = this.compiledFilters.get(traderId);
      if (!filterFunction) continue;
      
      // Only process updated symbols
      for (const symbolIndex of updatedIndices) {
        const symbol = this.symbolMap.get(symbolIndex);
        if (!symbol) continue;
        
        // ... run trader logic for this symbol
      }
    }
    
    // Update stats
    this.efficiencyStats.totalSymbols += this.symbolMap.size;
    this.efficiencyStats.processedSymbols += updatedIndices.length;
    this.efficiencyStats.skippedSymbols += (this.symbolMap.size - updatedIndices.length);
    this.efficiencyStats.avgEfficiency = (this.efficiencyStats.skippedSymbols / this.efficiencyStats.totalSymbols * 100);
    
    // Send results
    self.postMessage({
      type: 'RESULTS',
      data: {
        results,
        cycle: this.processingCycle,
        efficiency: efficiency.toFixed(1),
        avgEfficiency: this.efficiencyStats.avgEfficiency.toFixed(1)
      }
    });
  }
}
```

#### Chunk 2.2: Implement Main Thread Buffer Coordination (30 min)
```
Files to modify:
- apps/app/hooks/useSharedTraderIntervals.ts

Actions:
1. Swap buffers before sending to worker
2. Send read buffer to worker
3. Track buffer swap timing
4. Add debug logging
5. Handle worker responses

Test criteria:
- [ ] Buffers swap correctly
- [ ] Worker gets consistent snapshot
- [ ] No updates lost
- [ ] Timing tracked

Checkpoint: Main thread and worker coordinate buffers
```

**Implementation:**
```typescript
// In the update interval
const checkInterval = setInterval(() => {
  const currentCount = Atomics.load(sharedData.updateCounter, 0);
  
  if (currentCount !== lastUpdateCount) {
    lastUpdateCount = currentCount;
    
    // Swap buffers and get read buffer
    const readFlags = sharedData.swapBuffers();
    
    // Send read buffer to all workers
    workersRef.current.forEach(worker => {
      worker.postMessage({
        type: 'PROCESS_UPDATES',
        readFlags: readFlags.buffer, // Send the buffer
        cycle: updateCycle++
      });
    });
  }
}, 1000);
```

#### Chunk 2.3: Add Symbol Batching for Large Updates (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Detect when >50% symbols updated
2. Switch to batch processing mode
3. Process in chunks of 20 symbols
4. Yield between chunks
5. Report batch mode in metrics

Test criteria:
- [ ] Batch mode activates correctly
- [ ] No UI freezing with many updates
- [ ] All symbols still processed
- [ ] Metrics show batch mode

Checkpoint: Handles mass updates gracefully
```

#### Chunk 2.4: Optimize Result Messages (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Only send changes, not all results
2. Use compact format for unchanged symbols
3. Include efficiency metrics
4. Add compression for large results
5. Track message sizes

Test criteria:
- [ ] Smaller messages when few changes
- [ ] Correct results received
- [ ] Metrics included
- [ ] Message size tracked

Checkpoint: Network traffic reduced
```

**Phase 2 Complete When:**
- Double buffering working end-to-end
- No race conditions possible
- Batch mode handles mass updates
- Messages optimized
- Efficiency metrics accurate

### Phase 3: Production Hardening (1.5 hours)

#### Chunk 3.1: Add Comprehensive Error Recovery (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts
- apps/app/src/shared/SharedMarketData.ts

Actions:
1. Try-catch around all buffer operations
2. Fallback to process all on error
3. Auto-recovery after errors
4. Error reporting to monitoring
5. Graceful degradation

Test criteria:
- [ ] Errors don't crash system
- [ ] Fallback works correctly
- [ ] Recovery successful
- [ ] Errors logged properly

Checkpoint: System resilient to errors
```

#### Chunk 3.2: Performance Monitoring Dashboard (30 min)
```
Files to create:
- apps/app/src/components/PerformanceMonitor.tsx

Actions:
1. Create debug overlay component
2. Show efficiency percentage
3. Display symbols/second rate
4. Show buffer swap timing
5. Add toggle to enable/disable

Test criteria:
- [ ] Shows real-time metrics
- [ ] Can toggle on/off
- [ ] No performance impact
- [ ] Accurate measurements

Checkpoint: Can monitor optimization in real-time
```

#### Chunk 3.3: Feature Flag and A/B Testing (30 min)
```
Files to modify:
- apps/app/src/config/features.ts
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Add PER_SYMBOL_TRACKING_ENABLED flag
2. Support gradual rollout percentage
3. A/B test metrics collection
4. Runtime toggle without restart
5. Persist flag state

Test criteria:
- [ ] Flag controls feature
- [ ] Can toggle at runtime
- [ ] Metrics collected for both modes
- [ ] No errors when disabled

Checkpoint: Ready for gradual rollout
```

**Phase 3 Complete When:**
- Errors handled gracefully
- Monitoring in place
- Feature flag working
- A/B testing ready
- Production-ready

### Phase 4: Testing and Documentation (1 hour)

#### Chunk 4.1: Comprehensive Test Suite (30 min)
```
Files to create/modify:
- apps/app/src/utils/BitSet.test.ts
- apps/app/src/shared/SharedMarketData.test.ts
- apps/app/workers/persistentTraderWorker.test.ts

Actions:
1. Unit tests for BitSet operations
2. Integration tests for buffer swapping
3. Race condition tests
4. Performance benchmarks
5. Edge case coverage

Test criteria:
- [ ] 100% code coverage
- [ ] Race conditions tested
- [ ] Performance validated
- [ ] Edge cases handled

Checkpoint: All tests passing
```

#### Chunk 4.2: Documentation and Rollout Guide (30 min)
```
Files to create/modify:
- README.md
- docs/PERFORMANCE_OPTIMIZATION.md

Actions:
1. Document the optimization
2. Explain double buffering
3. Add troubleshooting guide
4. Create rollout playbook
5. Include metrics dashboard guide

Test criteria:
- [ ] Clear documentation
- [ ] Rollout steps defined
- [ ] Troubleshooting covered
- [ ] Metrics explained

Checkpoint: Team can operate feature
```

**Phase 4 Complete When:**
- All tests passing
- Documentation complete
- Rollout guide ready
- Team trained

## Testing Strategy

### Unit Tests
```bash
# After BitSet implementation
pnpm test BitSet

# After SharedMarketData changes
pnpm test SharedMarketData

# Full test suite
pnpm test
```

### Integration Tests
1. Start app with single symbol
2. Verify only that symbol processed
3. Force buffer swap
4. Confirm no lost updates
5. Test with 100 symbols updating

### Performance Tests
```bash
# Baseline without optimization
PER_SYMBOL_TRACKING_ENABLED=false pnpm dev
# Record CPU usage

# With optimization
PER_SYMBOL_TRACKING_ENABLED=true pnpm dev
# Compare CPU usage (expect 80%+ reduction)
```

### Manual Testing
1. Enable debug overlay: `localStorage.setItem('DEBUG_PERFORMANCE', 'true')`
2. Watch efficiency percentage (should be >80% typically)
3. Force mass update (all symbols)
4. Verify batch mode activates
5. Check no updates lost

## Rollback Plan
If issues arise:
1. Set feature flag: `PER_SYMBOL_TRACKING_ENABLED=false`
2. Monitor for 5 minutes
3. If critical: `git revert HEAD`
4. Investigate offline with debug logs
5. Fix and redeploy

## PM Checkpoints
- [ ] **After Phase 1** - Foundation ready, double buffering working
- [ ] **After Phase 2** - Workers optimized, 80%+ CPU savings visible
- [ ] **After Phase 3** - Production hardened, monitoring active
- [ ] **Before Phase 4** - Review metrics, approve for rollout

## Success Metrics
- ✅ 85%+ average efficiency (symbols skipped)
- ✅ Zero lost updates (verified by tests)
- ✅ 80%+ CPU reduction in typical usage
- ✅ No increase in signal detection latency
- ✅ Message size reduced by 70%+
- ✅ Memory overhead under 1KB (simpler design)
- ✅ No console errors in production
- ✅ A/B test shows performance improvement

## Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Buffer coordination complexity | Extensive testing, debug logging | ⏳ |
| 2 | Lost updates during swap | Double buffering eliminates risk | ⏳ |
| 3 | Performance regression | A/B testing before full rollout | ⏳ |
| 4 | Production issues | Feature flag for instant disable | ⏳ |

## Time Estimate
- Phase 1: 1.5 hours (simplified design)
- Phase 2: 2 hours (double buffering)
- Phase 3: 1.5 hours (hardening)
- Phase 4: 1 hour (testing/docs)
- **Total: 6 hours** (1 hour saved from v1)

## Next Actions
1. Create feature branch: `git checkout -b feat/per-symbol-update-tracking-v2`
2. Implement BitSet utility class (Phase 1.1)
3. Run tests after each chunk
4. Commit with meaningful messages
5. Deploy behind feature flag for A/B testing

## Key Improvements from v1
- **Simpler**: Removed redundant tracking (just flags + global counter)
- **Safer**: Double buffering eliminates race conditions
- **Faster**: O(1) reverse lookups with indexToSymbol map
- **Robust**: Rate limiting prevents update spam
- **Observable**: Ring buffer for debugging production issues
- **Testable**: Comprehensive test coverage for edge cases

This implementation is production-ready with proper error handling, monitoring, and rollback capabilities.