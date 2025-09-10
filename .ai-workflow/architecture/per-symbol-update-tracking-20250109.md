# Per-Symbol Update Tracking Architecture

## Executive Summary

Current signal detection runs ALL trader filters against ALL symbols whenever ANY data changes, wasting CPU cycles on unchanged symbols. This architecture introduces per-symbol update tracking to only process symbols with actual kline changes, reducing unnecessary computations by ~90% in typical scenarios.

## System Design

### Data Models

```typescript
// Symbol update tracking in shared memory
interface SymbolUpdateTracker {
  // Bit flags for each symbol indicating if it has updates
  updateFlags: Uint32Array; // Each bit represents a symbol (200 symbols = 7 uint32s)
  
  // Last update timestamp per symbol (for debugging/monitoring)
  lastUpdateTimestamps: Float64Array; // [symbolIndex] = timestamp
  
  // Update counter per symbol (for change detection)
  updateCounters: Uint32Array; // [symbolIndex] = counter
}

// Worker-side tracking
interface WorkerSymbolState {
  lastProcessedCounter: Map<number, number>; // symbolIndex -> last processed counter
  pendingSymbols: Set<number>; // Symbol indices with pending updates
}

// Enhanced shared buffers
interface EnhancedSharedBuffers {
  tickerBuffer: SharedArrayBuffer;
  klineBuffer: SharedArrayBuffer;
  metadataBuffer: SharedArrayBuffer;
  updateCounterBuffer: SharedArrayBuffer; // Global counter (existing)
  symbolUpdateBuffer: SharedArrayBuffer; // NEW: Per-symbol tracking
  config: SharedMarketDataConfig & {
    symbolUpdateSize: number; // Size of symbol update tracking arrays
  };
}
```

### Component Architecture

#### Modified Components

**SharedMarketData.ts**
- Add `symbolUpdateBuffer: SharedArrayBuffer` for per-symbol tracking
- Create `symbolUpdateFlags: Uint32Array` view for bit flags
- Create `symbolUpdateCounters: Uint32Array` view for per-symbol counters
- Modify `updateTicker()` to set symbol-specific update flag
- Modify `updateKlines()` to set symbol-specific update flag
- Add `clearSymbolUpdateFlag(symbolIndex: number)` method
- Add `getUpdatedSymbols(): number[]` method to return symbols with updates

**persistentTraderWorker.ts**
- Track `lastProcessedCounters: Map<number, number>` per symbol
- Modify `runAllTraders()` to only process updated symbols
- Clear symbol update flags after processing
- Add `getUpdatedSymbols()` method to check which symbols changed

**App.tsx**
- No changes needed - continues to update shared memory as before

### Service Layer

#### New Utilities

**symbolUpdateUtils.ts**
```typescript
/**
 * Utilities for managing per-symbol update tracking
 */
export class SymbolUpdateUtils {
  /**
   * Set update flag for a symbol using atomic operations
   */
  static setUpdateFlag(
    flags: Uint32Array, 
    symbolIndex: number
  ): void {
    const arrayIndex = Math.floor(symbolIndex / 32);
    const bitIndex = symbolIndex % 32;
    const mask = 1 << bitIndex;
    
    // Atomic OR to set the bit
    Atomics.or(flags, arrayIndex, mask);
  }
  
  /**
   * Clear update flag for a symbol
   */
  static clearUpdateFlag(
    flags: Uint32Array,
    symbolIndex: number
  ): void {
    const arrayIndex = Math.floor(symbolIndex / 32);
    const bitIndex = symbolIndex % 32;
    const mask = ~(1 << bitIndex);
    
    // Atomic AND to clear the bit
    Atomics.and(flags, arrayIndex, mask);
  }
  
  /**
   * Check if symbol has updates
   */
  static hasUpdate(
    flags: Uint32Array,
    symbolIndex: number
  ): boolean {
    const arrayIndex = Math.floor(symbolIndex / 32);
    const bitIndex = symbolIndex % 32;
    const mask = 1 << bitIndex;
    
    return (Atomics.load(flags, arrayIndex) & mask) !== 0;
  }
  
  /**
   * Get all symbols with updates
   */
  static getUpdatedSymbols(
    flags: Uint32Array,
    maxSymbols: number
  ): number[] {
    const updated: number[] = [];
    
    for (let i = 0; i < maxSymbols; i++) {
      if (this.hasUpdate(flags, i)) {
        updated.push(i);
      }
    }
    
    return updated;
  }
}
```

### Data Flow

1. **WebSocket receives ticker/kline update** (App.tsx)
   - Updates shared memory via `SharedMarketData.updateTicker()` or `updateKlines()`
   
2. **SharedMarketData marks symbol as updated**
   - Sets bit flag in `symbolUpdateFlags` for the symbol
   - Increments per-symbol counter in `symbolUpdateCounters`
   - Increments global counter (existing behavior)
   
3. **Worker checks for updates** (every 1 second)
   - Reads global counter to detect any changes
   - If changed, calls `getUpdatedSymbols()` to get list of changed symbols
   
4. **Worker processes only updated symbols**
   - Iterates through updated symbol indices
   - Runs trader filters only for those symbols
   - Clears update flags after processing
   
5. **Results sent back to main thread**
   - Only includes results for processed symbols
   - Reduces message size and processing overhead

## Technical Specifications

### Memory Layout

```typescript
// Symbol update buffer layout (per 200 symbols)
const SYMBOL_UPDATE_BUFFER_SIZE = 
  7 * Uint32Array.BYTES_PER_ELEMENT +     // Update flags (200 bits)
  200 * Float64Array.BYTES_PER_ELEMENT +  // Last update timestamps
  200 * Uint32Array.BYTES_PER_ELEMENT;    // Update counters

// Total: ~2KB additional shared memory
```

