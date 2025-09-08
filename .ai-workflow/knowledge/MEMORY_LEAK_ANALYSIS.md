# Memory Leak Analysis Report

## Executive Summary

After analyzing the codebase, I've identified several potential memory leak sources in your cryptocurrency screener application. The main areas of concern are:

1. **WebSocket Connection Management** - Improper cleanup and reconnection handling
2. **State Management Patterns** - Excessive Map cloning and unbounded state growth
3. **Event Listeners and Subscriptions** - Missing cleanup in some components
4. **Timer/Interval Management** - Intervals that may not be properly cleared
5. **Chart Component Lifecycle** - Chart.js instances not always destroyed correctly

## Detailed Analysis

### 1. WebSocket Connection Management (`binanceService.ts`)

**Issues Found:**
- WebSocket reconnection logic creates new connections without ensuring previous ones are fully cleaned up
- Event handlers are nullified but the connection might still receive messages during cleanup
- Reconnection timeouts might overlap if network issues cause rapid disconnects

**Memory Leak Potential: HIGH**

**Key Problem Areas:**
```typescript
// Lines 641-664 in App.tsx
reconnectTimeout = setTimeout(connectWebSocketWithRetry, 5000);
// This timeout is set in error handler, but if multiple errors occur quickly,
// multiple timeouts could be created
```

### 2. State Management Patterns

**Issues Found:**

#### a) Map Cloning (`App.tsx`)
- Every ticker update creates a new Map (line 476)
- Every kline update creates nested Maps (lines 527-582)
- Historical data Map grows unbounded with multiple intervals

**Memory Leak Potential: MEDIUM-HIGH**

#### b) Signal History (`App.tsx`)
- `signalHistory` Map is persisted to localStorage but never pruned (lines 441-444)
- `klineUpdateCountRef` Map grows indefinitely (line 139)

**Memory Leak Potential: MEDIUM**

#### c) Signal Log Array
- `signalLog` array is limited to `MAX_SIGNAL_LOG_ENTRIES` but updates create new arrays frequently

### 3. Event Listeners and Subscriptions

**Issues Found:**

#### a) klineEventBus (`klineEventBus.ts`)
- `subscribeToInterval` method creates wrapped callbacks that might not be properly cleaned up
- The subscriptions Set in `subscribeToInterval` could retain references

**Memory Leak Potential: LOW-MEDIUM**

#### b) Signal Manager (`signalManager.ts`)
- `updateCallbacks` Set properly managed
- `signals` Map cleaned up periodically via `cleanupOldSignals`

**Memory Leak Potential: LOW**

#### c) useSignalLifecycle Hook
- `monitoringIntervals` Map cleared on unmount (good)
- `analysisQueue` and `activeAnalyses` properly managed
- `traderAnalysisCounts` Map never cleared (potential leak)

**Memory Leak Potential: LOW-MEDIUM**

### 4. Timer/Interval Usage

**Issues Found:**

#### a) Multi-trader Screener (`useMultiTraderScreener.ts`)
- Interval properly cleared on cleanup
- Worker terminated correctly

**Memory Leak Potential: LOW**

#### b) Signal Monitoring (`useSignalLifecycle.ts`)
- Multiple intervals created for different kline intervals
- Intervals are cleared but the Map itself persists

**Memory Leak Potential: LOW**

### 5. Chart Component (`ChartDisplay.tsx`)

**Issues Found:**
- Charts destroyed in `destroyAllCharts` but refs might retain instances
- `panelChartInstanceRefs` array recreated but old refs might persist
- Crosshair plugin adds event listeners that might not be removed

**Memory Leak Potential: MEDIUM**

### 6. Worker Management

**Issues Found:**
- Workers are properly terminated in cleanup
- Message handlers removed correctly

**Memory Leak Potential: LOW**

### 7. Observability Service

**Issues Found:**
- `batchQueue` limited to 100 items (good)
- `traceIdMap` cleaned up after use (good)
- Timer properly managed

**Memory Leak Potential: LOW**

## Recommendations

### Critical Fixes

1. **WebSocket Cleanup**
   - Implement a connection manager that ensures only one connection exists
   - Add connection state tracking to prevent overlapping reconnection attempts
   - Clear all pending reconnection timeouts before creating new ones

2. **State Management Optimization**
   - Implement periodic pruning of historical data Maps
   - Use immutable update patterns more efficiently (avoid cloning entire Maps)
   - Add maximum size limits to all growing data structures

3. **Chart Lifecycle**
   - Ensure chart instances are fully dereferenced after destruction
   - Clear canvas references explicitly
   - Remove all chart event listeners before destruction

### Performance Optimizations

1. **Reduce Map Cloning Frequency**
   - Batch ticker updates before creating new Maps
   - Use mutable updates for real-time data and create immutable snapshots less frequently

2. **Implement Data Retention Policies**
   - Add configurable retention periods for signal history
   - Prune kline update counts periodically
   - Limit the number of analysis history entries per signal

3. **Event Listener Management**
   - Create a centralized event management system
   - Track all active listeners and ensure cleanup

### Monitoring Recommendations

1. Add memory usage monitoring to track:
   - Total heap size
   - Number of active WebSocket connections
   - Size of major data structures (Maps, Arrays)
   - Number of active chart instances

2. Implement periodic health checks that:
   - Log memory statistics
   - Force garbage collection (in development)
   - Alert on abnormal growth patterns

## Conclusion

The most critical areas to address are:
1. WebSocket connection management and cleanup
2. Unbounded growth of state Maps (especially historical data)
3. Chart component lifecycle management

These issues, when combined with long-running sessions and frequent data updates, can lead to significant memory consumption over time. Implementing the recommended fixes should substantially reduce memory usage and improve application stability.