# Worker Memory Leak Fix - Implementation Plan

## Overview
Implementing the worker memory leak fix as designed in the architecture document. The core issue is that persistent worker intervals (10ms) continue running after worker termination, causing exponential memory growth. This plan breaks the fix into safe, independently testable chunks.

## Prerequisites
- [x] Architecture document reviewed (`.ai-workflow/architecture/worker-memory-leak-fix-20250108.md`)
- [x] Development environment set up with pnpm
- [x] Access to browser DevTools for memory profiling
- [ ] Create feature branch: `fix/worker-memory-leak`

## Implementation Phases

### Phase 1: Core Interval Cleanup (2 hours)
**Objective:** Fix the primary memory leak by properly tracking and clearing intervals in workers

#### Chunk 1.1: Add Interval Tracking to Worker (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Add updateIntervalId property to track the interval
2. Modify startUpdateMonitor() to store interval ID
3. Add stopUpdateMonitor() method to clear interval
4. Ensure interval is cleared when isInitialized becomes false

Test criteria:
- [ ] Worker compiles without errors
- [ ] Interval ID is stored when created
- [ ] Existing functionality unchanged
- [ ] Workers still process trades normally

Checkpoint: Worker has ability to track its interval
```

#### Chunk 1.2: Implement Cleanup Message Handler (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts
- apps/app/types.ts (if needed for message types)

Actions:
1. Add 'CLEANUP' case to message handler
2. Create cleanup() method that:
   - Sets isShuttingDown flag
   - Calls stopUpdateMonitor()
   - Clears all Maps and Sets
   - Nullifies buffer references
   - Sends CLEANUP_COMPLETE response
3. Add 'CLEANUP_COMPLETE' to WorkerResponse type

Test criteria:
- [ ] Worker responds to CLEANUP message
- [ ] Interval is cleared on cleanup
- [ ] Memory references are released
- [ ] CLEANUP_COMPLETE is sent back

Checkpoint: Worker can be cleanly shut down via message
```

#### Chunk 1.3: Hook Cleanup Integration (45 min)
```
Files to modify:
- apps/app/hooks/useSharedTraderIntervals.ts

Actions:
1. Modify worker termination logic to:
   - Send CLEANUP message first
   - Wait up to 1 second for CLEANUP_COMPLETE
   - Then call worker.terminate()
2. Add cleanup confirmation handler
3. Log cleanup success/timeout for debugging

Test criteria:
- [ ] Cleanup message sent before termination
- [ ] Hook waits for confirmation
- [ ] Timeout works if no response
- [ ] Existing trader functionality intact

Checkpoint: Workers are cleanly terminated with proper cleanup
```

#### Chunk 1.4: Verify Memory Leak Fix (15 min)
```
Manual Testing:
1. Open Chrome DevTools Memory Profiler
2. Take heap snapshot
3. Add/remove traders multiple times
4. Take another heap snapshot
5. Compare snapshots - no growing worker count

Test criteria:
- [ ] Memory stays stable after multiple trader changes
- [ ] No zombie intervals in heap snapshot
- [ ] Worker count matches expected (not growing)
- [ ] Performance unchanged

Checkpoint: Memory leak is fixed
```

**Phase 1 Complete When:**
- Intervals are properly tracked and cleared
- Workers clean up before termination
- Memory usage remains stable
- No regression in signal detection

### Phase 2: Robustness & Health Monitoring (2.5 hours)
**Objective:** Add health checks and graceful worker replacement for production reliability

#### Chunk 2.1: Add Health Check Messages (30 min)
```
Files to modify:
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Add 'PING' case to message handler
2. Respond immediately with 'PONG' message
3. Include worker stats in PONG response:
   - Trader count
   - Last update processed
   - Uptime

Test criteria:
- [ ] Worker responds to PING
- [ ] PONG includes accurate stats
- [ ] No performance impact
- [ ] Messages don't interfere with trading

Checkpoint: Workers can report health status
```

