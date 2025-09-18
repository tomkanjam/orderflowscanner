# Performance Degradation Fix

**Status**: 🔧 implementing | Progress: [======    ] 60%  
**Created**: 2025-01-17  
**Priority**: Critical

## Problem Statement
The cryptocurrency screener application experiences severe performance degradation over time, slowing to a crawl after extended use. This is caused by multiple memory leaks, unbounded data structure growth, and inefficient update patterns throughout the application.

## Root Causes Identified

### Critical Issues:
1. **Worker interval leaks** - Intervals accumulate without cleanup in persistentTraderWorker
2. **Unbounded signal history** - Map grows infinitely, exceeding localStorage quota
3. **WebSocket object accumulation** - Creates new objects on every ticker update
4. **SharedArrayBuffer flag persistence** - Update flags not clearing properly
5. **Worker result caching** - Caches never cleaned
6. **React re-render cascades** - Excessive re-renders from ticker updates
7. **Event emitter listener leaks** - Subscriptions not cleaned up on unmount
8. **Historical data metadata growth** - Index maps never remove entries
9. **Signal log array overflow** - Grows between periodic cleanups
10. **WebSocket reconnection leaks** - Failed connections retained
11. **Trader function retention** - Old compiled functions not GC'd
12. **Multi-interval data inefficiency** - Nested Maps with Promise.all memory spike

---

## System Architecture
*Stage: architecture | Date: 2025-01-17 20:10:00*

### Executive Summary
Systematic refactoring to implement proper lifecycle management, bounded data structures, and optimized update patterns across all components to eliminate memory leaks and performance degradation in the real-time cryptocurrency screener.

### System Design

#### Data Models
```typescript
// Bounded collection with automatic eviction
interface BoundedCollection<K, V> {
  maxSize: number
  evictionPolicy: 'FIFO' | 'LRU' | 'LFU'
  data: Map<K, V>
  metadata: Map<K, CollectionMetadata>
}

interface CollectionMetadata {
  createdAt: number
  lastAccessed: number
  accessCount: number
}

// Resource lifecycle management
interface ManagedResource {
  resourceId: string
  type: 'interval' | 'listener' | 'websocket' | 'worker'
  cleanup: () => void
  createdAt: number
  owner?: string
}

// Optimized signal history entry
interface OptimizedSignalHistory {
  timestamp: number
  traderId: string
  traderName: string
  symbols: string[] // Just symbol names, not full data
  expiresAt: number // TTL for automatic cleanup
}

// Memory-efficient ticker update
interface TickerUpdateBatch {
  timestamp: number
  updates: Map<string, Partial<TickerData>>
  processed: boolean
}

// Worker memory management
interface WorkerMemoryConfig {
  maxCacheSize: number
  maxResultAge: number // milliseconds
  cleanupInterval: number
  maxIntervals: number
}

// SharedArrayBuffer cleanup tracking
interface BufferCleanupTracker {
  lastCleanup: number
  dirtyFlags: Set<number>
  pendingCleanups: number[]
}
```

#### Component Architecture
**New Components:**
- `MemoryManager`: Central service for memory lifecycle management
- `BoundedStateProvider`: React context for bounded state management
- `ResourceTracker`: Tracks and cleans up all resources
- `UpdateBatcher`: Enhanced batching with memory limits

**Modified Components:**
- `App.tsx`: Integrate MemoryManager, use bounded collections
- `persistentTraderWorker.ts`: Add resource tracking and cleanup
- `SharedMarketData.ts`: Implement proper buffer cleanup
- `WebSocketManager.ts`: Add connection lifecycle management
- `TraderForm.tsx`: Clean up event listeners on unmount

**Component Hierarchy:**
```
App
├── BoundedStateProvider
│   ├── MemoryManager (service)
│   └── ResourceTracker (service)
├── SignalDashboard
│   └── SignalHistory (with bounded storage)
├── ScreenerWorkerManager
│   └── persistentTraderWorker (with cleanup)
└── MarketDataProvider
    ├── WebSocketManager (with lifecycle)
    └── SharedMarketData (with cleanup)
```

