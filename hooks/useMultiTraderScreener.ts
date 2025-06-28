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

  // Store onResults in a ref to avoid recreating worker
  const onResultsRef = useRef(onResults);
  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  // Initialize worker only once
  useEffect(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [useMultiTraderScreener] Creating new worker`);
    
    workerRef.current = new Worker(
      new URL('../workers/multiTraderScreenerWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.addEventListener('message', (event: MessageEvent<MultiTraderScreenerResponse>) => {
      const { type, data, error } = event.data;

      if (type === 'MULTI_SCREENER_RESULT' && data) {
        setIsRunning(false);
        setLastExecutionTime(data.executionTime);
        // Use the ref to call the latest onResults
        onResultsRef.current(data.results);
      } else if (type === 'MULTI_SCREENER_ERROR') {
        setIsRunning(false);
        console.error('Multi-trader screener error:', error);
      }
    });

    return () => {
      const cleanupTimestamp = new Date().toISOString();
      console.log(`[${cleanupTimestamp}] [useMultiTraderScreener] Terminating worker`);
      workerRef.current?.terminate();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []); // Empty dependency array - only create worker once

  // Store dependencies in refs to avoid recreating runScreener
  const tradersRef = useRef(traders);
  const symbolsRef = useRef(symbols);
  const tickersRef = useRef(tickers);
  const historicalDataRef = useRef(historicalData);
  const enabledRef = useRef(enabled);
  
  // Update refs when props change
  useEffect(() => {
    tradersRef.current = traders;
    symbolsRef.current = symbols;
    tickersRef.current = tickers;
    historicalDataRef.current = historicalData;
    enabledRef.current = enabled;
  }, [traders, symbols, tickers, historicalData, enabled]);

  // Run screener function - stable reference
  const runScreener = useCallback(() => {
    const timestamp = new Date().toISOString();
    
    if (!workerRef.current || !enabledRef.current || tradersRef.current.length === 0 || symbolsRef.current.length === 0) {
      console.log(`[${timestamp}] [useMultiTraderScreener] Skipping run - worker: ${!!workerRef.current}, enabled: ${enabledRef.current}, traders: ${tradersRef.current.length}, symbols: ${symbolsRef.current.length}`);
      return;
    }

    // Filter only enabled traders
    const enabledTraders = tradersRef.current.filter(t => t.enabled);
    if (enabledTraders.length === 0) {
      console.log(`[${timestamp}] [useMultiTraderScreener] Skipping run - no enabled traders`);
      return;
    }

    console.log(`[${timestamp}] [useMultiTraderScreener] Starting screener run with ${enabledTraders.length} traders for ${symbolsRef.current.length} symbols`);
    setIsRunning(true);
    requestIdRef.current += 1;

    // Convert Maps to objects for serialization
    const tickersObj: Record<string, Ticker> = {};
    tickersRef.current.forEach((value, key) => {
      tickersObj[key] = value;
    });

    const historicalDataObj: Record<string, Kline[]> = {};
    historicalDataRef.current.forEach((value, key) => {
      historicalDataObj[key] = value;
    });

    const message: MultiTraderScreenerMessage = {
      id: requestIdRef.current.toString(),
      type: 'RUN_MULTI_SCREENER',
      data: {
        symbols: symbolsRef.current,
        tickers: tickersObj,
        historicalData: historicalDataObj,
        traders: enabledTraders.map(t => ({
          traderId: t.id,
          filterCode: t.filter.code
        }))
      }
    };

    workerRef.current.postMessage(message);
  }, []); // Empty dependency array - stable function

  // Set up interval
  useEffect(() => {
    if (enabled && interval > 0) {
      // Clear any existing interval first
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      
      // Run immediately
      runScreener();

      // Then run on interval
      intervalRef.current = setInterval(runScreener, interval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else {
      // Clear interval if disabled
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
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