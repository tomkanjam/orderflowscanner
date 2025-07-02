/**
 * Memory monitoring utility for debugging browser freezing issues
 */

interface MemorySnapshot {
  timestamp: number;
  jsHeapSizeLimit: number;
  totalJSHeapSize: number;
  usedJSHeapSize: number;
  heapUsagePercent: number;
  customMetrics: {
    [key: string]: number;
  };
}

interface MemoryTrend {
  metric: string;
  current: number;
  average: number;
  max: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  growthRate: number; // bytes per second
}

class MemoryMonitor {
  private snapshots: MemorySnapshot[] = [];
  private maxSnapshots = 100;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private customMetrics = new Map<string, () => number>();
  private warningThreshold = 0.9; // 90% heap usage
  private lastWarningTime = 0;
  private warningCooldown = 60000; // 1 minute between warnings

  constructor() {
    // Register default custom metrics
    this.registerMetric('mapSizes', () => {
      // Count total size of all Map objects in the app
      let count = 0;
      // This is a placeholder - in real usage, we'd pass specific maps to track
      return count;
    });
  }

  /**
   * Start monitoring memory usage
   */
  start(intervalMs: number = 10000) {
    if (this.monitoringInterval) {
      this.stop();
    }

    console.log('[MemoryMonitor] Starting memory monitoring with interval:', intervalMs + 'ms');
    
    // Take initial snapshot
    this.takeSnapshot();

    this.monitoringInterval = setInterval(() => {
      this.takeSnapshot();
      this.analyzeMemoryUsage();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('[MemoryMonitor] Stopped memory monitoring');
    }
  }

  /**
   * Register a custom metric to track
   */
  registerMetric(name: string, getter: () => number) {
    this.customMetrics.set(name, getter);
  }

  /**
   * Take a memory snapshot
   */
  private takeSnapshot() {
    if (!performance.memory) {
      console.warn('[MemoryMonitor] performance.memory not available');
      return;
    }

    const memory = performance.memory;
    const customMetrics: { [key: string]: number } = {};

    // Collect custom metrics
    this.customMetrics.forEach((getter, name) => {
      try {
        customMetrics[name] = getter();
      } catch (e) {
        console.error(`[MemoryMonitor] Error collecting metric ${name}:`, e);
      }
    });

    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      totalJSHeapSize: memory.totalJSHeapSize,
      usedJSHeapSize: memory.usedJSHeapSize,
      heapUsagePercent: memory.usedJSHeapSize / memory.jsHeapSizeLimit,
      customMetrics
    };

    this.snapshots.push(snapshot);

    // Keep only recent snapshots
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }
  }

  /**
   * Analyze memory usage and detect issues
   */
  private analyzeMemoryUsage() {
    if (this.snapshots.length < 2) return;

    const latest = this.snapshots[this.snapshots.length - 1];
    const previous = this.snapshots[this.snapshots.length - 2];
    const timeDiff = (latest.timestamp - previous.timestamp) / 1000; // seconds

    // Calculate memory growth rate
    const heapGrowthRate = (latest.usedJSHeapSize - previous.usedJSHeapSize) / timeDiff;
    
    // Log current status
    console.log(`[MemoryMonitor] Heap: ${this.formatBytes(latest.usedJSHeapSize)} / ${this.formatBytes(latest.jsHeapSizeLimit)} (${(latest.heapUsagePercent * 100).toFixed(1)}%)`,
      `Growth: ${heapGrowthRate > 0 ? '+' : ''}${this.formatBytes(heapGrowthRate)}/s`);

    // Log custom metrics
    Object.entries(latest.customMetrics).forEach(([name, value]) => {
      const prevValue = previous.customMetrics[name] || 0;
      const growth = (value - prevValue) / timeDiff;
      console.log(`[MemoryMonitor] ${name}: ${value} (${growth > 0 ? '+' : ''}${growth.toFixed(2)}/s)`);
    });

    // Check for warnings
    if (latest.heapUsagePercent > this.warningThreshold) {
      const now = Date.now();
      if (now - this.lastWarningTime > this.warningCooldown) {
        console.warn(`[MemoryMonitor] ⚠️ HIGH MEMORY USAGE: ${(latest.heapUsagePercent * 100).toFixed(1)}% of heap limit`);
        this.lastWarningTime = now;
        
        // Log trends
        const trends = this.getMemoryTrends();
        trends.forEach(trend => {
          if (trend.trend === 'increasing' && trend.growthRate > 0) {
            console.warn(`[MemoryMonitor] ⚠️ ${trend.metric} is growing at ${this.formatBytes(trend.growthRate)}/s`);
          }
        });
      }
    }

    // Detect rapid growth
    if (heapGrowthRate > 1048576) { // 1MB/s
      console.warn(`[MemoryMonitor] ⚠️ RAPID MEMORY GROWTH DETECTED: ${this.formatBytes(heapGrowthRate)}/s`);
    }
  }

  /**
   * Get memory trends over recent snapshots
   */
  getMemoryTrends(): MemoryTrend[] {
    if (this.snapshots.length < 10) return [];

    const trends: MemoryTrend[] = [];
    const recentSnapshots = this.snapshots.slice(-10); // Last 10 snapshots
    
    // Analyze heap usage
    const heapValues = recentSnapshots.map(s => s.usedJSHeapSize);
    trends.push(this.analyzeTrend('heapUsage', heapValues, recentSnapshots));

    // Analyze custom metrics
    Object.keys(recentSnapshots[0].customMetrics).forEach(metricName => {
      const values = recentSnapshots.map(s => s.customMetrics[metricName] || 0);
      trends.push(this.analyzeTrend(metricName, values, recentSnapshots));
    });

    return trends;
  }

  /**
   * Analyze trend for a specific metric
   */
  private analyzeTrend(metric: string, values: number[], snapshots: MemorySnapshot[]): MemoryTrend {
    const current = values[values.length - 1];
    const average = values.reduce((a, b) => a + b, 0) / values.length;
    const max = Math.max(...values);
    
    // Calculate growth rate using linear regression
    const timeDiffs = snapshots.map((s, i) => i > 0 ? (s.timestamp - snapshots[0].timestamp) / 1000 : 0);
    const growthRate = this.calculateLinearRegression(timeDiffs, values);
    
    // Determine trend
    let trend: 'increasing' | 'decreasing' | 'stable';
    if (Math.abs(growthRate) < 1000) { // Less than 1KB/s
      trend = 'stable';
    } else if (growthRate > 0) {
      trend = 'increasing';
    } else {
      trend = 'decreasing';
    }

    return {
      metric,
      current,
      average,
      max,
      trend,
      growthRate
    };
  }

  /**
   * Simple linear regression to calculate growth rate
   */
  private calculateLinearRegression(x: number[], y: number[]): number {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumX2 = x.reduce((total, xi) => total + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope; // bytes per second
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    const abs = Math.abs(bytes);
    if (abs < 1024) return bytes + ' B';
    if (abs < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (abs < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
  }

  /**
   * Get current memory status
   */
  getStatus() {
    if (this.snapshots.length === 0) return null;
    
    const latest = this.snapshots[this.snapshots.length - 1];
    const trends = this.getMemoryTrends();
    
    return {
      current: latest,
      trends,
      isHealthy: latest.heapUsagePercent < this.warningThreshold,
      formattedUsage: `${this.formatBytes(latest.usedJSHeapSize)} / ${this.formatBytes(latest.jsHeapSizeLimit)}`
    };
  }
}

// Export singleton instance
export const memoryMonitor = new MemoryMonitor();