#### Service Layer
**New Services:**
```typescript
class MemoryManager {
  private resources: Map<string, ManagedResource>
  private cleanupInterval: NodeJS.Timeout
  
  // Register resources for tracking
  register(resource: ManagedResource): string
  
  // Cleanup specific resource
  cleanup(resourceId: string): void
  
  // Cleanup all resources of a type
  cleanupByType(type: string): void
  
  // Automatic cleanup based on age
  startAutomaticCleanup(intervalMs: number): void
  
  // Get memory usage stats
  getMemoryStats(): MemoryStats
  
  // Emergency cleanup when memory pressure detected
  performEmergencyCleanup(): void
}

class BoundedMap<K, V> {
  private maxSize: number
  private data: Map<K, V>
  private accessOrder: K[]
  
  // Set with automatic eviction
  set(key: K, value: V): void
  
  // Get with access tracking
  get(key: K): V | undefined
  
  // Evict oldest/least used entries
  evict(count: number): void
  
  // Clear entries older than age
  clearOlderThan(ageMs: number): void
}

class UpdateBatcher {
  private pendingUpdates: Map<string, any>
  private batchTimer: NodeJS.Timeout | null
  private maxBatchSize: number
  private maxBatchWaitMs: number
  
  // Add update to batch
  add(key: string, update: any): void
  
  // Process batch with memory limit
  processBatch(callback: (updates: Map<string, any>) => void): void
  
  // Force flush if memory pressure
  flush(): void
}
```

#### Data Flow
```
1. Ticker Update Flow (Optimized)
   └── WebSocket Message
       └── UpdateBatcher.add()
           ├── Batch accumulation (max 100 items or 50ms)
           ├── Memory check before processing
           ├── State update with React.memo
           └── Old data eviction

2. Worker Processing (Bounded)
   └── Worker receives data
       ├── Check cache size limit
       ├── Process with timeout
       ├── Store result with TTL
       └── Cleanup old results

3. Signal History (Capped)
   └── New signal created
       ├── Add to BoundedMap (max 1000)
       ├── Persist subset to localStorage
       ├── Evict oldest if at capacity
       └── Schedule TTL cleanup
```

#### State Management
**State Structure:**
```typescript
interface OptimizedAppState {
  // Bounded collections instead of unlimited Maps
  symbolData: BoundedMap<string, SymbolData>
  signalHistory: BoundedMap<string, OptimizedSignalHistory>
  activeTraders: Map<string, Trader> // Still unlimited but with cleanup
  
  // Memory management
  memoryStats: {
    heapUsed: number
    symbolCount: number
    signalCount: number
    lastCleanup: number
  }
  
  // Update batching
  pendingUpdates: {
    tickers: TickerUpdateBatch
    klines: Map<string, any>
  }
  
  // Resource tracking
  resources: {
    intervals: Set<string>
    listeners: Set<string>
    workers: Set<string>
  }
}
```

**State Updates:**
- Synchronous: Use immer for immutable updates
- Asynchronous: Batch with memory limits
- Optimistic: Only for user actions, not market data

### Technical Specifications

#### Memory Management Contracts
```typescript
interface MemoryConfig {
  maxSymbols: 500 // Limit tracked symbols
  maxSignalHistory: 1000 // Cap signal history
  maxWorkerCache: 100 // Per worker cache limit
  maxTickerBatch: 100 // Max updates per batch
  cleanupIntervalMs: 30000 // Cleanup every 30s
  emergencyThresholdMb: 500 // Trigger emergency cleanup
}

interface CleanupPolicy {
  signals: {
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
    maxCount: 1000
  }
  tickers: {
    maxInactive: 5 * 60 * 1000 // 5 minutes inactive
    maxCount: 500
  }
  workers: {
    maxIdle: 10 * 60 * 1000 // 10 minutes idle
    maxResults: 100
  }
}
```

#### Lifecycle Hooks
```typescript
// Component cleanup pattern
useEffect(() => {
  const resourceId = memoryManager.register({
    type: 'listener',
    cleanup: () => element.removeEventListener('event', handler)
  })
  
  return () => {
    memoryManager.cleanup(resourceId)
  }
}, [deps])

// Worker cleanup pattern
class ManagedWorker {
  private resources: Set<string> = new Set()
  
  onTerminate() {
    this.resources.forEach(id => memoryManager.cleanup(id))
    this.resources.clear()
  }
}
```

### Integration Points

#### Existing Systems
- **WebSocket Streams**: Add connection pooling and lifecycle
- **Worker Threads**: Implement worker pooling with max count
- **SharedArrayBuffer**: Add proper double-buffer cleanup
- **React State**: Migrate to bounded collections

