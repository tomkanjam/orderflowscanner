import { useState, useCallback, useRef, useEffect } from 'react';
import { HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress, Kline, Ticker, KlineInterval } from '../types';
import { Trader } from '../src/abstractions/trader.interfaces';
import { sharedMarketData } from '../src/shared/SharedMarketData';

// Helper function to get milliseconds per bar for each interval
function getMillisecondsPerBar(interval: KlineInterval): number {
  switch (interval) {
    case KlineInterval.ONE_MINUTE:
      return 60 * 1000;
    case KlineInterval.FIVE_MINUTES:
      return 5 * 60 * 1000;
    case KlineInterval.FIFTEEN_MINUTES:
      return 15 * 60 * 1000;
    case KlineInterval.ONE_HOUR:
      return 60 * 60 * 1000;
    case KlineInterval.FOUR_HOURS:
      return 4 * 60 * 60 * 1000;
    case KlineInterval.ONE_DAY:
      return 24 * 60 * 60 * 1000;
    default:
      return 60 * 1000; // Default to 1 minute
  }
}

interface UseMultiTraderHistoricalScannerProps {
  traders: Trader[];
  symbols: string[];
  tickers: Map<string, Ticker>;
  klineInterval: KlineInterval;
  signalDedupeThreshold: number;
}

interface UseMultiTraderHistoricalScannerReturn {
  isScanning: boolean;
  progress: HistoricalScanProgress | null;
  signals: HistoricalSignal[];
  error: string | null;
  startScan: (config: HistoricalScanConfig) => void;
  cancelScan: () => void;
  clearSignals: () => void;
}

interface TraderHistoricalMessage {
  type: 'scan';
  symbols: string[];
  historicalData: Record<string, Kline[]>;
  tickers: Record<string, Ticker>;
  traders: Array<{
    id: string;
    name: string;
    filterCode: string;
    filterDescription: string[];
  }>;
  config: HistoricalScanConfig;
  klineInterval: KlineInterval;
}

interface TraderHistoricalResult extends HistoricalSignal {
  traderId: string;
  traderName: string;
}

