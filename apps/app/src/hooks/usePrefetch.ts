/**
 * usePrefetch - Hook for prefetching related symbols in the background
 */

import { useCallback, useRef } from 'react';
import { useKlineDataContext } from '../contexts/KlineDataProvider';
import { KlineInterval } from '../../types';

interface PrefetchOptions {
  maxSymbols?: number;
  delay?: number;
}

/**
 * Hook for prefetching kline data for related symbols
 * Useful for improving perceived performance when user might navigate to related symbols
 */
export const usePrefetch = () => {
  const { prefetch } = useKlineDataContext();
  const prefetchQueueRef = useRef<Set<string>>(new Set());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Prefetch a single symbol
   */
  const prefetchSymbol = useCallback((
    symbol: string,
    interval: KlineInterval
  ) => {
    if (!symbol) return;

    // Add to queue
    prefetchQueueRef.current.add(`${symbol}:${interval}`);

    // Debounce the actual prefetch
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      const symbols = Array.from(prefetchQueueRef.current).map(key => key.split(':')[0]);
      const uniqueSymbols = [...new Set(symbols)];

      if (uniqueSymbols.length > 0) {
        console.log(`[usePrefetch] Prefetching ${uniqueSymbols.length} symbols`);
        prefetch(uniqueSymbols, interval);
      }

      prefetchQueueRef.current.clear();
    }, 500); // Wait 500ms to batch requests
  }, [prefetch]);

  /**
   * Prefetch multiple related symbols
   * For example, when viewing BTCUSDT, prefetch ETHUSDT, BNBUSDT, etc.
   */
  const prefetchRelated = useCallback((
    baseSymbol: string,
    relatedSymbols: string[],
    interval: KlineInterval,
    options?: PrefetchOptions
  ) => {
    const { maxSymbols = 5, delay = 1000 } = options || {};

    // Filter and limit symbols
    const symbolsToFetch = relatedSymbols
      .filter(symbol => symbol !== baseSymbol && symbol.endsWith('USDT'))
      .slice(0, maxSymbols);

    if (symbolsToFetch.length === 0) {
      return;
    }

    // Prefetch with delay to not interfere with main data fetching
    setTimeout(() => {
      console.log(`[usePrefetch] Prefetching ${symbolsToFetch.length} related symbols for ${baseSymbol}`);
      prefetch(symbolsToFetch, interval);
    }, delay);
  }, [prefetch]);

  /**
   * Prefetch symbols based on user's viewing patterns
   * This can be called when user hovers over a symbol or shows interest
   */
  const prefetchOnHover = useCallback((
    symbol: string,
    interval: KlineInterval
  ) => {
    // Simple strategy: prefetch the hovered symbol
    prefetchSymbol(symbol, interval);

    // Advanced strategy: also prefetch commonly paired symbols
    const commonPairs = getCommonPairs(symbol);
    if (commonPairs.length > 0) {
      setTimeout(() => {
        prefetch(commonPairs.slice(0, 3), interval);
      }, 1500);
    }
  }, [prefetchSymbol, prefetch]);

  /**
   * Clear prefetch queue
   */
  const clearQueue = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    prefetchQueueRef.current.clear();
  }, []);

  return {
    prefetchSymbol,
    prefetchRelated,
    prefetchOnHover,
    clearQueue
  };
};

/**
 * Get commonly paired symbols for a given symbol
 */
function getCommonPairs(symbol: string): string[] {
  const pairs: { [key: string]: string[] } = {
    'BTCUSDT': ['ETHUSDT', 'BNBUSDT', 'SOLUSDT'],
    'ETHUSDT': ['BTCUSDT', 'BNBUSDT', 'MATICUSDT'],
    'BNBUSDT': ['BTCUSDT', 'ETHUSDT', 'ADAUSDT'],
    'SOLUSDT': ['BTCUSDT', 'ETHUSDT', 'AVAXUSDT'],
    'XRPUSDT': ['BTCUSDT', 'ADAUSDT', 'DOGEUSDT'],
    // Add more pairs as needed
  };

  return pairs[symbol] || [];
}