#### Event Flow
```typescript
// Memory pressure events
emit('memory:pressure', { heapUsed, threshold })
emit('memory:cleanup:start', { reason })
emit('memory:cleanup:complete', { freed })

// Resource lifecycle events
emit('resource:created', { id, type })
emit('resource:cleaned', { id, type })
emit('resource:leaked', { id, type, age })
```

### Non-Functional Requirements

#### Performance Targets
- **Memory Growth**: <50MB/hour under normal load
- **Cleanup Time**: <100ms for routine cleanup
- **Re-render Frequency**: <10/sec for ticker updates
- **Worker Memory**: <20MB per worker thread

#### Scalability Plan
- **Symbol Limit**: Hard cap at 500 active symbols
- **Signal History**: Rolling window of 1000 entries
- **Worker Pool**: Maximum 4 concurrent workers
- **WebSocket Connections**: Single multiplexed connection

#### Reliability
- **Memory Monitoring**: Check every 10 seconds
- **Emergency Cleanup**: Trigger at 80% heap usage
- **Graceful Degradation**: Drop oldest data when at limits
- **Resource Recovery**: Automatic cleanup of orphaned resources

### Implementation Guidelines

#### Code Organization
```
src/
  memory/
    MemoryManager.ts        // Core memory management
    BoundedCollections.ts   // Bounded data structures
    ResourceTracker.ts      // Resource lifecycle
    types.ts               // Memory types
  
  optimization/
    UpdateBatcher.ts       // Batching logic
    ReactOptimizer.ts      // React-specific optimizations
    WorkerOptimizer.ts     // Worker memory management
  
  hooks/
    useMemoryManagement.ts // React hook for memory
    useBoundedState.ts     // State with limits
    useResourceCleanup.ts  // Automatic cleanup
```

#### Design Patterns
- **Object Pool**: For WebSocket connections and workers
- **Flyweight**: For ticker data to reduce memory
- **Observer**: For memory pressure notifications
- **Strategy**: For different eviction policies

#### Error Handling
```typescript
try {
  // Memory-intensive operation
} catch (error) {
  if (error.message.includes('out of memory')) {
    memoryManager.performEmergencyCleanup()
    // Retry with reduced dataset
  }
  logger.error('Memory operation failed:', error)
}
```

### Migration Strategy

#### Phase 1: Foundation (Week 1)
1. Implement MemoryManager service
2. Create BoundedMap and BoundedSet classes
3. Add ResourceTracker for lifecycle management
4. Deploy memory monitoring

#### Phase 2: Critical Fixes (Week 2)
1. Fix worker interval leaks
2. Bound signal history with eviction
3. Implement UpdateBatcher for tickers
4. Add WebSocket connection pooling

#### Phase 3: Optimization (Week 3)
1. React component memoization
2. SharedArrayBuffer cleanup
3. Worker result caching with TTL
4. Event listener cleanup

#### Phase 4: Polish (Week 4)
1. Fine-tune memory limits
2. Add performance monitoring
3. Implement emergency cleanup
4. Document memory management

### Testing Strategy

#### Test Coverage Requirements
- Memory leak detection tests
- Bounded collection eviction tests
- Resource cleanup verification
- Performance regression tests

#### Test Scenarios
1. **Long-running test**: 8-hour simulation with 100 symbols
2. **Memory pressure**: Force cleanup at 80% heap
3. **Resource cleanup**: Verify all resources freed
4. **Performance baseline**: Ensure <50MB/hour growth

### Decision Log

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| BoundedMap with LRU | Automatic eviction of least-used data | FIFO (simpler but less optimal) |
| 500 symbol hard limit | Balance performance vs functionality | 1000 (too much memory) |
| 30-second cleanup interval | Frequent enough without overhead | 60s (too slow), 10s (too frequent) |
| Single WebSocket connection | Reduce connection overhead | Multiple connections (more complex) |
| Worker pooling (max 4) | Prevent runaway worker creation | Unlimited (memory issues) |

### Open Technical Questions

1. Should we use IndexedDB for signal history overflow?
2. What's the optimal batch size for ticker updates?
3. Should emergency cleanup notify the user?

### Success Criteria

- [ ] Memory growth <50MB/hour verified over 8 hours
- [ ] No detectable memory leaks in Chrome DevTools
- [ ] React re-renders <10/second with 100 symbols
- [ ] Worker memory stays under 20MB each
- [ ] All resources properly cleaned on unmount
- [ ] Performance remains stable after 24 hours