export function useMultiTraderHistoricalScanner({
  traders,
  symbols,
  tickers,
  klineInterval,
  signalDedupeThreshold,
}: UseMultiTraderHistoricalScannerProps): UseMultiTraderHistoricalScannerReturn {
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState<HistoricalScanProgress | null>(null);
  const [signals, setSignals] = useState<HistoricalSignal[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const workerRef = useRef<Worker | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const startScan = useCallback((config: HistoricalScanConfig) => {
    // Cancel any existing scan
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Filter enabled traders
    const enabledTraders = traders.filter(t => t.enabled);
    
    // Validate inputs
    if (enabledTraders.length === 0 || symbols.length === 0) {
      setError('No enabled traders or symbols available for scanning');
      return;
    }
    
    setIsScanning(true);
    setError(null);
    setProgress(null);
    setSignals([]);
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    try {
      // Create worker
      workerRef.current = new Worker(
        new URL('../workers/multiTraderHistoricalScannerWorker.ts', import.meta.url),
        { type: 'module' }
      );
      
      // Convert Map to plain object for worker
      const historicalDataObj: Record<string, Record<string, Kline[]>> = {};
      const tickersObj: Record<string, Ticker> = {};
      
      symbols.forEach(symbol => {
        const intervalMap = historicalData.get(symbol);
        const ticker = tickers.get(symbol);
        if (intervalMap && ticker) {
          historicalDataObj[symbol] = {};
          intervalMap.forEach((klines, interval) => {
            historicalDataObj[symbol][interval] = klines;
          });
          tickersObj[symbol] = ticker;
        }
      });
      
      // Handle worker messages
      workerRef.current.onmessage = (event) => {
        const response = event.data;
        
        switch (response.type) {
          case 'progress':
            if (!abortControllerRef.current?.signal.aborted) {
              setProgress(response.progress);
            }
            break;
            
          case 'complete':
            if (!abortControllerRef.current?.signal.aborted) {
              // Sort signals by time (oldest first) for proper deduplication
              const sortedSignals = response.signals.sort((a: TraderHistoricalResult, b: TraderHistoricalResult) => 
                a.klineTimestamp - b.klineTimestamp
              );
              
              // Apply deduplication logic per trader
              const deduplicatedSignals: HistoricalSignal[] = [];
              const traderSymbolLastSignal = new Map<string, { signalIndex: number, klineTimestamp: number }>();
              
              // Calculate milliseconds per bar based on interval
              const msPerBar = getMillisecondsPerBar(klineInterval);
              
              for (const signal of sortedSignals) {
                const key = `${signal.traderId}-${signal.symbol}`;
                const lastSignalInfo = traderSymbolLastSignal.get(key);
                
                // Calculate bar distance between signals
                let barDistance = signalDedupeThreshold; // Default to threshold if no previous signal
                if (lastSignalInfo) {
                  const timeDiff = Math.abs(signal.klineTimestamp - lastSignalInfo.klineTimestamp);
                  barDistance = Math.floor(timeDiff / msPerBar);
                }
                
                // Check if we should create a new signal or increment count
                if (!lastSignalInfo || barDistance >= signalDedupeThreshold) {
                  // Create new signal with trader info
                  const enhancedSignal: HistoricalSignal = {
                    ...signal,
                    filterDesc: `${signal.traderName}: ${signal.filterDesc}`,
                    count: 1,
                  };
                  const newIndex = deduplicatedSignals.push(enhancedSignal) - 1;
                  traderSymbolLastSignal.set(key, { signalIndex: newIndex, klineTimestamp: signal.klineTimestamp });
                } else {
                  // Increment count on existing signal in the array
                  const existingSignalIndex = lastSignalInfo.signalIndex;
                  if (existingSignalIndex < deduplicatedSignals.length) {
                    deduplicatedSignals[existingSignalIndex].count = (deduplicatedSignals[existingSignalIndex].count || 1) + 1;
                  }
                }
              }
              
              // Sort by newest first for display (by kline timestamp, not detection time)
              const finalSignals = deduplicatedSignals.sort((a, b) => b.klineTimestamp - a.klineTimestamp);
              
              setSignals(finalSignals);
              setIsScanning(false);
              setProgress(null);
            }
            break;
            
          case 'error':
            if (!abortControllerRef.current?.signal.aborted) {
              setError(response.error || 'Unknown error during scanning');
              setIsScanning(false);
              setProgress(null);
            }
            break;
        }
      };
      
      // Handle worker errors
      workerRef.current.onerror = (error) => {
        console.error('Worker error:', error);
        setError('Worker crashed during scanning');
        setIsScanning(false);
        setProgress(null);
      };
      
      // Prepare trader data for worker
      const traderData = enabledTraders.map(t => ({
        id: t.id,
        name: t.name,
        filterCode: t.filter.code,
        filterDescription: t.filter.description || [],
        interval: t.filter.interval || KlineInterval.ONE_MINUTE,
      }));
      
      // Start scanning
      const message: TraderHistoricalMessage = {
        type: 'scan',
        symbols,
        historicalData: historicalDataObj,
        tickers: tickersObj,
        traders: traderData,
        config,
        klineInterval,
      };
      
      workerRef.current.postMessage(message);
      
    } catch (err) {
      console.error('Failed to start scan:', err);
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      setIsScanning(false);
    }
  }, [traders, symbols, historicalData, tickers, klineInterval, signalDedupeThreshold]);
  
  const cancelScan = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsScanning(false);
    setProgress(null);
    setError('Scan cancelled by user');
  }, []);
  
  const clearSignals = useCallback(() => {
    setSignals([]);
    setError(null);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  return {
    isScanning,
    progress,
    signals,
    error,
    startScan,
    cancelScan,
    clearSignals,
  };
}