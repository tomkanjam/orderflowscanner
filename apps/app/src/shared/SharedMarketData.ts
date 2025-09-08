/**
 * SharedMarketData - Zero-copy shared memory implementation
 * 
 * Uses SharedArrayBuffer for zero-serialization data sharing between
 * main thread and workers. All data is stored in typed arrays for
 * maximum performance.
 */

import { Ticker, Kline, KlineInterval } from '../../types';

// Constants for memory layout
const TICKER_SIZE = 10; // floats per ticker (price, volume, change%, etc.)
const KLINE_SIZE = 6; // floats per kline (time, O, H, L, C, V)
const MAX_SYMBOLS = 200;
const MAX_KLINES_PER_SYMBOL = 1440;
const MAX_INTERVALS = 6;

// Memory offsets
const TICKER_BUFFER_SIZE = MAX_SYMBOLS * TICKER_SIZE * Float64Array.BYTES_PER_ELEMENT;
const KLINE_BUFFER_SIZE = MAX_SYMBOLS * MAX_INTERVALS * MAX_KLINES_PER_SYMBOL * KLINE_SIZE * Float64Array.BYTES_PER_ELEMENT;
const METADATA_BUFFER_SIZE = MAX_SYMBOLS * 256; // For symbol names and metadata

export interface SharedMarketDataConfig {
  maxSymbols?: number;
  maxKlinesPerSymbol?: number;
  maxIntervals?: number;
}

export class SharedMarketData {
  private tickerBuffer: SharedArrayBuffer;
  private klineBuffer: SharedArrayBuffer;
  private metadataBuffer: SharedArrayBuffer;
  private updateCounterBuffer: SharedArrayBuffer;
  private symbolIndexMap: Map<string, number> = new Map();
  private intervalIndexMap: Map<KlineInterval, number> = new Map();
  private tickerView: Float64Array;
  private klineView: Float64Array;
  private metadataView: Uint8Array;
  private updateCounter: Int32Array;
  private isInitialized = false;

  constructor(config?: SharedMarketDataConfig) {
    // Check if SharedArrayBuffer is available
    if (typeof SharedArrayBuffer === 'undefined') {
      throw new Error('SharedArrayBuffer is not available. Ensure COOP/COEP headers are set.');
    }

    // Initialize shared buffers
    this.tickerBuffer = new SharedArrayBuffer(TICKER_BUFFER_SIZE);
    this.klineBuffer = new SharedArrayBuffer(KLINE_BUFFER_SIZE);
    this.metadataBuffer = new SharedArrayBuffer(METADATA_BUFFER_SIZE);
    this.updateCounterBuffer = new SharedArrayBuffer(4);
    
    // Create typed array views
    this.tickerView = new Float64Array(this.tickerBuffer);
    this.klineView = new Float64Array(this.klineBuffer);
    this.metadataView = new Uint8Array(this.metadataBuffer);
    
    // Update counter for synchronization
    this.updateCounter = new Int32Array(this.updateCounterBuffer);
    
    // Initialize interval mapping
    const intervals: KlineInterval[] = ['1m', '5m', '15m', '1h', '4h', '1d'] as KlineInterval[];
    intervals.forEach((interval, index) => {
      this.intervalIndexMap.set(interval, index);
    });
    
    this.isInitialized = true;
    console.log('[SharedMarketData] Initialized with SharedArrayBuffer support');
  }

  /**
   * Get shared buffers to pass to workers
   */
  getSharedBuffers() {
    return {
      tickerBuffer: this.tickerBuffer,
      klineBuffer: this.klineBuffer,
      metadataBuffer: this.metadataBuffer,
      updateCounterBuffer: this.updateCounterBuffer,  // Use the stored buffer, not updateCounter.buffer
      config: {
        maxSymbols: MAX_SYMBOLS,
        maxKlinesPerSymbol: MAX_KLINES_PER_SYMBOL,
        maxIntervals: MAX_INTERVALS,
        tickerSize: TICKER_SIZE,
        klineSize: KLINE_SIZE
      }
    };
  }

  /**
   * Register a symbol and get its index
   */
  private getOrCreateSymbolIndex(symbol: string): number {
    if (this.symbolIndexMap.has(symbol)) {
      return this.symbolIndexMap.get(symbol)!;
    }
    
    const index = this.symbolIndexMap.size;
    if (index >= MAX_SYMBOLS) {
      throw new Error(`Maximum symbols (${MAX_SYMBOLS}) exceeded`);
    }
    
    this.symbolIndexMap.set(symbol, index);
    
    // Store symbol name in metadata
    const encoder = new TextEncoder();
    const symbolBytes = encoder.encode(symbol);
    const metadataOffset = index * 256;
    this.metadataView[metadataOffset] = symbolBytes.length;
    this.metadataView.set(symbolBytes, metadataOffset + 1);
    
    return index;
  }