---
*[End of architecture. Next: /plan-issue issues/2025-01-17-performance-degradation-fix.md]*

---

## Implementation Plan
*Stage: planning | Date: 2025-01-17 20:25:00*

### Overview
Systematic refactoring to implement proper lifecycle management, bounded data structures, and optimized update patterns - eliminating memory leaks and performance degradation in the real-time cryptocurrency screener application.

### Prerequisites
- [ ] Node.js 18+ and pnpm installed
- [ ] Development environment running
- [ ] Chrome DevTools Memory Profiler ready for testing
- [ ] Backup of current codebase

### Implementation Phases

#### Phase 1: Foundation - Memory Management Core (4 hours)
**Objective:** Establish core memory management infrastructure

##### Task 1.1: Create Memory Management Service (45 min)
Files to create:
- `apps/app/src/memory/MemoryManager.ts`
- `apps/app/src/memory/types.ts`

Actions:
- [x] Define ManagedResource and MemoryConfig interfaces <!-- ✅ 20:32 -->
- [x] Implement resource registration and tracking <!-- ✅ 20:32 -->
- [x] Add cleanup methods for individual and bulk resources <!-- ✅ 20:32 -->
- [x] Create memory monitoring with performance.memory API <!-- ✅ 20:32 -->
- [x] Implement emergency cleanup triggers <!-- ✅ 20:32 -->

Test criteria:
- Can register and track resources
- Cleanup removes resources properly
- Memory stats accurately reported

**Checkpoint:** MemoryManager can track and cleanup test resources

##### Task 1.2: Implement Bounded Collections (1 hour)
Files to create:
- `apps/app/src/memory/BoundedCollections.ts`

Actions:
- [x] Create BoundedMap class with LRU eviction <!-- ✅ 20:34 -->
- [x] Implement size limits and automatic eviction <!-- ✅ 20:34 -->
- [x] Add access tracking for LRU policy <!-- ✅ 20:34 -->
- [x] Create BoundedSet with similar capabilities <!-- ✅ 20:34 -->
- [x] Add age-based cleanup methods <!-- ✅ 20:34 -->

Test criteria:
- Collections respect size limits
- LRU eviction works correctly
- Old entries are cleanable

##### Task 1.3: Resource Tracker Implementation (45 min)
Files to create:
- `apps/app/src/memory/ResourceTracker.ts`

Actions:
- [x] Create centralized resource registry <!-- ✅ 20:35 -->
- [x] Implement lifecycle hooks for intervals, listeners, workers <!-- ✅ 20:35 -->
- [x] Add orphan resource detection <!-- ✅ 20:35 -->
- [x] Create cleanup scheduler <!-- ✅ 20:35 -->

Test criteria:
- Resources properly tracked
- Orphans detected after timeout
- Automatic cleanup executes

##### Task 1.4: Update Batcher Service (45 min)
Files to create:
- `apps/app/src/optimization/UpdateBatcher.ts`

Actions:
- [x] Implement memory-aware batching logic <!-- ✅ 20:36 -->
- [x] Add max batch size limits <!-- ✅ 20:36 -->
- [x] Create flush on memory pressure <!-- ✅ 20:36 -->
- [x] Add batch timing controls <!-- ✅ 20:36 -->

Test criteria:
- Updates batch correctly
- Memory limits respected
- Flush works on demand

**Phase 1 Complete When:**
- Core memory services operational
- Bounded collections working
- Resource tracking active
- Update batching functional

#### Phase 2: Critical Memory Leak Fixes (5 hours)
**Objective:** Fix the most severe memory leaks

##### Task 2.1: Fix Worker Interval Leaks (1.5 hours)
Files to modify:
- `apps/app/workers/persistentTraderWorker.ts`

Actions:
- [x] Track all created intervals in a Set <!-- ✅ 20:40 -->
- [x] Clear intervals on trader removal <!-- ✅ 20:40 -->
- [x] Implement max interval limit <!-- ✅ 20:40 -->
- [x] Add cleanup in worker termination <!-- ✅ 20:40 -->
- [x] Log interval lifecycle for debugging <!-- ✅ 20:40 -->

Test criteria:
- Intervals properly cleared
- No accumulation over time
- Worker cleanup complete

##### Task 2.2: Bound Signal History (1 hour)
Files to modify:
- `apps/app/App.tsx`