### API Contracts

```typescript
// Enhanced SharedMarketData methods
class SharedMarketData {
  /**
   * Get symbols that have been updated since last check
   */
  getUpdatedSymbols(): string[] {
    const indices = SymbolUpdateUtils.getUpdatedSymbols(
      this.symbolUpdateFlags,
      this.symbolIndexMap.size
    );
    
    return indices.map(idx => {
      // Reverse lookup symbol from index
      for (const [symbol, index] of this.symbolIndexMap) {
        if (index === idx) return symbol;
      }
      return '';
    }).filter(s => s !== '');
  }
  
  /**
   * Clear update flags for processed symbols
   */
  clearUpdateFlags(symbolIndices: number[]): void {
    for (const idx of symbolIndices) {
      SymbolUpdateUtils.clearUpdateFlag(this.symbolUpdateFlags, idx);
    }
  }
}
```

## Non-Functional Requirements

### Performance

**Expected Improvements:**
- 90% reduction in filter executions (only 10% of symbols typically change per second)
- 85% reduction in worker CPU usage
- 50% reduction in main thread message processing
- Near-zero overhead for update tracking (atomic operations)

**Benchmarks:**
- Update flag setting: < 1 microsecond
- Getting updated symbols: < 10 microseconds for 200 symbols
- Memory overhead: 2KB per shared data instance

### Scalability

- Supports up to 200 symbols with current bit array size
- Easily extendable to more symbols by increasing array size
- No performance degradation with number of traders
- Linear scaling with number of updated symbols

### Backward Compatibility

- Maintains existing global counter for compatibility
- No changes to external APIs or message formats
- Graceful fallback to processing all symbols if needed
- No impact on existing trader filter code

## Implementation Guidelines

### Code Organization

```
src/
  shared/
    SharedMarketData.ts          # Modified with per-symbol tracking
    symbolUpdateUtils.ts         # New utility class
  
  workers/
    persistentTraderWorker.ts    # Modified to use per-symbol updates
  
  utils/
    symbolUpdateUtils.test.ts    # Unit tests for update utilities
```

### Design Patterns

**Atomic Operations Pattern**
- Use `Atomics.or()` for setting flags (thread-safe)
- Use `Atomics.and()` for clearing flags
- Use `Atomics.load()` for reading flags
- Ensures consistency across threads without locks

**Bit Manipulation Pattern**
- Pack 32 symbol flags per Uint32 for memory efficiency
- Use bitwise operations for fast flag manipulation
- Clear pattern for index-to-bit mapping

### Testing Strategy

**Unit Tests:**
- Test bit flag operations with edge cases
- Verify atomic operations work correctly
- Test symbol index boundary conditions
- Validate flag clearing after processing

**Integration Tests:**
- Verify only updated symbols are processed
- Test with rapid updates to same symbol
- Test with updates to multiple symbols
- Verify no symbols are missed

**Performance Tests:**
- Measure CPU reduction with typical workload
- Benchmark flag operations overhead
- Test memory usage with max symbols
- Verify no performance regression

## Migration Strategy

### Phase 1: Add Infrastructure (No Breaking Changes)
1. Add `symbolUpdateBuffer` to SharedMarketData
2. Add update tracking utilities
3. Set flags on updates (backward compatible)
4. Deploy and monitor

### Phase 2: Worker Optimization
1. Update workers to check symbol flags
2. Add feature flag for per-symbol processing
3. A/B test performance improvements
4. Roll out to all workers

### Phase 3: Cleanup
1. Remove feature flags
2. Optimize message formats
3. Document new behavior
4. Update monitoring dashboards

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Missed updates due to flag race condition | Low | High | Use atomic operations exclusively |
| Memory corruption in shared buffers | Low | High | Validate all array accesses |
| Performance regression if all symbols update | Low | Low | Fallback to batch processing |
| Incompatibility with future multi-interval traders | Medium | Medium | Design supports per-interval flags |

## Dependencies

- No new external libraries needed
- Requires SharedArrayBuffer support (already validated)
- Depends on Atomics API (standard in modern browsers)
- Compatible with existing Web Worker infrastructure

## Monitoring & Observability

**Metrics to Track:**
- Symbols processed per second
- Percentage of symbols with updates
- CPU usage reduction
- Filter execution count
- Update flag operation timing

**Logging:**
```typescript
console.log(`[Worker] Processing ${updatedSymbols.length}/${totalSymbols} updated symbols`);
console.log(`[Worker] CPU saved: ${(1 - updatedSymbols.length/totalSymbols) * 100}%`);
```

## Success Criteria

- ✅ Only updated symbols are processed by workers
- ✅ 80%+ reduction in unnecessary filter executions  
- ✅ No missed updates or data inconsistencies
- ✅ CPU usage reduced by at least 50%
- ✅ No increase in signal detection latency
- ✅ All existing tests continue to pass
- ✅ Memory overhead under 5KB
- ✅ Performance improvement measurable in production

## Questions/Decisions Needed

1. **Update Flag Persistence**: Should flags be cleared immediately after processing or kept for debugging?
   - Recommendation: Clear immediately for correctness

2. **Granularity**: Track updates per symbol or per symbol-interval pair?
   - Recommendation: Start with per-symbol, extend if needed

3. **Fallback Behavior**: What if symbol tracking fails?
   - Recommendation: Process all symbols as current fallback

4. **Monitoring**: Should we expose update stats to UI?
   - Recommendation: Add debug mode to show efficiency gains