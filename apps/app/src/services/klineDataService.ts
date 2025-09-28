/**
 * KlineDataService - Manages fetching and caching of kline data
 * Features:
 * - LRU cache with 100 symbol capacity
 * - Request deduplication for in-flight requests
 * - TTL-based cache expiration
 * - Telemetry for cache performance tracking
 */

import { Kline, KlineInterval } from '../../types';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { performanceMonitor } from '../utils/performanceMonitor';
import { withRetry, ErrorRecovery } from '../utils/errorHandler';

// Cache configuration
const CACHE_MAX_SIZE = 100; // Maximum number of symbols to cache
const CACHE_TTL_MS = 60 * 1000; // 60 seconds TTL
const REQUEST_TIMEOUT_MS = 10 * 1000; // 10 seconds timeout

// Response types
export interface KlineRequest {
  symbol: string;
  timeframe: KlineInterval;
  limit?: number;
}

export interface KlineResponse {
  klines: Kline[];
  ticker: any | null;
  symbol: string;
  timeframe: string;
  count: number;
  cached: boolean;
  latency: number;
  error?: string;
}

export interface KlineUpdate {
  symbol: string;
  timeframe: string;
  kline: Kline;
  type: 'update' | 'close' | 'new';
  timestamp: number;
}

export interface CacheEntry {
  data: KlineResponse;
  timestamp: number;
  accessCount: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  memoryUsage: number;
}

/**
 * LRU Cache implementation for kline data
 */
class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;
  private onEvict?: (key: K, value: V) => void;

  constructor(maxSize: number, onEvict?: (key: K, value: V) => void) {
    this.maxSize = maxSize;
    this.onEvict = onEvict;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Remove if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      const evictedValue = this.cache.get(firstKey);
      this.cache.delete(firstKey);

      if (this.onEvict && evictedValue !== undefined) {
        this.onEvict(firstKey, evictedValue);
      }
    }

    this.cache.set(key, value);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  keys(): IterableIterator<K> {
    return this.cache.keys();
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }
}

/**
 * Service for fetching and caching kline data
 */
export class KlineDataService {
  private cache: LRUCache<string, CacheEntry>;
  private pendingRequests: Map<string, Promise<KlineResponse>>;
  private stats: CacheStats;
  private supabaseUrl: string;
  private supabaseKey: string;
  private supabase: any;
  private subscriptions: Map<string, RealtimeChannel>;
  private updateCallbacks: Map<string, Set<(update: KlineUpdate) => void>>;

  constructor() {
    // Initialize cache with eviction callback
    this.cache = new LRUCache<string, CacheEntry>(
      CACHE_MAX_SIZE,
      (key, entry) => {
        this.stats.evictions++;
        performanceMonitor.trackCacheEviction();
        console.log(`[KlineDataService] Evicted cache entry: ${key}`);
      }
    );

    this.pendingRequests = new Map();
    this.subscriptions = new Map();
    this.updateCallbacks = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      memoryUsage: 0
    };

    // Get Supabase configuration
    this.supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    this.supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

