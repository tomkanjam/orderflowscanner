import { useState, useCallback, useRef, useEffect } from 'react';
import { HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress, Kline, Ticker, KlineInterval } from '../types';

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

interface UseHistoricalScannerProps {
  symbols: string[];
  historicalData: Map<string, Kline[]>;
  tickers: Map<string, Ticker>;
  filterCode: string;
  filterDescription: string[];
  klineInterval: KlineInterval;
  signalDedupeThreshold: number;
}

interface UseHistoricalScannerReturn {
  isScanning: boolean;
  progress: HistoricalScanProgress | null;
  signals: HistoricalSignal[];
  error: string | null;
  startScan: (config: HistoricalScanConfig) => void;
  cancelScan: () => void;
  clearSignals: () => void;
}

export function useHistoricalScanner({
  symbols,
  historicalData,
  tickers,
  filterCode,
  filterDescription,
  klineInterval,
  signalDedupeThreshold,
}: UseHistoricalScannerProps): UseHistoricalScannerReturn {
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
    
    // Validate inputs
    if (!filterCode || symbols.length === 0) {
      setError('No filter or symbols available for scanning');
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
        new URL('../workers/historicalScannerWorker.ts', import.meta.url),
        { type: 'module' }
      );
      
      // Convert Map to plain object for worker
      const historicalDataObj: Record<string, Kline[]> = {};
      const tickersObj: Record<string, Ticker> = {};
      
      symbols.forEach(symbol => {
        const klines = historicalData.get(symbol);
        const ticker = tickers.get(symbol);
        if (klines && ticker) {
          historicalDataObj[symbol] = klines;
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
              const sortedSignals = response.signals.sort((a: HistoricalSignal, b: HistoricalSignal) => 
                a.klineTimestamp - b.klineTimestamp
              );
              
              // Apply deduplication logic
              const deduplicatedSignals: HistoricalSignal[] = [];
              const symbolLastSignal = new Map<string, { signalIndex: number, klineTimestamp: number }>();
              
              // Calculate milliseconds per bar based on interval
              const msPerBar = getMillisecondsPerBar(klineInterval);
              
              for (const signal of sortedSignals) {
                const lastSignalInfo = symbolLastSignal.get(signal.symbol);
                
                // Calculate bar distance between signals
                let barDistance = signalDedupeThreshold; // Default to threshold if no previous signal
                if (lastSignalInfo) {
                  const timeDiff = Math.abs(signal.klineTimestamp - lastSignalInfo.klineTimestamp);
                  barDistance = Math.floor(timeDiff / msPerBar);
                }
                
                // Check if we should create a new signal or increment count
                if (!lastSignalInfo || barDistance >= signalDedupeThreshold) {
                  // Create new signal with filter description
                  const enhancedSignal = {
                    ...signal,
                    filterDesc: filterDescription.length > 0 ? filterDescription[0] : 'AI Filter Active',
                    count: 1,
                  };
                  const newIndex = deduplicatedSignals.push(enhancedSignal) - 1;
                  symbolLastSignal.set(signal.symbol, { signalIndex: newIndex, klineTimestamp: signal.klineTimestamp });
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
      
      // Start scanning
      workerRef.current.postMessage({
        symbols,
        historicalData: historicalDataObj,
        tickers: tickersObj,
        filterCode,
        config,
        klineInterval,
      });
      
    } catch (err) {
      console.error('Failed to start scan:', err);
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      setIsScanning(false);
    }
  }, [symbols, historicalData, tickers, filterCode, filterDescription, klineInterval, signalDedupeThreshold]);
  
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