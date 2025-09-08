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
  type: 'INIT' | 'ADD_TRADER' | 'REMOVE_TRADER' | 'UPDATE_TRADER' | 'RUN_TRADERS' | 'GET_STATUS';
  data?: any;
  traderId?: string;
}

interface WorkerResponse {
  type: 'READY' | 'RESULTS' | 'STATUS' | 'ERROR';
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
  
  constructor() {
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
    this.tickerView = new Float64Array(config.tickerBuffer);
    this.klineView = new Float64Array(config.klineBuffer);
    this.metadataView = new Uint8Array(config.metadataBuffer);
    this.updateCounter = new Int32Array(config.updateCounterBuffer);
    this.config = config.config;
    
    // Read symbol names from metadata
    this.readSymbolNames();
    
    this.isInitialized = true;
    this.lastUpdateCount = Atomics.load(this.updateCounter, 0);
    
    console.log('[PersistentWorker] Initialized with shared memory', {
      maxSymbols: this.config.maxSymbols,
      bufferSizes: {
        ticker: (config.tickerBuffer.byteLength / 1024).toFixed(2) + 'KB',
        kline: (config.klineBuffer.byteLength / 1024 / 1024).toFixed(2) + 'MB',
        metadata: (config.metadataBuffer.byteLength / 1024).toFixed(2) + 'KB'
      }
    });
    
    // Start monitoring for updates
    this.startUpdateMonitor();
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
   * Monitor for data updates using Atomics.wait
   */
  private async startUpdateMonitor() {
    console.log('[PersistentWorker] Starting update monitor');
    let loopCount = 0;
    
    while (this.isInitialized) {
      const currentCount = Atomics.load(this.updateCounter!, 0);
      
      // Debug: Log every 100 loops
      if (++loopCount % 100 === 0) {
        console.log(`[PersistentWorker] Monitor loop ${loopCount}, updateCount: ${currentCount}, lastCount: ${this.lastUpdateCount}, traders: ${this.traders.size}`);
      }
      
      if (currentCount !== this.lastUpdateCount) {
        console.log(`[PersistentWorker] Detected update! Count: ${this.lastUpdateCount} -> ${currentCount}`);
        // Data has been updated
        this.lastUpdateCount = currentCount;
        
        // Re-read symbol names in case new symbols were added
        this.readSymbolNames();
        console.log(`[PersistentWorker] Found ${this.symbolMap.size} symbols`);
        
        // Run all traders with current data
        if (this.traders.size > 0) {
          console.log(`[PersistentWorker] Running ${this.traders.size} traders...`);
          this.runAllTraders();
        }
      }
      
      // Wait for next update (with timeout to check periodically)
      const result = Atomics.wait(this.updateCounter!, 0, currentCount, 100);
      
      if (result === 'not-equal') {
        // Data changed while we were preparing to wait
        console.log('[PersistentWorker] Data changed during wait preparation');
        continue;
      } else if (result === 'timed-out') {
        // Normal timeout - continue loop
      } else if (result === 'ok') {
        console.log('[PersistentWorker] Woken up by notify!');
      }
    }
    
    console.log('[PersistentWorker] Update monitor stopped');
  }

  /**
   * Add or update a trader
   */
  addTrader(trader: TraderExecution) {
    this.traders.set(trader.traderId, trader);
    
    // Compile the filter function
    try {
      const filterFunction = new Function(
        'ticker',
        'timeframes',
        'helpers',
        'hvnNodes',
        `try { ${trader.filterCode} } catch(e) { console.error('Filter error:', e); return false; }`
      );
      this.compiledFilters.set(trader.traderId, filterFunction);
      
      console.log(`[PersistentWorker] Added trader ${trader.traderId}`);
      console.log(`[PersistentWorker] Filter code length: ${trader.filterCode.length}`);
      console.log(`[PersistentWorker] Required timeframes: ${trader.requiredTimeframes.join(', ')}`);
      
      // Immediately run the trader to test
      console.log(`[PersistentWorker] Testing trader immediately...`);
      if (this.symbolMap.size > 0) {
        const result = this.runTrader(trader.traderId, trader, filterFunction);
        console.log(`[PersistentWorker] Test result:`, result);
      } else {
        console.log(`[PersistentWorker] No symbols available for testing`);
      }
    } catch (error) {
      console.error(`[PersistentWorker] Failed to compile filter for ${trader.traderId}:`, error);
    }
  }

  /**
   * Remove a trader
   */
  removeTrader(traderId: string) {
    this.traders.delete(traderId);
    this.compiledFilters.delete(traderId);
    this.previousMatches.delete(traderId);
    console.log(`[PersistentWorker] Removed trader ${traderId}`);
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
    
    return {
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

// Worker instance
const worker = new PersistentTraderWorker();

// Message handler
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const { type, data, traderId } = event.data;
  
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
        
      default:
        console.warn(`[PersistentWorker] Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error'
    } as WorkerResponse);
  }
});

export {};