    if (!this.supabaseUrl || !this.supabaseKey) {
      console.warn('[KlineDataService] Supabase configuration missing');
    } else {
      // Initialize Supabase client for real-time
      this.supabase = createClient(this.supabaseUrl, this.supabaseKey);
    }
  }

  /**
   * Fetch klines with caching and deduplication
   */
  async fetchKlines(request: KlineRequest): Promise<KlineResponse> {
    const cacheKey = this.getCacheKey(request);

    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      this.stats.hits++;
      performanceMonitor.trackCacheHit();
      return { ...cached, cached: true };
    }

    this.stats.misses++;
    performanceMonitor.trackCacheMiss();

    // Check for pending request (deduplication)
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      console.log(`[KlineDataService] Reusing pending request for ${cacheKey}`);
      return pending;
    }

    // Create new request with deduplication
    const requestPromise = this.dedupRequest(cacheKey, () =>
      this.fetchFromServer(request)
    );

    return requestPromise;
  }

  /**
   * Fetch multiple symbols in batch
   */
  async fetchMultipleKlines(requests: KlineRequest[]): Promise<Map<string, KlineResponse>> {
    const results = new Map<string, KlineResponse>();

    // Process in parallel but limit concurrency
    const batchSize = 5;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const promises = batch.map(req =>
        this.fetchKlines(req).then(res => ({
          key: `${req.symbol}:${req.timeframe}`,
          value: res
        }))
      );

      const batchResults = await Promise.all(promises);
      batchResults.forEach(({ key, value }) => {
        results.set(key, value);
      });
    }

    return results;
  }

  /**
   * Prefetch related symbols in background
   */
  async prefetchRelatedSymbols(
    baseSymbol: string,
    relatedSymbols: string[],
    timeframe: KlineInterval
  ): Promise<void> {
    // Don't wait for prefetch to complete
    Promise.all(
      relatedSymbols.map(symbol =>
        this.fetchKlines({ symbol, timeframe, limit: 100 }).catch(err => {
          console.warn(`[KlineDataService] Prefetch failed for ${symbol}:`, err);
        })
      )
    ).then(() => {
      console.log(`[KlineDataService] Prefetched ${relatedSymbols.length} related symbols`);
    });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    // Calculate memory usage (rough estimate)
    let memoryUsage = 0;
    for (const entry of this.cache.values()) {
      // Estimate: ~1KB per kline, plus overhead
      memoryUsage += entry.data.klines.length * 1024;
    }

    // Update performance monitor
    performanceMonitor.updateCacheSize(this.cache.size);

    return {
      ...this.stats,
      size: this.cache.size,
      memoryUsage
    };
  }

  /**
   * Subscribe to real-time kline updates
   */
  subscribeToUpdates(
    symbol: string,
    timeframe: KlineInterval,
    callback: (update: KlineUpdate) => void
  ): () => void {
    if (!this.supabase) {
      console.warn('[KlineDataService] Cannot subscribe - Supabase not configured');
      return () => {};
    }

    const channelKey = `klines:${symbol}:${timeframe}`;

    // Add callback to the set for this channel
    if (!this.updateCallbacks.has(channelKey)) {
      this.updateCallbacks.set(channelKey, new Set());
    }
    this.updateCallbacks.get(channelKey)!.add(callback);

    // Create subscription if not exists
    if (!this.subscriptions.has(channelKey)) {
      console.log(`[KlineDataService] Creating subscription for ${channelKey}`);

      const channel = this.supabase
        .channel(channelKey)
        .on('broadcast', { event: 'kline_update' }, (payload: any) => {
          const update: KlineUpdate = payload.payload;

          // Merge update into cached data
          this.mergeKlineUpdate(update);

          // Notify all callbacks for this channel
          const callbacks = this.updateCallbacks.get(channelKey);
          if (callbacks) {
            callbacks.forEach(cb => cb(update));
          }
        })
        .subscribe((status: string) => {
          console.log(`[KlineDataService] Subscription ${channelKey} status:`, status);
        });

      this.subscriptions.set(channelKey, channel);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.updateCallbacks.get(channelKey);
      if (callbacks) {
        callbacks.delete(callback);

        // If no more callbacks, unsubscribe the channel
        if (callbacks.size === 0) {
          this.unsubscribeChannel(channelKey);
        }
      }
    };
  }

  /**
   * Merge real-time update into cached data
   */
  private mergeKlineUpdate(update: KlineUpdate): void {
    const cacheKey = `${update.symbol}:${update.timeframe}:100`;
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return; // No cached data to update
    }

    const klines = entry.data.klines;
    const updateKline = update.kline;

    // Find the kline to update based on openTime
    const existingIndex = klines.findIndex(k => k.openTime === updateKline.openTime);

    if (existingIndex >= 0) {
      // Update existing kline
      if (update.type === 'update' || update.type === 'close') {
        klines[existingIndex] = updateKline;
      }
    } else if (update.type === 'new') {
      // Add new kline, maintaining sort order
      klines.push(updateKline);
      klines.sort((a, b) => a.openTime - b.openTime);

      // Keep only the latest N klines
      if (klines.length > 250) {
        klines.splice(0, klines.length - 250);
      }
    }

    // Update cache timestamp to extend TTL
    entry.timestamp = Date.now();

    console.log(`[KlineDataService] Merged ${update.type} update for ${update.symbol}`);
  }

  /**
   * Unsubscribe from a channel
   */
  private unsubscribeChannel(channelKey: string): void {
    const channel = this.subscriptions.get(channelKey);
    if (channel) {
      channel.unsubscribe();
      this.subscriptions.delete(channelKey);
      this.updateCallbacks.delete(channelKey);
      console.log(`[KlineDataService] Unsubscribed from ${channelKey}`);
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      memoryUsage: 0
    };
    console.log('[KlineDataService] Cache cleared');
  }

  /**
   * Cleanup all subscriptions
   */
  cleanup(): void {
    // Unsubscribe from all channels
    this.subscriptions.forEach((channel, key) => {
      channel.unsubscribe();
      console.log(`[KlineDataService] Unsubscribed from ${key}`);
    });

    this.subscriptions.clear();
    this.updateCallbacks.clear();
    this.clearCache();

    console.log('[KlineDataService] Service cleaned up');
  }

  /**
   * Remove specific symbol from cache
   */
  invalidateSymbol(symbol: string): void {
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${symbol}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
    console.log(`[KlineDataService] Invalidated ${keysToDelete.length} entries for ${symbol}`);
  }

  // Private methods

  private getCacheKey(request: KlineRequest): string {
    return `${request.symbol}:${request.timeframe}:${request.limit || 100}`;
  }

  private getFromCache(key: string): KlineResponse | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check TTL
    const age = Date.now() - entry.timestamp;
    if (age > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    // Update access count
    entry.accessCount++;

    return entry.data;
  }

  private async dedupRequest(
    key: string,
    fetcher: () => Promise<KlineResponse>
  ): Promise<KlineResponse> {
    // Create promise for this request
    const promise = fetcher()
      .then(response => {
        // Cache successful response
        this.cache.set(key, {
          data: response,
          timestamp: Date.now(),
          accessCount: 1
        });

        // Clean up pending request
        this.pendingRequests.delete(key);

        return response;
      })
      .catch(error => {
        // Clean up pending request on error
        this.pendingRequests.delete(key);
        throw error;
      });

    // Store as pending
    this.pendingRequests.set(key, promise);

    return promise;
  }

  private async fetchFromServer(request: KlineRequest): Promise<KlineResponse> {
    if (!this.supabaseUrl) {
      throw new Error('Supabase not configured');
    }

    const startTime = Date.now();

    try {
      // Build the edge function URL
      const url = `${this.supabaseUrl}/functions/v1/get-klines`;

      // Make the request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.supabaseKey,
          'Authorization': `Bearer ${this.supabaseKey}`
        },
        body: JSON.stringify({
          symbol: request.symbol,
          timeframe: request.timeframe,
          limit: request.limit || 100
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // Transform klines to match expected format
      const klines: Kline[] = (data.klines || []).map((k: any) => ({
        openTime: k.openTime,
        open: k.open,
        high: k.high,
        low: k.low,
        close: k.close,
        volume: k.volume,
        closeTime: k.closeTime,
        quoteVolume: k.quoteVolume,
        trades: k.trades,
        takerBuyBaseVolume: k.takerBuyBaseVolume,
        takerBuyQuoteVolume: k.takerBuyQuoteVolume
      }));

      const latency = Date.now() - startTime;
      performanceMonitor.trackNetworkRequest(latency, true);

      return {
        klines,
        ticker: data.ticker,
        symbol: data.symbol,
        timeframe: data.timeframe,
        count: klines.length,
        cached: false,
        latency
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      performanceMonitor.trackNetworkRequest(latency, false);
      console.error('[KlineDataService] Server fetch failed:', error);

      // Return empty response on error
      return {
        klines: [],
        ticker: null,
        symbol: request.symbol,
        timeframe: request.timeframe,
        count: 0,
        cached: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Fetch failed'
      };
    }
  }
}

// Singleton instance
export const klineDataService = new KlineDataService();