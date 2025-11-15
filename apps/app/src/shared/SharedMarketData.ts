/**
 * SharedMarketData - Zero-copy shared memory implementation
 * 
 * Uses SharedArrayBuffer for zero-serialization data sharing between
 * main thread and workers. All data is stored in typed arrays for
 * maximum performance.
 */

import { Ticker, Kline, KlineInterval } from '../../types';
import { BitSet } from '../utils/BitSet';

// Constants for memory layout
const TICKER_SIZE = 10; // floats per ticker (price, volume, change%, etc.)
const KLINE_SIZE = 6; // floats per kline (time, O, H, L, C, V)
const MAX_SYMBOLS = 200;
const MAX_KLINES_PER_SYMBOL = 150; // Limit to 150 candles per symbol-interval
const MAX_INTERVALS = 6;

// Memory offsets
const TICKER_BUFFER_SIZE = MAX_SYMBOLS * TICKER_SIZE * Float64Array.BYTES_PER_ELEMENT;
const KLINE_BUFFER_SIZE = MAX_SYMBOLS * MAX_INTERVALS * MAX_KLINES_PER_SYMBOL * KLINE_SIZE * Float64Array.BYTES_PER_ELEMENT;
const METADATA_BUFFER_SIZE = MAX_SYMBOLS * 256; // For symbol names and metadata

// Symbol update tracking sizes
const SYMBOL_UPDATE_FLAGS_SIZE = Math.ceil(MAX_SYMBOLS / 32); // 7 uint32s for 200 symbols

export interface SharedMarketDataConfig {
  maxSymbols?: number;
  maxKlinesPerSymbol?: number;
  maxIntervals?: number;
}

export class SharedMarketData {
  private tickerBuffer: SharedArrayBuffer | ArrayBuffer;
  private klineBuffer: SharedArrayBuffer | ArrayBuffer;
  private metadataBuffer: SharedArrayBuffer | ArrayBuffer;
  private updateCounterBuffer: SharedArrayBuffer | ArrayBuffer;

  // Double buffering for race-condition free updates
  private updateFlagsA: SharedArrayBuffer | ArrayBuffer;
  private updateFlagsB: SharedArrayBuffer | ArrayBuffer;
  private currentWriteBuffer: 'A' | 'B' = 'A';
  private flagsViewA: Uint32Array;
  private flagsViewB: Uint32Array;

  // Maps for O(1) lookups
  private symbolIndexMap: Map<string, number> = new Map();
  private indexToSymbol: Map<number, string> = new Map();
  private intervalIndexMap: Map<KlineInterval, number> = new Map();

  // Views for data access
  private tickerView: Float64Array;
  private klineView: Float64Array;
  private metadataView: Uint8Array;
  private updateCounter: Int32Array;

  // Rate limiting
  private lastUpdateTime: Map<string, number> = new Map();
  private readonly MIN_UPDATE_INTERVAL = 100; // ms between updates per symbol

  // Debug ring buffer for tracking recent updates
  private debugMode = false;
  private updateHistory: Array<{symbol: string, timestamp: number, type: 'ticker' | 'kline'}> = [];
  private readonly MAX_HISTORY = 100;

  private isInitialized = false;
  private isSharedArrayBufferAvailable = false;

