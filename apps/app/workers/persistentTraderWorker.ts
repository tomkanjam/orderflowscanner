/**
 * Persistent Trader Worker
 * 
 * Stateful worker that maintains its own view of market data using SharedArrayBuffer.
 * Zero serialization cost - all data is shared memory.
 */

import { KlineInterval } from '../types';
import * as helpers from '../screenerHelpers';
import { BitSet } from '../src/utils/BitSet';

interface WorkerConfig {
  tickerBuffer: SharedArrayBuffer;
  klineBuffer: SharedArrayBuffer;
  metadataBuffer: SharedArrayBuffer;
  updateCounterBuffer: SharedArrayBuffer;
  updateFlagsA: SharedArrayBuffer;
  updateFlagsB: SharedArrayBuffer;
  maxSymbols: number;
  indexToSymbol: Record<number, string>;
  config: {
    maxSymbols: number;
    maxKlinesPerSymbol: number;
    maxIntervals: number;
    tickerSize: number;
    klineSize: number;
    symbolUpdateFlagsSize: number;
  };
}

interface TraderExecution {
  traderId: string;
  filterCode: string;
  refreshInterval: KlineInterval;
  requiredTimeframes: KlineInterval[];
}

interface WorkerMessage {
  type: 'INIT' | 'ADD_TRADER' | 'REMOVE_TRADER' | 'UPDATE_TRADER' | 'RUN_TRADERS' | 'GET_STATUS' | 'CLEANUP' | 'PING' | 'PROCESS_UPDATES';
  data?: any;
  traderId?: string;
  readFlags?: ArrayBuffer;
  cycle?: number;
}

interface WorkerResponse {
  type: 'READY' | 'RESULTS' | 'STATUS' | 'ERROR' | 'CLEANUP_COMPLETE' | 'PONG';
  data?: any;
  error?: string;
}

class PersistentTraderWorker {
  private tickerView: Float64Array | null = null;
  private klineView: Float64Array | null = null;
  private metadataView: Uint8Array | null = null;
  private updateCounter: Int32Array | null = null;
  private updateFlagsViewA: Uint32Array | null = null;
  private updateFlagsViewB: Uint32Array | null = null;
  private config: WorkerConfig['config'] | null = null;
  private indexToSymbol: Record<number, string> = {};
  
  private traders: Map<string, TraderExecution> = new Map();
  private compiledFilters: Map<string, Function> = new Map();
  private previousMatches: Map<string, Set<string>> = new Map();
  private previousResults: Map<string, any> = new Map(); // For result diffing
  private symbolMap: Map<number, string> = new Map();
  private intervalMap: Map<string, number> = new Map();
  
  private lastUpdateCount = 0;
  private isInitialized = false;
  private updateIntervalId: number | null = null; // Track the interval ID for cleanup
  private isShuttingDown = false; // Flag to prevent operations during shutdown
  
  // Efficiency tracking
  private processingCycle = 0;
  private efficiencyStats = {
    totalSymbols: 0,
    processedSymbols: 0,
    skippedSymbols: 0,
    avgEfficiency: 0
  };
  
  constructor() {
    console.log(`[Worker ${self.name || 'unnamed'}] Constructor called at ${new Date().toISOString()}`);
    // Set up interval mapping
    const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'];
    intervals.forEach((interval, index) => {
      this.intervalMap.set(interval, index);
    });
  }

  /**
   * Initialize with shared buffers
   */
  init(config: WorkerConfig) {
    console.log(`[Worker] Init called at ${new Date().toISOString()}`);
    this.tickerView = new Float64Array(config.tickerBuffer);
    this.klineView = new Float64Array(config.klineBuffer);
    this.metadataView = new Uint8Array(config.metadataBuffer);
    this.updateCounter = new Int32Array(config.updateCounterBuffer);
    this.updateFlagsViewA = new Uint32Array(config.updateFlagsA);
    this.updateFlagsViewB = new Uint32Array(config.updateFlagsB);
    this.config = config.config;
    this.indexToSymbol = config.indexToSymbol || {};
    
    // Read symbol names from metadata
    this.readSymbolNames();
    
    this.isInitialized = true;
    this.lastUpdateCount = Atomics.load(this.updateCounter, 0);
    
    // Start monitoring for updates asynchronously
    console.log(`[Worker] Scheduling startUpdateMonitor`);
    setTimeout(() => this.startUpdateMonitor(), 10);
  }

