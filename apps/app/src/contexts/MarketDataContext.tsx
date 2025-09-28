/**
 * MarketDataContext - Isolated context for market data to prevent cascading re-renders
 * Features:
 * - Separated ticker and kline state management
 * - React.memo wrapped components
 * - Subscription management
 * - Performance optimized updates
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Ticker, Kline, KlineInterval } from '../../types';
import { klineDataService, KlineResponse, KlineUpdate } from '../services/klineDataService';
import { performanceMonitor } from '../utils/performanceMonitor';

interface MarketDataState {
  tickers: Map<string, Ticker>;
  klines: Map<string, Kline[]>;
  loading: Map<string, boolean>;
  errors: Map<string, string>;
}

interface MarketDataContextValue {
  // State
  tickers: Map<string, Ticker>;
  klines: Map<string, Kline[]>;
  loading: Map<string, boolean>;
  errors: Map<string, string>;

  // Actions
  fetchKlines: (symbol: string, interval: KlineInterval) => Promise<void>;
  subscribeToUpdates: (symbol: string, interval: KlineInterval) => () => void;
  updateTicker: (symbol: string, ticker: Ticker) => void;
  updateKlines: (symbol: string, klines: Kline[]) => void;
  clearError: (symbol: string) => void;

  // Utilities
  getKlineKey: (symbol: string, interval: KlineInterval) => string;
}

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

/**
 * Provider component with optimized state management
 */
export const MarketDataProvider: React.FC<{ children: React.ReactNode }> = React.memo(({ children }) => {
  const [state, setState] = useState<MarketDataState>({
    tickers: new Map(),
    klines: new Map(),
    loading: new Map(),
    errors: new Map()
  });

  // Track active subscriptions
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Unsubscribe all
      subscriptionsRef.current.forEach(unsub => unsub());
      subscriptionsRef.current.clear();
    };
  }, []);

  /**
   * Generate consistent key for kline data
   */
  const getKlineKey = useCallback((symbol: string, interval: KlineInterval): string => {
    return `${symbol}:${interval}`;
  }, []);

  /**
   * Fetch klines from server
   */
  const fetchKlines = useCallback(async (symbol: string, interval: KlineInterval) => {
    const key = getKlineKey(symbol, interval);

    // Set loading state
    setState(prev => ({
      ...prev,
      loading: new Map(prev.loading).set(key, true),
      errors: new Map(prev.errors) // Clear any previous error
    }));

    try {
      const response = await klineDataService.fetchKlines({
        symbol,
        timeframe: interval,
        limit: 100
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Update klines
      setState(prev => ({
        ...prev,
        klines: new Map(prev.klines).set(key, response.klines),
        loading: new Map(prev.loading).set(key, false)
      }));

      // Track cache hit/miss
      if (response.cached) {
        performanceMonitor.trackCacheHit();
      } else {
        performanceMonitor.trackCacheMiss();
      }

    } catch (error) {
      console.error(`[MarketDataContext] Failed to fetch klines for ${symbol}:`, error);

      setState(prev => ({
        ...prev,
        loading: new Map(prev.loading).set(key, false),
        errors: new Map(prev.errors).set(key, error instanceof Error ? error.message : 'Fetch failed')
      }));
    }
  }, [getKlineKey]);

  /**
   * Subscribe to real-time updates for a symbol
   */
  const subscribeToUpdates = useCallback((symbol: string, interval: KlineInterval) => {
    const key = getKlineKey(symbol, interval);

    // Unsubscribe existing if any
    const existing = subscriptionsRef.current.get(key);
    if (existing) {
      existing();
    }

    // Create new subscription
    const unsubscribe = klineDataService.subscribeToUpdates(
      symbol,
      interval,
      (update: KlineUpdate) => {
        // Handle real-time update
        setState(prev => {
          const currentKlines = prev.klines.get(key) || [];
          const updatedKlines = [...currentKlines];

          // Find and update or append kline
          const existingIndex = updatedKlines.findIndex(k => k.openTime === update.kline.openTime);

          if (existingIndex >= 0) {
            // Update existing
            if (update.type === 'update' || update.type === 'close') {
              updatedKlines[existingIndex] = update.kline;
            }
          } else if (update.type === 'new') {
            // Add new kline
            updatedKlines.push(update.kline);
            // Keep last 250 klines
            if (updatedKlines.length > 250) {
              updatedKlines.shift();
            }
          }

          return {
            ...prev,
            klines: new Map(prev.klines).set(key, updatedKlines)
          };
        });
      }
    );

    // Store subscription
    subscriptionsRef.current.set(key, unsubscribe);

    // Return unsubscribe function
    return () => {
      const unsub = subscriptionsRef.current.get(key);
      if (unsub) {
        unsub();
        subscriptionsRef.current.delete(key);
      }
    };
  }, [getKlineKey]);

  /**
   * Update ticker data
   */
  const updateTicker = useCallback((symbol: string, ticker: Ticker) => {
    setState(prev => {
      // Only update if changed
      const current = prev.tickers.get(symbol);
      if (current && current.c === ticker.c && current.P === ticker.P) {
        return prev; // No change
      }

      return {
        ...prev,
        tickers: new Map(prev.tickers).set(symbol, ticker)
      };
    });
  }, []);

  /**
   * Update klines directly
   */
  const updateKlines = useCallback((symbol: string, klines: Kline[]) => {
    setState(prev => ({
      ...prev,
      klines: new Map(prev.klines).set(symbol, klines)
    }));
  }, []);

  /**
   * Clear error for a symbol
   */
  const clearError = useCallback((symbol: string) => {
    setState(prev => {
      const newErrors = new Map(prev.errors);
      newErrors.delete(symbol);
      return {
        ...prev,
        errors: newErrors
      };
    });
  }, []);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<MarketDataContextValue>(() => ({
    tickers: state.tickers,
    klines: state.klines,
    loading: state.loading,
    errors: state.errors,
    fetchKlines,
    subscribeToUpdates,
    updateTicker,
    updateKlines,
    clearError,
    getKlineKey
  }), [state, fetchKlines, subscribeToUpdates, updateTicker, updateKlines, clearError, getKlineKey]);

  return (
    <MarketDataContext.Provider value={contextValue}>
      {children}
    </MarketDataContext.Provider>
  );
});

