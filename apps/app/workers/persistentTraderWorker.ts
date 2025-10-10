/**
 * Persistent Trader Worker
 * 
 * Stateful worker that maintains its own view of market data using SharedArrayBuffer.
 * Zero serialization cost - all data is shared memory.
 */

import { KlineInterval } from '../types';
import * as helpers from '../screenerHelpers';
import { BitSet } from '../src/utils/BitSet';
import { ResourceTracker } from '../src/memory/ResourceTracker';
import { WorkerMemoryConfig } from '../src/memory/types';
import { GoBackendClient, type MarketData } from '../src/api/goBackendClient';

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
  language?: 'javascript' | 'go'; // Programming language of the filter code
}

interface WorkerMessage {
  type: 'INIT' | 'ADD_TRADER' | 'REMOVE_TRADER' | 'UPDATE_TRADER' | 'RUN_TRADERS' | 'GET_STATUS' | 'CLEANUP' | 'PING' | 'PROCESS_UPDATES';
  data?: any;
  traderId?: string;
  readFlags?: ArrayBuffer;
  cycle?: number;
}

interface WorkerResponse {
  type: 'READY' | 'RESULTS' | 'STATUS' | 'ERROR' | 'CLEANUP_COMPLETE' | 'PONG' | 'MEMORY_STATS';
  data?: any;
  error?: string;
  stats?: any;
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
  
  // Resource management
  private managedIntervals: Set<NodeJS.Timeout> = new Set();
  private memoryConfig: WorkerMemoryConfig & { maxCompiledFunctions: number; maxMemoryMB: number } = {
    maxCacheSize: 100,
    maxResultAge: 60 * 60 * 1000, // 1 hour
    cleanupInterval: 30 * 1000, // 30 seconds
    maxIntervals: 5,
    maxCompiledFunctions: 50, // Limit compiled functions
    maxMemoryMB: 20 // Target max memory usage
  };
  private lastCacheCleanup = Date.now();
  private cacheAccessTimes: Map<string, number> = new Map(); // Track cache access for LRU
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  
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
  
  // Go backend client for executing Go filters
  private goBackendClient: GoBackendClient;

  // Error tracking
  private errorCount = 0;
  private lastErrorTime = 0;
  private isInErrorRecovery = false;
  private readonly MAX_ERRORS_PER_MINUTE = 10;
  private readonly ERROR_RECOVERY_DELAY = 5000; // 5 seconds

  constructor() {
    console.log(`[Worker ${self.name || 'unnamed'}] Constructor called at ${new Date().toISOString()}`);

    // Initialize Go backend client
    const goBackendUrl = typeof process !== 'undefined' && process.env?.VITE_GO_BACKEND_URL
      ? process.env.VITE_GO_BACKEND_URL
      : 'http://localhost:8080';
    this.goBackendClient = new GoBackendClient(goBackendUrl, 5000);

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
    
    // Check if we've hit the max intervals limit
    if (this.managedIntervals.size >= this.memoryConfig.maxIntervals) {
      console.warn(`[Worker] Max intervals limit reached (${this.memoryConfig.maxIntervals}). Cleaning up oldest.`);
      const oldest = this.managedIntervals.values().next().value;
      if (oldest) {
        clearInterval(oldest);
        this.managedIntervals.delete(oldest);
      }
    }
    
    // Create new interval and store its ID for cleanup
    const intervalId = setInterval(() => {
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
      
      // Periodic cache cleanup
      this.performCacheCleanup();
    }, 1000); // Check every 1 second (reduced from 10ms for CPU savings)
    
    this.updateIntervalId = intervalId as any;
    this.managedIntervals.add(intervalId as any);
    console.log(`[Worker] Created interval - Total managed: ${this.managedIntervals.size}`);
  }

