/**
 * Batched Trader Intervals Hook
 * 
 * Optimized version of useIndividualTraderIntervals that groups traders by refresh interval
 * and executes them in batches to reduce data serialization overhead.
 * 
 * Performance improvements:
 * - Single data serialization per interval group (80% reduction for 5 traders)
 * - Reduced main thread blocking
 * - Better resource utilization
 */

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

interface BatchedExecution {
  interval: KlineInterval;
  traders: Trader[];
  timer: NodeJS.Timeout | null;
  lastRun: number;
  running: boolean;
}

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
  const batchesRef = useRef<Map<KlineInterval, BatchedExecution>>(new Map());
  
  // Store callbacks in refs to avoid recreating worker
  const onResultsRef = useRef(onResults);
  useEffect(() => {
    onResultsRef.current = onResults;
  }, [onResults]);

  // Store dependencies in refs for stable callbacks
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
    console.log('[BatchedTraderIntervals] Creating new worker');
    
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
          // Find which batch this belongs to
          batchesRef.current.forEach(batch => {
            if (batch.traders.some(t => t.id === firstTraderId)) {
              batch.running = false;
            }
          });
        }
        
        // Log performance metrics
        console.log(`[BatchedTraderIntervals] Batch complete:`, {
          traders: data.results.length,
          executionTime: data.executionTime.toFixed(2) + 'ms',
          totalSymbols: data.totalSymbols
        });
        
        onResultsRef.current(data.results);
      } else if (type === 'MULTI_SCREENER_ERROR') {
        console.error('[BatchedTraderIntervals] Worker error:', error);
        // Mark all batches as not running on error
        batchesRef.current.forEach(batch => {
          batch.running = false;
        });
      }
    });

    return () => {
      console.log('[BatchedTraderIntervals] Terminating worker');
      workerRef.current?.terminate();
      
      // Clear all intervals
      batchesRef.current.forEach(batch => {
        if (batch.timer) {
          clearInterval(batch.timer);
        }
      });
      batchesRef.current.clear();
    };
  }, []);

  // Execute a batch of traders with the same interval
  const executeBatch = useCallback((batch: BatchedExecution) => {
    if (!workerRef.current || !enabledRef.current || symbolsRef.current.length === 0) {
      return;
    }

    if (batch.running) {
      console.log(`[BatchedTraderIntervals] Skipping batch for ${batch.interval} - already running`);
      return;
    }

    const enabledTraders = batch.traders.filter(t => t.enabled && t.filter?.code);
    if (enabledTraders.length === 0) {
      return;
    }

    console.log(`[BatchedTraderIntervals] Executing batch:`, {
      interval: batch.interval,
      traders: enabledTraders.length,
      traderNames: enabledTraders.map(t => t.name)
    });
    
    batch.running = true;
    batch.lastRun = Date.now();

    requestIdRef.current += 1;

    // Performance optimization: Measure serialization time
    const serializeStart = performance.now();

    // Convert Maps to objects for serialization (this is the expensive part)
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

    const serializeTime = performance.now() - serializeStart;
    
    // Log serialization performance
    if (serializeTime > 50) {
      console.warn(`[BatchedTraderIntervals] Serialization took ${serializeTime.toFixed(2)}ms`);
    }

    const message: MultiTraderScreenerMessage = {
      id: requestIdRef.current.toString(),
      type: 'RUN_MULTI_SCREENER',
      data: {
        symbols: symbolsRef.current,
        tickers: tickersObj,
        historicalData: historicalDataObj,
        traders: enabledTraders.map(trader => ({
          traderId: trader.id,
          filterCode: trader.filter?.code || '',
          refreshInterval: trader.filter?.refreshInterval,
          requiredTimeframes: trader.filter?.requiredTimeframes
        }))
      }
    };

    workerRef.current.postMessage(message);
  }, []);

  // Set up batched intervals for traders
  useEffect(() => {
    if (!enabled) {
      // Clear all intervals when disabled
      batchesRef.current.forEach(batch => {
        if (batch.timer) {
          clearInterval(batch.timer);
          console.log(`[BatchedTraderIntervals] Cleared interval for ${batch.interval}`);
        }
      });
      batchesRef.current.clear();
      return;
    }

    // Get enabled traders
    const enabledTraders = traders.filter(t => t.enabled && t.filter?.code);
    console.log(`[BatchedTraderIntervals] Managing ${enabledTraders.length} enabled traders`);

    // Group traders by refresh interval
    const grouped = new Map<KlineInterval, Trader[]>();
    enabledTraders.forEach(trader => {
      const interval = trader.filter?.refreshInterval || KlineInterval.ONE_MINUTE;
      if (!grouped.has(interval)) {
        grouped.set(interval, []);
      }
      grouped.get(interval)!.push(trader);
    });

    console.log(`[BatchedTraderIntervals] Grouped into ${grouped.size} interval batches:`, 
      Array.from(grouped.entries()).map(([interval, traders]) => ({
        interval,
        count: traders.length,
        traders: traders.map(t => t.name)
      }))
    );

    // Remove batches for intervals that no longer have traders
    const activeIntervals = new Set(grouped.keys());
    batchesRef.current.forEach((batch, interval) => {
      if (!activeIntervals.has(interval)) {
        if (batch.timer) {
          clearInterval(batch.timer);
          console.log(`[BatchedTraderIntervals] Removed batch for interval ${interval}`);
        }
        batchesRef.current.delete(interval);
      }
    });

    // Set up or update batches for each interval group
    grouped.forEach((groupTraders, interval) => {
      const existingBatch = batchesRef.current.get(interval);
      const intervalMs = klineIntervalToMs(interval);
      
      if (existingBatch) {
        // Update traders list for existing batch
        existingBatch.traders = groupTraders;
        console.log(`[BatchedTraderIntervals] Updated batch for ${interval} with ${groupTraders.length} traders`);
      } else {
        // Create new batch
        console.log(`[BatchedTraderIntervals] Creating batch for ${interval} (${intervalMs}ms) with ${groupTraders.length} traders`);
        
        const batch: BatchedExecution = {
          interval,
          traders: groupTraders,
          timer: null,
          lastRun: 0,
          running: false
        };
        
        // Run immediately
        executeBatch(batch);
        
        // Then set up interval
        batch.timer = setInterval(() => {
          // Re-check traders in case they changed
          const currentBatch = batchesRef.current.get(interval);
          if (currentBatch) {
            executeBatch(currentBatch);
          }
        }, intervalMs);
        
        batchesRef.current.set(interval, batch);
      }
    });
  }, [traders, enabled, executeBatch]);

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

  // Get batch status for debugging
  const getBatchStatus = useCallback(() => {
    const status: Record<string, { 
      interval: KlineInterval; 
      traderCount: number; 
      lastRun: number; 
      running: boolean;
      traders: string[];
    }> = {};
    
    batchesRef.current.forEach((batch, interval) => {
      status[interval] = {
        interval,
        traderCount: batch.traders.length,
        lastRun: batch.lastRun,
        running: batch.running,
        traders: batch.traders.map(t => t.name)
      };
    });
    
    return status;
  }, []);

  // Performance metrics
  const getPerformanceMetrics = useCallback(() => {
    const totalTraders = traders.filter(t => t.enabled).length;
    const batchCount = batchesRef.current.size;
    const serializationsPerMinute = batchCount; // One per batch per interval
    const oldSerializationsPerMinute = totalTraders; // Old approach
    const improvement = oldSerializationsPerMinute > 0 
      ? ((oldSerializationsPerMinute - serializationsPerMinute) / oldSerializationsPerMinute * 100).toFixed(1)
      : 0;
    
    return {
      totalTraders,
      batchCount,
      serializationsPerMinute,
      oldSerializationsPerMinute,
      improvementPercent: improvement + '%'
    };
  }, [traders]);

  return {
    clearTraderCache,
    getBatchStatus,
    getPerformanceMetrics
  };
}