#### Chunk 2.2: Create WorkerLifecycleManager Utility (60 min)
```
Files to create:
- apps/app/utils/WorkerLifecycleManager.ts
- apps/app/types/worker.types.ts

Actions:
1. Create WorkerInstance interface with lifecycle tracking
2. Implement WorkerLifecycleManager class:
   - createWorker() method
   - terminateWorker() with cleanup protocol
   - waitForCleanup() with timeout
   - Worker instance tracking Map
3. Add proper TypeScript types

Test criteria:
- [ ] Manager can create workers
- [ ] Cleanup protocol implemented
- [ ] Timeout fallback works
- [ ] TypeScript types compile

Checkpoint: Lifecycle manager ready for integration
```

#### Chunk 2.3: Integrate Lifecycle Manager in Hook (45 min)
```
Files to modify:
- apps/app/hooks/useSharedTraderIntervals.ts

Actions:
1. Import and initialize WorkerLifecycleManager
2. Replace direct worker creation with manager.createWorker()
3. Replace direct termination with manager.terminateWorker()
4. Clean up manager on hook unmount
5. Update worker instance tracking

Test criteria:
- [ ] Workers created through manager
- [ ] Proper cleanup on termination
- [ ] No memory leaks
- [ ] Trading still works correctly

Checkpoint: Lifecycle management integrated
```

#### Chunk 2.4: Implement Health Monitoring (30 min)
```
Files to modify:
- apps/app/utils/WorkerLifecycleManager.ts
- apps/app/hooks/useSharedTraderIntervals.ts

Actions:
1. Add startHealthMonitoring() method
2. Send PING every 5 seconds
3. Track lastPingResponse timestamp
4. Detect unresponsive workers (>10s)
5. Log health check results

Test criteria:
- [ ] Health checks run periodically
- [ ] Unresponsive workers detected
- [ ] Logging provides visibility
- [ ] Minimal performance impact

Checkpoint: Worker health is monitored
```

**Phase 2 Complete When:**
- Health monitoring active
- Lifecycle properly managed
- Graceful cleanup confirmed
- System more resilient

### Phase 3: Auto-Recovery & Observability (2 hours)
**Objective:** Add automatic recovery from failures and comprehensive monitoring

#### Chunk 3.1: Implement Worker Replacement (45 min)
```
Files to modify:
- apps/app/utils/WorkerLifecycleManager.ts

Actions:
1. Add replaceWorker() method
2. Create new worker with traders from old
3. Transfer trader configurations
4. Terminate old worker after transfer
5. Handle edge cases (mid-replacement failures)

Test criteria:
- [ ] Zombie workers get replaced
- [ ] Traders transfer correctly
- [ ] No signal detection gaps
- [ ] Smooth transition

Checkpoint: Auto-recovery working
```

#### Chunk 3.2: Add Memory Monitoring (30 min)
```
Files to modify:
- apps/app/utils/WorkerLifecycleManager.ts
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Track worker creation timestamps
2. Add memory estimation based on trader count
3. Include memory stats in health checks
4. Log memory warnings if threshold exceeded

Test criteria:
- [ ] Memory tracked per worker
- [ ] Warnings logged appropriately
- [ ] Stats available for debugging
- [ ] No false positives

Checkpoint: Memory usage visible
```

#### Chunk 3.3: Enhanced Logging & Metrics (30 min)
```
Files to modify:
- apps/app/utils/WorkerLifecycleManager.ts
- apps/app/hooks/useSharedTraderIntervals.ts
- apps/app/workers/persistentTraderWorker.ts

Actions:
1. Add structured logging for all lifecycle events
2. Include timing metrics (cleanup duration)
3. Log worker statistics periodically
4. Add debug mode for verbose output

Test criteria:
- [ ] All events logged
- [ ] Metrics captured accurately
- [ ] Logs helpful for debugging
- [ ] Can toggle debug mode

Checkpoint: Full observability achieved
```

