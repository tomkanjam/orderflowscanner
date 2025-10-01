/**
 * Binance WebSocket Client for Node.js
 * Adapts browser WebSocket implementation for server-side use with `ws` package
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { IBinanceWebSocketClient, MarketData } from '../types';
import { Ticker, Kline, KlineInterval } from '../../../apps/app/types';

const WS_BASE_URL = 'wss://stream.binance.com:9443';
const RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_ATTEMPTS = 10;

export class BinanceWebSocketClient extends EventEmitter implements IBinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private symbols: string[] = [];
  private interval: KlineInterval = '5m' as KlineInterval;
  private tickers: Map<string, Ticker> = new Map();
  private klines: Map<string, Map<KlineInterval, Kline[]>> = new Map();

  private connectionStatus: 'connected' | 'disconnected' | 'reconnecting' = 'disconnected';
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  private lastTickerUpdate = Date.now();
  private lastKlineUpdate = Date.now();

  constructor() {
    super();
  }

  async connect(symbols: string[], interval: KlineInterval = '5m' as KlineInterval): Promise<void> {
    if (symbols.length === 0) {
      throw new Error('Cannot connect WebSocket with no symbols');
    }

    this.symbols = symbols;
    this.interval = interval;
    this.isShuttingDown = false;

    return new Promise((resolve, reject) => {
      this.createWebSocket(resolve, reject);
    });
  }

  private createWebSocket(
    onSuccess?: () => void,
    onError?: (error: Error) => void
  ): void {
    try {
      // Build combined stream URL
      const streams = this.buildStreamNames(this.symbols, this.interval);
      const url = `${WS_BASE_URL}/stream?streams=${streams.join('/')}`;

      console.log(`[BinanceWS] Connecting to ${this.symbols.length} symbols...`);

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

  private buildStreamNames(symbols: string[], interval: KlineInterval): string[] {
    const streams: string[] = [];

    symbols.forEach(symbol => {
      const lowerSymbol = symbol.toLowerCase();
      // Add ticker stream
      streams.push(`${lowerSymbol}@ticker`);
      // Add kline stream
      streams.push(`${lowerSymbol}@kline_${interval}`);
    });

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
    await this.connect(uniqueSymbols, this.interval);
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
    await this.connect(remainingSymbols, this.interval);
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

  getStats() {
    return {
      isConnected: this.ws !== null && this.isConnected,
      symbolCount: this.symbols.length,
      tickerCount: this.tickers.size,
      klineCount: this.klines.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}
