/**
 * UpdateBatcher - Memory-aware batching for efficient updates
 * Reduces render frequency and memory allocation
 */

import { MemoryManager } from '../memory/MemoryManager';

export interface BatchConfig {
  maxBatchSize: number;
  maxBatchWaitMs: number;
  flushOnMemoryPressure: boolean;
  memoryThresholdMb?: number;
}

const DEFAULT_CONFIG: BatchConfig = {
  maxBatchSize: 100,
  maxBatchWaitMs: 50,
  flushOnMemoryPressure: true,
  memoryThresholdMb: 400
};

export class UpdateBatcher<K, V> {
  private pendingUpdates: Map<K, V> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;
  private config: BatchConfig;
  private processingCallback: ((updates: Map<K, V>) => void) | null = null;
  private memoryManager: MemoryManager;
  private lastFlushTime: number = Date.now();
  private updateCount: number = 0;
  private batchCount: number = 0;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryManager = MemoryManager.getInstance();
  }

  /**
   * Add an update to the batch
   */
  add(key: K, update: V): void {
    this.pendingUpdates.set(key, update);
    this.updateCount++;

    // Check if we should flush immediately
    if (this.shouldFlushImmediately()) {
      this.flush();
      return;
    }

    // Schedule batch processing if not already scheduled
    if (!this.batchTimer && this.processingCallback) {
      this.scheduleBatch();
    }
  }

  /**
   * Add multiple updates at once
   */
  addBatch(updates: Map<K, V> | Array<[K, V]>): void {
    const updatesMap = updates instanceof Map ? updates : new Map(updates);
    
    updatesMap.forEach((value, key) => {
      this.pendingUpdates.set(key, value);
      this.updateCount++;
    });

    if (this.shouldFlushImmediately()) {
      this.flush();
      return;
    }

    if (!this.batchTimer && this.processingCallback) {
      this.scheduleBatch();
    }
  }

  /**
   * Set the callback for processing batches
   */
  onBatch(callback: (updates: Map<K, V>) => void): void {
    this.processingCallback = callback;
  }

  /**
   * Schedule batch processing
   */
  private scheduleBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.config.maxBatchWaitMs);
  }

  /**
   * Process the current batch
   */
  processBatch(callback?: (updates: Map<K, V>) => void): void {
    if (this.pendingUpdates.size === 0) {
      this.clearBatchTimer();
      return;
    }

    // Use provided callback or default
    const processCallback = callback || this.processingCallback;
    
    if (!processCallback) {
      console.warn('[UpdateBatcher] No processing callback set');
      return;
    }

    // Create a copy of updates to process
    const updates = new Map(this.pendingUpdates);
    
    // Clear pending updates
    this.pendingUpdates.clear();
    this.clearBatchTimer();
    
    // Update statistics
    this.batchCount++;
    this.lastFlushTime = Date.now();

    // Process the batch
    try {
      processCallback(updates);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[UpdateBatcher] Processed batch of ${updates.size} updates`);
      }
    } catch (error) {
      console.error('[UpdateBatcher] Error processing batch:', error);
    }
  }

  /**
   * Force flush all pending updates
   */
  flush(): void {
    if (this.pendingUpdates.size > 0) {
      this.processBatch();
    }
  }

  /**
   * Check if we should flush immediately
   */
  private shouldFlushImmediately(): boolean {
    // Check batch size limit
    if (this.pendingUpdates.size >= this.config.maxBatchSize) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[UpdateBatcher] Flushing due to batch size limit');
      }
      return true;
    }

    // Check memory pressure
    if (this.config.flushOnMemoryPressure) {
      const stats = this.memoryManager.getMemoryStats();
      const heapUsedMb = stats.heapUsed / 1024 / 1024;
      
      if (heapUsedMb > (this.config.memoryThresholdMb || 400)) {
        console.warn(`[UpdateBatcher] Flushing due to memory pressure: ${heapUsedMb.toFixed(2)}MB`);
        return true;
      }
    }

    return false;
  }

  /**
   * Clear the batch timer
   */
  private clearBatchTimer(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Get current batch size
   */
  get size(): number {
    return this.pendingUpdates.size;
  }

  /**
   * Check if there are pending updates
   */
  get hasPendingUpdates(): boolean {
    return this.pendingUpdates.size > 0;
  }

  /**
   * Get statistics about batching
   */
  getStats(): {
    pendingCount: number;
    totalUpdates: number;
    totalBatches: number;
    averageBatchSize: number;
    timeSinceLastFlush: number;
  } {
    return {
      pendingCount: this.pendingUpdates.size,
      totalUpdates: this.updateCount,
      totalBatches: this.batchCount,
      averageBatchSize: this.batchCount > 0 ? this.updateCount / this.batchCount : 0,
      timeSinceLastFlush: Date.now() - this.lastFlushTime
    };
  }

  /**
   * Clear all pending updates without processing
   */
  clear(): void {
    this.pendingUpdates.clear();
    this.clearBatchTimer();
  }

  /**
   * Dispose of the batcher
   */
  dispose(): void {
    this.clear();
    this.processingCallback = null;
  }
}

/**
 * Create a ticker update batcher specifically for price updates
 */
export function createTickerBatcher(
  onUpdate: (updates: Map<string, any>) => void
): UpdateBatcher<string, any> {
  const batcher = new UpdateBatcher<string, any>({
    maxBatchSize: 100,
    maxBatchWaitMs: 50,
    flushOnMemoryPressure: true,
    memoryThresholdMb: 400
  });
  
  batcher.onBatch(onUpdate);
  return batcher;
}

/**
 * Create a kline update batcher for candlestick data
 */
export function createKlineBatcher(
  onUpdate: (updates: Map<string, any>) => void
): UpdateBatcher<string, any> {
  const batcher = new UpdateBatcher<string, any>({
    maxBatchSize: 50,
    maxBatchWaitMs: 100,
    flushOnMemoryPressure: true,
    memoryThresholdMb: 400
  });
  
  batcher.onBatch(onUpdate);
  return batcher;
}