/**
 * Health Monitor - System Health Tracking
 * Monitors machine health, WebSocket connectivity, and error rates
 */

import { EventEmitter } from 'events';
import * as os from 'os';
import { IHealthMonitor, HealthStatus } from '../types';

interface HealthMetric {
  timestamp: Date;
  cpuUsage: number;
  memoryUsage: number;
  uptime: number;
  websocketConnected: boolean;
  errorRate: number;
}

export class HealthMonitor extends EventEmitter implements IHealthMonitor {
  private machineId: string = '';
  private startTime: Date = new Date();
  private isRunning = false;

  // Health check interval
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private config = {
    checkInterval: 30000, // 30 seconds
    historySize: 100,
    errorRateWindow: 300000 // 5 minutes
  };

  // Metrics tracking
  private metricsHistory: HealthMetric[] = [];

  // Error tracking
  private errorLog: Array<{ timestamp: Date; source: string; message: string }> = [];

  // Component status
  private componentStatus = {
    binance: false,
    database: false,
    workers: false
  };

  private lastComponentUpdate = {
    binance: new Date(),
    database: new Date(),
    workers: new Date()
  };

  constructor() {
    super();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.startTime = new Date();
    this.isRunning = true;

    console.log(`[HealthMonitor] Starting health monitoring`);

    // Start health check loop
    this.startHealthCheckLoop();

    console.log(`[HealthMonitor] Health monitoring started (check interval: ${this.config.checkInterval}ms)`);
  }

  private startHealthCheckLoop(): void {
    this.healthCheckTimer = setInterval(() => {
      if (this.isRunning) {
        this.performHealthCheck();
      }
    }, this.config.checkInterval);
  }

  private performHealthCheck(): void {
    // Collect system metrics
    const cpuUsage = this.getCpuUsage();
    const memoryUsage = this.getMemoryUsagePercent();
    const uptime = Date.now() - this.startTime.getTime();
    const websocketConnected = this.componentStatus.binance;
    const errorRate = this.calculateErrorRate();

    const metric: HealthMetric = {
      timestamp: new Date(),
      cpuUsage,
      memoryUsage,
      uptime,
      websocketConnected,
      errorRate
    };

    // Add to history
    this.metricsHistory.push(metric);
    if (this.metricsHistory.length > this.config.historySize) {
      this.metricsHistory.shift();
    }

    // Emit health update
    this.emit('health_update', this.getHealth());

    // Check for critical issues
    if (cpuUsage > 90) {
      this.recordError('system', `High CPU usage: ${cpuUsage.toFixed(1)}%`);
    }

    if (memoryUsage > 90) {
      this.recordError('system', `High memory usage: ${memoryUsage.toFixed(1)}%`);
    }

    if (errorRate > 10) {
      this.recordError('system', `High error rate: ${errorRate.toFixed(1)} errors/min`);
    }
  }

  private getCpuUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - Math.floor((idle / total) * 100);

    return Math.max(0, Math.min(100, usage));
  }

  private getMemoryUsagePercent(): number {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return (usedMem / totalMem) * 100;
  }

  private calculateErrorRate(): number {
    if (this.errorLog.length === 0) return 0;

    const now = Date.now();
    const windowStart = now - this.config.errorRateWindow;

    const recentErrors = this.errorLog.filter(
      e => e.timestamp.getTime() >= windowStart
    );

    // Errors per minute
    return (recentErrors.length / (this.config.errorRateWindow / 60000));
  }

  updateComponentStatus(
    component: 'binance' | 'database' | 'workers',
    status: boolean
  ): void {
    this.componentStatus[component] = status;
    this.lastComponentUpdate[component] = new Date();

    // Trigger immediate health check
    if (this.isRunning) {
      this.performHealthCheck();
    }
  }

  recordError(source: string, message: string, details?: any): void {
    const error = {
      timestamp: new Date(),
      source,
      message
    };

    this.errorLog.push(error);

    // Keep error log size limited
    if (this.errorLog.length > 1000) {
      this.errorLog.shift();
    }

    // Emit error event
    this.emit('error_recorded', {
      source,
      message,
      details,
      errorRate: this.calculateErrorRate()
    });

    console.error(`[HealthMonitor] Error recorded from ${source}: ${message}`, details || '');
  }

  getHealth(): HealthStatus {
    const latestMetric = this.metricsHistory[this.metricsHistory.length - 1];
    const uptime = Date.now() - this.startTime.getTime();

    if (!latestMetric) {
      return {
        status: 'unhealthy',
        uptime: uptime,
        lastCheck: new Date(),
        components: {
          binance: this.componentStatus.binance,
          database: this.componentStatus.database,
          workers: this.componentStatus.workers
        },
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          activeSignals: 0,
          queueDepth: 0
        }
      };
    }

    // Determine overall status based on components and metrics
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check component health
    if (!this.componentStatus.binance || !this.componentStatus.database || !this.componentStatus.workers) {
      status = 'unhealthy';
    } else if (latestMetric.cpuUsage > 80 || latestMetric.memoryUsage > 80) {
      status = 'degraded';
    } else if (latestMetric.errorRate > 5) {
      status = 'degraded';
    }

    return {
      status,
      uptime,
      lastCheck: latestMetric.timestamp,
      components: {
        binance: this.componentStatus.binance,
        database: this.componentStatus.database,
        workers: this.componentStatus.workers
      },
      metrics: {
        cpuUsage: latestMetric.cpuUsage,
        memoryUsage: latestMetric.memoryUsage,
        activeSignals: 0, // Will be updated by orchestrator
        queueDepth: 0 // Will be updated by orchestrator
      }
    };
  }

  getMetricsHistory(): HealthMetric[] {
    return [...this.metricsHistory];
  }

  getErrorLog(): Array<{ timestamp: Date; source: string; message: string }> {
    return [...this.errorLog];
  }

  clearErrorLog(): void {
    this.errorLog = [];
    console.log('[HealthMonitor] Error log cleared');
  }

  async stop(): Promise<void> {
    console.log('[HealthMonitor] Stopping...');
    this.isRunning = false;

    // Stop health check loop
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    console.log('[HealthMonitor] Stopped');
  }

  getStats() {
    const health = this.getHealth();
    const recentErrors = this.errorLog.slice(-10);

    return {
      status: health.status,
      uptime: health.uptime,
      cpuUsage: health.metrics.cpuUsage,
      memoryUsage: health.metrics.memoryUsage,
      errorRate: this.calculateErrorRate(),
      components: health.components,
      recentErrors,
      metricsHistorySize: this.metricsHistory.length,
      errorLogSize: this.errorLog.length
    };
  }
}