  /**
   * Stop the update monitor interval
   */
  private stopUpdateMonitor() {
    console.log(`[Worker] stopUpdateMonitor called at ${new Date().toISOString()}, current interval: ${this.updateIntervalId}`);
    if (this.updateIntervalId !== null) {
      clearInterval(this.updateIntervalId);
      this.managedIntervals.delete(this.updateIntervalId as any);
      console.log(`[Worker] Cleared interval - Total managed: ${this.managedIntervals.size}`);
      this.updateIntervalId = null;
    } else {
      console.log(`[Worker] No interval to clear - Total managed: ${this.managedIntervals.size}`);
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

    // Only compile filter function for JavaScript traders
    // Go traders will execute via backend API
    if (trader.language === 'go') {
      console.log(`[Worker] Skipping filter compilation for Go trader ${trader.traderId} - will execute via backend`);
      return;
    }

    // Compile the filter function only for new or changed JavaScript traders
    try {
      console.log(`[Worker] Compiling filter for JS trader ${trader.traderId}`);
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
  private async processNormalUpdates(updatedIndices: number[]) {
    try {
      const results: any[] = [];
      const deltaResults: any[] = [];

      for (const [traderId, trader] of this.traders) {
        const filterFunction = this.compiledFilters.get(traderId) || null;

        // Track cache access for LRU
        this.cacheAccessTimes.set(traderId, Date.now());

        // For Go traders, filterFunction can be null
        if (!filterFunction && trader.language !== 'go') continue;

        const result = await this.runTraderSelective(traderId, trader, filterFunction, updatedIndices);
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
    } catch (error) {
      this.handleProcessingError(error, 'processNormalUpdates');
      // Continue with partial results if possible
      const partialResults: any[] = [];
      if (partialResults.length > 0) {
        self.postMessage({
          type: 'RESULTS',
          data: {
            results: partialResults,
            isDelta: true,
            partial: true,
            error: true
          }
        } as WorkerResponse);
      }
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
  private async processBatchedUpdates(updatedIndices: number[], batchSize: number) {
    const totalBatches = Math.ceil(updatedIndices.length / batchSize);
    const allResults: any[] = [];

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * batchSize;
      const end = Math.min(start + batchSize, updatedIndices.length);
      const batch = updatedIndices.slice(start, end);

      console.log(`[Worker] Processing batch ${batchIndex + 1}/${totalBatches} (${batch.length} symbols)`);

      // Process this batch for all traders
      for (const [traderId, trader] of this.traders) {
        const filterFunction = this.compiledFilters.get(traderId) || null;

        // Track cache access for LRU
        this.cacheAccessTimes.set(traderId, Date.now());

        // For Go traders, filterFunction can be null
        if (!filterFunction && trader.language !== 'go') continue;

        const result = await this.runTraderSelective(traderId, trader, filterFunction, batch);

        // Merge results
        if (batchIndex === 0) {
          allResults.push(result);
        } else {
          // Merge with existing result for this trader
          const existingResult = allResults.find(r => r.traderId === traderId);
          if (existingResult) {
            existingResult.filteredSymbols = [...new Set([...existingResult.filteredSymbols, ...result.filteredSymbols])];
            existingResult.signalSymbols = [...new Set([...existingResult.signalSymbols, ...result.signalSymbols])];
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
  private async runAllTraders() {
    const startTime = performance.now();
    const results: any[] = [];

    for (const [traderId, trader] of this.traders) {
      const filterFunction = this.compiledFilters.get(traderId) || null;

      // Track cache access for LRU
      this.cacheAccessTimes.set(traderId, Date.now());

      // For Go traders, filterFunction can be null
      if (!filterFunction && trader.language !== 'go') continue;

      const result = await this.runTrader(traderId, trader, filterFunction);
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
  private async runTraderSelective(traderId: string, trader: TraderExecution, filterFunction: Function | null, updatedIndices: number[]) {
    const previousMatches = this.previousMatches.get(traderId) || new Set<string>();
    const currentMatches = new Set<string>();
    const filteredSymbols: string[] = [];
    const signalSymbols: string[] = [];

    // Check if this is a Go trader
    const isGoTrader = trader.language === 'go';

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
        let matches = false;

        if (isGoTrader) {
          // Execute Go filter via backend API
          matches = await this.executeGoFilter(trader, symbol, ticker, timeframes);
        } else {
          // Execute JavaScript filter locally
          if (!filterFunction) {
            console.error(`[Worker] No filter function compiled for JS trader ${traderId}`);
            continue;
          }

          // Calculate HVN nodes for JavaScript filters
          const longestTf = trader.requiredTimeframes[0];
          const hvnKlines = timeframes[longestTf];
          const hvnNodes = helpers.calculateHighVolumeNodes(hvnKlines, {
            lookback: Math.min(hvnKlines.length, 100)
          });

          // Run filter (directly on shared memory data)
          matches = filterFunction(ticker, timeframes, helpers, hvnNodes);
        }

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
  private async runTrader(traderId: string, trader: TraderExecution, filterFunction: Function | null) {
    const previousMatches = this.previousMatches.get(traderId) || new Set<string>();
    const currentMatches = new Set<string>();
    const filteredSymbols: string[] = [];
    const signalSymbols: string[] = [];

    // Check if this is a Go trader
    const isGoTrader = trader.language === 'go';

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
        let matches = false;

        if (isGoTrader) {
          // Execute Go filter via backend API
          matches = await this.executeGoFilter(trader, symbol, ticker, timeframes);
        } else {
          // Execute JavaScript filter locally
          if (!filterFunction) {
            console.error(`[Worker] No filter function compiled for JS trader ${traderId}`);
            continue;
          }

          // Calculate HVN nodes for JavaScript filters
          const longestTf = trader.requiredTimeframes[0];
          const hvnKlines = timeframes[longestTf];
          const hvnNodes = helpers.calculateHighVolumeNodes(hvnKlines, {
            lookback: Math.min(hvnKlines.length, 100)
          });

          // Run filter (directly on shared memory data)
          matches = filterFunction(ticker, timeframes, helpers, hvnNodes);
        }

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
  
  /**
   * Report memory statistics
   */
  private reportMemoryStats() {
    const stats = {
      traders: this.traders.size,
      compiledFilters: this.compiledFilters.size,
      previousResults: this.previousResults.size,
      previousMatches: this.previousMatches.size,
      managedIntervals: this.managedIntervals.size,
      cacheAccessTimes: this.cacheAccessTimes.size,
      symbolMap: this.symbolMap.size,
      memoryUsage: this.getMemoryUsage()
    };
    
    console.log('[Worker] Memory stats:', stats);
    
    // Send to main thread for monitoring
    self.postMessage({
      type: 'MEMORY_STATS',
      stats
    } as WorkerResponse);
  }
  
  /**
   * Perform periodic cache cleanup with enhanced memory management
   */
  private performCacheCleanup() {
    const now = Date.now();
    
    // Only run cleanup periodically
    if (now - this.lastCacheCleanup < this.memoryConfig.cleanupInterval) {
      return;
    }
    
    this.lastCacheCleanup = now;
    
    // 1. Clean up old results with LRU eviction
    if (this.previousResults.size > this.memoryConfig.maxCacheSize) {
      const entriesToDelete = this.previousResults.size - this.memoryConfig.maxCacheSize;
      
      // Sort by access time (LRU)
      const sortedEntries = Array.from(this.previousResults.keys())
        .sort((a, b) => {
          const timeA = this.cacheAccessTimes.get(a) || 0;
          const timeB = this.cacheAccessTimes.get(b) || 0;
          return timeA - timeB; // Oldest first
        });
      
      // Delete least recently used
      sortedEntries.slice(0, entriesToDelete).forEach(key => {
        this.previousResults.delete(key);
        this.cacheAccessTimes.delete(key);
      });
      
      console.log(`[Worker] Cleaned up ${entriesToDelete} old results from cache (LRU)`);
    }
    
    // 2. Clean up old match history
    if (this.previousMatches.size > this.memoryConfig.maxCacheSize) {
      const entriesToDelete = this.previousMatches.size - this.memoryConfig.maxCacheSize;
      const keys = Array.from(this.previousMatches.keys()).slice(0, entriesToDelete);
      keys.forEach(key => this.previousMatches.delete(key));
    }
    
    // 3. Clean up compiled functions if too many
    if (this.compiledFilters.size > this.memoryConfig.maxCompiledFunctions) {
      const entriesToDelete = this.compiledFilters.size - this.memoryConfig.maxCompiledFunctions;
      const sortedTraders = Array.from(this.traders.entries())
        .sort((a, b) => {
          // Keep active traders' functions
          const aActive = a[1].enabled ? 1 : 0;
          const bActive = b[1].enabled ? 1 : 0;
          return aActive - bActive;
        });
      
      // Delete compiled functions for inactive traders first
      let deleted = 0;
      for (const [traderId] of sortedTraders) {
        if (deleted >= entriesToDelete) break;
        if (!this.traders.get(traderId)?.enabled) {
          this.compiledFilters.delete(traderId);
          deleted++;
        }
      }
      
      if (deleted > 0) {
        console.log(`[Worker] Cleaned up ${deleted} compiled functions`);
      }
    }
    
    // 4. Clean up stale cache access times
    const staleAccessKeys = Array.from(this.cacheAccessTimes.keys())
      .filter(key => !this.previousResults.has(key));
    staleAccessKeys.forEach(key => this.cacheAccessTimes.delete(key));
    
    // 5. Force garbage collection hint (if available)
    if (global.gc) {
      global.gc();
      console.log('[Worker] Forced garbage collection');
    }
    
    // Report memory stats
    this.reportMemoryStats();
  }
  
  /**
   * Clean up all resources
   */
  public cleanup() {
    console.log('[Worker] Starting full cleanup');
    this.isShuttingDown = true;
    
    // Stop all intervals
    this.stopUpdateMonitor();
    this.managedIntervals.forEach(interval => clearInterval(interval));
    this.managedIntervals.clear();
    
    // Clear all Maps to free memory
    this.traders.clear();
    this.compiledFilters.clear();
    this.previousMatches.clear();
    this.previousResults.clear();
    this.symbolMap.clear();
    this.intervalMap.clear();
    
    // Nullify typed arrays
    this.tickerView = null;
    this.klineView = null;
    this.metadataView = null;
    this.updateCounter = null;
    this.updateFlagsViewA = null;
    this.updateFlagsViewB = null;
    
    console.log('[Worker] Cleanup complete');
  }
  
  /**
   * Handle processing errors with recovery logic
   */
  private handleProcessingError(error: any, context: string) {
    const now = Date.now();
    
    // Reset error count if more than a minute has passed
    if (now - this.lastErrorTime > 60000) {
      this.errorCount = 0;
    }
    
    this.errorCount++;
    this.lastErrorTime = now;
    
    console.error(`[Worker] Error in ${context} (count: ${this.errorCount}):`, error);
    
    // Report to monitoring
    self.postMessage({
      type: 'ERROR',
      data: {
        context,
        errorCount: this.errorCount,
        message: error?.message || 'Unknown error',
        timestamp: now
      }
    } as WorkerResponse);
    
    // Enter recovery mode if too many errors
    if (this.errorCount >= this.MAX_ERRORS_PER_MINUTE) {
      this.enterErrorRecovery();
    }
  }
  
  /**
   * Enter error recovery mode
   */
  private enterErrorRecovery() {
    if (this.isInErrorRecovery) return;
    
    console.warn(`[Worker] Entering error recovery mode after ${this.errorCount} errors`);
    this.isInErrorRecovery = true;
    
    // Pause processing temporarily
    setTimeout(() => {
      console.log(`[Worker] Attempting recovery after delay`);
      this.attemptRecovery();
    }, this.ERROR_RECOVERY_DELAY);
  }
  
  /**
   * Attempt to recover from error state
   */
  private attemptRecovery() {
    try {
      // Re-read symbol names
      this.readSymbolNames();
      
      // Validate shared memory buffers
      if (!this.tickerView || !this.klineView) {
        throw new Error('Shared memory buffers invalid');
      }
      
      // Clear cached data
      this.previousMatches.clear();
      this.previousResults.clear();
      
      console.log(`[Worker] Recovery attempt successful`);
      this.isInErrorRecovery = false;
      this.errorCount = Math.max(0, this.errorCount - 2); // Reduce error count on successful recovery
    } catch (recoveryError) {
      console.error(`[Worker] Recovery failed:`, recoveryError);
      // Will retry on next cycle
    }
  }
  
  /**
   * Safely run all traders with error handling
   */
  private runAllTradersSafely() {
    try {
      if (this.isInErrorRecovery) {
        console.log(`[Worker] Skipping processing - in recovery mode`);
        return;
      }

      this.runAllTraders();
    } catch (error) {
      this.handleProcessingError(error, 'runAllTradersSafely');
    }
  }

  /**
   * Execute a Go filter via the backend API
   */
  private async executeGoFilter(
    trader: TraderExecution,
    symbol: string,
    ticker: any,
    timeframes: Record<string, any[]>
  ): Promise<boolean> {
    try {
      // Convert ticker and klines to the format expected by the Go backend
      const marketData: MarketData = {
        symbol,
        ticker: {
          lastPrice: parseFloat(ticker.c),
          priceChangePercent: parseFloat(ticker.P),
          quoteVolume: parseFloat(ticker.q)
        },
        klines: {}
      };

      // Convert klines format
      for (const [interval, klines] of Object.entries(timeframes)) {
        marketData.klines[interval] = klines.map((k: any[]) => ({
          openTime: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5])
        }));
      }

      // Execute filter via backend
      const matched = await this.goBackendClient.executeFilter(trader.filterCode, marketData);
      return matched;
    } catch (error) {
      console.error(`[Worker] Go filter execution error for ${symbol}:`, error);
      // Return false on error to prevent false positives
      return false;
    }
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
        worker.cleanup();
        self.postMessage({ type: 'CLEANUP_COMPLETE' } as WorkerResponse);
        break;
        
      case 'PING':
        self.postMessage({ type: 'PONG' } as WorkerResponse);
        break;
        
      case 'PROCESS_UPDATES':
        // Process only updated symbols using read buffer if feature enabled
        if (event.data.readFlags || event.data.data?.readBuffer) {
          const readBuffer = event.data.readFlags || event.data.data?.readBuffer;
          const featureEnabled = event.data.data?.featureEnabled !== false;
          
          if (featureEnabled && readBuffer) {
            worker['processUpdateCycle'](readBuffer);
          } else {
            // Fallback to processing all symbols
            console.log('[Worker] Per-symbol tracking disabled, processing all symbols');
            worker['runAllTraders']();
          }
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