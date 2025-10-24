/**
 * Dynamic Scaler - Intelligent Resource Scaling
 * Monitors workload and scales Fly machine resources (vCPUs) and worker pools
 */

import { EventEmitter } from 'events';
import { IDynamicScaler, ScalingPolicy, ScalingDecision, FlyMachineConfig } from '../types';

interface ScalingMetrics {
  signalQueueDepth: number;
  analysisQueueDepth: number;
  activeWorkers: number;
  cpuUsage: number;
  memoryUsage: number;
  timestamp: Date;
}

interface ScalingHistory {
  timestamp: Date;
  action: 'scale_up' | 'scale_down' | 'no_change';
  fromCpus: number;
  toCpus: number;
  reason: string;
}

export class DynamicScaler extends EventEmitter implements IDynamicScaler {
  private machineId: string = '';
  private currentCpus: number = 1;
  private currentWorkers: number = 1;

  private policy: ScalingPolicy = {
    minCpus: 1,
    maxCpus: 8,
    scaleUpThreshold: 10,
    scaleDownThreshold: 2,
    cooldownPeriod: 300 // 5 minutes (in seconds)
  };

  private evaluationIntervalMs: number = 60000; // 1 minute in milliseconds

  private lastScalingAction: Date | null = null;
  private scalingHistory: ScalingHistory[] = [];
  private evaluationIntervalTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  // Metrics collection
  private metricsBuffer: ScalingMetrics[] = [];
  private maxMetricsHistory = 10;

  constructor() {
    super();
  }

  async initialize(
    config: FlyMachineConfig,
    policy: ScalingPolicy
  ): Promise<void> {
    this.machineId = config.machineId;
    this.currentCpus = config.cpus;
    this.currentWorkers = Math.max(1, Math.floor(config.cpus / 2));
    this.policy = policy;

    console.log(`[DynamicScaler] Initializing for machine ${config.machineId}`);
    console.log(`[DynamicScaler] Current CPUs: ${config.cpus}, Workers: ${this.currentWorkers}`);
    console.log(`[DynamicScaler] Policy:`, this.policy);

    // Start evaluation loop
    this.startEvaluationLoop();

    console.log(`[DynamicScaler] Initialized (evaluation every ${this.evaluationIntervalMs}ms)`);
  }

  private startEvaluationLoop(): void {
    this.evaluationIntervalTimer = setInterval(() => {
      if (!this.isShuttingDown) {
        this.evaluateScaling();
      }
    }, this.evaluationIntervalMs);
  }

  recordMetrics(metrics: {
    signalQueueDepth: number;
    analysisQueueDepth: number;
    activeWorkers: number;
    cpuUsage: number;
    memoryUsage: number;
  }): void {
    const scalingMetrics: ScalingMetrics = {
      ...metrics,
      timestamp: new Date()
    };

    this.metricsBuffer.push(scalingMetrics);

    // Keep buffer size limited
    if (this.metricsBuffer.length > this.maxMetricsHistory) {
      this.metricsBuffer.shift();
    }
  }

  async evaluateScaling(): Promise<ScalingDecision> {
    if (this.metricsBuffer.length === 0) {
      // No metrics to evaluate - return no_change decision
      return {
        action: 'no_change',
        targetCpus: this.currentCpus,
        reason: 'No metrics available',
        currentLoad: {
          signalQueueDepth: 0,
          analysisQueueDepth: 0,
          activeWorkers: this.currentWorkers
        }
      };
    }

    // Check cooldown period
    if (this.lastScalingAction) {
      const timeSinceLastAction = Date.now() - this.lastScalingAction.getTime();
      const cooldownMs = this.policy.cooldownPeriod * 1000;
      if (timeSinceLastAction < cooldownMs) {
        // Still in cooldown - return no_change decision
        const avgMetrics = this.calculateAverageMetrics();
        return {
          action: 'no_change',
          targetCpus: this.currentCpus,
          reason: `In cooldown period (${Math.ceil((cooldownMs - timeSinceLastAction) / 1000)}s remaining)`,
          currentLoad: {
            signalQueueDepth: avgMetrics.signalQueueDepth,
            analysisQueueDepth: avgMetrics.analysisQueueDepth,
            activeWorkers: avgMetrics.activeWorkers
          }
        };
      }
    }

    // Get average metrics over recent history
    const avgMetrics = this.calculateAverageMetrics();

    // Make scaling decision
    const decision = this.makeScalingDecision(avgMetrics);

    if (decision.action !== 'no_change') {
      await this.executeScaling(decision);
    }

    return decision;
  }

