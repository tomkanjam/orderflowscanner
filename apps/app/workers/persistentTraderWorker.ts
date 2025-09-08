/**
 * Persistent Trader Worker
 * 
 * Stateful worker that maintains its own view of market data using SharedArrayBuffer.
 * Zero serialization cost - all data is shared memory.
 */

import { KlineInterval } from '../types';
import * as helpers from '../screenerHelpers';

interface WorkerConfig {
  tickerBuffer: SharedArrayBuffer;
  klineBuffer: SharedArrayBuffer;
  metadataBuffer: SharedArrayBuffer;
  updateCounterBuffer: SharedArrayBuffer;
  config: {
    maxSymbols: number;
    maxKlinesPerSymbol: number;
    maxIntervals: number;
    tickerSize: number;
    klineSize: number;
  };
}

interface TraderExecution {
  traderId: string;
  filterCode: string;
  refreshInterval: KlineInterval;
  requiredTimeframes: KlineInterval[];
}

interface WorkerMessage {
  type: 'INIT' | 'ADD_TRADER' | 'REMOVE_TRADER' | 'UPDATE_TRADER' | 'RUN_TRADERS' | 'GET_STATUS' | 'CLEANUP' | 'PING';
  data?: any;
  traderId?: string;
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
  private config: WorkerConfig['config'] | null = null;
  
  private traders: Map<string, TraderExecution> = new Map();
  private compiledFilters: Map<string, Function> = new Map();
  private previousMatches: Map<string, Set<string>> = new Map();
  private symbolMap: Map<number, string> = new Map();
  private intervalMap: Map<string, number> = new Map();
  
  private lastUpdateCount = 0;
  private isInitialized = false;
  private updateIntervalId: number | null = null; // Track the interval ID for cleanup
  private isShuttingDown = false; // Flag to prevent operations during shutdown
  
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
    this.config = config.config;
    
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
    }, 10); // Check every 10ms
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
  }

  /**
   * Run all traders against current shared memory data
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
   * Run a single trader
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
    return {
      isInitialized: this.isInitialized,
      traderCount: this.traders.size,
      traders: Array.from(this.traders.keys()),
      symbolCount: this.symbolMap.size,
      updateCount: this.lastUpdateCount,
      memoryUsage: this.getMemoryUsage()
    };
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
        worker.addTrader(data); // Add/update uses same method
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