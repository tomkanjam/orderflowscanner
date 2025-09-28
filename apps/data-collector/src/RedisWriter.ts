import { Redis } from '@upstash/redis';
import type { KlineData } from './BinanceCollector';

export class RedisWriter {
  private redis: Redis;
  private pipeline: ReturnType<Redis['pipeline']> | null = null;
  private pipelineTimer: NodeJS.Timeout | null = null;
  private readonly pipelineFlushInterval = 100; // Flush every 100ms
  private readonly maxKlinesPerSymbol = 500; // Store last 500 klines per interval

  constructor(redisUrl?: string, redisToken?: string) {
    const url = redisUrl || process.env.UPSTASH_REDIS_URL;
    const token = redisToken || process.env.UPSTASH_REDIS_TOKEN;

    if (!url || !token) {
      throw new Error('Redis connection details required (UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN)');
    }

    console.log('Initializing Redis with URL:', url.substring(0, 30) + '...');
    console.log('Token length:', token ? token.length : 0);

    this.redis = new Redis({
      url,
      token,
    });

    this.startPipelineFlush();
  }

  private startPipelineFlush(): void {
    this.pipelineTimer = setInterval(() => {
      this.flushPipeline();
    }, this.pipelineFlushInterval);
  }

  private async flushPipeline(): Promise<void> {
    if (!this.pipeline) return;

    try {
      const startTime = Date.now();
      await this.pipeline.exec();
      const latency = Date.now() - startTime;

      if (latency > 10) {
        console.warn(`Pipeline flush took ${latency}ms`);
      }

      this.pipeline = null;
    } catch (error) {
      console.error('Pipeline flush error:', error);
      this.pipeline = null;
    }
  }

  private getPipeline(): ReturnType<Redis['pipeline']> {
    if (!this.pipeline) {
      this.pipeline = this.redis.pipeline();
    }
    return this.pipeline;
  }

  // Removed writeTicker method - no longer storing ticker data

async writeKline(symbol: string, interval: string, kline: KlineData): Promise<void> {
    // Only store closed klines for historical data
    if (!kline.x) return;

    const key = `klines:${symbol}:${interval}`;
    const pipeline = this.getPipeline();

    // Add to sorted set (score is the close time)
    pipeline.zadd(key, {
      score: kline.T,
      member: JSON.stringify(kline)
    });

    // Trim to keep only the most recent klines
    // Using negative indices to keep the last N items
    pipeline.zremrangebyrank(key, 0, -(this.maxKlinesPerSymbol + 1));

    // Set expiry to 24 hours
    pipeline.expire(key, 86400);

    // Track last closed candle time for execution triggers
    if (kline.x) {
      pipeline.set(`lastClosed:${symbol}:${interval}`, kline.T);
    }
  }

  async getKlines(symbol: string, interval: string, limit: number = 100): Promise<KlineData[]> {
    const key = `klines:${symbol}:${interval}`;

    // Get the most recent klines
    const results = await this.redis.zrange(key, -limit, -1);

    return results.map(item => {
      if (typeof item === 'string') {
        return JSON.parse(item) as KlineData;
      }
      return item as KlineData;
    });
  }

  // Removed getTicker method - ticker data now derived from klines

async getSymbolsWithNewCandles(_interval: string, _since: number): Promise<string[]> {
    // This would scan for symbols that have new closed candles since a timestamp
    // For now, return empty array - this will be implemented when we add execution tracking
    return [];
  }

  async cleanup(): Promise<void> {
    if (this.pipelineTimer) {
      clearInterval(this.pipelineTimer);
      this.pipelineTimer = null;
    }

    await this.flushPipeline();
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      console.log('Redis ping result:', result);
      return result === 'PONG';
    } catch (error) {
      console.error('Redis ping error:', error);
      return false;
    }
  }

  getStatus(): {
    connected: boolean;
    pipelineSize: number;
  } {
    return {
      connected: true, // Will implement proper connection tracking if needed
      pipelineSize: this.pipeline ? 1 : 0
    };
  }
}