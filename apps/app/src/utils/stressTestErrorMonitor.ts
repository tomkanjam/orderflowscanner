/**
 * Stress test for ErrorMonitor to verify memory leak fix
 * Run this in the browser console to test memory stability
 */

import { errorMonitor, ErrorCategory } from './errorMonitor';

export function runStressTest(durationMs: number = 60000) {
  console.log(`[Stress Test] Starting ${durationMs / 1000} second stress test...`);

  const startTime = Date.now();
  const startMemory = performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : 0;

  let errorCount = 0;
  let intervalCount = 0;

  // Track memory readings
  const memoryReadings: number[] = [];

  // Generate errors at high rate (1000+ per minute)
  const errorInterval = setInterval(() => {
    // Burst of 20 errors every 50ms = 400 errors/second
    for (let i = 0; i < 20; i++) {
      errorCount++;

      // Mix of duplicate and unique errors
      const isCommon = Math.random() > 0.3; // 70% common errors
      const message = isCommon
        ? `common-error-${Math.floor(Math.random() * 10)}`
        : `unique-error-${errorCount}`;

      const category = [
        ErrorCategory.NETWORK,
        ErrorCategory.WEBSOCKET,
        ErrorCategory.DATA_FETCH,
        ErrorCategory.CACHE
      ][Math.floor(Math.random() * 4)];

      errorMonitor.trackError(
        category,
        message,
        Math.random() > 0.8 ? new Error('Test error') : undefined,
        { index: errorCount, timestamp: Date.now() }
      );
    }

    intervalCount++;

    // Log progress every second (20 intervals)
    if (intervalCount % 20 === 0) {
      const elapsed = Date.now() - startTime;
      const currentMemory = performance.memory
        ? performance.memory.usedJSHeapSize / (1024 * 1024)
        : 0;

      memoryReadings.push(currentMemory);

      const stats = errorMonitor.getStats();
      const metrics = errorMonitor.getMemoryMetrics();

      console.log(`[Stress Test] ${elapsed / 1000}s elapsed:`, {
        errorsGenerated: errorCount,
        errorsPerSecond: Math.round(errorCount / (elapsed / 1000)),
        historySize: stats.totalErrors,
        dedupSaved: metrics.dedupStats.saved,
        dedupPercentage: `${metrics.dedupStats.percentage}%`,
        memoryMB: metrics.totalMemoryMB,
        heapUsedMB: currentMemory.toFixed(2)
      });
    }

    // Stop after duration
    if (Date.now() - startTime >= durationMs) {
      clearInterval(errorInterval);

      // Final report
      const endMemory = performance.memory
        ? performance.memory.usedJSHeapSize / (1024 * 1024)
        : 0;

      const memoryGrowth = endMemory - startMemory;
      const stats = errorMonitor.getStats();
      const metrics = errorMonitor.getMemoryMetrics();

      console.log('[Stress Test] ========== FINAL REPORT ==========');
      console.log({
        duration: `${durationMs / 1000}s`,
        totalErrorsGenerated: errorCount,
        averageErrorsPerSecond: Math.round(errorCount / (durationMs / 1000)),
        finalHistorySize: stats.totalErrors,
        finalMapSize: metrics.errorMapSize,
        dedupWindowSize: metrics.dedupWindowSize,
        totalDeduped: metrics.dedupStats.saved,
        dedupEfficiency: `${metrics.dedupStats.percentage}%`,
        startMemoryMB: startMemory.toFixed(2),
        endMemoryMB: endMemory.toFixed(2),
        memoryGrowthMB: memoryGrowth.toFixed(2),
        errorMonitorMemoryMB: metrics.totalMemoryMB,
        memoryStable: Math.abs(memoryGrowth) < 10 ? '✅ YES' : '❌ NO'
      });

      // Check memory stability
      if (memoryReadings.length > 2) {
        const firstHalf = memoryReadings.slice(0, Math.floor(memoryReadings.length / 2));
        const secondHalf = memoryReadings.slice(Math.floor(memoryReadings.length / 2));

        const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        console.log('[Stress Test] Memory Trend:', {
          firstHalfAvg: avgFirst.toFixed(2),
          secondHalfAvg: avgSecond.toFixed(2),
          trend: avgSecond > avgFirst * 1.5 ? '⚠️ GROWING' : '✅ STABLE'
        });
      }

      console.log('[Stress Test] =====================================');

      // Return results for programmatic use
      return {
        success: Math.abs(memoryGrowth) < 10,
        errorCount,
        memoryGrowth,
        dedupPercentage: metrics.dedupStats.percentage
      };
    }
  }, 50); // Run every 50ms

  return {
    stop: () => clearInterval(errorInterval)
  };
}

// Export for browser console
if (typeof window !== 'undefined') {
  (window as any).stressTestErrorMonitor = runStressTest;
}