  /**
   * Read symbol names from metadata buffer
   */
  private readSymbolNames() {
    if (!this.metadataView || !this.config) return;
    
    const decoder = new TextDecoder();
    
    for (let i = 0; i < this.config.maxSymbols; i++) {
      const metadataOffset = i * 256;
      const symbolLength = this.metadataView[metadataOffset];
      
      if (symbolLength === 0) break; // No more symbols
      
      const symbolBytes = this.metadataView.slice(metadataOffset + 1, metadataOffset + 1 + symbolLength);
      const symbol = decoder.decode(symbolBytes);
      this.symbolMap.set(i, symbol);
    }
  }

  /**
   * Monitor for data updates using setInterval
   */
  private startUpdateMonitor() {
    console.log(`[Worker] startUpdateMonitor called at ${new Date().toISOString()}, existing interval: ${this.updateIntervalId}`);
    // Clear any existing interval first
    this.stopUpdateMonitor();
    
    // Create new interval and store its ID for cleanup
    globalIntervalCount++;
    console.log(`[Worker] Creating interval #${globalIntervalCount} - Total active: ${globalIntervalCount}`);
    this.updateIntervalId = setInterval(() => {
      if (this.isShuttingDown || !this.isInitialized) {
        this.stopUpdateMonitor();
        return;
      }
      
      const currentCount = Atomics.load(this.updateCounter!, 0);
      
      if (currentCount !== this.lastUpdateCount) {
        // Data has been updated
        this.lastUpdateCount = currentCount;
        
        // Re-read symbol names in case new symbols were added
        this.readSymbolNames();
        
        // Run all traders with current data
        if (this.traders.size > 0) {
          this.runAllTraders();
        }
      }
    }, 1000); // Check every 1 second (reduced from 10ms for CPU savings)
    console.log(`[Worker] Created interval with ID: ${this.updateIntervalId}`);
  }

  /**
   * Stop the update monitor interval
   */
  private stopUpdateMonitor() {
    console.log(`[Worker] stopUpdateMonitor called at ${new Date().toISOString()}, current interval: ${this.updateIntervalId}`);
    if (this.updateIntervalId !== null) {
      clearInterval(this.updateIntervalId);
      globalIntervalCount--;
      console.log(`[Worker] Cleared interval ${this.updateIntervalId} - Total active: ${globalIntervalCount}`);
      this.updateIntervalId = null;
    } else {
      console.log(`[Worker] No interval to clear - Total active: ${globalIntervalCount}`);
    }
  }

  /**
   * Add or update a trader
   */
  addTrader(trader: TraderExecution) {
    
    if (!trader || !trader.traderId) {
      console.error('[PersistentWorker] Invalid trader data:', trader);
      return;
    }
    
    // Check if trader already exists with identical configuration
    const existing = this.traders.get(trader.traderId);
    if (existing && 
        existing.filterCode === trader.filterCode &&
        existing.refreshInterval === trader.refreshInterval &&
        JSON.stringify(existing.requiredTimeframes) === JSON.stringify(trader.requiredTimeframes)) {
      // Skip duplicate - no need to recompile identical filter
      console.log(`[Worker] Skipping duplicate ADD_TRADER for ${trader.traderId} - filter unchanged`);
      return;
    }
    
    // If updating an existing trader, dispose old function first
    if (existing && this.compiledFilters.has(trader.traderId)) {
      console.log(`[Worker] Updating trader ${trader.traderId} - disposing old filter function`);
      const oldFunction = this.compiledFilters.get(trader.traderId);
      if (oldFunction) {
        // Clear references to help garbage collection
        this.compiledFilters.delete(trader.traderId);
      }
    }
    
    this.traders.set(trader.traderId, trader);
    
    // Compile the filter function only for new or changed traders
    try {
      console.log(`[Worker] Compiling filter for trader ${trader.traderId}`);
      const filterFunction = new Function(
        'ticker',
        'timeframes',
        'helpers',
        'hvnNodes',
        `try { ${trader.filterCode} } catch(e) { console.error('Filter error:', e); return false; }`
      );
      this.compiledFilters.set(trader.traderId, filterFunction);
      console.log(`[Worker] Successfully compiled filter for trader ${trader.traderId}`);
    } catch (error) {
      console.error(`[PersistentWorker] Failed to compile filter for ${trader.traderId}:`, error);
    }
  }

