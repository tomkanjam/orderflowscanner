/**
 * Hook for efficiently reading kline data from SharedArrayBuffer
 * Replaces the memory-leaking historicalData state approach
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { sharedMarketData } from '../shared/SharedMarketData';
import { Kline, KlineInterval } from '../../types';

interface UseSharedKlineDataResult {
  klines: Kline[];
  loading: boolean;
  lastUpdate: number;
}

/**
 * Hook to read kline data directly from SharedArrayBuffer
 * @param symbol - Trading symbol (e.g., 'BTCUSDT')
 * @param interval - Kline interval (e.g., '1m', '5m')
 * @param limit - Maximum number of klines to return (default: 100)
 */
export function useSharedKlineData(
  symbol: string | null,
  interval: KlineInterval,
  limit: number = 100
): UseSharedKlineDataResult {
  const [klines, setKlines] = useState<Kline[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(0);
  const updateTimerRef = useRef<NodeJS.Timeout>();

  const readKlines = useCallback(() => {
    if (!symbol || !sharedMarketData) {
      setKlines([]);
      setLoading(false);
      return;
    }

    try {
      // Read klines directly from SharedArrayBuffer
      const symbolIndex = sharedMarketData.getSymbolIndex(symbol);
      if (symbolIndex === -1) {
        setKlines([]);
        setLoading(false);
        return;
      }

      const intervalIndex = sharedMarketData.getIntervalIndex(interval);
      if (intervalIndex === -1) {
        setKlines([]);
        setLoading(false);
        return;
      }

      const readKlines: Kline[] = [];
      const maxKlines = Math.min(limit, sharedMarketData.getMaxKlinesPerSymbol());
      
      // Read from SharedArrayBuffer
      for (let i = 0; i < maxKlines; i++) {
        const kline = sharedMarketData.readKline(symbolIndex, intervalIndex, i);
        if (kline && kline.time > 0) {
          readKlines.push(kline);
        }
      }

      // Sort by time (most recent last)
      readKlines.sort((a, b) => a.time - b.time);
      
      // Take only the requested limit from the end (most recent)
      const limitedKlines = readKlines.slice(-limit);
      
      setKlines(limitedKlines);
      setLastUpdate(Date.now());
      setLoading(false);
    } catch (error) {
      console.error('[useSharedKlineData] Error reading klines:', error);
      setKlines([]);
      setLoading(false);
    }
  }, [symbol, interval, limit]);

  // Initial read and periodic updates
  useEffect(() => {
    readKlines();

    // Poll for updates every 500ms
    // This is more efficient than subscribing to every single update
    const pollInterval = setInterval(() => {
      readKlines();
    }, 500);

    return () => {
      clearInterval(pollInterval);
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
      }
    };
  }, [readKlines]);

  return {
    klines,
    loading,
    lastUpdate
  };
}

/**
 * Hook to get the latest kline for a symbol/interval
 */
export function useLatestKline(
  symbol: string | null,
  interval: KlineInterval
): Kline | null {
  const { klines } = useSharedKlineData(symbol, interval, 1);
  return klines.length > 0 ? klines[klines.length - 1] : null;
}

/**
 * Hook to get all intervals for a symbol
 */
export function useAllSymbolKlines(symbol: string | null): Map<KlineInterval, Kline[]> {
  const intervals: KlineInterval[] = [
    KlineInterval.ONE_MINUTE,
    KlineInterval.FIVE_MINUTES,
    KlineInterval.FIFTEEN_MINUTES,
    KlineInterval.ONE_HOUR,
    KlineInterval.FOUR_HOURS,
    KlineInterval.ONE_DAY
  ];

  const [allKlines, setAllKlines] = useState<Map<KlineInterval, Kline[]>>(new Map());

  useEffect(() => {
    if (!symbol || !sharedMarketData) {
      setAllKlines(new Map());
      return;
    }

    const updateAllKlines = () => {
      const result = new Map<KlineInterval, Kline[]>();
      const symbolIndex = sharedMarketData.getSymbolIndex(symbol);
      
      if (symbolIndex === -1) {
        setAllKlines(new Map());
        return;
      }

      intervals.forEach(interval => {
        const intervalIndex = sharedMarketData.getIntervalIndex(interval);
        if (intervalIndex !== -1) {
          const klines: Kline[] = [];
          const maxKlines = sharedMarketData.getMaxKlinesPerSymbol();
          
          for (let i = 0; i < maxKlines; i++) {
            const kline = sharedMarketData.readKline(symbolIndex, intervalIndex, i);
            if (kline && kline.time > 0) {
              klines.push(kline);
            }
          }
          
          if (klines.length > 0) {
            klines.sort((a, b) => a.time - b.time);
            result.set(interval, klines);
          }
        }
      });

      setAllKlines(result);
    };

    updateAllKlines();

    // Update every 500ms
    const interval = setInterval(updateAllKlines, 500);
    return () => clearInterval(interval);
  }, [symbol]);

  return allKlines;
}