  /**
   * Update ticker data (zero-copy)
   */
  updateTicker(symbol: string, ticker: Ticker) {
    const symbolIndex = this.getOrCreateSymbolIndex(symbol);
    const offset = symbolIndex * TICKER_SIZE;
    
    // Direct write to shared memory
    this.tickerView[offset + 0] = parseFloat(ticker.c); // Current price
    this.tickerView[offset + 1] = parseFloat(ticker.o); // Open price
    this.tickerView[offset + 2] = parseFloat(ticker.h); // High price
    this.tickerView[offset + 3] = parseFloat(ticker.l); // Low price
    this.tickerView[offset + 4] = parseFloat(ticker.v); // Volume
    this.tickerView[offset + 5] = parseFloat(ticker.q); // Quote volume
    this.tickerView[offset + 6] = parseFloat(ticker.P); // Price change percent
    this.tickerView[offset + 7] = parseFloat(ticker.p); // Price change
    this.tickerView[offset + 8] = parseFloat(ticker.w); // Weighted avg price
    this.tickerView[offset + 9] = Date.now(); // Update timestamp
    
    // Increment update counter and notify waiting workers
    Atomics.add(this.updateCounter, 0, 1);
    Atomics.notify(this.updateCounter, 0);
  }

  /**
   * Update kline data (zero-copy)
   */
  updateKline(symbol: string, interval: KlineInterval, kline: Kline) {
    const symbolIndex = this.getOrCreateSymbolIndex(symbol);
    const intervalIndex = this.intervalIndexMap.get(interval);
    
    if (intervalIndex === undefined) {
      console.warn(`Unknown interval: ${interval}`);
      return;
    }
    
    // Calculate offset for this symbol-interval combination
    const baseOffset = (symbolIndex * MAX_INTERVALS * MAX_KLINES_PER_SYMBOL + 
                        intervalIndex * MAX_KLINES_PER_SYMBOL) * KLINE_SIZE;
    
    // Find the kline position (latest kline or update existing)
    const klineTime = kline[0];
    let klineIndex = this.findKlineIndex(baseOffset, klineTime);
    
    if (klineIndex === -1) {
      // New kline - add at the end
      klineIndex = this.getKlineCount(baseOffset);
      if (klineIndex >= MAX_KLINES_PER_SYMBOL) {
        // Shift array (remove oldest)
        this.shiftKlines(baseOffset);
        klineIndex = MAX_KLINES_PER_SYMBOL - 1;
      }
    }
    
    const offset = baseOffset + klineIndex * KLINE_SIZE;
    
    // Direct write to shared memory
    this.klineView[offset + 0] = kline[0]; // Timestamp
    this.klineView[offset + 1] = parseFloat(kline[1]); // Open
    this.klineView[offset + 2] = parseFloat(kline[2]); // High
    this.klineView[offset + 3] = parseFloat(kline[3]); // Low
    this.klineView[offset + 4] = parseFloat(kline[4]); // Close
    this.klineView[offset + 5] = parseFloat(kline[5]); // Volume
    
    // Increment update counter and notify waiting workers
    Atomics.add(this.updateCounter, 0, 1);
    Atomics.notify(this.updateCounter, 0);
  }

  /**
   * Batch update klines for a symbol-interval
   */
  updateKlines(symbol: string, interval: KlineInterval, klines: Kline[]) {
    const symbolIndex = this.getOrCreateSymbolIndex(symbol);
    const intervalIndex = this.intervalIndexMap.get(interval);
    
    if (intervalIndex === undefined) {
      console.warn(`Unknown interval: ${interval}`);
      return;
    }
    
    const baseOffset = (symbolIndex * MAX_INTERVALS * MAX_KLINES_PER_SYMBOL + 
                        intervalIndex * MAX_KLINES_PER_SYMBOL) * KLINE_SIZE;
    
    // Clear existing klines for this symbol-interval
    for (let i = 0; i < MAX_KLINES_PER_SYMBOL * KLINE_SIZE; i++) {
      this.klineView[baseOffset + i] = 0;
    }
    
    // Write new klines
    const klinesToWrite = Math.min(klines.length, MAX_KLINES_PER_SYMBOL);
    for (let i = 0; i < klinesToWrite; i++) {
      const kline = klines[i];
      const offset = baseOffset + i * KLINE_SIZE;
      
      this.klineView[offset + 0] = kline[0];
      this.klineView[offset + 1] = parseFloat(kline[1]);
      this.klineView[offset + 2] = parseFloat(kline[2]);
      this.klineView[offset + 3] = parseFloat(kline[3]);
      this.klineView[offset + 4] = parseFloat(kline[4]);
      this.klineView[offset + 5] = parseFloat(kline[5]);
    }
    
    // Increment update counter and notify waiting workers
    Atomics.add(this.updateCounter, 0, 1);
    Atomics.notify(this.updateCounter, 0);
  }