  constructor(config?: SharedMarketDataConfig) {
    // Check if SharedArrayBuffer is available
    this.isSharedArrayBufferAvailable = typeof SharedArrayBuffer !== 'undefined';

    if (!this.isSharedArrayBufferAvailable) {
      console.warn('SharedArrayBuffer is not available. Falling back to ArrayBuffer (performance may be degraded on some features).');
    }

    // Initialize buffers (use SharedArrayBuffer if available, otherwise ArrayBuffer)
    const BufferType = this.isSharedArrayBufferAvailable ? SharedArrayBuffer : ArrayBuffer;

    this.tickerBuffer = new BufferType(TICKER_BUFFER_SIZE);
    this.klineBuffer = new BufferType(KLINE_BUFFER_SIZE);
    this.metadataBuffer = new BufferType(METADATA_BUFFER_SIZE);
    this.updateCounterBuffer = new BufferType(4);

    // Initialize double buffers for update flags
    const flagBufferSize = SYMBOL_UPDATE_FLAGS_SIZE * Uint32Array.BYTES_PER_ELEMENT;
    this.updateFlagsA = new BufferType(flagBufferSize);
    this.updateFlagsB = new BufferType(flagBufferSize);
    this.flagsViewA = new Uint32Array(this.updateFlagsA);
    this.flagsViewB = new Uint32Array(this.updateFlagsB);

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

    // Check for debug mode
    this.debugMode = typeof localStorage !== 'undefined' &&
                     localStorage.getItem('DEBUG_SYMBOL_UPDATES') === 'true';

    this.isInitialized = true;
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
      updateFlagsA: this.updateFlagsA,
      updateFlagsB: this.updateFlagsB,
      config: {
        maxSymbols: MAX_SYMBOLS,
        maxKlinesPerSymbol: MAX_KLINES_PER_SYMBOL,
        maxIntervals: MAX_INTERVALS,
        tickerSize: TICKER_SIZE,
        klineSize: KLINE_SIZE,
        symbolUpdateFlagsSize: SYMBOL_UPDATE_FLAGS_SIZE
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
    
    // Maintain both maps for O(1) lookups
    this.symbolIndexMap.set(symbol, index);
    this.indexToSymbol.set(index, symbol);
    
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
    // Rate limiting
    const now = Date.now();
    const lastUpdate = this.lastUpdateTime.get(symbol) || 0;
    if (now - lastUpdate < this.MIN_UPDATE_INTERVAL) {
      return; // Skip update if too frequent
    }
    this.lastUpdateTime.set(symbol, now);
    
    const symbolIndex = this.getOrCreateSymbolIndex(symbol);
    const offset = symbolIndex * TICKER_SIZE;
    
    // Log first few updates for debugging - disabled to reduce noise
    // if (symbolIndex < 3 && Math.random() < 0.01) { // Sample 1% of updates for first 3 symbols
    //   console.log(`[SharedMarketData] Updating ticker ${symbol} at index ${symbolIndex}:`, {
    //     price: ticker.c,
    //     volume: ticker.v,
    //     change: ticker.P
    //   });
    // }
    
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
    
    // Set update flag in current write buffer
    const writeFlags = this.currentWriteBuffer === 'A' ? this.flagsViewA : this.flagsViewB;
    const bitSet = new BitSet(writeFlags, MAX_SYMBOLS);
    bitSet.set(symbolIndex);
    
    // Add to debug history if enabled
    if (this.debugMode) {
      this.addToHistory(symbol, 'ticker');
    }
    
    // Increment update counter and notify waiting workers
    const oldCount = Atomics.load(this.updateCounter, 0);
    const newCount = Atomics.add(this.updateCounter, 0, 1) + 1;
    Atomics.notify(this.updateCounter, 0);
    
    // Log counter updates occasionally - disabled to reduce noise
    // if (newCount % 10000 === 0) {
    //   console.log(`[SharedMarketData] Update counter: ${oldCount} -> ${newCount}`);
    // }
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
    
    // Write new klines - take the LAST N candles (most recent data)
    const klinesToWrite = Math.min(klines.length, MAX_KLINES_PER_SYMBOL);
    const startIndex = Math.max(0, klines.length - klinesToWrite);
    for (let i = 0; i < klinesToWrite; i++) {
      const kline = klines[startIndex + i];
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
   * Get symbol index (public method for hooks)
   */
  getSymbolIndex(symbol: string): number {
    return this.symbolIndexMap.get(symbol) ?? -1;
  }

  /**
   * Get interval index (public method for hooks)
   */
  getIntervalIndex(interval: KlineInterval): number {
    return this.intervalIndexMap.get(interval) ?? -1;
  }

  /**
   * Get maximum klines per symbol
   */
  getMaxKlinesPerSymbol(): number {
    return MAX_KLINES_PER_SYMBOL;
  }

  /**
   * Read a single kline from shared memory
   */
  readKline(symbolIndex: number, intervalIndex: number, klineIndex: number): Kline | null {
    if (symbolIndex < 0 || intervalIndex < 0 || klineIndex < 0 || klineIndex >= MAX_KLINES_PER_SYMBOL) {
      return null;
    }

    const baseOffset = (symbolIndex * MAX_INTERVALS * MAX_KLINES_PER_SYMBOL + 
                        intervalIndex * MAX_KLINES_PER_SYMBOL) * KLINE_SIZE;
    const offset = baseOffset + klineIndex * KLINE_SIZE;
    
    const timestamp = this.klineView[offset + 0];
    if (timestamp === 0) return null;
    
    return {
      time: timestamp,
      open: this.klineView[offset + 1],
      high: this.klineView[offset + 2],
      low: this.klineView[offset + 3],
      close: this.klineView[offset + 4],
      volume: this.klineView[offset + 5]
    } as any;
  }
  
  /**
   * Swap buffers and return the read buffer for workers
   * This ensures workers get a consistent snapshot
   */
  swapBuffers(): Uint32Array {
    // Return read buffer and swap for next cycle
    const readBuffer = this.currentWriteBuffer === 'A' ? this.flagsViewB : this.flagsViewA;
    this.currentWriteBuffer = this.currentWriteBuffer === 'A' ? 'B' : 'A';
    
    // Clear the new write buffer
    const newWriteBuffer = this.currentWriteBuffer === 'A' ? this.flagsViewA : this.flagsViewB;
    const bitSet = new BitSet(newWriteBuffer, MAX_SYMBOLS);
    bitSet.clearAll();
    
    if (this.debugMode) {
      const readBitSet = new BitSet(readBuffer, MAX_SYMBOLS);
      const updatedCount = readBitSet.count();
      console.log(`[SharedMarketData] Buffer swap: ${updatedCount} symbols updated`);
    }
    
    return readBuffer;
  }
  
  /**
   * Get symbol from index (O(1) reverse lookup)
   */
  getSymbolFromIndex(index: number): string | undefined {
    return this.indexToSymbol.get(index);
  }
  
  /**
   * Get all updated symbol indices from a flags buffer
   */
  getUpdatedSymbols(flagsBuffer: Uint32Array): number[] {
    const bitSet = new BitSet(flagsBuffer, MAX_SYMBOLS);
    return bitSet.getSetIndices();
  }
  
  /**
   * Remove a symbol from tracking (cleanup memory)
   */
  removeSymbol(symbol: string): void {
    const index = this.symbolIndexMap.get(symbol);
    if (index === undefined) return;
    
    // Clear ticker data
    const tickerOffset = index * TICKER_SIZE;
    for (let i = 0; i < TICKER_SIZE; i++) {
      this.tickerView[tickerOffset + i] = 0;
    }
    
    // Clear kline data for all intervals
    for (let intervalIndex = 0; intervalIndex < MAX_INTERVALS; intervalIndex++) {
      const baseOffset = (index * MAX_INTERVALS * MAX_KLINES_PER_SYMBOL + 
                          intervalIndex * MAX_KLINES_PER_SYMBOL) * KLINE_SIZE;
      for (let i = 0; i < MAX_KLINES_PER_SYMBOL * KLINE_SIZE; i++) {
        this.klineView[baseOffset + i] = 0;
      }
    }
    
    // Clear metadata
    const metadataOffset = index * 256;
    for (let i = 0; i < 256; i++) {
      this.metadataView[metadataOffset + i] = 0;
    }
    
    // Remove from maps
    this.symbolIndexMap.delete(symbol);
    this.indexToSymbol.delete(index);
    this.lastUpdateTime.delete(symbol);
    
    console.log(`[SharedMarketData] Removed symbol ${symbol} at index ${index}`);
  }
  
  /**
   * Clean up old symbols based on last update time
   */
  cleanupOldSymbols(maxAgeMs: number = 5 * 60 * 1000): number {
    const now = Date.now();
    const symbolsToRemove: string[] = [];
    
    this.lastUpdateTime.forEach((updateTime, symbol) => {
      if (now - updateTime > maxAgeMs) {
        symbolsToRemove.push(symbol);
      }
    });
    
    symbolsToRemove.forEach(symbol => this.removeSymbol(symbol));
    
    if (symbolsToRemove.length > 0) {
      console.log(`[SharedMarketData] Cleaned up ${symbolsToRemove.length} old symbols`);
    }
    
    return symbolsToRemove.length;
  }
  
  /**
   * Reset all buffers and maps
   */
  reset(): void {
    // Clear all typed arrays
    this.tickerView.fill(0);
    this.klineView.fill(0);
    this.metadataView.fill(0);
    this.updateCounter.fill(0);
    this.flagsViewA.fill(0);
    this.flagsViewB.fill(0);
    
    // Clear all maps
    this.symbolIndexMap.clear();
    this.indexToSymbol.clear();
    this.intervalIndexMap.clear();
    this.lastUpdateTime.clear();
    
    // Reset state
    this.nextSymbolIndex = 0;
    this.currentWriteBuffer = 'A';
    
    // Re-initialize interval mapping
    const intervals = ['1m', '5m', '15m', '1h', '4h', '1d'];
    intervals.forEach((interval, index) => {
      this.intervalIndexMap.set(interval as KlineInterval, index);
    });
    
    console.log('[SharedMarketData] Reset complete');
  }
  
  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    symbolCount: number;
    totalMemoryMB: number;
    tickerMemoryMB: number;
    klineMemoryMB: number;
    metadataMemoryMB: number;
  } {
    const tickerBytes = this.tickerBuffer.byteLength;
    const klineBytes = this.klineBuffer.byteLength;
    const metadataBytes = this.metadataBuffer.byteLength;
    const totalBytes = tickerBytes + klineBytes + metadataBytes + 
                      this.updateCounterBuffer.byteLength + 
                      this.updateFlagsA.byteLength + 
                      this.updateFlagsB.byteLength;
    
    return {
      symbolCount: this.symbolIndexMap.size,
      totalMemoryMB: totalBytes / (1024 * 1024),
      tickerMemoryMB: tickerBytes / (1024 * 1024),
      klineMemoryMB: klineBytes / (1024 * 1024),
      metadataMemoryMB: metadataBytes / (1024 * 1024)
    };
  }
  
  /**
   * Add to debug history (ring buffer)
   */
  private addToHistory(symbol: string, type: 'ticker' | 'kline') {
    if (!this.debugMode) return;
    
    this.updateHistory.push({
      symbol,
      timestamp: Date.now(),
      type
    });
    
    // Keep only last MAX_HISTORY entries
    if (this.updateHistory.length > this.MAX_HISTORY) {
      this.updateHistory.shift();
    }
  }
  
  /**
   * Get debug history
   */
  getUpdateHistory() {
    return this.updateHistory.slice(); // Return copy
  }
  
  /**
   * Enable/disable debug mode
   */
  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('DEBUG_SYMBOL_UPDATES', enabled ? 'true' : 'false');
    }
  }
}

// Create and export singleton instance
export const sharedMarketData = new SharedMarketData();