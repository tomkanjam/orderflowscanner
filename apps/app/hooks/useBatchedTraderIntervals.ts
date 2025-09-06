import { useEffect, useRef, useCallback } from 'react';
import { Ticker, Kline, KlineInterval } from '../types';
import { Trader } from '../src/abstractions/trader.interfaces';
import { klineIntervalToMs } from '../src/utils/intervalUtils';
import { 
  MultiTraderScreenerMessage, 
  MultiTraderScreenerResponse, 
  TraderResult 
} from '../workers/multiTraderScreenerWorker';

interface UseBatchedTraderIntervalsProps {
  traders: Trader[];
  symbols: string[];
  tickers: Map<string, Ticker>;
  historicalData: Map<string, Map<KlineInterval, Kline[]>>;
  onResults: (results: TraderResult[]) => void;
  enabled?: boolean;
}

interface BatchedInterval {
  interval: KlineInterval;
  timer: NodeJS.Timeout | null;
  traders: Set<string>;
  lastRun: number;
  running: boolean;
}

/**
 * Optimized hook that batches trader executions by interval to reduce serialization overhead
 */
export function useBatchedTraderIntervals({
  traders,
  symbols,
  tickers,
  historicalData,
  onResults,
  enabled = true
}: UseBatchedTraderIntervalsProps) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const batchedIntervalsRef = useRef<Map<KlineInterval, BatchedInterval>>(new Map());
  
  // Store callbacks and dependencies in refs
  const onResultsRef = useRef(onResults);
  const symbolsRef = useRef(symbols);
  const tickersRef = useRef(tickers);
  const historicalDataRef = useRef(historicalData);
  const enabledRef = useRef(enabled);
  
  useEffect(() => {
    onResultsRef.current = onResults;
    symbolsRef.current = symbols;
    tickersRef.current = tickers;
    historicalDataRef.current = historicalData;
    enabledRef.current = enabled;
  }, [onResults, symbols, tickers, historicalData, enabled]);

  // Initialize worker
  useEffect(() => {
    console.log('[BatchedTraderIntervals] Creating optimized worker');
    
    workerRef.current = new Worker(
      new URL('../workers/multiTraderScreenerWorker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.addEventListener('message', (event: MessageEvent<MultiTraderScreenerResponse>) => {
      const { type, data, error } = event.data;

      if (type === 'MULTI_SCREENER_RESULT' && data) {
        // Mark batch as not running
        const firstTraderId = data.results[0]?.traderId;
        if (firstTraderId) {
          const trader = traders.find(t => t.id === firstTraderId);
          if (trader) {
            const interval = trader.filter?.refreshInterval || KlineInterval.ONE_MINUTE;
            const batch = batchedIntervalsRef.current.get(interval);
            if (batch) {
              batch.running = false;
            }
          }
        }
        
        console.log(`[BatchedTraderIntervals] Batch complete: ${data.results.length} traders, ${data.executionTime.toFixed(0)}ms`);
        onResultsRef.current(data.results);
      } else if (type === 'MULTI_SCREENER_ERROR') {
        console.error('[BatchedTraderIntervals] Worker error:', error);
      }
    });

    return () => {
      console.log('[BatchedTraderIntervals] Terminating worker');
      workerRef.current?.terminate();
      
      // Clear all intervals
      batchedIntervalsRef.current.forEach(batch => {
        if (batch.timer) {
          clearInterval(batch.timer);
        }
      });
      batchedIntervalsRef.current.clear();
    };
  }, [traders]);

  // Serialize data once and cache it
  const serializeDataOnce = useCallback(() => {
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

    return { tickersObj, historicalDataObj };
  }, []);

  // Run a batch of traders with the same interval
  const runTraderBatch = useCallback((interval: KlineInterval, traderIds: Set<string>) => {
    if (!workerRef.current || !enabledRef.current || symbolsRef.current.length === 0) {
      return;
    }

    const batch = batchedIntervalsRef.current.get(interval);
    if (batch?.running) {
      console.log(`[BatchedTraderIntervals] Skipping ${interval} batch - already running`);
      return;
    }

    const batchTraders = traders.filter(t => 
      traderIds.has(t.id) && t.enabled && t.filter?.code
    );

    if (batchTraders.length === 0) return;

    console.log(`[BatchedTraderIntervals] Running batch for ${interval}: ${batchTraders.length} traders`);
    
    if (batch) {
      batch.running = true;
      batch.lastRun = Date.now();
    }

    requestIdRef.current += 1;

    // Serialize data once for all traders in this batch
    const startSerialize = performance.now();
    const { tickersObj, historicalDataObj } = serializeDataOnce();
    const serializeTime = performance.now() - startSerialize;
    console.log(`[BatchedTraderIntervals] Data serialization took ${serializeTime.toFixed(0)}ms`);

    const message: MultiTraderScreenerMessage = {
      id: requestIdRef.current.toString(),
      type: 'RUN_MULTI_SCREENER',
      data: {
        symbols: symbolsRef.current,
        tickers: tickersObj,
        historicalData: historicalDataObj,
        traders: batchTraders.map(trader => ({
          traderId: trader.id,
          filterCode: trader.filter?.code || '',
          refreshInterval: trader.filter?.refreshInterval,
          requiredTimeframes: trader.filter?.requiredTimeframes
        }))
      }
    };

    workerRef.current.postMessage(message);
  }, [traders, serializeDataOnce]);

  // Set up batched intervals
  useEffect(() => {
    if (!enabled) {
      // Clear all intervals when disabled
      batchedIntervalsRef.current.forEach(batch => {
        if (batch.timer) {
          clearInterval(batch.timer);
          console.log(`[BatchedTraderIntervals] Cleared interval for ${batch.interval}`);
        }
      });
      batchedIntervalsRef.current.clear();
      return;
    }

    // Group traders by interval
    const tradersByInterval = new Map<KlineInterval, Set<string>>();
    const enabledTraders = traders.filter(t => t.enabled && t.filter?.code);
    
    enabledTraders.forEach(trader => {
      const interval = trader.filter?.refreshInterval || KlineInterval.ONE_MINUTE;
      if (!tradersByInterval.has(interval)) {
        tradersByInterval.set(interval, new Set());
      }
      tradersByInterval.get(interval)!.add(trader.id);
    });

    console.log('[BatchedTraderIntervals] Trader groups:', 
      Array.from(tradersByInterval.entries()).map(([interval, ids]) => 
        `${interval}: ${ids.size} traders`
      ).join(', ')
    );

    // Remove intervals that no longer have traders
    batchedIntervalsRef.current.forEach((batch, interval) => {
      if (!tradersByInterval.has(interval)) {
        if (batch.timer) {
          clearInterval(batch.timer);
          console.log(`[BatchedTraderIntervals] Removed interval for ${interval}`);
        }
        batchedIntervalsRef.current.delete(interval);
      }
    });

    // Set up or update intervals
    tradersByInterval.forEach((traderIds, interval) => {
      const intervalMs = klineIntervalToMs(interval);
      const existingBatch = batchedIntervalsRef.current.get(interval);
      
      // Check if we need to update the batch
      if (existingBatch) {
        // Update trader list
        existingBatch.traders = traderIds;
        
        // If timer doesn't exist, create it
        if (!existingBatch.timer) {
          console.log(`[BatchedTraderIntervals] Creating timer for ${interval} (${intervalMs}ms)`);
          
          // Run immediately
          runTraderBatch(interval, traderIds);
          
          // Then set up interval
          existingBatch.timer = setInterval(() => {
            runTraderBatch(interval, traderIds);
          }, intervalMs);
        }
      } else {
        // Create new batch
        console.log(`[BatchedTraderIntervals] Setting up new batch for ${interval} (${intervalMs}ms)`);
        
        // Run immediately
        runTraderBatch(interval, traderIds);
        
        // Then set up interval
        const timer = setInterval(() => {
          runTraderBatch(interval, traderIds);
        }, intervalMs);

        batchedIntervalsRef.current.set(interval, {
          interval,
          timer,
          traders: traderIds,
          lastRun: Date.now(),
          running: false
        });
      }
    });
  }, [traders, enabled, runTraderBatch]);

  // Get batch status for debugging
  const getBatchStatus = useCallback(() => {
    const status: Record<string, { 
      traders: number; 
      intervalMs: number; 
      lastRun: number; 
      running: boolean 
    }> = {};
    
    batchedIntervalsRef.current.forEach((batch, interval) => {
      const intervalMs = klineIntervalToMs(interval);
      status[interval] = {
        traders: batch.traders.size,
        intervalMs,
        lastRun: batch.lastRun,
        running: batch.running
      };
    });
    
    return status;
  }, []);

  return { getBatchStatus };
}