  /**
   * Get ticker data from shared memory
   */
  getTicker(symbol: string): Ticker | null {
    const symbolIndex = this.symbolIndexMap.get(symbol);
    if (symbolIndex === undefined) return null;
    
    const offset = symbolIndex * TICKER_SIZE;
    
    // Check if data exists
    if (this.tickerView[offset + 9] === 0) return null;
    
    return {
      s: symbol,
      c: this.tickerView[offset + 0].toString(),
      o: this.tickerView[offset + 1].toString(),
      h: this.tickerView[offset + 2].toString(),
      l: this.tickerView[offset + 3].toString(),
      v: this.tickerView[offset + 4].toString(),
      q: this.tickerView[offset + 5].toString(),
      P: this.tickerView[offset + 6].toString(),
      p: this.tickerView[offset + 7].toString(),
      w: this.tickerView[offset + 8].toString(),
    } as Ticker;
  }

  /**
   * Get klines from shared memory
   */
  getKlines(symbol: string, interval: KlineInterval): Kline[] {
    const symbolIndex = this.symbolIndexMap.get(symbol);
    const intervalIndex = this.intervalIndexMap.get(interval);
    
    if (symbolIndex === undefined || intervalIndex === undefined) {
      return [];
    }
    
    const baseOffset = (symbolIndex * MAX_INTERVALS * MAX_KLINES_PER_SYMBOL + 
                        intervalIndex * MAX_KLINES_PER_SYMBOL) * KLINE_SIZE;
    
    const klines: Kline[] = [];
    
    for (let i = 0; i < MAX_KLINES_PER_SYMBOL; i++) {
      const offset = baseOffset + i * KLINE_SIZE;
      const timestamp = this.klineView[offset + 0];
      
      // Stop when we hit empty data
      if (timestamp === 0) break;
      
      klines.push([
        timestamp,
        this.klineView[offset + 1].toString(),
        this.klineView[offset + 2].toString(),
        this.klineView[offset + 3].toString(),
        this.klineView[offset + 4].toString(),
        this.klineView[offset + 5].toString(),
      ] as Kline);
    }
    
    return klines;
  }

  /**
   * Get all registered symbols
   */
  getSymbols(): string[] {
    return Array.from(this.symbolIndexMap.keys());
  }

  /**
   * Get update counter value
   */
  getUpdateCount(): number {
    return Atomics.load(this.updateCounter, 0);
  }

  /**
   * Wait for updates (for workers)
   */
  waitForUpdate(expectedCount: number, timeout: number = 1000): number {
    return Atomics.wait(this.updateCounter, 0, expectedCount, timeout);
  }

  // Helper methods
  private findKlineIndex(baseOffset: number, timestamp: number): number {
    for (let i = 0; i < MAX_KLINES_PER_SYMBOL; i++) {
      const offset = baseOffset + i * KLINE_SIZE;
      const klineTime = this.klineView[offset + 0];
      
      if (klineTime === 0) return -1; // End of data
      if (klineTime === timestamp) return i; // Found existing
    }
    return -1;
  }

  private getKlineCount(baseOffset: number): number {
    for (let i = 0; i < MAX_KLINES_PER_SYMBOL; i++) {
      const offset = baseOffset + i * KLINE_SIZE;
      if (this.klineView[offset + 0] === 0) return i;
    }
    return MAX_KLINES_PER_SYMBOL;
  }

  private shiftKlines(baseOffset: number) {
    // Shift all klines one position to the left (remove oldest)
    for (let i = 0; i < MAX_KLINES_PER_SYMBOL - 1; i++) {
      const srcOffset = baseOffset + (i + 1) * KLINE_SIZE;
      const dstOffset = baseOffset + i * KLINE_SIZE;
      
      for (let j = 0; j < KLINE_SIZE; j++) {
        this.klineView[dstOffset + j] = this.klineView[srcOffset + j];
      }
    }
    
    // Clear last position
    const lastOffset = baseOffset + (MAX_KLINES_PER_SYMBOL - 1) * KLINE_SIZE;
    for (let j = 0; j < KLINE_SIZE; j++) {
      this.klineView[lastOffset + j] = 0;
    }
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats() {
    const usedSymbols = this.symbolIndexMap.size;
    const totalMemory = TICKER_BUFFER_SIZE + KLINE_BUFFER_SIZE + METADATA_BUFFER_SIZE;
    const usedMemoryEstimate = usedSymbols * (TICKER_SIZE * 8 + MAX_INTERVALS * 250 * KLINE_SIZE * 8);
    
    return {
      totalMemoryMB: (totalMemory / 1024 / 1024).toFixed(2),
      usedMemoryMB: (usedMemoryEstimate / 1024 / 1024).toFixed(2),
      usedSymbols,
      maxSymbols: MAX_SYMBOLS,
      updateCount: this.getUpdateCount()
    };
  }
}