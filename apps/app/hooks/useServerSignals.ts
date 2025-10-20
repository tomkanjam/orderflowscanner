/**
 * Server-side signal subscription hook
 * Replaces the old worker-based useSharedTraderIntervals
 */
import { useEffect, useRef, useCallback } from 'react';
import { serverExecutionService, TraderSignal } from '../src/services/serverExecutionService';
import { Trader } from '../src/abstractions/trader.interfaces';

interface UseServerSignalsProps {
  traders: Trader[];
  onResults: (signals: TraderSignal[]) => void;
  enabled?: boolean;
}

export function useServerSignals({
  traders,
  onResults,
  enabled = true
}: UseServerSignalsProps) {
  const cleanupFnsRef = useRef<(() => void)[]>([]);
  const onResultsRef = useRef(onResults);

  // Keep callback reference updated
  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  // Handle trader subscriptions
  useEffect(() => {
    if (!enabled) {
      // Hook disabled
      return;
    }

    // Setting up subscriptions for traders

    // Clean up previous subscriptions
    cleanupFnsRef.current.forEach(fn => fn());
    cleanupFnsRef.current = [];

    // Subscribe to each trader's signals
    const cleanups = traders
      .filter(trader => trader.enabled)
      .map(trader => {
        // Subscribing to trader

        return serverExecutionService.onTraderSignal(
          trader.id,
          (signal) => {
            // Received signal for trader
            // Wrap signal in array to match old interface
            onResultsRef.current([signal]);
          }
        );
      });

    cleanupFnsRef.current = cleanups;

    // Cleanup function
    return () => {
      // Cleaning up subscriptions
      cleanupFnsRef.current.forEach(fn => fn());
      cleanupFnsRef.current = [];
    };
  }, [traders, enabled]);

  // Return clearTraderCache function for compatibility
  const clearTraderCache = useCallback((traderId?: string) => {
    // Clear cache requested
    // In server-side execution, cache is managed server-side
    // This is a no-op for compatibility
  }, []);

  return {
    clearTraderCache
  };
}