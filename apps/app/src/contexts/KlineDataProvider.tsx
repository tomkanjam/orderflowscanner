/**
 * KlineDataProvider - React context for managing kline data access
 * Provides centralized data fetching, caching, and state management
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { serverExecutionService } from '../services/serverExecutionService';
import { KlineResponse } from '../services/klineDataService';
import { Kline, KlineInterval } from '../../types';

// Context value interface
export interface KlineDataContextValue {
  fetchKlines: (symbol: string, interval: KlineInterval, limit?: number) => Promise<KlineResponse>;
  getCached: (symbol: string, interval: KlineInterval) => KlineResponse | null;
  prefetch: (symbols: string[], interval: KlineInterval) => void;
  invalidateSymbol: (symbol: string) => void;
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

  // Update cache stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = serverExecutionService.getCacheStats();
      setCacheStats(stats);
    }, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
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
   * Prefetch multiple symbols in background
   */
  const prefetch = useCallback((
    symbols: string[],
    interval: KlineInterval
  ): void => {
    // Don't block UI, just fire and forget
    Promise.all(
      symbols.map(symbol =>
        fetchKlines(symbol, interval, 100).catch(err => {
          console.warn(`[KlineDataProvider] Prefetch failed for ${symbol}:`, err);
        })
      )
    ).then(() => {
      console.log(`[KlineDataProvider] Prefetched ${symbols.length} symbols`);
    });
  }, [fetchKlines]);

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

  // Context value
  const value: KlineDataContextValue = {
    fetchKlines,
    getCached,
    prefetch,
    invalidateSymbol,
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