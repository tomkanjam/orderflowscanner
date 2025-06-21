import { useEffect, useRef, useCallback } from 'react';
import { Ticker, Kline } from '../types';

interface ScreenerResult {
  filteredSymbols: string[];
  signalSymbols: string[];
}

export function useScreenerWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingScreenerRef = useRef<{
    resolve: (result: ScreenerResult) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const messageIdCounter = useRef(0);

  useEffect(() => {
    // Create worker
    workerRef.current = new Worker(
      new URL('../workers/screenerWorker.ts', import.meta.url),
      { type: 'module' }
    );

    // Handle messages from worker
    workerRef.current.onmessage = (event) => {
      const { type, data, error } = event.data;
      
      if (pendingScreenerRef.current) {
        if (type === 'SCREENER_RESULT') {
          pendingScreenerRef.current.resolve(data);
        } else if (type === 'SCREENER_ERROR') {
          pendingScreenerRef.current.reject(new Error(error));
        }
        pendingScreenerRef.current = null;
      }
    };

    workerRef.current.onerror = (error) => {
      console.error('Screener worker error:', error);
      if (pendingScreenerRef.current) {
        pendingScreenerRef.current.reject(new Error('Worker error'));
        pendingScreenerRef.current = null;
      }
    };

    // Cleanup
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const runScreener = useCallback(
    (
      symbols: string[],
      tickers: Map<string, Ticker>,
      historicalData: Map<string, Kline[]>,
      filterCode: string
    ): Promise<ScreenerResult> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }

        // Convert Maps to objects for serialization
        const tickersObj: Record<string, Ticker> = {};
        const historicalDataObj: Record<string, Kline[]> = {};
        
        symbols.forEach(symbol => {
          const ticker = tickers.get(symbol);
          const klines = historicalData.get(symbol);
          if (ticker) tickersObj[symbol] = ticker;
          if (klines) historicalDataObj[symbol] = klines;
        });

        const id = `screen-${++messageIdCounter.current}`;
        
        // Store pending screener
        pendingScreenerRef.current = { resolve, reject };

        // Send message to worker
        workerRef.current.postMessage({
          id,
          type: 'RUN_SCREENER',
          data: {
            symbols,
            tickers: tickersObj,
            historicalData: historicalDataObj,
            filterCode
          }
        });
      });
    },
    []
  );

  const resetCache = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'RESET_CACHE' });
    }
  }, []);

  return {
    runScreener,
    resetCache
  };
}