#### Chunk 3.4: Final Integration Testing (15 min)
```
Manual Testing Protocol:
1. Start app with multiple traders
2. Monitor memory over 10 minutes
3. Force worker failures (DevTools)
4. Verify auto-recovery
5. Check all logging/metrics

Test criteria:
- [ ] Memory stable long-term
- [ ] Recovery from failures
- [ ] All features working
- [ ] Good performance

Checkpoint: Production ready
```

**Phase 3 Complete When:**
- Auto-recovery functioning
- Comprehensive monitoring
- All edge cases handled
- Production ready

## Testing Strategy

### Unit Tests
```bash
# After each chunk, run:
pnpm build                  # Ensure no compilation errors
pnpm test                   # Run existing tests
```

### Memory Testing
```javascript
// Browser console memory check
performance.memory.usedJSHeapSize / 1048576  // Check MB used

// Take heap snapshots in Chrome DevTools
// Memory > Take snapshot > Compare before/after
```

### Integration Tests
1. **Trader Creation/Deletion Cycle**
   - Create 10 traders
   - Delete all traders
   - Repeat 10 times
   - Memory should not grow

2. **Worker Failure Recovery**
   - Kill worker process in DevTools
   - Verify automatic replacement
   - Check traders still function

3. **Long-Running Test**
   - Run for 1 hour with active traders
   - Monitor memory every 10 minutes
   - Should remain stable

### Manual Testing
1. Start the app: `pnpm dev`
2. Open Chrome DevTools > Memory
3. Take initial heap snapshot
4. Create several traders
5. Wait for signals to trigger
6. Delete traders
7. Take final heap snapshot
8. Compare snapshots - no leaked workers

## Rollback Plan
If issues arise:
1. `git checkout main` - Return to stable branch
2. `pnpm install` - Reset dependencies if needed
3. Clear browser cache and reload
4. Document issue for investigation

### Commit Checkpoints
- After Phase 1: "fix: Add interval cleanup to prevent memory leak"
- After Phase 2: "feat: Add worker lifecycle management and health monitoring"  
- After Phase 3: "feat: Add auto-recovery and observability for workers"

## PM Checkpoints
Points where PM should review:
- [ ] After Phase 1 - Memory leak fixed, core functionality intact
- [ ] After Phase 2 - Health monitoring active, graceful cleanup working
- [ ] After Phase 3 - Full solution with auto-recovery ready
- [ ] Before deployment - All tests passing, metrics look good

## Success Metrics
How we know it's working:
- [ ] Memory usage stable over 24 hours
- [ ] Zero zombie workers in heap snapshots
- [ ] Cleanup success rate > 99%
- [ ] Average cleanup time < 100ms
- [ ] No regression in signal detection speed
- [ ] Health checks responsive 100% of time
- [ ] Auto-recovery triggers when needed

## Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Breaking worker communication | Test thoroughly after each change | ⏳ |
| 2 | Performance impact from health checks | Use 5s interval, lightweight PING | ⏳ |
| 3 | Race conditions during replacement | Overlap period, atomic transfer | ⏳ |
| All | Regression in trading functionality | Comprehensive testing at each step | ⏳ |

## Time Estimate
- Phase 1: 2 hours
- Phase 2: 2.5 hours  
- Phase 3: 2 hours
- Buffer: 1 hour
- **Total: 7.5 hours**

## Next Actions
Immediate steps to begin:
1. Create feature branch: `git checkout -b fix/worker-memory-leak`
2. Open `apps/app/workers/persistentTraderWorker.ts`
3. Begin Phase 1, Chunk 1.1 - Add interval tracking
4. Take initial memory snapshot for comparison

## Notes for Implementation
- Keep existing functionality working at all times
- Test after EVERY chunk - don't accumulate changes
- Use console.log liberally during development (remove before commit)
- Monitor browser memory usage continuously
- If memory still grows, use heap snapshots to find other leaks

This plan ensures the memory leak is fixed systematically with minimal risk to the production system.