  /**
   * Remove a trader
   */
  removeTrader(traderId: string) {
    console.log(`[Worker] Removing trader ${traderId}`);
    
    // Dispose of compiled function to help garbage collection
    if (this.compiledFilters.has(traderId)) {
      this.compiledFilters.delete(traderId);
      console.log(`[Worker] Disposed filter function for trader ${traderId}`);
    }
    
    this.traders.delete(traderId);
    this.previousMatches.delete(traderId);
    this.previousResults.delete(traderId);
  }

  /**
   * Process update cycle with selective symbol processing
   */
  private processUpdateCycle(readFlags: ArrayBuffer) {
    if (!this.config) return;
    
    this.processingCycle++;
    const readFlagsView = new Uint32Array(readFlags);
    const bitSet = new BitSet(readFlagsView, this.config.maxSymbols);
    const updatedIndices = bitSet.getSetIndices();
    
    if (updatedIndices.length === 0) {
      console.log(`[Worker] Cycle ${this.processingCycle}: No updates to process`);
      return;
    }
    
    const totalSymbols = this.symbolMap.size;
    const efficiency = totalSymbols > 0 ? ((totalSymbols - updatedIndices.length) / totalSymbols * 100) : 0;
    console.log(`[Worker] Cycle ${this.processingCycle}: Processing ${updatedIndices.length}/${totalSymbols} symbols (${efficiency.toFixed(1)}% saved)`);
    
    const startTime = performance.now();
    
    // Use batching for large updates (>50 symbols)
    const BATCH_SIZE = 50;
    const useBatching = updatedIndices.length > BATCH_SIZE;
    
    if (useBatching) {
      console.log(`[Worker] Using batch processing for ${updatedIndices.length} symbols`);
      this.processBatchedUpdates(updatedIndices, BATCH_SIZE);
    } else {
      // Process normally for small updates
      this.processNormalUpdates(updatedIndices);
    }
    
    const executionTime = performance.now() - startTime;
    
    // Update stats
    this.efficiencyStats.totalSymbols += totalSymbols;
    this.efficiencyStats.processedSymbols += updatedIndices.length;
    this.efficiencyStats.skippedSymbols += (totalSymbols - updatedIndices.length);
    this.efficiencyStats.avgEfficiency = this.efficiencyStats.totalSymbols > 0 
      ? (this.efficiencyStats.skippedSymbols / this.efficiencyStats.totalSymbols * 100)
      : 0;
    
    console.log(`[Worker] Cycle ${this.processingCycle} complete in ${executionTime.toFixed(2)}ms`);
  }
  
  /**
   * Process updates normally (for small batches)
   */
  private processNormalUpdates(updatedIndices: number[]) {
    const results: any[] = [];
    const deltaResults: any[] = [];
    
    for (const [traderId, trader] of this.traders) {
      const filterFunction = this.compiledFilters.get(traderId);
      if (!filterFunction) continue;
      
      const result = this.runTraderSelective(traderId, trader, filterFunction, updatedIndices);
      results.push(result);
      
      // Calculate delta from previous result
      const delta = this.calculateResultDelta(traderId, result);
      if (delta) {
        deltaResults.push(delta);
      }
    }
    
    // Only send if there are changes
    if (deltaResults.length > 0 || this.processingCycle === 1) {
      self.postMessage({
        type: 'RESULTS',
        data: {
          results: this.processingCycle === 1 ? results : deltaResults,
          isDelta: this.processingCycle > 1,
          cycle: this.processingCycle,
          efficiency: this.efficiencyStats.avgEfficiency.toFixed(1),
          symbolsProcessed: updatedIndices.length,
          totalSymbols: this.symbolMap.size
        }
      } as WorkerResponse);
    }
  }
  
