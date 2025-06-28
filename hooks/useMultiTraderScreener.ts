import { useEffect, useRef, useCallback, useState } from 'react';
import { Ticker, Kline } from '../types';
import { Trader } from '../src/abstractions/trader.interfaces';
import { 
  MultiTraderScreenerMessage, 
  MultiTraderScreenerResponse, 
  TraderResult 
} from '../workers/multiTraderScreenerWorker';

interface UseMultiTraderScreenerProps {
  traders: Trader[];
  symbols: string[];
  tickers: Map<string, Ticker>;
  historicalData: Map<string, Kline[]>;
  onResults: (results: TraderResult[]) => void;
  interval?: number; // How often to run the screener (in ms)
  enabled?: boolean;
}

export function useMultiTraderScreener({
  traders,
  symbols,
  tickers,
  historicalData,
  onResults,
  interval = 5000, // Default 5 seconds
  enabled = true
}: UseMultiTraderScreenerProps) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [lastExecutionTime, setLastExecutionTime] = useState<number | null>(null);

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/multiTraderScreenerWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.addEventListener('message', (event: MessageEvent<MultiTraderScreenerResponse>) => {
      const { type, data, error } = event.data;

      if (type === 'MULTI_SCREENER_RESULT' && data) {
        setIsRunning(false);
        setLastExecutionTime(data.executionTime);
        onResults(data.results);
      } else if (type === 'MULTI_SCREENER_ERROR') {
        setIsRunning(false);
        console.error('Multi-trader screener error:', error);
      }
    });

    return () => {
      workerRef.current?.terminate();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [onResults]);

  // Run screener function
  const runScreener = useCallback(() => {
    const timestamp = new Date().toISOString();
    
    if (!workerRef.current || !enabled || traders.length === 0 || symbols.length === 0) {
      console.log(`[${timestamp}] [useMultiTraderScreener] Skipping run - worker: ${!!workerRef.current}, enabled: ${enabled}, traders: ${traders.length}, symbols: ${symbols.length}`);
      return;
    }

    // Filter only enabled traders
    const enabledTraders = traders.filter(t => t.enabled);
    if (enabledTraders.length === 0) {
      console.log(`[${timestamp}] [useMultiTraderScreener] Skipping run - no enabled traders`);
      return;
    }

    console.log(`[${timestamp}] [useMultiTraderScreener] Starting screener run with ${enabledTraders.length} traders for ${symbols.length} symbols`);
    setIsRunning(true);
    requestIdRef.current += 1;

    // Convert Maps to objects for serialization
    const tickersObj: Record<string, Ticker> = {};
    tickers.forEach((value, key) => {
      tickersObj[key] = value;
    });

    const historicalDataObj: Record<string, Kline[]> = {};
    historicalData.forEach((value, key) => {
      historicalDataObj[key] = value;
    });

    const message: MultiTraderScreenerMessage = {
      id: requestIdRef.current.toString(),
      type: 'RUN_MULTI_SCREENER',
      data: {
        symbols,
        tickers: tickersObj,
        historicalData: historicalDataObj,
        traders: enabledTraders.map(t => ({
          traderId: t.id,
          filterCode: t.filter.code
        }))
      }
    };

    workerRef.current.postMessage(message);
  }, [traders, symbols, tickers, historicalData, enabled]);

  // Set up interval
  useEffect(() => {
    if (enabled && interval > 0) {
      // Run immediately
      runScreener();

      // Then run on interval
      intervalRef.current = setInterval(runScreener, interval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [runScreener, interval, enabled]);

  // Reset cache when traders change
  const resetCache = useCallback(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [useMultiTraderScreener] Resetting cache`);
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'RESET_CACHE' });
    }
  }, []);

  return {
    isRunning,
    lastExecutionTime,
    runScreener,
    resetCache
  };
}