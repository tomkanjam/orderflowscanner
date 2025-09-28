import WebSocket from 'ws';
import { RedisWriter } from './RedisWriter';

export interface KlineData {
  t: number;  // Kline start time
  T: number;  // Kline close time
  s: string;  // Symbol
  i: string;  // Interval
  o: string;  // Open
  c: string;  // Close
  h: string;  // High
  l: string;  // Low
  v: string;  // Base asset volume
  n: number;  // Number of trades
  x: boolean; // Is this kline closed?
  q: string;  // Quote asset volume
}

export interface TickerData {
  s: string;  // Symbol
  c: string;  // Close price
  o: string;  // Open price
  h: string;  // High price
  l: string;  // Low price
  v: string;  // Total traded base asset volume
  q: string;  // Total traded quote asset volume
  p: string;  // Price change
  P: string;  // Price change percent
  n: number;  // Count of trades
}

export class BinanceCollector {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private connectionCount = 0;
  private readonly maxStreamsPerConnection = 1024;
  private readonly reconnectDelay = 5000;
  private readonly pingInterval = 30000;
  private pingTimer: NodeJS.Timeout | null = null;
  private lastTickerWrite = new Map<string, number>(); // Throttle ticker writes

  constructor(
    private readonly redisWriter: RedisWriter,
    private readonly symbols: string[],
    private readonly intervals: string[] = ['1m', '5m', '15m', '1h']
  ) {}

  async start(): Promise<void> {
    console.log(`Starting Binance collector for ${this.symbols.length} symbols`);
    await this.connect();
  }

  async stop(): Promise<void> {
    console.log('Stopping Binance collector...');
    this.isShuttingDown = true;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private async connect(): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      // Build stream names
      const streams: string[] = [];

      for (const symbol of this.symbols) {
        const sym = symbol.toLowerCase();

        // Add ticker stream
        streams.push(`${sym}@ticker`);

        // Add kline streams for each interval
        for (const interval of this.intervals) {
          streams.push(`${sym}@kline_${interval}`);
        }
      }

      // Check if we exceed max streams
      if (streams.length > this.maxStreamsPerConnection) {
        console.warn(`Warning: ${streams.length} streams exceeds max ${this.maxStreamsPerConnection}`);
        // In production, we'd split into multiple connections
        streams.splice(this.maxStreamsPerConnection);
      }

      const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams.join('/')}`;
      console.log(`Connecting to Binance WebSocket with ${streams.length} streams`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.connectionCount++;
        console.log(`WebSocket connected (connection #${this.connectionCount})`);
        this.setupPing();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error: Error) => {
        console.error('WebSocket error:', error);
      });

      this.ws.on('close', () => {
        console.log('WebSocket closed');
        this.handleReconnect();
      });

    } catch (error) {
      console.error('Failed to connect:', error);
      this.handleReconnect();
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.stream && message.data) {
        const streamType = message.stream.split('@')[1];

        if (streamType === 'ticker') {
          this.handleTicker(message.data);
        } else if (streamType?.startsWith('kline_')) {
          this.handleKline(message.data);
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  private async handleTicker(data: any): Promise<void> {
    // Throttle ticker writes to once per second per symbol
    const now = Date.now();
    const lastWrite = this.lastTickerWrite.get(data.s) || 0;

    if (now - lastWrite < 1000) {
      return; // Skip if written within last second
    }

    this.lastTickerWrite.set(data.s, now);

    const ticker: TickerData = {
      s: data.s,
      c: data.c,
      o: data.o,
      h: data.h,
      l: data.l,
      v: data.v,
      q: data.q,
      p: data.p,
      P: data.P,
      n: data.n
    };

    await this.redisWriter.writeTicker(ticker.s, ticker);
  }

  private async handleKline(data: any): Promise<void> {
    const kline: KlineData = {
      t: data.k.t,
      T: data.k.T,
      s: data.k.s,
      i: data.k.i,
      o: data.k.o,
      c: data.k.c,
      h: data.k.h,
      l: data.k.l,
      v: data.k.v,
      n: data.k.n,
      x: data.k.x,
      q: data.k.q
    };

    // CRITICAL FIX: Only write closed candles to Redis
    // This reduces writes by ~99% (from every update to only at candle close)
    if (!kline.x) {
      return; // Skip incomplete candles
    }

    await this.redisWriter.writeKline(kline.s, kline.i, kline);
  }

  private setupPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
    }

    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.pingInterval);
  }

  private handleReconnect(): void {
    if (this.isShuttingDown) return;

    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    console.log(`Reconnecting in ${this.reconnectDelay}ms...`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  getStatus(): {
    connected: boolean;
    connectionCount: number;
    symbolCount: number;
    streamCount: number;
  } {
    return {
      connected: this.ws?.readyState === WebSocket.OPEN,
      connectionCount: this.connectionCount,
      symbolCount: this.symbols.length,
      streamCount: this.symbols.length * (1 + this.intervals.length)
    };
  }
}