  /**
   * Calculate delta between current and previous results
   */
  private calculateResultDelta(traderId: string, currentResult: any) {
    const previousResult = this.previousResults.get(traderId);
    
    // Store current result for next comparison
    this.previousResults.set(traderId, {
      matchingSymbols: [...currentResult.matchingSymbols],
      signalSymbols: [...currentResult.signalSymbols]
    });
    
    if (!previousResult) {
      // First time - send full result
      return currentResult;
    }
    
    // Calculate changes
    const prevMatches = new Set(previousResult.matchingSymbols);
    const currMatches = new Set(currentResult.matchingSymbols);
    
    const added = currentResult.matchingSymbols.filter((s: string) => !prevMatches.has(s));
    const removed = previousResult.matchingSymbols.filter((s: string) => !currMatches.has(s));
    
    // Only send if there are changes
    if (added.length > 0 || removed.length > 0 || currentResult.signalSymbols.length > 0) {
      return {
        traderId,
        added,
        removed,
        signalSymbols: currentResult.signalSymbols,
        matchingSymbols: currentResult.matchingSymbols // Still send full list for UI consistency
      };
    }
    
    return null; // No changes
  }
  
  /**
   * Process updates in batches to prevent blocking
   */
  private processBatchedUpdates(updatedIndices: number[], batchSize: number) {
    const totalBatches = Math.ceil(updatedIndices.length / batchSize);
    const allResults: any[] = [];
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, updatedIndices.length);
      const batch = updatedIndices.slice(start, end);
      
      console.log(`[Worker] Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} symbols)`);
      
