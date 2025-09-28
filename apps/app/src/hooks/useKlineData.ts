/**
 * useKlineData - Hook for fetching and managing kline data
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useKlineDataContext } from '../contexts/KlineDataProvider';
import { Kline, KlineInterval } from '../../types';

export interface UseKlineDataOptions {
  symbol: string;
  interval: KlineInterval;
  limit?: number;
  enabled?: boolean;
  refetchInterval?: number;
  onSuccess?: (klines: Kline[]) => void;
  onError?: (error: Error) => void;
}

export interface UseKlineDataResult {
  klines: Kline[];
  ticker: any | null;
  isLoading: boolean;
  error: string | null;
  isCached: boolean;
  latency: number;
  refetch: () => Promise<void>;
  invalidate: () => void;
}

/**
 * Hook for fetching kline data with automatic caching
 */
export const useKlineData = (options: UseKlineDataOptions): UseKlineDataResult => {
  const {
    symbol,
    interval,
    limit = 100,
    enabled = true,
    refetchInterval,
    onSuccess,
    onError
  } = options;

  const { fetchKlines, getCached, invalidateSymbol } = useKlineDataContext();

  const [klines, setKlines] = useState<Kline[]>([]);
  const [ticker, setTicker] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [latency, setLatency] = useState(0);

  const fetchIdRef = useRef(0);

  /**
   * Fetch kline data
   */
  const fetchData = useCallback(async () => {
    if (!symbol || !interval || !enabled) {
      return;
    }

    const fetchId = ++fetchIdRef.current;

    try {
      setIsLoading(true);
      setError(null);

      // Check cache first
      const cached = getCached(symbol, interval);
      if (cached && cached.klines.length > 0) {
        setKlines(cached.klines);
        setTicker(cached.ticker);
        setIsCached(true);
        setLatency(0);
        setIsLoading(false);

        if (onSuccess) {
          onSuccess(cached.klines);
        }
        return;
      }

      // Fetch from server
      const startTime = Date.now();
      const response = await fetchKlines(symbol, interval, limit);

      // Check if this is still the latest fetch
      if (fetchId !== fetchIdRef.current) {
        return;
      }

      if (response.error) {
        throw new Error(response.error);
      }

      setKlines(response.klines);
      setTicker(response.ticker);
      setIsCached(response.cached);
      setLatency(response.latency);

      if (onSuccess && response.klines.length > 0) {
        onSuccess(response.klines);
      }

    } catch (err) {
      // Check if this is still the latest fetch
      if (fetchId !== fetchIdRef.current) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch klines';
      setError(errorMessage);

      if (onError) {
        onError(err instanceof Error ? err : new Error(errorMessage));
      }
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [symbol, interval, limit, enabled, fetchKlines, getCached, onSuccess, onError]);

  /**
   * Initial fetch and refetch on dependencies change
   */
  useEffect(() => {
    fetchData();
  }, [symbol, interval, limit, enabled]);

  /**
   * Set up refetch interval if specified
   */
  useEffect(() => {
    if (!refetchInterval || refetchInterval <= 0 || !enabled) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchData();
    }, refetchInterval);

    return () => clearInterval(intervalId);
  }, [refetchInterval, enabled, fetchData]);

  /**
   * Manual refetch function
   */
  const refetch = useCallback(async () => {
    // Invalidate cache first
    invalidateSymbol(symbol);
    // Then fetch fresh data
    await fetchData();
  }, [symbol, invalidateSymbol, fetchData]);

  /**
   * Invalidate cache for this symbol
   */
  const invalidate = useCallback(() => {
    invalidateSymbol(symbol);
  }, [symbol, invalidateSymbol]);

  return {
    klines,
    ticker,
    isLoading,
    error,
    isCached,
    latency,
    refetch,
    invalidate
  };
};