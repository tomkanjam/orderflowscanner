# Memory Management Architecture

## Overview
This document explains the memory management system implemented to prevent memory leaks and ensure stable long-term operation. The system uses bounded collections, automatic cleanup, and resource lifecycle tracking to maintain memory usage below 50MB/hour growth rate.

## Critical Limits and Their Impact

### 1. Signal Storage Limits
**Location**: `signalManager.ts`
```typescript
maxSignals = 1000           // Maximum signals to keep in memory
maxSignalAge = 24 hours     // Signals older than this are removed
cleanupInterval = 30 minutes // How often cleanup runs
```

**Impact on Functionality**:
- ✅ **No Impact on Active Trading**: Signals in 'in_position' status are never deleted
- ⚠️ **Historical Data**: Old completed/rejected signals are removed after 24 hours
- ⚠️ **High Volume**: If you generate >1000 signals, oldest non-active ones are removed
- **Mitigation**: Important signals should be persisted to database if needed long-term

### 2. Worker Memory Limits
**Location**: `persistentTraderWorker.ts`
```typescript
maxCacheSize = 100           // Max cached filter results per trader
maxResultAge = 1 hour        // Cached results expire after this
maxCompiledFunctions = 50    // Max compiled filter functions
maxIntervals = 5             // Max concurrent intervals per worker
maxMemoryMB = 20            // Worker memory warning threshold
```

**Impact on Functionality**:
- ✅ **No Impact on Accuracy**: Cache is for performance, not correctness
- ⚠️ **Trader Limit**: System supports ~50 active traders efficiently
- ⚠️ **Cache Misses**: After 100 symbols, LRU eviction may cause recalculation
- **Mitigation**: Most important traders should be added first

### 3. Market Data Limits
**Location**: `SharedMarketData.ts`
```typescript
maxSymbols = 500            // Maximum symbols to track
maxKlineHistory = 500       // Klines per symbol per timeframe
maxTickerAge = 5 minutes    // Stale ticker data is removed
```

**Impact on Functionality**:
- ✅ **No Impact on Top Assets**: Tracks 500 symbols (more than enough for top pairs)
- ✅ **Sufficient History**: 500 candles = ~8 hours at 1m, ~20 days at 1h
- ⚠️ **Exotic Pairs**: Cannot track entire Binance universe simultaneously
- **Mitigation**: Focuses on high-volume USDT pairs automatically

### 4. React Component Limits
**Location**: `useBoundedState.ts` hooks
```typescript
useBoundedMap: maxSize = 100 (default)
useBoundedSet: maxSize = 100 (default)
useThrottledState: delay = 100ms (default)
```

**Impact on Functionality**:
- ✅ **No Impact on Display**: UI components have reasonable limits
- ⚠️ **Large Lists**: Components showing >100 items need pagination
- **Mitigation**: Can increase limits per-component if needed

### 5. Resource Tracking Limits
**Location**: `ResourceTracker.ts`
```typescript
maxResourcesPerOwner = 10   // Max resources per component
warningThreshold = 50        // Warns if total resources exceed this
```

**Impact on Functionality**:
- ✅ **No Impact**: Only tracks and cleans up, doesn't limit functionality
- ℹ️ **Developer Aid**: Helps identify leaks during development

## Memory Management Features

### Automatic Cleanup Systems

1. **Signal Cleanup** (every 30 minutes)
   - Removes signals older than 24 hours
   - Keeps maximum 1000 signals
   - Never removes active positions

2. **Worker Cleanup** (every 30 seconds)
   - Evicts old cached results
   - Clears expired compiled functions
   - Reports memory stats to main thread

3. **Market Data Cleanup** (continuous)
   - Removes stale ticker data
   - Maintains kline history limits
   - Uses LRU eviction for symbols

4. **Resource Cleanup** (on component unmount)
   - Automatically clears intervals
   - Removes event listeners
   - Cancels pending operations

### Bounded Collections

All major data structures now have size limits with LRU (Least Recently Used) eviction:

```typescript
// Example: BoundedMap
class BoundedMap<K, V> extends Map<K, V> {
  constructor(private maxSize: number = 100) {}
  
  set(key: K, value: V): this {
    if (this.size >= this.maxSize && !this.has(key)) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey); // Remove oldest
    }
    super.delete(key); // Remove if exists
    super.set(key, value); // Add as newest
    return this;
  }
}
```

## Performance Targets