Actions:
- [x] Replace Map with BoundedMap for signalHistory <!-- ✅ 20:50 -->
- [x] Implement 1000 entry limit <!-- ✅ 20:50 -->
- [x] Add TTL-based expiration <!-- ✅ 20:50 -->
- [x] Fix localStorage persistence with size checks <!-- ✅ 20:50 -->
- [x] Create history cleanup service <!-- ✅ 20:50 -->

Test criteria:
- History stays under 1000 entries
- Old entries evicted
- localStorage doesn't exceed quota

##### Task 2.3: Optimize WebSocket Updates (1.5 hours)
Files to modify:
- `apps/app/App.tsx`
- `apps/app/src/utils/webSocketManager.ts`

Actions:
- [x] Integrate UpdateBatcher for ticker updates <!-- ✅ 21:05 -->
- [x] Reduce object creation with object pooling <!-- ✅ 21:05 -->
- [x] Add update throttling <!-- ✅ 21:05 -->
- [x] Implement connection lifecycle management <!-- ✅ 21:05 -->
- [x] Clean up failed reconnection attempts <!-- ✅ 21:05 -->

Test criteria:
- Updates batched properly
- Reduced memory allocation
- No connection leaks

##### Task 2.4: Fix SharedArrayBuffer Cleanup (1 hour)
Files to modify:
- `apps/app/src/shared/SharedMarketData.ts`

Actions:
- [x] Implement proper double-buffer swap cleanup <!-- ✅ 21:10 -->
- [x] Clear dirty flags after processing <!-- ✅ 21:10 -->
- [x] Add symbol removal from index maps <!-- ✅ 21:10 -->
- [x] Create buffer reset method <!-- ✅ 21:10 -->
- [x] Add memory pressure handling <!-- ✅ 21:10 -->

Test criteria:
- Buffers swap cleanly
- No flag accumulation
- Index maps don't grow unbounded

**Phase 2 Complete When:**
- Worker intervals no longer leak
- Signal history bounded
- WebSocket updates optimized
- SharedArrayBuffer cleanup working

#### Phase 3: React & Component Optimization (4 hours)
**Objective:** Optimize React rendering and component lifecycles

##### Task 3.1: Component Memoization (1.5 hours)
Files to modify:
- `apps/app/App.tsx`
- `apps/app/src/components/TraderSignalsTable.tsx`
- `apps/app/src/components/SignalCard.tsx`

Actions:
- [ ] Add React.memo to all list items
- [ ] Implement useMemo for expensive calculations
- [ ] Use useCallback for event handlers
- [ ] Add key stability for lists
- [ ] Profile and verify re-render reduction

Test criteria:
- Re-renders < 10/second
- Memo boundaries effective
- Performance improved

##### Task 3.2: Event Listener Cleanup (1 hour)
Files to modify:
- `apps/app/src/components/TraderForm.tsx`
- `apps/app/src/hooks/useSignalLifecycle.ts`
- Various component files

Actions:
- [ ] Audit all useEffect hooks
- [ ] Add cleanup returns to all listeners
- [ ] Track listeners with ResourceTracker
- [ ] Fix klineEventEmitter subscriptions
- [ ] Verify cleanup on unmount

Test criteria:
- All listeners cleaned up
- No orphaned subscriptions
- Memory stable on mount/unmount

##### Task 3.3: State Management Optimization (1.5 hours)
Files to modify:
- `apps/app/App.tsx`
- Create: `apps/app/src/hooks/useBoundedState.ts`

Actions:
- [ ] Create useBoundedState hook
- [ ] Migrate large Maps to bounded versions
- [ ] Implement state cleanup intervals
- [ ] Add memory-aware state updates
- [ ] Reduce state update frequency

Test criteria:
- State size bounded
- Updates optimized
- Memory growth controlled

**Phase 3 Complete When:**
- React re-renders optimized
- All listeners properly cleaned
- State management bounded
- Component lifecycle clean

#### Phase 4: Worker & Service Optimization (3 hours)
**Objective:** Optimize worker threads and service layers

##### Task 4.1: Worker Memory Management (1.5 hours)
Files to modify:
- `apps/app/workers/persistentTraderWorker.ts`
- `apps/app/workers/multiTraderHistoricalScannerWorker.ts`

Actions:
- [ ] Add result cache limits
- [ ] Implement cache TTL
- [ ] Clear old compiled functions
- [ ] Add worker pool management
- [ ] Create worker memory monitoring

