import { useEffect, useRef, useCallback } from 'react';
import { Ticker, Kline, KlineInterval } from '../types';
import { Trader } from '../src/abstractions/trader.interfaces';
import { klineIntervalToMs } from '../src/utils/intervalUtils';
import { 
  MultiTraderScreenerMessage, 
  MultiTraderScreenerResponse, 
  TraderResult 
} from '../workers/multiTraderScreenerWorker';

interface UseIndividualTraderIntervalsProps {
  traders: Trader[];
  symbols: string[];
  tickers: Map<string, Ticker>;
  historicalData: Map<string, Map<KlineInterval, Kline[]>>;
  onResults: (results: TraderResult[]) => void;
  enabled?: boolean;
}

interface TraderInterval {
  traderId: string;
  timer: NodeJS.Timeout | null;
  lastRun: number;
  running: boolean;
}

export function useIndividualTraderIntervals({
  traders,
  symbols,
  tickers,
  historicalData,
  onResults,
  enabled = true
}: UseIndividualTraderIntervalsProps) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const traderIntervalsRef = useRef<Map<string, TraderInterval>>(new Map());
  
  // Store onResults in a ref to avoid recreating worker
  const onResultsRef = useRef(onResults);
  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  // Store dependencies in refs
  const symbolsRef = useRef(symbols);
  const tickersRef = useRef(tickers);
  const historicalDataRef = useRef(historicalData);
  const enabledRef = useRef(enabled);
  
  useEffect(() => {
    symbolsRef.current = symbols;
    tickersRef.current = tickers;
    historicalDataRef.current = historicalData;
    enabledRef.current = enabled;
  }, [symbols, tickers, historicalData, enabled]);

  // Initialize worker
  useEffect(() => {
    console.log('[IndividualTraderIntervals] Creating new worker');
    
    workerRef.current = new Worker(
      new URL('../workers/multiTraderScreenerWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.addEventListener('message', (event: MessageEvent<MultiTraderScreenerResponse>) => {
      const { type, data, error } = event.data;

      if (type === 'MULTI_SCREENER_RESULT' && data) {
        // Mark trader as not running
        const traderId = data.results[0]?.traderId;
        if (traderId) {
          const interval = traderIntervalsRef.current.get(traderId);
          if (interval) {
            interval.running = false;
          }
        }
        
        onResultsRef.current(data.results);
        console.log(`[IndividualTraderIntervals] Received results for ${data.results.length} traders`);
      } else if (type === 'MULTI_SCREENER_ERROR') {
        console.error('[IndividualTraderIntervals] Worker error:', error);
      }
    });

    return () => {
      console.log('[IndividualTraderIntervals] Terminating worker');
      workerRef.current?.terminate();
      
      // Clear all intervals
      traderIntervalsRef.current.forEach(interval => {
        if (interval.timer) {
          clearInterval(interval.timer);
        }
      });
      traderIntervalsRef.current.clear();
    };
  }, []);

  // Run a single trader's filter
  const runTraderFilter = useCallback((trader: Trader) => {
    if (!workerRef.current || !enabledRef.current || symbolsRef.current.length === 0) {
      return;
    }

    const interval = traderIntervalsRef.current.get(trader.id);
    if (interval?.running) {
      console.log(`[IndividualTraderIntervals] Skipping ${trader.name} - already running`);
      return;
    }

    console.log(`[IndividualTraderIntervals] Running filter for trader: ${trader.name} (${trader.id})`);
    
    if (interval) {
      interval.running = true;
      interval.lastRun = Date.now();
    }

    requestIdRef.current += 1;

    // Convert Maps to objects for serialization
    const tickersObj: Record<string, Ticker> = {};
    tickersRef.current.forEach((value, key) => {
      tickersObj[key] = value;
    });

    const historicalDataObj: Record<string, Record<string, Kline[]>> = {};
    historicalDataRef.current.forEach((intervalMap, symbol) => {
      historicalDataObj[symbol] = {};
      intervalMap.forEach((klines, interval) => {
        historicalDataObj[symbol][interval] = klines;
      });
    });

    const message: MultiTraderScreenerMessage = {
      id: requestIdRef.current.toString(),
      type: 'RUN_MULTI_SCREENER',
      data: {
        symbols: symbolsRef.current,
        tickers: tickersObj,
        historicalData: historicalDataObj,
        traders: [{
          traderId: trader.id,
          filterCode: trader.filter?.code || '',
          refreshInterval: trader.filter?.refreshInterval,
          requiredTimeframes: trader.filter?.requiredTimeframes
        }]
      }
    };

    workerRef.current.postMessage(message);
  }, []);

  // Set up individual intervals for each trader
  useEffect(() => {
    if (!enabled) {
      // Clear all intervals when disabled
      traderIntervalsRef.current.forEach(interval => {
        if (interval.timer) {
          clearInterval(interval.timer);
          console.log(`[IndividualTraderIntervals] Cleared interval for trader ${interval.traderId}`);
        }
      });
      traderIntervalsRef.current.clear();
      return;
    }

    // Get enabled traders
    const enabledTraders = traders.filter(t => t.enabled && t.filter?.code);
    console.log(`[IndividualTraderIntervals] Managing intervals for ${enabledTraders.length} enabled traders`);

    // Remove intervals for traders that are no longer enabled
    const enabledTraderIds = new Set(enabledTraders.map(t => t.id));
    traderIntervalsRef.current.forEach((interval, traderId) => {
      if (!enabledTraderIds.has(traderId)) {
        if (interval.timer) {
          clearInterval(interval.timer);
          console.log(`[IndividualTraderIntervals] Removed interval for disabled trader ${traderId}`);
        }
        traderIntervalsRef.current.delete(traderId);
      }
    });

    // Set up intervals for each enabled trader
    enabledTraders.forEach(trader => {
      const refreshInterval = trader.filter?.refreshInterval || KlineInterval.ONE_MINUTE;
      const intervalMs = klineIntervalToMs(refreshInterval);
      
      const existingInterval = traderIntervalsRef.current.get(trader.id);
      
      // Check if we need to update the interval
      if (existingInterval?.timer) {
        // If interval hasn't changed, keep existing timer
        const existingMs = klineIntervalToMs(trader.filter?.refreshInterval || KlineInterval.ONE_MINUTE);
        if (existingMs === intervalMs) {
          return; // No change needed
        }
        
        // Clear old interval if it changed
        clearInterval(existingInterval.timer);
        console.log(`[IndividualTraderIntervals] Updating interval for ${trader.name} from ${existingMs}ms to ${intervalMs}ms`);
      }

      // Create new interval
      console.log(`[IndividualTraderIntervals] Setting up ${refreshInterval} interval (${intervalMs}ms) for ${trader.name}`);
      
      // Run immediately
      runTraderFilter(trader);
      
      // Then set up interval
      const timer = setInterval(() => {
        runTraderFilter(trader);
      }, intervalMs);

      traderIntervalsRef.current.set(trader.id, {
        traderId: trader.id,
        timer,
        lastRun: Date.now(),
        running: false
      });
    });
  }, [traders, enabled, runTraderFilter]);

  // Clear trader cache when needed
  const clearTraderCache = useCallback((traderId: string) => {
    if (workerRef.current) {
      const message: MultiTraderScreenerMessage = {
        id: 'clear-trader-' + traderId,
        type: 'CLEAR_TRADER_CACHE',
        traderId
      };
      workerRef.current.postMessage(message);
    }
  }, []);

  // Get interval status for debugging
  const getIntervalStatus = useCallback(() => {
    const status: Record<string, { intervalMs: number; lastRun: number; running: boolean }> = {};
    traderIntervalsRef.current.forEach((interval, traderId) => {
      const trader = traders.find(t => t.id === traderId);
      if (trader) {
        const intervalMs = klineIntervalToMs(trader.filter?.refreshInterval || KlineInterval.ONE_MINUTE);
        status[trader.name] = {
          intervalMs,
          lastRun: interval.lastRun,
          running: interval.running
        };
      }
    });
    return status;
  }, [traders]);

  return {
    clearTraderCache,
    getIntervalStatus
  };
}