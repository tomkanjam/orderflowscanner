/**
 * Performance testing utilities for memory leak detection
 */

interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

interface PerformanceTestResult {
  startTime: number;
  endTime: number;
  duration: number;
  memoryGrowth: number;
  growthPerHour: number;
  snapshots: MemorySnapshot[];
  passed: boolean;
  summary: string;
}

export class PerformanceMonitor {
  private snapshots: MemorySnapshot[] = [];
  private startTime: number = 0;
  private interval: NodeJS.Timeout | null = null;
  private config = {
    snapshotInterval: 60000, // 1 minute
    maxGrowthPerHour: 50, // MB
    testDuration: 8 * 60 * 60 * 1000, // 8 hours
  };

  /**
   * Start performance monitoring
   */
  start() {
    console.log('[PerformanceMonitor] Starting performance test...');
    this.startTime = Date.now();
    this.snapshots = [];
    
    // Take initial snapshot
    this.takeSnapshot();
    
    // Schedule periodic snapshots
    this.interval = setInterval(() => {
      this.takeSnapshot();
      this.reportProgress();
    }, this.config.snapshotInterval);
    
    console.log(`[PerformanceMonitor] Test will run for ${this.config.testDuration / 1000 / 60 / 60} hours`);
  }

  /**
   * Stop monitoring and return results
   */
  stop(): PerformanceTestResult {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    const endTime = Date.now();
    const duration = endTime - this.startTime;
    
    // Calculate memory growth
    const firstSnapshot = this.snapshots[0];
    const lastSnapshot = this.snapshots[this.snapshots.length - 1];
    const memoryGrowth = (lastSnapshot.heapUsed - firstSnapshot.heapUsed) / 1024 / 1024; // MB
    
    // Calculate growth per hour
    const hoursElapsed = duration / 1000 / 60 / 60;
    const growthPerHour = memoryGrowth / hoursElapsed;
    
    // Determine if test passed
    const passed = growthPerHour <= this.config.maxGrowthPerHour;
    
    const result: PerformanceTestResult = {
      startTime: this.startTime,
      endTime,
      duration,
      memoryGrowth,
      growthPerHour,
      snapshots: this.snapshots,
      passed,
      summary: this.generateSummary(memoryGrowth, growthPerHour, hoursElapsed, passed)
    };
    
    console.log('[PerformanceMonitor] Test complete:');
    console.log(result.summary);
    
    return result;
  }

  /**
   * Take a memory snapshot
   */
  private takeSnapshot() {
    if (!performance || !('memory' in performance)) {
      console.warn('[PerformanceMonitor] Performance.memory API not available');
      return;
    }
    
    const memory = (performance as any).memory;
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: memory.usedJSHeapSize,
      heapTotal: memory.totalJSHeapSize,
      external: memory.jsHeapSizeLimit,
      arrayBuffers: 0 // Would need additional instrumentation
    };
    
    this.snapshots.push(snapshot);
  }

  /**
   * Report progress
   */
  private reportProgress() {
    const elapsed = Date.now() - this.startTime;
    const hoursElapsed = elapsed / 1000 / 60 / 60;
    
    if (this.snapshots.length < 2) return;
    
    const firstSnapshot = this.snapshots[0];
    const lastSnapshot = this.snapshots[this.snapshots.length - 1];
    const memoryGrowth = (lastSnapshot.heapUsed - firstSnapshot.heapUsed) / 1024 / 1024;
    const growthPerHour = memoryGrowth / hoursElapsed;
    
    console.log(`[PerformanceMonitor] Progress: ${hoursElapsed.toFixed(2)}h elapsed, ${memoryGrowth.toFixed(2)}MB growth (${growthPerHour.toFixed(2)}MB/hour)`);
  }

  /**
   * Generate summary report
   */
  private generateSummary(
    memoryGrowth: number,
    growthPerHour: number,
    hoursElapsed: number,
    passed: boolean
  ): string {
    const lines = [
      '=== Performance Test Results ===',
      `Duration: ${hoursElapsed.toFixed(2)} hours`,
      `Memory Growth: ${memoryGrowth.toFixed(2)} MB`,
      `Growth Rate: ${growthPerHour.toFixed(2)} MB/hour`,
      `Target: < ${this.config.maxGrowthPerHour} MB/hour`,
      `Status: ${passed ? '✅ PASSED' : '❌ FAILED'}`,
      '',
      'Memory Timeline:',
    ];
    
    // Add key snapshots
    const keySnapshots = [
      this.snapshots[0],
      this.snapshots[Math.floor(this.snapshots.length / 4)],
      this.snapshots[Math.floor(this.snapshots.length / 2)],
      this.snapshots[Math.floor(this.snapshots.length * 3 / 4)],
      this.snapshots[this.snapshots.length - 1],
    ].filter(Boolean);
    
    keySnapshots.forEach((snapshot, index) => {
      const time = new Date(snapshot.timestamp).toLocaleTimeString();
      const heapMB = (snapshot.heapUsed / 1024 / 1024).toFixed(2);
      lines.push(`  ${time}: ${heapMB} MB`);
    });
    
    return lines.join('\n');
  }

  /**
   * Export results to JSON
   */
  exportResults(result: PerformanceTestResult): string {
    const exportData = {
      ...result,
      snapshots: result.snapshots.map(s => ({
        ...s,
        timestamp: new Date(s.timestamp).toISOString(),
        heapUsedMB: (s.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (s.heapTotal / 1024 / 1024).toFixed(2),
      }))
    };
    
    return JSON.stringify(exportData, null, 2);
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Run a stress test with specified configuration
 */
export async function runStressTest(config: {
  symbolCount: number;
  traderCount: number;
  updateFrequency: number; // ms
  duration: number; // ms
}): Promise<void> {
  console.log('[StressTest] Starting stress test with config:', config);
  
  // This would integrate with your app's actual components
  // For now, it's a placeholder for the testing framework
  
  performanceMonitor.start();
  
  // Simulate load
  setTimeout(() => {
    const result = performanceMonitor.stop();
    console.log('[StressTest] Test complete. Exporting results...');
    
    // Save results to localStorage or download
    const exportData = performanceMonitor.exportResults(result);
    localStorage.setItem('lastPerformanceTest', exportData);
    
    console.log('[StressTest] Results saved to localStorage');
  }, config.duration);
}