/**
 * useKlineManager - Bridge hook between legacy code and new KlineDataProvider
 * This manages fetching and caching kline data for multiple symbols
 */

import { useCallback, useRef, useEffect } from 'react';
import { useKlineDataContext } from '../contexts/KlineDataProvider';
import { Kline, KlineInterval } from '../../types';

interface KlineStore {
  [key: string]: {
    klines: Kline[];
    timestamp: number;
  };
}

export const useKlineManager = () => {
  const { fetchKlines, getCached } = useKlineDataContext();
  const storeRef = useRef<KlineStore>({});
  const fetchingRef = useRef<Set<string>>(new Set());

  /**
   * Get klines for a specific symbol and interval
   * This is the main bridge function to replace the old getKlinesForInterval
   */
  const getKlinesForInterval = useCallback((
    symbol: string,
    interval: KlineInterval
  ): Kline[] => {
    if (!symbol || !interval) {
      return [];
    }

    const cacheKey = `${symbol}:${interval}`;

    // Check local memory store first (immediate return)
    const stored = storeRef.current[cacheKey];
    if (stored && Date.now() - stored.timestamp < 30000) { // 30 second local cache
      return stored.klines;
    }

    // Check provider cache
    const cached = getCached(symbol, interval);
    if (cached && cached.klines.length > 0) {
      // Update local store
      storeRef.current[cacheKey] = {
        klines: cached.klines,
        timestamp: Date.now()
      };
      return cached.klines;
    }

    // If not fetching already, initiate fetch in background
    if (!fetchingRef.current.has(cacheKey)) {
      fetchingRef.current.add(cacheKey);

      // Fetch in background (non-blocking)
      fetchKlines(symbol, interval, 100)
        .then(response => {
          if (response.klines.length > 0) {
            storeRef.current[cacheKey] = {
              klines: response.klines,
              timestamp: Date.now()
            };
          }
        })
        .catch(err => {
          console.error(`[useKlineManager] Failed to fetch ${symbol}:${interval}:`, err);
        })
        .finally(() => {
          fetchingRef.current.delete(cacheKey);
        });
    }

    // Return empty array while fetching (non-blocking behavior)
    return stored?.klines || [];
  }, [fetchKlines, getCached]);

  /**
   * Prefetch klines for a list of symbols
   * Useful when we know user will need these soon
   */
  const prefetchSymbols = useCallback(async (
    symbols: string[],
    interval: KlineInterval
  ): Promise<void> => {
    const promises = symbols.map(symbol => {
      const cacheKey = `${symbol}:${interval}`;

      // Skip if already have recent data
      const stored = storeRef.current[cacheKey];
      if (stored && Date.now() - stored.timestamp < 60000) {
        return Promise.resolve();
      }

      return fetchKlines(symbol, interval, 100)
        .then(response => {
          if (response.klines.length > 0) {
            storeRef.current[cacheKey] = {
              klines: response.klines,
              timestamp: Date.now()
            };
          }
        })
        .catch(err => {
          console.warn(`[useKlineManager] Prefetch failed for ${symbol}:`, err);
        });
    });

    await Promise.allSettled(promises);
  }, [fetchKlines]);

  /**
   * Clear old entries from memory to prevent memory leak
   */
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const maxAge = 5 * 60 * 1000; // 5 minutes

      Object.keys(storeRef.current).forEach(key => {
        if (now - storeRef.current[key].timestamp > maxAge) {
          delete storeRef.current[key];
        }
      });
    }, 60000); // Clean up every minute

    return () => clearInterval(interval);
  }, []);

  /**
   * Force refresh data for a symbol
   */
  const refreshSymbol = useCallback(async (
    symbol: string,
    interval: KlineInterval
  ): Promise<Kline[]> => {
    const response = await fetchKlines(symbol, interval, 100);

    if (response.klines.length > 0) {
      const cacheKey = `${symbol}:${interval}`;
      storeRef.current[cacheKey] = {
        klines: response.klines,
        timestamp: Date.now()
      };
    }

    return response.klines;
  }, [fetchKlines]);

  return {
    getKlinesForInterval,
    prefetchSymbols,
    refreshSymbol
  };
};