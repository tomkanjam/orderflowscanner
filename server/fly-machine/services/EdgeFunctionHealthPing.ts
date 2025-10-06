/**
 * Edge Function Health Ping Service
 * Prevents cold starts by pinging the Edge Function every 4 minutes
 * Also monitors Edge Function availability and latency
 */

import { EventEmitter } from 'events';

interface HealthPingConfig {
  edgeFunctionUrl: string;
  pingIntervalMs: number; // Default: 240000 (4 minutes)
  timeoutMs: number;       // Default: 5000 (5 seconds)
}

interface HealthPingStats {
  totalPings: number;
  successfulPings: number;
  failedPings: number;
  lastPingTime: Date | null;
  lastPingLatency: number;
  averageLatency: number;
  isHealthy: boolean;
}

export class EdgeFunctionHealthPing extends EventEmitter {
  private config: HealthPingConfig;
  private pingInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  private stats: HealthPingStats = {
    totalPings: 0,
    successfulPings: 0,
    failedPings: 0,
    lastPingTime: null,
    lastPingLatency: 0,
    averageLatency: 0,
    isHealthy: true
  };

  private latencyHistory: number[] = [];
  private readonly MAX_LATENCY_HISTORY = 10;

  constructor(edgeFunctionUrl: string) {
    super();

    this.config = {
      edgeFunctionUrl,
      pingIntervalMs: 4 * 60 * 1000, // 4 minutes
      timeoutMs: 5000 // 5 seconds
    };
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[EdgeFunctionHealthPing] Already running');
      return;
    }

    console.log('[EdgeFunctionHealthPing] Starting health ping service...');
    console.log(`[EdgeFunctionHealthPing] Target: ${this.config.edgeFunctionUrl}`);
    console.log(`[EdgeFunctionHealthPing] Interval: ${this.config.pingIntervalMs / 1000}s`);

    this.isRunning = true;

    // Initial ping immediately
    await this.ping();

    // Start periodic pinging
    this.pingInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.ping();
      }
    }, this.config.pingIntervalMs);

    console.log('[EdgeFunctionHealthPing] Health ping service started');
  }

  private async ping(): Promise<void> {
    const startTime = Date.now();
    this.stats.totalPings++;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(`${this.config.edgeFunctionUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const latency = Date.now() - startTime;
      this.stats.lastPingTime = new Date();
      this.stats.lastPingLatency = latency;

      if (response.ok) {
        this.stats.successfulPings++;
        this.updateLatencyHistory(latency);

        console.log(`[EdgeFunctionHealthPing] ✅ Health check successful (${latency}ms)`);

        // Mark as healthy if was previously unhealthy
        if (!this.stats.isHealthy) {
          this.stats.isHealthy = true;
          this.emit('health_restored', {
            latency,
            timestamp: new Date()
          });
        }

        this.emit('ping_success', {
          latency,
          timestamp: new Date()
        });
      } else {
        throw new Error(`HTTP ${response.status}`);
      }

    } catch (error) {
      this.stats.failedPings++;
      const latency = Date.now() - startTime;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[EdgeFunctionHealthPing] ❌ Health check failed (${latency}ms):`, errorMessage);

      // Mark as unhealthy after first failure
      if (this.stats.isHealthy) {
        this.stats.isHealthy = false;
        this.emit('health_degraded', {
          error: errorMessage,
          timestamp: new Date()
        });
      }

      this.emit('ping_failed', {
        error: errorMessage,
        latency,
        timestamp: new Date()
      });
    }
  }

  private updateLatencyHistory(latency: number): void {
    this.latencyHistory.push(latency);

    // Keep only last N measurements
    if (this.latencyHistory.length > this.MAX_LATENCY_HISTORY) {
      this.latencyHistory.shift();
    }

    // Calculate average latency
    this.stats.averageLatency =
      this.latencyHistory.reduce((sum, l) => sum + l, 0) / this.latencyHistory.length;
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('[EdgeFunctionHealthPing] Stopping health ping service...');
    this.isRunning = false;

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    console.log('[EdgeFunctionHealthPing] Health ping service stopped');
  }

  getStats(): HealthPingStats {
    return { ...this.stats };
  }

  isEdgeFunctionHealthy(): boolean {
    return this.stats.isHealthy;
  }

  /**
   * Force an immediate health check (useful for testing or manual triggers)
   */
  async forceHealthCheck(): Promise<void> {
    console.log('[EdgeFunctionHealthPing] Forcing immediate health check...');
    await this.ping();
  }
}