MarketDataProvider.displayName = 'MarketDataProvider';

/**
 * Hook to use market data context
 */
export function useMarketData() {
  const context = useContext(MarketDataContext);
  if (!context) {
    throw new Error('useMarketData must be used within MarketDataProvider');
  }
  return context;
}

/**
 * Hook to get ticker for a specific symbol
 */
export function useTicker(symbol: string): Ticker | undefined {
  const { tickers } = useMarketData();
  return tickers.get(symbol);
}

/**
 * Hook to get klines for a specific symbol and interval
 */
export function useKlines(symbol: string, interval: KlineInterval): {
  klines: Kline[];
  loading: boolean;
  error?: string;
} {
  const { klines, loading, errors, getKlineKey } = useMarketData();
  const key = getKlineKey(symbol, interval);

  return {
    klines: klines.get(key) || [],
    loading: loading.get(key) || false,
    error: errors.get(key)
  };
}

/**
 * Hook to manage subscriptions with automatic cleanup
 */
export function useMarketDataSubscription(
  symbols: string[],
  interval: KlineInterval,
  enabled: boolean = true
) {
  const { fetchKlines, subscribeToUpdates } = useMarketData();

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;

    const subscriptions: Array<() => void> = [];

    // Fetch initial data and subscribe
    symbols.forEach(symbol => {
      // Fetch initial
      fetchKlines(symbol, interval);

      // Subscribe to updates
      const unsubscribe = subscribeToUpdates(symbol, interval);
      subscriptions.push(unsubscribe);
    });

    // Cleanup
    return () => {
      subscriptions.forEach(unsub => unsub());
    };
  }, [symbols, interval, enabled, fetchKlines, subscribeToUpdates]);
}