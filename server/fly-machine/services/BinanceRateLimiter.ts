/**
 * Binance Rate Limiter
 * Token bucket implementation for rate limiting Binance API requests
 *
 * Binance limits:
 * - 1200 requests per minute (20 req/sec)
 * - We use 10 req/sec (50% capacity) to be conservative
 */

export interface RateLimiterConfig {
  tokensPerSecond: number;
  maxTokens: number;
  initialTokens?: number;
}

export class BinanceRateLimiter {
  private tokens: number;
  private readonly tokensPerSecond: number;
  private readonly maxTokens: number;
  private lastRefill: number;
  private requestQueue: Array<() => void> = [];
  private processingQueue = false;

  constructor(config?: Partial<RateLimiterConfig>) {
    // Default: 10 req/sec, max 20 tokens (allows short bursts)
    this.tokensPerSecond = config?.tokensPerSecond || 10;
    this.maxTokens = config?.maxTokens || 20;
    this.tokens = config?.initialTokens ?? this.maxTokens;
    this.lastRefill = Date.now();
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * this.tokensPerSecond;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Acquire a token for making a request
   * @param cost Number of tokens required (default: 1)
   * @returns Promise that resolves when token is acquired
   */
  async acquire(cost: number = 1): Promise<void> {
    return new Promise((resolve) => {
      const tryAcquire = () => {
        this.refillTokens();

        if (this.tokens >= cost) {
          this.tokens -= cost;
          resolve();
          return true;
        }
        return false;
      };

      // Try immediate acquisition
      if (tryAcquire()) {
        this.processQueue();
        return;
      }

      // Queue the request
      this.requestQueue.push(() => {
        if (tryAcquire()) {
          resolve();
        } else {
          // Re-queue if still not enough tokens
          this.requestQueue.unshift(() => {
            if (tryAcquire()) {
              resolve();
            }
          });
        }
      });

      this.processQueue();
    });
  }

  /**
   * Process queued requests
   */
  private processQueue(): void {
    if (this.processingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.processingQueue = true;

    const processNext = () => {
      this.refillTokens();

      while (this.requestQueue.length > 0 && this.tokens >= 1) {
        const next = this.requestQueue.shift();
        if (next) next();
      }

      if (this.requestQueue.length > 0) {
        // Calculate wait time for next token
        const waitTime = (1 / this.tokensPerSecond) * 1000;
        setTimeout(processNext, waitTime);
      } else {
        this.processingQueue = false;
      }
    };

    // Start processing with a small delay
    const waitTime = (1 / this.tokensPerSecond) * 1000;
    setTimeout(processNext, waitTime);
  }

  /**
   * Execute a function with rate limiting
   * @param fn Function to execute
   * @param cost Number of tokens required (default: 1)
   * @returns Result of the function
   */
  async execute<T>(fn: () => Promise<T>, cost: number = 1): Promise<T> {
    await this.acquire(cost);
    return fn();
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refillTokens();
    return Math.floor(this.tokens);
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.requestQueue.length;
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    this.refillTokens();
    return {
      availableTokens: Math.floor(this.tokens),
      maxTokens: this.maxTokens,
      tokensPerSecond: this.tokensPerSecond,
      queueLength: this.requestQueue.length,
      utilizationPercent: Math.round(((this.maxTokens - this.tokens) / this.maxTokens) * 100),
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.requestQueue = [];
    this.processingQueue = false;
  }

  /**
   * Wait for specified time (useful for exponential backoff)
   * @param ms Milliseconds to wait
   */
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate exponential backoff delay
   * @param attempt Attempt number (0-indexed)
   * @param baseDelay Base delay in milliseconds (default: 1000)
   * @param maxDelay Maximum delay in milliseconds (default: 8000)
   * @returns Delay in milliseconds
   */
  static calculateBackoff(
    attempt: number,
    baseDelay: number = 1000,
    maxDelay: number = 8000
  ): number {
    const delay = baseDelay * Math.pow(2, attempt);
    return Math.min(delay, maxDelay);
  }
}