      // Process this batch for all traders
      for (const [traderId, trader] of this.traders) {
        const filterFunction = this.compiledFilters.get(traderId);
        if (!filterFunction) continue;
        
        const result = this.runTraderSelective(traderId, trader, filterFunction, batch);
        
        // Merge results
        if (batchIndex === 0) {
          allResults.push(result);
        } else {
          // Merge with existing result for this trader
          const existingResult = allResults.find(r => r.traderId === traderId);
          if (existingResult) {
            existingResult.matchingSymbols = [...new Set([...existingResult.matchingSymbols, ...result.matchingSymbols])];
            existingResult.signalSymbols = [...new Set([...existingResult.signalSymbols, ...result.signalSymbols])];
            existingResult.removedSymbols = [...new Set([...existingResult.removedSymbols, ...result.removedSymbols])];
          }
        }
      }
    }
    
    // Calculate deltas for batched results
    const deltaResults: any[] = [];
    for (const result of allResults) {
      const delta = this.calculateResultDelta(result.traderId, result);
      if (delta) {
        deltaResults.push(delta);
      }
    }
    
    // Send combined results
    if (deltaResults.length > 0 || this.processingCycle === 1) {
      self.postMessage({
        type: 'RESULTS',
        data: {
          results: this.processingCycle === 1 ? allResults : deltaResults,
          isDelta: this.processingCycle > 1,
          cycle: this.processingCycle,
          efficiency: this.efficiencyStats.avgEfficiency.toFixed(1),
          symbolsProcessed: updatedIndices.length,
          totalSymbols: this.symbolMap.size,
          batched: true,
          batchCount: totalBatches
        }
      } as WorkerResponse);
    }
  }

  /**
   * Run all traders against current shared memory data (legacy method for compatibility)
   */
  private runAllTraders() {
    const startTime = performance.now();
    const results: any[] = [];
    
    for (const [traderId, trader] of this.traders) {
      const filterFunction = this.compiledFilters.get(traderId);
      if (!filterFunction) continue;
      
      const result = this.runTrader(traderId, trader, filterFunction);
      results.push(result);
    }
    
    const executionTime = performance.now() - startTime;
    
    // Send results back to main thread
    self.postMessage({
      type: 'RESULTS',
      data: {
        results,
        executionTime,
        updateCount: this.lastUpdateCount
      }
    } as WorkerResponse);
  }

  /**
   * Run a single trader with selective symbol processing
   */
  private runTraderSelective(traderId: string, trader: TraderExecution, filterFunction: Function, updatedIndices: number[]) {
    const previousMatches = this.previousMatches.get(traderId) || new Set<string>();
    const currentMatches = new Set<string>();
    const filteredSymbols: string[] = [];
    const signalSymbols: string[] = [];
    
    // Only process updated symbols
    for (const symbolIndex of updatedIndices) {
      // Try indexToSymbol first (O(1)), fallback to symbolMap
      const symbol = this.indexToSymbol[symbolIndex] || this.symbolMap.get(symbolIndex);
      if (!symbol) continue;
      
      const ticker = this.getTickerFromSharedMemory(symbolIndex);
      if (!ticker) continue;
      
      // Build timeframes object from shared memory
      const timeframes: Record<string, any[]> = {};
      let hasAllData = true;
      
      for (const tf of trader.requiredTimeframes) {
        const klines = this.getKlinesFromSharedMemory(symbolIndex, tf);
        if (!klines || klines.length < 30) {
          hasAllData = false;
          break;
        }
        timeframes[tf] = klines;
      }
      
      if (!hasAllData) continue;
      
      try {
        // Calculate HVN nodes
        const longestTf = trader.requiredTimeframes[0];
        const hvnKlines = timeframes[longestTf];
        const hvnNodes = helpers.calculateHighVolumeNodes(hvnKlines, { 
          lookback: Math.min(hvnKlines.length, 100) 
        });
        
        // Run filter (directly on shared memory data)
        const matches = filterFunction(ticker, timeframes, helpers, hvnNodes);
        
        if (matches) {
          filteredSymbols.push(symbol);
          currentMatches.add(symbol);
          
          // Check if this is a new match (signal)
          if (!previousMatches.has(symbol)) {
            signalSymbols.push(symbol);
          }
        }
      } catch (error) {
        console.error(`[Worker] Error running filter for ${symbol}:`, error);
      }
    }
    
    // Update previous matches for this trader
    this.previousMatches.set(traderId, currentMatches);
    
    return {
      traderId,
      filteredSymbols,
      signalSymbols,
      totalProcessed: updatedIndices.length
    };
  }

  /**
   * Run a single trader (legacy - processes all symbols)
   */
  private runTrader(traderId: string, trader: TraderExecution, filterFunction: Function) {
    const previousMatches = this.previousMatches.get(traderId) || new Set<string>();
    const currentMatches = new Set<string>();
    const filteredSymbols: string[] = [];
    const signalSymbols: string[] = [];
    
    // Iterate through all symbols in shared memory
    for (const [symbolIndex, symbol] of this.symbolMap) {
      const ticker = this.getTickerFromSharedMemory(symbolIndex);
      if (!ticker) continue;
      
      // Build timeframes object from shared memory
      const timeframes: Record<string, any[]> = {};
      let hasAllData = true;
      
      for (const tf of trader.requiredTimeframes) {
        const klines = this.getKlinesFromSharedMemory(symbolIndex, tf);
        if (!klines || klines.length < 30) {
          hasAllData = false;
          break;
        }
        timeframes[tf] = klines;
      }
      
      if (!hasAllData) continue;
      
      try {
        // Calculate HVN nodes
        const longestTf = trader.requiredTimeframes[0];
        const hvnKlines = timeframes[longestTf];
        const hvnNodes = helpers.calculateHighVolumeNodes(hvnKlines, { 
          lookback: Math.min(hvnKlines.length, 100) 
        });
        
        // Run filter (directly on shared memory data)
        const matches = filterFunction(ticker, timeframes, helpers, hvnNodes);
        
        if (matches) {
          filteredSymbols.push(symbol);
          currentMatches.add(symbol);
          
          if (!previousMatches.has(symbol)) {
            signalSymbols.push(symbol);
          }
        }
      } catch (error) {
        console.error(`[PersistentWorker] Filter error for ${traderId} on ${symbol}:`, error);
      }
    }
    
    // Update cache
    this.previousMatches.set(traderId, currentMatches);
    
    return {
      traderId,
      filteredSymbols,
      signalSymbols
    };
  }

  /**
   * Get ticker from shared memory
   */
  private getTickerFromSharedMemory(symbolIndex: number) {
    if (!this.tickerView || !this.config) return null;
    
    const offset = symbolIndex * this.config.tickerSize;
    const updateTime = this.tickerView[offset + 9];
    
    if (updateTime === 0) return null; // No data
    
    // Get the symbol name for this index
    const symbol = this.symbolMap.get(symbolIndex);
    if (!symbol) return null;
    
    return {
      s: symbol,  // Symbol property that filters expect
      c: this.tickerView[offset + 0].toString(),
      o: this.tickerView[offset + 1].toString(),
      h: this.tickerView[offset + 2].toString(),
      l: this.tickerView[offset + 3].toString(),
      v: this.tickerView[offset + 4].toString(),
      q: this.tickerView[offset + 5].toString(),
      P: this.tickerView[offset + 6].toString(),
      p: this.tickerView[offset + 7].toString(),
      w: this.tickerView[offset + 8].toString()
    };
  }

  /**
   * Get klines from shared memory
   */
  private getKlinesFromSharedMemory(symbolIndex: number, interval: string) {
    if (!this.klineView || !this.config) return null;
    
    const intervalIndex = this.intervalMap.get(interval);
    if (intervalIndex === undefined) return null;
    
    const baseOffset = (symbolIndex * this.config.maxIntervals * this.config.maxKlinesPerSymbol + 
                        intervalIndex * this.config.maxKlinesPerSymbol) * this.config.klineSize;
    
    const klines = [];
    
    for (let i = 0; i < this.config.maxKlinesPerSymbol; i++) {
      const offset = baseOffset + i * this.config.klineSize;
      const timestamp = this.klineView[offset + 0];
      
      if (timestamp === 0) break; // End of data
      
      klines.push([
        timestamp,
        this.klineView[offset + 1].toString(),
        this.klineView[offset + 2].toString(),
        this.klineView[offset + 3].toString(),
        this.klineView[offset + 4].toString(),
        this.klineView[offset + 5].toString()
      ]);
    }
    
    return klines;
  }

  /**
   * Cleanup worker resources before termination
   */
  private cleanup() {
    console.log(`[Worker] CLEANUP called at ${new Date().toISOString()}, interval: ${this.updateIntervalId}`);
    // Set shutdown flag to stop all operations
    this.isShuttingDown = true;
    
    // Stop the update monitor interval
    this.stopUpdateMonitor();
    
    // Clear all data structures
    this.traders.clear();
    this.compiledFilters.clear();
    this.previousMatches.clear();
    this.symbolMap.clear();
    this.intervalMap.clear();
    
    // Nullify shared buffer references to allow garbage collection
    this.tickerView = null;
    this.klineView = null;
    this.metadataView = null;
    this.updateCounter = null;
    this.config = null;
    
    // Mark as not initialized
    this.isInitialized = false;
    
    // Send cleanup completion confirmation
    console.log(`[Worker] Cleanup complete, sending CLEANUP_COMPLETE`);
    self.postMessage({ type: 'CLEANUP_COMPLETE' } as WorkerResponse);
  }

  /**
   * Get worker status
   */
  getStatus() {
    const status = {
      isInitialized: this.isInitialized,
      traderCount: this.traders.size,
      traders: Array.from(this.traders.keys()),
      symbolCount: this.symbolMap.size,
      updateCount: this.lastUpdateCount,
      memoryUsage: this.getMemoryUsage()
    };
    
    if (DEBUG) {
      console.log('[Worker] Detailed status:', {
        ...status,
        compiledFilters: this.compiledFilters.size,
        previousMatches: this.previousMatches.size,
        intervalId: this.updateIntervalId,
        isShuttingDown: this.isShuttingDown,
        memoryMB: typeof performance !== 'undefined' && 'memory' in performance 
          ? ((performance as any).memory.usedJSHeapSize / 1024 / 1024).toFixed(2)
          : 'N/A'
      });
    }
    
    return status;
  }

  /**
   * Calculate memory usage
   */
  private getMemoryUsage() {
    if (!this.config) return null;
    
    const totalBytes = 
      this.config.maxSymbols * this.config.tickerSize * 8 +
      this.config.maxSymbols * this.config.maxIntervals * this.config.maxKlinesPerSymbol * this.config.klineSize * 8 +
      this.config.maxSymbols * 256;
    
    return {
      totalMB: (totalBytes / 1024 / 1024).toFixed(2),
      symbols: this.symbolMap.size,
      traders: this.traders.size
    };
  }
}

