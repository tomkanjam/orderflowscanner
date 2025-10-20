/**
 * KlineDataProvider - React context for managing kline data access
 * Provides centralized data fetching, caching, and state management
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { serverExecutionService } from '../services/serverExecutionService';
import { KlineResponse, KlineUpdate, klineDataService } from '../services/klineDataService';
import { Kline, KlineInterval } from '../../types';
import { prefetchStrategy, getCorrelatedSymbols } from '../utils/correlationMap';

// Context value interface
export interface KlineDataContextValue {
  fetchKlines: (symbol: string, interval: KlineInterval, limit?: number) => Promise<KlineResponse>;
  getCached: (symbol: string, interval: KlineInterval) => KlineResponse | null;
  prefetch: (symbols: string[], interval: KlineInterval) => void;
  prefetchCorrelated: (baseSymbol: string, interval: KlineInterval) => void;
  invalidateSymbol: (symbol: string) => void;
  subscribeToUpdates: (
    symbol: string,
    interval: KlineInterval,
    callback: (update: KlineUpdate) => void
  ) => () => void;
  cacheStats: {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
    memoryUsage: number;
  };
  isLoading: boolean;
  error: string | null;
}

// Create context
const KlineDataContext = createContext<KlineDataContextValue | undefined>(undefined);

// Local cache for React state (separate from service cache)
interface ReactCacheEntry {
  data: KlineResponse;
  timestamp: number;
}

// Provider props
interface KlineDataProviderProps {
  children: React.ReactNode;
  maxCacheAge?: number; // Max age in milliseconds
}

/**
 * KlineDataProvider component
 */