  private calculateAverageMetrics(): ScalingMetrics {
    const sum = this.metricsBuffer.reduce(
      (acc, m) => ({
        signalQueueDepth: acc.signalQueueDepth + m.signalQueueDepth,
        analysisQueueDepth: acc.analysisQueueDepth + m.analysisQueueDepth,
        activeWorkers: acc.activeWorkers + m.activeWorkers,
        cpuUsage: acc.cpuUsage + m.cpuUsage,
        memoryUsage: acc.memoryUsage + m.memoryUsage,
        timestamp: new Date()
      }),
      {
        signalQueueDepth: 0,
        analysisQueueDepth: 0,
        activeWorkers: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        timestamp: new Date()
      }
    );

    const count = this.metricsBuffer.length;

    return {
      signalQueueDepth: Math.round(sum.signalQueueDepth / count),
      analysisQueueDepth: Math.round(sum.analysisQueueDepth / count),
      activeWorkers: Math.round(sum.activeWorkers / count),
      cpuUsage: sum.cpuUsage / count,
      memoryUsage: sum.memoryUsage / count,
      timestamp: new Date()
    };
  }

  private makeScalingDecision(metrics: ScalingMetrics): ScalingDecision {
    const totalQueueDepth = metrics.signalQueueDepth + metrics.analysisQueueDepth;
    let targetCpus = this.currentCpus;
    let action: 'scale_up' | 'scale_down' | 'no_change' = 'no_change';
    let reason = '';

    // Scale up conditions
    if (totalQueueDepth >= this.policy.scaleUpThreshold) {
      targetCpus = Math.min(this.currentCpus * 2, this.policy.maxCpus);
      if (targetCpus > this.currentCpus) {
        action = 'scale_up';
        reason = `Queue depth (${totalQueueDepth}) exceeds scale-up threshold (${this.policy.scaleUpThreshold})`;
      }
    }
    // Scale down conditions
    else if (totalQueueDepth <= this.policy.scaleDownThreshold && this.currentCpus > this.policy.minCpus) {
      targetCpus = Math.max(Math.floor(this.currentCpus / 2), this.policy.minCpus);
      if (targetCpus < this.currentCpus) {
        action = 'scale_down';
        reason = `Queue depth (${totalQueueDepth}) below scale-down threshold (${this.policy.scaleDownThreshold})`;
      }
    }

    // Additional consideration: CPU usage
    if (metrics.cpuUsage > 80 && action === 'no_change') {
      const newTarget = Math.min(this.currentCpus + 1, this.policy.maxCpus);
      if (newTarget > this.currentCpus) {
        targetCpus = newTarget;
        action = 'scale_up';
        reason = `High CPU usage (${metrics.cpuUsage.toFixed(1)}%)`;
      }
    }

    if (action === 'no_change') {
      reason = `Load stable (queue: ${totalQueueDepth}, CPU: ${metrics.cpuUsage.toFixed(1)}%)`;
    }

    return {
      action,
      targetCpus,
      reason,
      currentLoad: {
        signalQueueDepth: metrics.signalQueueDepth,
        analysisQueueDepth: metrics.analysisQueueDepth,
        activeWorkers: metrics.activeWorkers
      }
    };
  }

