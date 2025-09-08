# Architecture: React Re-render Memory Leak Fix

## Problem Statement
The application experiences rapid memory growth (22.8 MB/s) leading to gigabyte-scale memory consumption. Root cause analysis revealed:

1. **NOT the issue**: Worker interval cleanup (this was fixed in Phase 1)
2. **ACTUAL issue**: React re-renders triggering excessive ADD_TRADER messages
   - useEffect in useSharedTraderIntervals runs 20+ times in 23 seconds
   - Each run sends 4 ADD_TRADER messages (80+ total)
   - Each ADD_TRADER compiles a new Function() in the worker
   - Compiled functions and their closures accumulate in memory

## Evidence from Logs
```
[SharedTraderIntervals] Worker useEffect triggered at 2025-01-09T00:25:23.813Z
[SharedTraderIntervals] Worker useEffect triggered at 2025-01-09T00:25:24.023Z
[SharedTraderIntervals] Worker useEffect triggered at 2025-01-09T00:25:24.236Z
... (20+ times in 23 seconds)

[Worker] ADD_TRADER received 80+ times
Memory growth: 525.8 MB in 23 seconds = 22.8 MB/s
```

## Root Cause Chain
1. **App.tsx** calls `setTraders` frequently (20+ times)
2. **traders array** reference changes each time
3. **useEffect** with `[traders, enabled, isInitialized]` dependency triggers
4. **ADD_TRADER** messages sent for ALL traders on EVERY trigger
5. **Worker** compiles new Function() for each ADD_TRADER
6. **Memory** accumulates from compiled functions and closures

## Solution Architecture

### Strategy: Prevent Unnecessary Re-renders and Redundant Operations

#### Option 1: Memoization and Stable References (Recommended)
**Principle**: Make trader array reference stable unless actual changes occur

```typescript
// In App.tsx
const tradersRef = useRef<Trader[]>([]);
const [traders, setTraders] = useState<Trader[]>([]);

// Only update if actual changes
const updateTraders = useCallback((newTraders: Trader[]) => {
  const hasChanges = !areTraderArraysEqual(tradersRef.current, newTraders);
  if (hasChanges) {
    tradersRef.current = newTraders;
    setTraders(newTraders);
  }
}, []);

// Deep equality check for traders
function areTraderArraysEqual(a: Trader[], b: Trader[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((trader, i) => {
    const other = b[i];
    return trader.id === other.id &&
           trader.enabled === other.enabled &&
           trader.filter?.code === other.filter?.code &&
           // ... other relevant properties
  });
}
```

#### Option 2: Worker-Side Deduplication
**Principle**: Check if trader already exists before recompiling

```typescript
// In persistentTraderWorker.ts
addTrader(trader: TraderExecution) {
  const existing = this.traders.get(trader.traderId);
  
  // Skip if identical trader already exists
  if (existing && 
      existing.filterCode === trader.filterCode &&
      existing.refreshInterval === trader.refreshInterval &&
      JSON.stringify(existing.requiredTimeframes) === JSON.stringify(trader.requiredTimeframes)) {
    console.log(`[Worker] Skipping duplicate ADD_TRADER for ${trader.traderId}`);
    return;
  }
  
  // Only compile if new or changed
  this.traders.set(trader.traderId, trader);
  this.compileFilter(trader);
}

private compileFilter(trader: TraderExecution) {
  try {
    const filterFunction = new Function(...);
    this.compiledFilters.set(trader.traderId, filterFunction);
  } catch (error) {
    console.error(`Failed to compile filter for ${trader.traderId}:`, error);
  }
}
```

#### Option 3: Differential Updates (Most Efficient)
**Principle**: Only send changes to workers, not entire trader list

```typescript
// In useSharedTraderIntervals.ts
const previousTradersRef = useRef<Map<string, TraderExecution>>(new Map());

useEffect(() => {
  const enabledTraders = traders.filter(t => t.enabled && t.filter?.code);
  const currentTraderMap = new Map(enabledTraders.map(t => [t.id, createTraderExecution(t)]));
  
  // Find differences
  const toAdd: TraderExecution[] = [];
  const toRemove: string[] = [];
  const toUpdate: TraderExecution[] = [];
  
  // Check for additions/updates
  currentTraderMap.forEach((trader, id) => {
    const previous = previousTradersRef.current.get(id);
    if (!previous) {
      toAdd.push(trader);
    } else if (!isTraderEqual(previous, trader)) {
      toUpdate.push(trader);
    }
  });
  
  // Check for removals
  previousTradersRef.current.forEach((_, id) => {
    if (!currentTraderMap.has(id)) {
      toRemove.push(id);
    }
  });
  
  // Only send necessary messages
  toAdd.forEach(trader => {
    worker.postMessage({ type: 'ADD_TRADER', data: trader });
  });
  
  toUpdate.forEach(trader => {
    worker.postMessage({ type: 'UPDATE_TRADER', data: trader });
  });
  
  toRemove.forEach(id => {
    worker.postMessage({ type: 'REMOVE_TRADER', traderId: id });
  });
  
  // Update reference
  previousTradersRef.current = currentTraderMap;
  
}, [traders, enabled, isInitialized]);
```