export const KlineDataProvider: React.FC<KlineDataProviderProps> = ({
  children,
  maxCacheAge = 60000 // 60 seconds default
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState({
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    memoryUsage: 0
  });

  // React-level cache for immediate updates
  const reactCache = useRef<Map<string, ReactCacheEntry>>(new Map());

  // Store active subscriptions
  const activeSubscriptions = useRef<Map<string, () => void>>(new Map());

  // Update cache stats periodically and cleanup
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = serverExecutionService.getCacheStats();
      setCacheStats(stats);
    }, 5000); // Update every 5 seconds

    return () => {
      clearInterval(interval);

      // Cleanup all subscriptions on unmount
      activeSubscriptions.current.forEach(unsub => unsub());
      activeSubscriptions.current.clear();
    };
  }, []);

  /**
   * Generate cache key
   */
  const getCacheKey = useCallback((symbol: string, interval: KlineInterval): string => {
    return `${symbol}:${interval}`;
  }, []);

  /**
   * Fetch klines with loading state management
   */
  const fetchKlines = useCallback(async (
    symbol: string,
    interval: KlineInterval,
    limit: number = 100
  ): Promise<KlineResponse> => {
    const cacheKey = getCacheKey(symbol, interval);

    try {
      setIsLoading(true);
      setError(null);

      // Fetch from service
      const response = await serverExecutionService.fetchKlines(symbol, interval, limit);

      // Update React cache
      reactCache.current.set(cacheKey, {
        data: response,
        timestamp: Date.now()
      });

      // Clean up old entries
      if (reactCache.current.size > 50) {
        const firstKey = reactCache.current.keys().next().value;
        reactCache.current.delete(firstKey);
      }

      return response;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch klines';
      setError(errorMessage);
      console.error(`[KlineDataProvider] Error fetching ${symbol}:`, err);

      // Return empty response on error
      return {
        klines: [],
        ticker: null,
        symbol,
        timeframe: interval,
        count: 0,
        cached: false,
        latency: 0,
        error: errorMessage
      };
    } finally {
      setIsLoading(false);
    }
  }, [getCacheKey]);

  /**
   * Get cached data without fetching
   */
  const getCached = useCallback((
    symbol: string,
    interval: KlineInterval
  ): KlineResponse | null => {
    const cacheKey = getCacheKey(symbol, interval);
    const entry = reactCache.current.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check if cache is still valid
    const age = Date.now() - entry.timestamp;
    if (age > maxCacheAge) {
      reactCache.current.delete(cacheKey);
      return null;
    }

    return entry.data;
  }, [getCacheKey, maxCacheAge]);

  /**
   * Prefetch multiple symbols in background with intelligent prioritization
   */
  const prefetch = useCallback((
    symbols: string[],
    interval: KlineInterval
  ): void => {
    // Check which symbols actually need prefetching
    const symbolsToFetch = symbols.filter(symbol => {
      const cached = getCached(symbol, interval);
      return !cached; // Only prefetch if not already cached
    });

    if (symbolsToFetch.length === 0) {
      return; // All already cached
    }

    // Don't block UI, just fire and forget with batching
    const batchSize = 3; // Fetch 3 at a time to avoid overwhelming
    const batches: string[][] = [];

    for (let i = 0; i < symbolsToFetch.length; i += batchSize) {
      batches.push(symbolsToFetch.slice(i, i + batchSize));
    }

    // Process batches sequentially to avoid network congestion
    const processBatches = async () => {
      for (const batch of batches) {
        await Promise.all(
          batch.map(symbol =>
            fetchKlines(symbol, interval, 100).catch(err => {
              console.warn(`[KlineDataProvider] Prefetch failed for ${symbol}:`, err);
            })
          )
        );
      }
      console.log(`[KlineDataProvider] Prefetched ${symbolsToFetch.length} symbols`);
    };

    processBatches();
  }, [fetchKlines, getCached]);

  /**
   * Intelligent prefetch based on symbol correlations
   */
  const prefetchCorrelated = useCallback((
    baseSymbol: string,
    interval: KlineInterval
  ): void => {
    // Record view for pattern analysis
    prefetchStrategy.recordView(baseSymbol);

    // Get correlated symbols
    const correlatedSymbols = getCorrelatedSymbols(baseSymbol, 5);

    // Prefetch with delay to not interfere with main loading
    setTimeout(() => {
      prefetch(correlatedSymbols, interval);
    }, 500);
  }, [prefetch]);

  /**
   * Invalidate cache for a specific symbol
   */
  const invalidateSymbol = useCallback((symbol: string): void => {
    // Clear from React cache
    const keysToDelete: string[] = [];
    reactCache.current.forEach((_, key) => {
      if (key.startsWith(`${symbol}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => reactCache.current.delete(key));

    // Clear from service cache
    serverExecutionService.clearSymbolCache(symbol);

    console.log(`[KlineDataProvider] Invalidated cache for ${symbol}`);
  }, []);

  /**
   * Subscribe to real-time updates for a symbol
   */
  const subscribeToUpdates = useCallback((
    symbol: string,
    interval: KlineInterval,
    callback: (update: KlineUpdate) => void
  ): (() => void) => {
    const subscriptionKey = `${symbol}:${interval}`;

    // Unsubscribe previous if exists
    const existing = activeSubscriptions.current.get(subscriptionKey);
    if (existing) {
      existing();
    }

    // Create new subscription
    const unsubscribe = klineDataService.subscribeToUpdates(
      symbol,
      interval,
      (update: KlineUpdate) => {
        // Update React cache when we get an update
        const cacheKey = getCacheKey(symbol, interval);
        const entry = reactCache.current.get(cacheKey);

        if (entry) {
          // Update the cached data with the new kline
          const klines = [...entry.data.klines];
          const updateKline = update.kline;
          const existingIndex = klines.findIndex(k => k.openTime === updateKline.openTime);

          if (existingIndex >= 0) {
            klines[existingIndex] = updateKline;
          } else if (update.type === 'new') {
            klines.push(updateKline);
            klines.sort((a, b) => a.openTime - b.openTime);
            if (klines.length > 250) {
              klines.splice(0, klines.length - 250);
            }
          }

          // Update cache with new data
          entry.data = { ...entry.data, klines };
          entry.timestamp = Date.now();
        }

        // Notify the callback
        callback(update);
      }
    );

    // Store the unsubscribe function
    activeSubscriptions.current.set(subscriptionKey, unsubscribe);

    // Return cleanup function
    return () => {
      unsubscribe();
      activeSubscriptions.current.delete(subscriptionKey);
    };
  }, [getCacheKey]);

  // Context value
  const value: KlineDataContextValue = {
    fetchKlines,
    getCached,
    prefetch,
    prefetchCorrelated,
    invalidateSymbol,
    subscribeToUpdates,
    cacheStats,
    isLoading,
    error
  };

  return (
    <KlineDataContext.Provider value={value}>
      {children}
    </KlineDataContext.Provider>
  );
};

/**
 * Hook to use KlineData context
 */
export const useKlineDataContext = (): KlineDataContextValue => {
  const context = useContext(KlineDataContext);

  if (!context) {
    throw new Error('useKlineDataContext must be used within KlineDataProvider');
  }

  return context;
};