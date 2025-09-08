# Memory Leak Patterns & Solutions

## Pattern: React Re-render Cascade with Workers

### Symptoms
- Memory growth >20 MB/s
- Multiple identical worker messages per state change
- Browser slowdown after extended use
- DevTools showing accumulating function compilations

### Root Cause
React re-renders trigger useEffect hooks that send messages to workers. Without proper deduplication, each re-render causes:
1. New messages to workers
2. Workers recompiling filters with `new Function()`
3. Old functions not garbage collected
4. Memory accumulation

### Solution Pattern
Implement 4-layer defense:

```typescript
// Layer 1: Worker-side deduplication
if (existingTrader && !traderChanged(existingTrader, newTrader)) {
  return; // Skip recompilation
}

// Layer 2: Stable React references
const updateTraders = useCallback((newTraders) => {
  setTraders(prev => {
    if (deepEqual(prev, newTraders)) return prev;
    return newTraders;
  });
}, []);

// Layer 3: Differential updates
const changes = differentialTracker.getChanges(oldTraders, newTraders);
if (changes.hasChanges()) {
  worker.postMessage({ type: 'UPDATE_TRADERS', changes });
}

// Layer 4: Debounced notifications
const debouncedNotify = debounce(() => {
  this.emit('tradersUpdated', traders);
}, 50);
```

### Key Learnings
1. **Always check equality before updates** - Both in workers and React
2. **Use UPDATE not REPLACE** - Modify existing state rather than recreating
3. **Debounce rapid changes** - 50ms works well for user-imperceptible delay
4. **Track differentials** - Send only what changed, not entire state

## Pattern: Worker Function Compilation Leak

### Symptoms
- DevTools Profiler shows growing "Compile Code" entries
- Worker memory increases linearly with time
- Performance degrades as more functions compile

### Root Cause
Using `new Function()` or `eval()` in workers without proper cleanup:
```typescript
// BAD: Creates new function every time
const filterFn = new Function('ticker', 'klines', trader.filter.code);
```

### Solution Pattern
```typescript
// GOOD: Reuse or properly dispose
if (compiledFilters.has(traderId)) {
  const oldFilter = compiledFilters.get(traderId);
  // Dispose if different
  if (oldFilter.code !== newCode) {
    oldFilter.fn = null; // Help GC
    compiledFilters.set(traderId, compileNew());
  }
} else {
  compiledFilters.set(traderId, compileNew());
}
```

## Pattern: Shared Memory Not Detected

### Symptoms
- Workers not detecting signals in SharedArrayBuffer
- Atomics.load returning 0 when should be 1
- Race conditions in multi-worker scenarios

### Root Cause
SharedArrayBuffer updates not properly synchronized:
```typescript
// BAD: Write without synchronization
view[index] = 1;

// BAD: Read without synchronization  
if (view[index] === 1) { }
```

### Solution Pattern
```typescript
// GOOD: Use Atomics for synchronization
Atomics.store(view, index, 1);
Atomics.notify(view, index);

// GOOD: Atomic read
if (Atomics.load(view, index) === 1) { }
```

## Anti-Patterns to Avoid

### 1. Sending Full State on Every Change
```typescript
// BAD
worker.postMessage({ type: 'UPDATE', allTraders });

// GOOD
worker.postMessage({ type: 'UPDATE', changes: { added, updated, removed } });
```

### 2. Creating New References Unnecessarily
```typescript
// BAD
setTraders([...traders]); // New array every time

// GOOD
setTraders(prev => prev); // Keep same reference if unchanged
```

### 3. Not Cleaning Up on Unmount
```typescript
// BAD
useEffect(() => {
  const interval = setInterval(update, 1000);
  // Missing cleanup!
});

// GOOD
useEffect(() => {
  const interval = setInterval(update, 1000);
  return () => clearInterval(interval);
}, []);
```

## Performance Monitoring Checklist

### Metrics to Track
- [ ] Memory growth rate (should be <0.1 MB/s)
- [ ] Worker message frequency (should be <10/min steady state)
- [ ] Function compilation count (should stabilize after initial load)
- [ ] React re-render frequency (should be <5/min without user interaction)
- [ ] Cleanup success rate (should be 100%)

### Debug Tools
```javascript
// Enable debug mode
localStorage.setItem('DEBUG_WORKERS', 'true');

// Check performance
window.getPerformanceComparison?.();

// Monitor memory
const checkMemory = () => {
  if (performance.memory) {
    console.log('Heap:', Math.round(performance.memory.usedJSHeapSize / 1048576), 'MB');
  }
};
setInterval(checkMemory, 5000);
```

## References
- [Chrome DevTools Memory Profiling](https://developer.chrome.com/docs/devtools/memory-problems/)
- [MDN: Memory Management](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Memory_Management)
- [React: Preventing Memory Leaks](https://react.dev/learn/synchronizing-with-effects#step-3-add-cleanup-if-needed)