## Recommended Implementation Plan

### Phase 1: Immediate Fix (30 minutes)
1. **Add worker-side deduplication** (Option 2)
   - Prevents recompilation of identical traders
   - Quick win with minimal changes
   - Reduces memory growth immediately

### Phase 2: Stable References (1 hour)
2. **Implement memoization in App.tsx** (Option 1)
   - Prevents unnecessary re-renders
   - Reduces message traffic to workers
   - More efficient overall

### Phase 3: Optimal Solution (2 hours)
3. **Implement differential updates** (Option 3)
   - Only sends actual changes
   - Most efficient long-term solution
   - Scales better with many traders

## Memory Management Improvements

### Additional Optimizations

1. **Dispose Old Functions**
```typescript
// When removing/updating a trader
const oldFunction = this.compiledFilters.get(traderId);
if (oldFunction) {
  // Clear references to allow garbage collection
  delete oldFunction.prototype;
  this.compiledFilters.delete(traderId);
}
```

2. **Function Pool/Cache**
```typescript
// Cache compiled functions by filter code hash
private filterCache = new Map<string, Function>();

private getOrCompileFilter(filterCode: string): Function {
  const hash = hashCode(filterCode);
  let func = this.filterCache.get(hash);
  
  if (!func) {
    func = new Function(...);
    this.filterCache.set(hash, func);
  }
  
  return func;
}
```

3. **Batch Updates**
```typescript
// Debounce trader updates in App.tsx
const debouncedSetTraders = useMemo(
  () => debounce((newTraders: Trader[]) => {
    setTraders(newTraders);
  }, 100),
  []
);
```

## Testing Strategy

### Memory Profiling
1. Take heap snapshot before changes
2. Create/modify traders multiple times
3. Take heap snapshot after 1 minute
4. Compare memory growth rate (target: < 1 MB/s)

### Performance Metrics
- ADD_TRADER messages per minute (target: < 10)
- Function compilations per trader (target: 1)
- useEffect triggers per minute (target: < 5)
- Memory growth rate (target: < 1 MB/s)

### Validation Tests
1. **Deduplication Test**: Send same trader 10 times, verify only 1 compilation
2. **Update Test**: Change trader, verify recompilation occurs
3. **Memory Test**: Run for 10 minutes, verify stable memory
4. **Performance Test**: 10 traders active, verify smooth operation

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Missing trader updates | High | Careful equality checks, comprehensive testing |
| Race conditions | Medium | Atomic operations, proper state management |
| Performance regression | Low | Benchmark before/after, profile critical paths |
| Cached functions stale | Medium | Clear cache on trader changes |

## Success Criteria
- [ ] Memory growth < 1 MB/s under normal operation
- [ ] ADD_TRADER messages reduced by 90%
- [ ] No duplicate function compilations
- [ ] Trader updates still work correctly
- [ ] No regression in signal detection

## Implementation Priority
1. **IMMEDIATE**: Worker-side deduplication (stops the bleeding)
2. **HIGH**: Stable references in App.tsx (prevents the cause)
3. **MEDIUM**: Differential updates (optimal solution)
4. **LOW**: Function caching (nice-to-have optimization)

## Code Locations
- `apps/app/App.tsx`: Lines where setTraders is called
- `apps/app/hooks/useSharedTraderIntervals.ts`: Lines 143-288 (worker useEffect)
- `apps/app/workers/persistentTraderWorker.ts`: Lines 166-188 (addTrader method)

## Next Steps
1. Implement worker-side deduplication (Option 2) - Quick fix
2. Add performance logging to measure improvement
3. Implement stable references (Option 1) - Root cause fix
4. Monitor memory growth rate
5. Consider differential updates if needed (Option 3)

This architecture addresses the actual root cause: excessive React re-renders causing redundant ADD_TRADER messages and function recompilation.