  async executeScaling(decision: ScalingDecision): Promise<void> {
    const targetWorkers = Math.max(1, Math.floor(decision.targetCpus / 2));

    console.log(`[DynamicScaler] Scaling decision:`, {
      from: `${this.currentCpus} CPUs, ${this.currentWorkers} workers`,
      to: `${decision.targetCpus} CPUs, ${targetWorkers} workers`,
      reason: decision.reason
    });

    try {
      // Update Fly machine resources
      await this.updateMachineResources(decision.targetCpus);

      // Record scaling action
      this.scalingHistory.push({
        timestamp: new Date(),
        action: decision.action,
        fromCpus: this.currentCpus,
        toCpus: decision.targetCpus,
        reason: decision.reason
      });

      // Keep history limited
      if (this.scalingHistory.length > 50) {
        this.scalingHistory.shift();
      }

      // Update current state
      this.currentCpus = decision.targetCpus;
      this.currentWorkers = targetWorkers;
      this.lastScalingAction = new Date();

      // Emit scaling event
      this.emit('scaling_complete', {
        cpus: this.currentCpus,
        workers: this.currentWorkers,
        reason: decision.reason
      });

      console.log(`[DynamicScaler] Scaling complete: ${this.currentCpus} CPUs, ${this.currentWorkers} workers`);

    } catch (error) {
      console.error('[DynamicScaler] Scaling failed:', error);
      this.emit('scaling_failed', {
        error: error instanceof Error ? error.message : String(error),
        decision
      });
    }
  }

  private async updateMachineResources(targetCpus: number): Promise<void> {
    // This will be implemented to call Fly.io Machines API
    // For now, we'll simulate the API call

    console.log(`[DynamicScaler] Calling Fly.io API to update machine ${this.machineId} to ${targetCpus} vCPUs`);

    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // TODO: Implement actual Fly.io Machines API call
    // const response = await fetch(`https://api.machines.dev/v1/apps/${appName}/machines/${machineId}`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${FLY_API_TOKEN}`,
    //     'Content-Type': 'application/json'
    //   },
    //   body: JSON.stringify({
    //     config: {
    //       guest: {
    //         cpu_kind: 'shared',
    //         cpus: targetCpus,
    //         memory_mb: 256 * targetCpus
    //       }
    //     }
    //   })
    // });

    console.log(`[DynamicScaler] Machine resources updated successfully`);
  }

  getScalingHistory(): ScalingHistory[] {
    return [...this.scalingHistory];
  }

  getCurrentState() {
    return {
      machineId: this.machineId,
      currentCpus: this.currentCpus,
      currentWorkers: this.currentWorkers,
      policy: { ...this.policy },
      lastScalingAction: this.lastScalingAction,
      metricsHistory: [...this.metricsBuffer],
      scalingHistory: this.getScalingHistory()
    };
  }

  updatePolicy(policy: Partial<ScalingPolicy>): void {
    this.policy = { ...this.policy, ...policy };
    console.log(`[DynamicScaler] Policy updated:`, this.policy);
  }

  async forceScale(targetCpus: number, reason: string): Promise<void> {
    if (targetCpus < this.policy.minCpus || targetCpus > this.policy.maxCpus) {
      throw new Error(`Target CPUs (${targetCpus}) outside policy bounds (${this.policy.minCpus}-${this.policy.maxCpus})`);
    }

    const latestMetrics = this.metricsBuffer[this.metricsBuffer.length - 1];

    const decision: ScalingDecision = {
      action: targetCpus > this.currentCpus ? 'scale_up' : (targetCpus < this.currentCpus ? 'scale_down' : 'no_change'),
      targetCpus,
      reason: `Manual scaling: ${reason}`,
      currentLoad: {
        signalQueueDepth: latestMetrics?.signalQueueDepth || 0,
        analysisQueueDepth: latestMetrics?.analysisQueueDepth || 0,
        activeWorkers: latestMetrics?.activeWorkers || 0
      }
    };

    await this.executeScaling(decision);
  }

  async shutdown(): Promise<void> {
    console.log('[DynamicScaler] Shutting down...');
    this.isShuttingDown = true;

    // Stop evaluation loop
    if (this.evaluationIntervalTimer) {
      clearInterval(this.evaluationIntervalTimer);
      this.evaluationIntervalTimer = null;
    }

    console.log('[DynamicScaler] Shutdown complete');
  }

  getStats() {
    const recentMetrics = this.metricsBuffer[this.metricsBuffer.length - 1];
    const recentScaling = this.scalingHistory[this.scalingHistory.length - 1];

    return {
      currentCpus: this.currentCpus,
      currentWorkers: this.currentWorkers,
      policy: { ...this.policy },
      lastScalingAction: this.lastScalingAction,
      recentMetrics,
      recentScaling,
      scalingHistoryCount: this.scalingHistory.length,
      isInCooldown: this.lastScalingAction
        ? Date.now() - this.lastScalingAction.getTime() < this.policy.cooldownPeriod
        : false
    };
  }
}
