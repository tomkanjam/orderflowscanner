/**
 * Parallel Screener - Strategy 1: Trader Parallelization
 * Distributes traders across worker thread pool for concurrent filter execution
 */

import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import * as path from 'path';
import {
  IParallelScreener,
  CloudTrader,
  MarketData,
  TraderResult,
  WorkerPoolConfig,
  WorkerTask,
  WorkerResult
} from '../types';

interface ManagedWorker {
  id: string;
  worker: Worker;
  busy: boolean;
  tasksProcessed: number;
  createdAt: Date;
}

export class ParallelScreener extends EventEmitter implements IParallelScreener {
  private workers: ManagedWorker[] = [];
  private taskQueue: WorkerTask[] = [];
  private config: WorkerPoolConfig;
  private isShuttingDown = false;
  private pendingTasks = new Map<string, {
    resolve: (result: WorkerResult) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  constructor() {
    super();
    this.config = {
      minWorkers: 1,
      maxWorkers: 4,
      taskTimeout: 30000,
      maxQueueSize: 1000
    };
  }

  async initialize(numWorkers: number): Promise<void> {
    this.config.maxWorkers = Math.min(numWorkers, 8); // Cap at 8
    this.config.minWorkers = Math.max(1, Math.floor(numWorkers / 2));

    console.log(`[ParallelScreener] Initializing with ${this.config.minWorkers}-${this.config.maxWorkers} workers`);

    // Spawn initial worker pool
    for (let i = 0; i < this.config.minWorkers; i++) {
      await this.spawnWorker();
    }

    console.log(`[ParallelScreener] Initialized with ${this.workers.length} workers`);
  }

  private async spawnWorker(): Promise<void> {
    const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const workerPath = path.join(__dirname, '../workers/screener-worker.js');

    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath);

      const managedWorker: ManagedWorker = {
        id: workerId,
        worker,
        busy: false,
        tasksProcessed: 0,
        createdAt: new Date()
      };

      worker.on('message', (message: any) => {
        if (message.type === 'READY') {
          this.workers.push(managedWorker);
          console.log(`[ParallelScreener] Worker ${workerId} ready`);
          resolve();
        } else if (message.type === 'FILTER_RESULTS') {
          this.handleWorkerResult(workerId, message);
        } else if (message.type === 'ERROR') {
          this.handleWorkerError(workerId, message.error);
        }
      });

      worker.on('error', (error) => {
        console.error(`[ParallelScreener] Worker ${workerId} error:`, error);
        this.removeWorker(workerId);
        reject(error);
      });

      worker.on('exit', (code) => {
        console.log(`[ParallelScreener] Worker ${workerId} exited with code ${code}`);
        this.removeWorker(workerId);
      });

      // Timeout if worker doesn't become ready
      setTimeout(() => {
        if (!this.workers.find(w => w.id === workerId)) {
          reject(new Error(`Worker ${workerId} failed to initialize`));
          worker.terminate();
        }
      }, 10000);
    });
  }

  private removeWorker(workerId: string): void {
    const index = this.workers.findIndex(w => w.id === workerId);
    if (index !== -1) {
      this.workers.splice(index, 1);
      console.log(`[ParallelScreener] Removed worker ${workerId}, ${this.workers.length} remaining`);
    }
  }

  async executeFilters(
    traders: CloudTrader[],
    marketData: MarketData
  ): Promise<Map<string, TraderResult>> {
    if (this.isShuttingDown) {
      throw new Error('ParallelScreener is shutting down');
    }

    if (traders.length === 0) {
      return new Map();
    }

    console.log(`[ParallelScreener] Executing filters for ${traders.length} traders across ${this.workers.length} workers`);

    // Convert Map to Record for worker serialization
    const marketDataSerialized = {
      symbols: marketData.symbols,
      tickers: Object.fromEntries(marketData.tickers),
      klines: Object.fromEntries(
        Array.from(marketData.klines.entries()).map(([symbol, intervals]) => [
          symbol,
          Object.fromEntries(intervals)
        ])
      )
    };

    // Distribute traders across workers
    const chunks = this.distributeTraders(traders, this.workers.length);
    const workerPromises: Promise<WorkerResult>[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (chunk.length === 0) continue;

      const task: WorkerTask = {
        id: `task-${Date.now()}-${i}`,
        type: 'filter',
        traderId: chunk.map(t => t.id).join(','),
        payload: {
          traders: chunk.map(t => ({
            id: t.id,
            name: t.name,
            filterCode: t.filter.code,
            refreshInterval: t.filter.refreshInterval || '5m',
            requiredTimeframes: t.filter.requiredTimeframes
          })),
          marketData: marketDataSerialized
        },
        priority: 'normal',
        createdAt: new Date()
      };

      workerPromises.push(this.executeTask(task));
    }

    // Wait for all workers to complete
    const results = await Promise.all(workerPromises);

    // Aggregate results
    return this.aggregateResults(results);
  }

  private distributeTraders(traders: CloudTrader[], numWorkers: number): CloudTrader[][] {
    if (numWorkers === 0) {
      return [traders];
    }

    const chunks: CloudTrader[][] = Array(numWorkers).fill(null).map(() => []);

    // Round-robin distribution
    traders.forEach((trader, i) => {
      chunks[i % numWorkers].push(trader);
    });

    return chunks.filter(chunk => chunk.length > 0);
  }

  private async executeTask(task: WorkerTask): Promise<WorkerResult> {
    return new Promise((resolve, reject) => {
      // Find available worker
      const worker = this.getAvailableWorker();

      if (!worker) {
        reject(new Error('No available workers'));
        return;
      }

      // Mark worker as busy
      worker.busy = true;

      // Set timeout
      const timeout = setTimeout(() => {
        this.pendingTasks.delete(task.id);
        worker.busy = false;
        reject(new Error(`Task ${task.id} timed out after ${this.config.taskTimeout}ms`));
      }, this.config.taskTimeout);

      // Store pending task
      this.pendingTasks.set(task.id, { resolve, reject, timeout });

      // Send task to worker
      worker.worker.postMessage({
        type: 'RUN_FILTERS',
        data: task.payload
      });
    });
  }

  private getAvailableWorker(): ManagedWorker | null {
    // Find idle worker
    const idle = this.workers.find(w => !w.busy);
    if (idle) return idle;

    // All workers busy - check if we can spawn more
    if (this.workers.length < this.config.maxWorkers) {
      console.log(`[ParallelScreener] All workers busy, spawning additional worker`);
      // Don't await - will be available soon
      this.spawnWorker().catch(err =>
        console.error('[ParallelScreener] Failed to spawn worker:', err)
      );
    }

    // Return least busy worker
    return this.workers.reduce((least, current) =>
      current.tasksProcessed < least.tasksProcessed ? current : least
    );
  }

  private handleWorkerResult(workerId: string, message: any): void {
    const worker = this.workers.find(w => w.id === workerId);
    if (!worker) return;

    worker.busy = false;
    worker.tasksProcessed++;

    // Find pending task (we don't have task ID in response, so process first)
    const [taskId, pending] = Array.from(this.pendingTasks.entries())[0] || [];

    if (!pending) {
      console.warn(`[ParallelScreener] Received result but no pending task`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingTasks.delete(taskId);

    // Resolve with worker results
    const result: WorkerResult = {
      taskId,
      traderId: '',
      success: true,
      data: message.data,
      duration: 0
    };

    pending.resolve(result);
  }

  private handleWorkerError(workerId: string, error: string): void {
    const worker = this.workers.find(w => w.id === workerId);
    if (!worker) return;

    worker.busy = false;

    // Reject first pending task
    const [taskId, pending] = Array.from(this.pendingTasks.entries())[0] || [];

    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingTasks.delete(taskId);
      pending.reject(new Error(error));
    }
  }

  private aggregateResults(workerResults: WorkerResult[]): Map<string, TraderResult> {
    const resultsMap = new Map<string, TraderResult>();

    for (const workerResult of workerResults) {
      if (!workerResult.success || !workerResult.data) {
        console.error('[ParallelScreener] Worker result failed:', workerResult.error);
        continue;
      }

      const traderResults = workerResult.data.results;

      for (const result of traderResults) {
        resultsMap.set(result.traderId, {
          traderId: result.traderId,
          traderName: result.traderName,
          enabled: true,
          matches: result.matches,
          error: result.error,
          executionTime: result.executionTime
        });
      }
    }

    return resultsMap;
  }

  async scaleWorkerPool(targetWorkers: number): Promise<void> {
    const current = this.workers.length;
    const target = Math.min(targetWorkers, this.config.maxWorkers);

    if (target > current) {
      // Scale up
      const toSpawn = target - current;
      console.log(`[ParallelScreener] Scaling up: spawning ${toSpawn} workers`);

      const spawnPromises = [];
      for (let i = 0; i < toSpawn; i++) {
        spawnPromises.push(this.spawnWorker());
      }

      await Promise.all(spawnPromises);
    } else if (target < current) {
      // Scale down
      const toTerminate = current - target;
      console.log(`[ParallelScreener] Scaling down: terminating ${toTerminate} workers`);

      // Terminate idle workers first
      const toRemove = this.workers
        .filter(w => !w.busy)
        .slice(0, toTerminate);

      for (const worker of toRemove) {
        await worker.worker.terminate();
        this.removeWorker(worker.id);
      }
    }
  }

  async shutdown(): Promise<void> {
    console.log('[ParallelScreener] Shutting down...');
    this.isShuttingDown = true;

    // Reject all pending tasks
    this.pendingTasks.forEach((pending, taskId) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('ParallelScreener is shutting down'));
    });
    this.pendingTasks.clear();

    // Terminate all workers
    const terminatePromises = this.workers.map(w => w.worker.terminate());
    await Promise.all(terminatePromises);

    this.workers = [];
    console.log('[ParallelScreener] Shutdown complete');
  }

  getStats() {
    return {
      totalWorkers: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queueDepth: this.taskQueue.length,
      pendingTasks: this.pendingTasks.size,
      tasksProcessed: this.workers.reduce((sum, w) => sum + w.tasksProcessed, 0)
    };
  }
}
