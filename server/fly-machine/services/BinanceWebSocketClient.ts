/**
 * Binance WebSocket Client for Node.js
 * Adapts browser WebSocket implementation for server-side use with `ws` package
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { IBinanceWebSocketClient, MarketData } from '../types';
import { Ticker, Kline, KlineInterval } from '../shared/types/types';
import { BinanceRateLimiter } from './BinanceRateLimiter';
import { mergeKlines, detectGaps, isValidKline, calculateStartTime } from '../utils/klineHelpers';

const WS_BASE_URL = 'wss://stream.binance.com:9443';
const BINANCE_API_URL = 'https://api.binance.com/api/v3/klines';
const RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

export class BinanceWebSocketClient extends EventEmitter implements IBinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private symbols: string[] = [];
  private intervals: Set<KlineInterval> = new Set();
  private tickers: Map<string, Ticker> = new Map();
  private klines: Map<string, Map<KlineInterval, Kline[]>> = new Map();

  private connectionStatus: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  private lastTickerUpdate = Date.now();
  private lastKlineUpdate = Date.now();

  // Historical data management
  private rateLimiter: BinanceRateLimiter;
  private historicalDataFetched = false;

  constructor() {
    super();
    this.rateLimiter = new BinanceRateLimiter({
      tokensPerSecond: 10, // Conservative: 10 req/sec (50% of Binance's 1200 req/min limit)
      maxTokens: 20, // Allow short bursts
    });
  }

  async connect(symbols: string[], intervals: KlineInterval[] | KlineInterval = ['1m' as KlineInterval]): Promise<void> {
    if (symbols.length === 0) {
      throw new Error('Cannot connect WebSocket with no symbols');
    }

    this.symbols = symbols;

    // Support both single interval (backward compat) and array of intervals
    if (Array.isArray(intervals)) {
      this.intervals = new Set(intervals);
    } else {
      this.intervals = new Set([intervals]);
    }

    // Always include 1m as fallback
    this.intervals.add('1m' as KlineInterval);

    this.isShuttingDown = false;

    console.log(`[BinanceWS] Connecting to ${this.symbols.length} symbols with ${this.intervals.size} intervals: ${Array.from(this.intervals).join(', ')}`);

    return new Promise((resolve, reject) => {
      this.createWebSocket(resolve, reject);
    });
  }

  private createWebSocket(
    onSuccess?: () => void,
    onError?: (error: Error) => void
  ): void {
    try {
      // Build combined stream URL with multiple intervals
      const streams = this.buildStreamNames(this.symbols, this.intervals);
      const url = `${WS_BASE_URL}/stream?streams=${streams.join('/')}`;

      console.log(`[BinanceWS] Connecting with ${streams.length} total streams...`);

      this.ws = new WebSocket(url);
      this.connectionStatus = 'reconnecting';

      this.ws.on('open', () => {
        console.log('[BinanceWS] Connected successfully');
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0;

        if (onSuccess) onSuccess();
        this.emit('connected');
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error('[BinanceWS] Failed to parse message:', error);
        }
      });

      this.ws.on('error', (error: Error) => {
        console.error('[BinanceWS] WebSocket error:', error.message);
        this.emit('error', error);

        if (onError) onError(error);
      });

      this.ws.on('close', (code: number, reason: string) => {
        console.log(`[BinanceWS] Connection closed: ${code} - ${reason || 'No reason'}`);
        this.connectionStatus = 'disconnected';
        this.ws = null;

        this.emit('disconnected');

        // Attempt reconnection if not shutting down
        if (!this.isShuttingDown && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          this.scheduleReconnect();
        } else if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[BinanceWS] Max reconnect attempts reached. Giving up.');
        }
      });

    } catch (error) {
      console.error('[BinanceWS] Failed to create WebSocket:', error);
      if (onError) onError(error as Error);
    }
  }

  private buildStreamNames(symbols: string[], intervals: Set<KlineInterval>): string[] {
    const streams: string[] = [];

    symbols.forEach(symbol => {
      const lowerSymbol = symbol.toLowerCase();
      // Add ticker stream (only once per symbol)
      streams.push(`${lowerSymbol}@ticker`);

      // Add kline stream for each interval
      intervals.forEach(interval => {
        streams.push(`${lowerSymbol}@kline_${interval}`);
      });
    });

    console.log(`[BinanceWS] Building ${streams.length} streams (${symbols.length} symbols × ${intervals.size} intervals + tickers)`);

    return streams;
  }

  private handleMessage(message: any): void {
    if (!message.stream || !message.data) return;

    const stream = message.stream as string;
    const data = message.data;

    if (stream.endsWith('@ticker')) {
      this.handleTickerUpdate(data);
    } else if (stream.includes('@kline_')) {
      this.handleKlineUpdate(data);
    }
  }

  private handleTickerUpdate(data: any): void {
    const ticker: Ticker = {
      s: data.s,      // Symbol
      P: data.P,      // Price change percent
      c: data.c,      // Current price
      q: data.q,      // Quote volume
      ...data
    };

    this.tickers.set(ticker.s, ticker);
    this.lastTickerUpdate = Date.now();

    this.emit('ticker', ticker);
  }

  private handleKlineUpdate(data: any): void {
    const kline = data.k;
    const symbol = kline.s;
    const interval = kline.i as KlineInterval;
    const isClosed = kline.x;

    const klineData: Kline = [
      kline.t,     // Open time
      kline.o,     // Open
      kline.h,     // High
      kline.l,     // Low
      kline.c,     // Close
      kline.v,     // Volume
      kline.T,     // Close time
      kline.q,     // Quote asset volume
      kline.n,     // Number of trades
      kline.V,     // Taker buy base asset volume
      kline.Q,     // Taker buy quote asset volume
      '0'          // Ignore
    ];

    // Initialize symbol klines map if needed
    if (!this.klines.has(symbol)) {
      this.klines.set(symbol, new Map());
    }

    const symbolKlines = this.klines.get(symbol)!;

    // Initialize interval array if needed
    if (!symbolKlines.has(interval)) {
      symbolKlines.set(interval, []);
    }

    const intervalKlines = symbolKlines.get(interval)!;

    if (isClosed) {
      // Closed candle - add to history
      intervalKlines.push(klineData);

      // Keep only last 500 klines
      if (intervalKlines.length > 500) {
        intervalKlines.shift();
      }
    } else {
      // Update the current (open) candle
      if (intervalKlines.length > 0) {
        intervalKlines[intervalKlines.length - 1] = klineData;
      } else {
        intervalKlines.push(klineData);
      }
    }

    this.lastKlineUpdate = Date.now();
    this.emit('kline', { symbol, interval, kline: klineData, isClosed });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectAttempts++;
    this.connectionStatus = 'reconnecting';

    const delay = RECONNECT_DELAY * Math.min(this.reconnectAttempts, 5); // Max 25s delay

    console.log(`[BinanceWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.createWebSocket();
    }, delay);
  }

  async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    // Cancel any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.ws.close(1000, 'Intentional disconnect');
      this.ws = null;
    }

    this.connectionStatus = 'disconnected';
    console.log('[BinanceWS] Disconnected');
  }

  getTickers(): Map<string, Ticker> {
    return new Map(this.tickers);
  }

  getKlines(symbol: string, interval: KlineInterval): Kline[] {
    const symbolKlines = this.klines.get(symbol);
    if (!symbolKlines) return [];

    const intervalKlines = symbolKlines.get(interval);
    return intervalKlines ? [...intervalKlines] : [];
  }

  getConnectionStatus(): 'connected' | 'disconnected' | 'reconnecting' {
    return this.connectionStatus;
  }

  getLastUpdate(): { ticker: number; kline: number } {
    return {
      ticker: this.lastTickerUpdate,
      kline: this.lastKlineUpdate
    };
  }

  isConnected(): boolean {
    return this.connectionStatus === 'connected';
  }

  getSymbols(): string[] {
    return [...this.symbols];
  }

  // Add symbols to the connection (requires reconnect)
  async addSymbols(newSymbols: string[]): Promise<void> {
    const uniqueSymbols = [...new Set([...this.symbols, ...newSymbols])];

    if (uniqueSymbols.length === this.symbols.length) {
      return; // No new symbols
    }

    await this.disconnect();
    await this.connect(uniqueSymbols, Array.from(this.intervals) as any);
  }

  // Remove symbols from the connection (requires reconnect)
  async removeSymbols(symbolsToRemove: string[]): Promise<void> {
    const removeSet = new Set(symbolsToRemove);
    const remainingSymbols = this.symbols.filter(s => !removeSet.has(s));

    if (remainingSymbols.length === 0) {
      throw new Error('Cannot remove all symbols from WebSocket');
    }

    if (remainingSymbols.length === this.symbols.length) {
      return; // No symbols removed
    }

    await this.disconnect();
    await this.connect(remainingSymbols, Array.from(this.intervals) as any);
  }

  /**
   * Fetch historical klines for multiple symbols and intervals
   * Uses rate limiting and parallel execution for efficiency
   * @param symbols Array of symbols to fetch
   * @param intervals Array of intervals to fetch
   * @param primaryInterval Primary interval (gets 1440 klines, others get 100)
   */
  async fetchHistoricalKlines(
    symbols: string[],
    intervals: KlineInterval[],
    primaryInterval: KlineInterval
  ): Promise<void> {
    const startTime = Date.now();
    console.log(`[BinanceWS] Starting historical fetch for ${symbols.length} symbols × ${intervals.length} intervals`);

    // Build all requests
    const requests: Array<{
      symbol: string;
      interval: KlineInterval;
      limit: number;
    }> = [];

    for (const symbol of symbols) {
      for (const interval of intervals) {
        const limit = interval === primaryInterval ? 1440 : 100;
        requests.push({ symbol, interval, limit });
      }
    }

    console.log(`[BinanceWS] Total requests to process: ${requests.length}`);

    // Execute all requests in parallel with rate limiting
    const results = await Promise.allSettled(
      requests.map(req => this.executeFetchRequest(req.symbol, req.interval, req.limit))
    );

    // Process results
    let successCount = 0;
    let failureCount = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { symbol, interval, klines } = result.value;

        // Initialize maps if needed
        if (!this.klines.has(symbol)) {
          this.klines.set(symbol, new Map());
        }

        const symbolKlines = this.klines.get(symbol)!;

        // Merge with existing real-time data if any
        const existing = symbolKlines.get(interval) || [];
        const merged = mergeKlines(klines, existing);

        symbolKlines.set(interval, merged);
        successCount++;

        console.log(`[BinanceWS] ✓ ${symbol} ${interval}: ${merged.length} klines (${klines.length} historical + ${existing.length} real-time)`);
      } else {
        failureCount++;
        const req = requests[index];
        console.error(`[BinanceWS] ✗ ${req.symbol} ${req.interval}: ${result.reason}`);
      }
    });

    const duration = Date.now() - startTime;
    const successRate = (successCount / requests.length) * 100;

    console.log(`[BinanceWS] Historical fetch complete in ${(duration / 1000).toFixed(1)}s`);
    console.log(`[BinanceWS] Success: ${successCount}/${requests.length} (${successRate.toFixed(1)}%)`);

    if (successRate < 80) {
      throw new Error(`Historical fetch failed: only ${successRate.toFixed(1)}% success rate`);
    }

    this.historicalDataFetched = true;
  }

  /**
   * Execute a single fetch request with retry logic
   * @param symbol Symbol to fetch
   * @param interval Interval to fetch
   * @param limit Number of klines to fetch
   * @returns Fetched klines
   */
  private async executeFetchRequest(
    symbol: string,
    interval: KlineInterval,
    limit: number
  ): Promise<{ symbol: string; interval: KlineInterval; klines: Kline[] }> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Wait for rate limiter token
        await this.rateLimiter.acquire();

        // Calculate start time for this interval
        const endTime = Date.now();
        const startTime = calculateStartTime(interval, limit);

        // Build URL
        const url = new URL(BINANCE_API_URL);
        url.searchParams.set('symbol', symbol);
        url.searchParams.set('interval', interval);
        url.searchParams.set('startTime', startTime.toString());
        url.searchParams.set('endTime', endTime.toString());
        url.searchParams.set('limit', limit.toString());

        // Execute request
        const response = await fetch(url.toString());

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate response
        if (!Array.isArray(data)) {
          throw new Error(`Invalid response format: expected array, got ${typeof data}`);
        }

        // Validate and filter klines
        const klines: Kline[] = data.filter(isValidKline);

        if (klines.length === 0) {
          console.warn(`[BinanceWS] No valid klines for ${symbol} ${interval}`);
        }

        return { symbol, interval, klines };

      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries - 1) {
          const delay = BinanceRateLimiter.calculateBackoff(attempt);
          console.warn(`[BinanceWS] Retry ${attempt + 1}/${maxRetries} for ${symbol} ${interval} after ${delay}ms: ${lastError.message}`);
          await BinanceRateLimiter.wait(delay);
        }
      }
    }

    throw lastError || new Error(`Failed to fetch ${symbol} ${interval} after ${maxRetries} attempts`);
  }

  getMarketData(): MarketData {
    const klineMap = new Map<string, Map<string, Kline[]>>();

    this.klines.forEach((intervals, symbol) => {
      const intervalMap = new Map<string, Kline[]>();
      intervals.forEach((klines, interval) => {
        intervalMap.set(interval, [...klines]);
      });
      klineMap.set(symbol, intervalMap);
    });

    return {
      tickers: this.getTickers(),
      klines: klineMap,
      symbols: this.getSymbols(),
      timestamp: Date.now()
    };
  }

  /**
   * Update active intervals for the connection
   * Requires reconnection to change subscribed streams
   * @param newIntervals Array of new intervals to subscribe to
   */
  async updateIntervals(newIntervals: KlineInterval[]): Promise<void> {
    const currentIntervals = Array.from(this.intervals);
    const newIntervalSet = new Set(newIntervals);

    // Always include 1m as fallback
    newIntervalSet.add('1m' as KlineInterval);

    // Check if there's any change
    const hasChanges =
      currentIntervals.length !== newIntervalSet.size ||
      currentIntervals.some(interval => !newIntervalSet.has(interval));

    if (!hasChanges) {
      console.log('[BinanceWS] No interval changes detected, skipping update');
      return;
    }

    console.log(`[BinanceWS] Updating intervals from [${currentIntervals.join(', ')}] to [${Array.from(newIntervalSet).join(', ')}]`);

    // Store current data
    const currentKlines = this.klines;
    const currentTickers = this.tickers;

    // Update intervals
    this.intervals = newIntervalSet;

    // Reconnect with new intervals
    if (this.symbols.length > 0) {
      await this.disconnect();
      await this.connect(this.symbols, Array.from(newIntervalSet) as any);
    }

    // Restore data
    this.klines = currentKlines;
    this.tickers = currentTickers;

    console.log('[BinanceWS] Intervals updated successfully');
  }

  /**
   * Get currently active intervals
   * @returns Array of active intervals
   */
  getActiveIntervals(): KlineInterval[] {
    return Array.from(this.intervals);
  }

  /**
   * Validate data boundary for gaps and completeness
   * @param symbol Symbol to validate
   * @param interval Interval to validate
   * @param expectedCount Expected number of klines
   * @returns Validation result
   */
  validateDataBoundary(
    symbol: string,
    interval: KlineInterval,
    expectedCount: number
  ): {
    hasGaps: boolean;
    gaps: Array<[number, number]>;
    actualCount: number;
    expectedCount: number;
  } {
    const klines = this.getKlines(symbol, interval);
    const gaps = detectGaps(klines, interval);

    return {
      hasGaps: gaps.length > 0,
      gaps,
      actualCount: klines.length,
      expectedCount,
    };
  }

  getStats() {
    return {
      isConnected: this.ws !== null && this.isConnected,
      symbolCount: this.symbols.length,
      tickerCount: this.tickers.size,
      klineCount: this.klines.size,
      reconnectAttempts: this.reconnectAttempts,
      historicalDataFetched: this.historicalDataFetched,
      activeIntervals: this.getActiveIntervals(),
    };
  }
}