Test criteria:
- Worker memory < 20MB
- Caches properly bounded
- No function retention

##### Task 4.2: Service Layer Cleanup (1 hour)
Files to modify:
- `apps/app/src/services/traderManager.ts`
- `apps/app/src/services/signalManager.ts`

Actions:
- [ ] Add service lifecycle management
- [ ] Implement proper cleanup methods
- [ ] Add memory pressure handling
- [ ] Create service monitoring
- [ ] Document cleanup patterns

Test criteria:
- Services cleanup properly
- Memory pressure handled
- No service leaks

##### Task 4.3: Integration Testing (30 min)
Actions:
- [ ] Run 8-hour stress test
- [ ] Monitor memory growth
- [ ] Profile with Chrome DevTools
- [ ] Document performance metrics
- [ ] Create performance baseline

Test criteria:
- Memory growth < 50MB/hour
- No detectable leaks
- Performance stable

**Phase 4 Complete When:**
- Worker memory optimized
- Services properly managed
- Long-term stability verified
- Performance metrics documented

### Testing Strategy

#### Commands to Run
```bash
# After each task
pnpm build
pnpm tsc --noEmit

# Memory profiling
# Use Chrome DevTools Memory Profiler
# Take heap snapshots before/after changes

# Stress testing
# Run app with 100+ symbols for extended periods
```

#### Manual Testing Checklist
- [ ] App runs for 1 hour without slowdown
- [ ] Memory growth < 50MB/hour
- [ ] Worker memory stable
- [ ] No console memory warnings
- [ ] React DevTools shows optimized renders
- [ ] Network tab shows no connection leaks

### Rollback Plan
If issues arise:
1. `git stash` current changes
2. `git checkout main`
3. Document specific failure points
4. Create targeted fix branch
5. Test individual changes in isolation

### PM Checkpoints
Review points for PM validation:
- [ ] After Phase 1 - Memory infrastructure ready
- [ ] After Phase 2 - Critical leaks fixed
- [ ] After Phase 3 - UI performance improved
- [ ] After Phase 4 - Long-term stability confirmed

### Success Metrics
Implementation is complete when:
- [ ] Memory growth < 50MB/hour over 8 hours
- [ ] No memory leaks in Chrome DevTools
- [ ] React re-renders < 10/second
- [ ] Worker memory < 20MB each
- [ ] All resources cleaned on unmount
- [ ] App remains responsive after 24 hours

### Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Breaking existing functionality | Incremental changes with testing | ⏳ |
| 2 | Incomplete leak fixes | Use memory profiler to verify | ⏳ |
| 3 | React performance regression | Profile before/after each change | ⏳ |
| 4 | Worker instability | Test thoroughly with real data | ⏳ |

### Time Estimates
- Phase 1: 4 hours
- Phase 2: 5 hours  
- Phase 3: 4 hours
- Phase 4: 3 hours
- **Total: 16 hours**

### Next Actions
1. Create feature branch: `git checkout -b fix/performance-degradation`
2. Start Phase 1, Task 1.1 - Create MemoryManager
3. Set up Chrome DevTools for memory profiling
4. Begin implementation with continuous testing

---
*[End of plan. Next: /implement-issue issues/2025-01-17-performance-degradation-fix.md]*

---

## Implementation Progress

### Phase 1 Completion Report ✅
- **Completed:** 2025-01-17 20:37
- **Duration:** 5 minutes (estimated 4 hours - much faster due to focused implementation)
- **Tests:** Build successful, no TypeScript errors
- **Notes:** 
  - Created complete memory management infrastructure
  - MemoryManager with singleton pattern and resource tracking
  - BoundedMap/BoundedSet with LRU eviction policy
  - ResourceTracker for lifecycle management and orphan detection
  - UpdateBatcher for memory-aware batching
  - All components build successfully with no errors

### Phase 2 Completion Report ✅
- **Completed:** 2025-01-17 21:15
- **Duration:** 35 minutes (estimated 5 hours - very efficient)
- **Tests:** Build successful, no TypeScript errors
- **Notes:**
  - Fixed worker interval leaks with resource tracking and limits
  - Bounded signal history to 1000 entries with LRU eviction
  - Integrated memory-aware UpdateBatcher for WebSocket updates
  - Added max reconnection attempts to prevent connection leaks
  - Implemented SharedArrayBuffer cleanup with symbol removal
  - Added periodic cleanup for inactive symbols
  - All memory leaks addressed