| Metric | Target | What Happens if Exceeded |
|--------|--------|--------------------------|
| Memory Growth | <50MB/hour | Test fails, investigate leaks |
| Worker Memory | <20MB each | Warning logged, cleanup triggered |
| React Re-renders | <10/sec | UI may feel sluggish |
| Signal Count | <1000 | Oldest inactive signals deleted |
| Cached Results | <100/trader | LRU eviction, recalculation needed |

## When Limits Might Affect You

### Scenario 1: Running Many Strategies
**Limit Hit**: >50 compiled filter functions
**Impact**: Older strategies' compiled functions are evicted
**Solution**: Functions recompile on-demand (small performance hit)

### Scenario 2: Tracking Many Symbols  
**Limit Hit**: >500 symbols in market data
**Impact**: Cannot add more symbols
**Solution**: Focus on high-volume pairs, or increase limit if RAM allows

### Scenario 3: Long-Running Sessions
**Limit Hit**: >1000 signals accumulated
**Impact**: Old completed signals are deleted
**Solution**: Export important signals before they're cleaned up

### Scenario 4: Complex Indicators
**Limit Hit**: >500 klines per timeframe
**Impact**: Very long-term indicators may lack data
**Solution**: Increase `maxKlineHistory` if needed for specific strategies

## How to Adjust Limits

All limits are configurable if you need different values:

```typescript
// signalManager.ts
private maxSignals = 2000; // Increase if needed
private maxSignalAge = 48 * 60 * 60 * 1000; // Keep for 48 hours

// persistentTraderWorker.ts  
private memoryConfig = {
  maxCacheSize: 200,        // More cache per trader
  maxCompiledFunctions: 100, // Support more traders
  // ...
}

// SharedMarketData.ts
private readonly maxSymbols = 1000; // Track more symbols
```

## Monitoring Memory Health

### Using the Performance Monitor
1. Open the Performance Monitor (bottom-right widget)
2. Run an 8-hour stress test
3. Monitor memory growth rate
4. Should stay under 50MB/hour

### Key Metrics to Watch
```javascript
// In browser console
performance.memory.usedJSHeapSize / 1024 / 1024 // Current MB
```

### Warning Signs
- Memory growth >50MB/hour
- Worker memory >30MB
- Frequent "Maximum resources exceeded" warnings
- UI becoming sluggish over time

## Safe Defaults

The current limits are conservative and should work well for:
- Up to 50 active trading strategies
- Monitoring 100-500 symbols
- Running continuously for 24+ hours
- Generating 50-100 signals per hour

## Breaking Changes from Previous Version

### What Changed
1. **Signals**: Now automatically cleaned up after 24 hours
2. **Worker Cache**: Limited to 100 results per trader
3. **Compiled Functions**: Maximum 50 (was unlimited)
4. **Market Data**: Capped at 500 symbols
5. **Component State**: Many components now use bounded collections

### What Stayed the Same
- All trading logic unchanged
- Signal analysis unchanged  
- WebSocket connections unchanged
- Indicator calculations unchanged
- UI functionality unchanged

## Troubleshooting

### "Maximum signals exceeded"
- **Cause**: >1000 signals accumulated
- **Fix**: Old signals are auto-deleted, or increase `maxSignals`

### "Worker memory warning"
- **Cause**: Worker using >20MB RAM
- **Fix**: Automatic cleanup runs, or reduce active traders

### "Resource limit exceeded"
- **Cause**: Component creating too many resources
- **Fix**: Check for resource leaks in component

### Performance degradation
- **Cause**: Limits may be too low for your use case
- **Fix**: Adjust limits based on available RAM

## Recommendations

1. **For Production Use**:
   - Run 8-hour stress test before deployment
   - Monitor memory growth weekly
   - Adjust limits based on actual usage patterns

2. **For Development**:
   - Keep browser DevTools Memory profiler open
   - Take heap snapshots before/after major operations
   - Watch for "Maximum resources exceeded" warnings

3. **For Heavy Usage** (>100 traders, >500 symbols):
   - Increase relevant limits
   - Add more aggressive cleanup intervals
   - Consider implementing pagination in UI
   - Monitor worker memory closely

## Summary

The memory management system implements reasonable limits that should not affect normal usage while preventing memory leaks. The limits are:
- **Protective**: Prevent unbounded growth
- **Configurable**: Can be adjusted for your needs  
- **Transparent**: Clear warnings when limits are approached
- **Non-Breaking**: Core functionality remains intact

The system prioritizes active trading operations and recent data while cleaning up old, unused data to maintain performance over long-running sessions.