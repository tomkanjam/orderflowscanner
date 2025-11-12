import { useState, useCallback, useRef } from 'react';
import { serverExecutionService, TraderSignal } from '../services/serverExecutionService';
import { signalManager } from '../services/signalManager';

export interface UseInfiniteSignalsOptions {
  traderIds: string[];
  batchSize?: number;
}

export function useInfiniteSignals({ traderIds, batchSize = 50 }: UseInfiniteSignalsOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore || traderIds.length === 0) {
      return;
    }

    setIsLoading(true);

    try {
      const signals = await serverExecutionService.fetchRecentSignals({
        limit: batchSize,
        offset: offsetRef.current,
        traderIds,
        userSpecific: true
      });

      if (signals.length > 0) {
        // Convert TraderSignal format to SignalManager format
        const dbSignals = signals.map(s => ({
          id: s.id,
          trader_id: s.trader_id,
          symbol: s.symbols[0],
          created_at: s.timestamp,
          price_at_signal: s.metadata?.price_at_signal,
          metadata: s.metadata,
          indicator_data: s.metadata?.indicator_data  // Extract indicator_data from metadata
        }));

        // Load signals into signalManager (append mode)
        signalManager.loadInitialSignals(dbSignals, true);

        // Update offset for next load
        offsetRef.current += signals.length;

        // Check if we have more signals to load
        if (signals.length < batchSize) {
          setHasMore(false);
        }
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('[useInfiniteSignals] Failed to load more signals:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, hasMore, traderIds, batchSize]);

  const reset = useCallback(() => {
    offsetRef.current = 0;
    setHasMore(true);
    setIsLoading(false);
  }, []);

  return {
    loadMore,
    isLoading,
    hasMore,
    reset
  };
}