// Track global interval count for debugging
let globalIntervalCount = 0;

// Debug mode from localStorage
const DEBUG = typeof localStorage !== 'undefined' && localStorage.getItem('DEBUG_WORKERS') === 'true';

// Worker instance
const worker = new PersistentTraderWorker();

// Message handler
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  if (!event.data) return;
  
  const { type, data, traderId } = event.data;
  console.log(`[Worker] Received message: ${type} at ${new Date().toISOString()}`);
  
  try {
    switch (type) {
      case 'INIT':
        worker.init(data);
        self.postMessage({ type: 'READY' } as WorkerResponse);
        break;
        
      case 'ADD_TRADER':
        worker.addTrader(data);
        break;
        
      case 'REMOVE_TRADER':
        if (traderId) {
          worker.removeTrader(traderId);
        }
        break;
        
      case 'UPDATE_TRADER':
        // Handle updates more efficiently
        if (data && data.traderId) {
          const existing = worker['traders'].get(data.traderId);
          if (existing) {
            // Check if filter needs recompilation
            if (existing.filterCode !== data.filterCode) {
              console.log(`[Worker] Filter changed for ${data.traderId}, recompiling`);
              worker.addTrader(data); // Reuse existing logic for filter changes
            } else {
              console.log(`[Worker] Updating metadata only for ${data.traderId}`);
              // Update non-filter properties without recompilation
              worker['traders'].set(data.traderId, {
                ...existing,
                refreshInterval: data.refreshInterval,
                requiredTimeframes: data.requiredTimeframes
              });
            }
          } else {
            // Trader doesn't exist, add it
            console.log(`[Worker] UPDATE_TRADER for non-existent trader ${data.traderId}, adding`);
            worker.addTrader(data);
          }
        }
        break;
        
      case 'RUN_TRADERS':
        // Manual trigger (usually automatic via update monitor)
        worker['runAllTraders']();
        break;
        
      case 'GET_STATUS':
        self.postMessage({
          type: 'STATUS',
          data: worker.getStatus()
        } as WorkerResponse);
        break;
        
      case 'CLEANUP':
        worker['cleanup']();
        break;
        
      case 'PING':
        self.postMessage({ type: 'PONG' } as WorkerResponse);
        break;
        
      case 'PROCESS_UPDATES':
        // Process only updated symbols using read buffer
        if (event.data.readFlags) {
          worker['processUpdateCycle'](event.data.readFlags);
        }
        break;
        
      default:
        // Unknown message type
    }
  } catch (error) {
    console.error(`[PersistentWorker] Error handling message ${type}:`, error);
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    } as WorkerResponse);
  }
});

export {};