/**
 * Performance Monitor - Track and analyze application performance metrics
 *
 * This module provides comprehensive performance monitoring for the trading screener,
 * tracking cache performance, network latency, memory usage, and rendering metrics.
 */

import { KlineInterval } from '../../types';

// Performance metrics interface
export interface PerformanceMetrics {
  cache: {
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    evictions: number;
    size: number;
  };
  network: {
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    p99Latency: number;
    totalRequests: number;
    failedRequests: number;
  };
  memory: {
    used: number;
    limit: number;
    percentage: number;
  };
  rendering: {
    fps: number;
    frameDrops: number;
    avgRenderTime: number;
  };
  timestamp: number;
}

// Metric event types
export interface MetricEvent {
  type: 'cache_hit' | 'cache_miss' | 'network_request' | 'render_frame' | 'memory_snapshot';
  value?: number;
  metadata?: Record<string, any>;
  timestamp: number;
}

/**
 * Performance monitoring service
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private events: MetricEvent[] = [];
  private maxEvents = 1000; // Keep last 1000 events
  private latencies: number[] = [];
  private maxLatencies = 100; // Keep last 100 latency measurements
  private frameTimestamps: number[] = [];
  private analyticsCallback?: (metrics: PerformanceMetrics) => void;
  private reportingInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;

  constructor() {
    this.metrics = this.createEmptyMetrics();
  }

  /**
   * Start monitoring
   */
  start(analyticsCallback?: (metrics: PerformanceMetrics) => void): void {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.analyticsCallback = analyticsCallback;

    // Start FPS monitoring
    this.startFPSMonitoring();

    // Start memory monitoring
    this.startMemoryMonitoring();

    // Start periodic reporting
    this.reportingInterval = setInterval(() => {
      this.report();
    }, 30000); // Report every 30 seconds

    console.log('[PerformanceMonitor] Started monitoring');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isMonitoring = false;

    if (this.reportingInterval) {
      clearInterval(this.reportingInterval);
      this.reportingInterval = null;
    }

    console.log('[PerformanceMonitor] Stopped monitoring');
  }

  /**
   * Track cache hit
   */
  trackCacheHit(): void {
    this.metrics.cache.totalHits++;
    this.updateCacheHitRate();
    this.addEvent({ type: 'cache_hit', timestamp: Date.now() });
  }

  /**
   * Track cache miss
   */
  trackCacheMiss(): void {
    this.metrics.cache.totalMisses++;
    this.updateCacheHitRate();
    this.addEvent({ type: 'cache_miss', timestamp: Date.now() });
  }

  /**
   * Track cache eviction
   */
  trackCacheEviction(): void {
    this.metrics.cache.evictions++;
  }

  /**
   * Update cache size
   */
  updateCacheSize(size: number): void {
    this.metrics.cache.size = size;
  }

  /**
   * Track network request
   */
  trackNetworkRequest(latency: number, success: boolean = true): void {
    this.metrics.network.totalRequests++;

    if (!success) {
      this.metrics.network.failedRequests++;
    } else {
      // Track latency
      this.latencies.push(latency);
      if (this.latencies.length > this.maxLatencies) {
        this.latencies.shift();
      }

      // Update latency metrics
      this.updateLatencyMetrics();
    }

    this.addEvent({
      type: 'network_request',
      value: latency,
      metadata: { success },
      timestamp: Date.now()
    });
  }

  /**
   * Track render frame
   */
  trackRenderFrame(renderTime: number): void {
    this.metrics.rendering.avgRenderTime =
      (this.metrics.rendering.avgRenderTime * 0.9) + (renderTime * 0.1); // Exponential moving average

    this.addEvent({
      type: 'render_frame',
      value: renderTime,
      timestamp: Date.now()
    });
  }

  /**
   * Get current metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics, timestamp: Date.now() };
  }

  /**
   * Get recent events
   */
  getRecentEvents(count: number = 100): MetricEvent[] {
    return this.events.slice(-count);
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const m = this.metrics;
    const report = [
      '=== Performance Report ===',
      '',
      '📊 Cache Performance:',
      `  Hit Rate: ${(m.cache.hitRate * 100).toFixed(1)}%`,
      `  Total Hits: ${m.cache.totalHits}`,
      `  Total Misses: ${m.cache.totalMisses}`,
      `  Evictions: ${m.cache.evictions}`,
      `  Cache Size: ${m.cache.size}`,
      '',
      '🌐 Network Performance:',
      `  Avg Latency: ${m.network.avgLatency.toFixed(0)}ms`,
      `  P50 Latency: ${m.network.p50Latency.toFixed(0)}ms`,
      `  P95 Latency: ${m.network.p95Latency.toFixed(0)}ms`,
      `  P99 Latency: ${m.network.p99Latency.toFixed(0)}ms`,
      `  Total Requests: ${m.network.totalRequests}`,
      `  Failed Requests: ${m.network.failedRequests}`,
      '',
      '💾 Memory Usage:',
      `  Used: ${(m.memory.used / 1024 / 1024).toFixed(1)}MB`,
      `  Limit: ${(m.memory.limit / 1024 / 1024).toFixed(1)}MB`,
      `  Percentage: ${m.memory.percentage.toFixed(1)}%`,
      '',
      '🎨 Rendering Performance:',
      `  FPS: ${m.rendering.fps.toFixed(1)}`,
      `  Frame Drops: ${m.rendering.frameDrops}`,
      `  Avg Render Time: ${m.rendering.avgRenderTime.toFixed(1)}ms`,
      ''
    ];

    return report.join('\n');
  }

  // Private methods

  private createEmptyMetrics(): PerformanceMetrics {
    return {
      cache: {
        hitRate: 0,
        totalHits: 0,
        totalMisses: 0,
        evictions: 0,
        size: 0
      },
      network: {
        avgLatency: 0,
        p50Latency: 0,
        p95Latency: 0,
        p99Latency: 0,
        totalRequests: 0,
        failedRequests: 0
      },
      memory: {
        used: 0,
        limit: 0,
        percentage: 0
      },
      rendering: {
        fps: 60,
        frameDrops: 0,
        avgRenderTime: 0
      },
      timestamp: Date.now()
    };
  }

  private updateCacheHitRate(): void {
    const total = this.metrics.cache.totalHits + this.metrics.cache.totalMisses;
    if (total > 0) {
      this.metrics.cache.hitRate = this.metrics.cache.totalHits / total;
    }
  }

  private updateLatencyMetrics(): void {
    if (this.latencies.length === 0) {
      return;
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const len = sorted.length;

    // Calculate average
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    this.metrics.network.avgLatency = sum / len;

    // Calculate percentiles
    this.metrics.network.p50Latency = sorted[Math.floor(len * 0.5)];
    this.metrics.network.p95Latency = sorted[Math.floor(len * 0.95)];
    this.metrics.network.p99Latency = sorted[Math.floor(len * 0.99)];
  }

  private startFPSMonitoring(): void {
    let lastTime = performance.now();
    let frameCount = 0;

    const measureFPS = () => {
      if (!this.isMonitoring) {
        return;
      }

      const currentTime = performance.now();
      frameCount++;

      // Update FPS every second
      if (currentTime - lastTime >= 1000) {
        this.metrics.rendering.fps = frameCount;

        // Detect frame drops (less than 50 fps)
        if (frameCount < 50) {
          this.metrics.rendering.frameDrops++;
        }

        frameCount = 0;
        lastTime = currentTime;
      }

      requestAnimationFrame(measureFPS);
    };

    requestAnimationFrame(measureFPS);
  }

  private startMemoryMonitoring(): void {
    const updateMemory = () => {
      if (!this.isMonitoring) {
        return;
      }

      // Check if memory API is available
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        this.metrics.memory.used = memory.usedJSHeapSize;
        this.metrics.memory.limit = memory.jsHeapSizeLimit;
        this.metrics.memory.percentage = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

        this.addEvent({
          type: 'memory_snapshot',
          value: memory.usedJSHeapSize,
          timestamp: Date.now()
        });
      }

      // Check memory every 10 seconds
      setTimeout(updateMemory, 10000);
    };

    updateMemory();
  }

  private addEvent(event: MetricEvent): void {
    this.events.push(event);

    // Trim events if too many
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  private report(): void {
    const metrics = this.getMetrics();

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[PerformanceMonitor]', this.generateReport());
    }

    // Send to analytics if callback provided
    if (this.analyticsCallback) {
      this.analyticsCallback(metrics);
    }
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * React hook for using performance monitor
 */
export function usePerformanceMonitor() {
  const trackCacheHit = () => performanceMonitor.trackCacheHit();
  const trackCacheMiss = () => performanceMonitor.trackCacheMiss();
  const trackNetworkRequest = (latency: number, success = true) =>
    performanceMonitor.trackNetworkRequest(latency, success);
  const trackRenderFrame = (renderTime: number) =>
    performanceMonitor.trackRenderFrame(renderTime);
  const getMetrics = () => performanceMonitor.getMetrics();

  return {
    trackCacheHit,
    trackCacheMiss,
    trackNetworkRequest,
    trackRenderFrame,
    getMetrics
  };
}