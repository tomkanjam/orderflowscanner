import { useState, useCallback, useRef, useEffect } from 'react';
import { HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress, Kline, Ticker, KlineInterval } from '../types';

interface UseHistoricalScannerProps {
  symbols: string[];
  historicalData: Map<string, Kline[]>;
  tickers: Map<string, Ticker>;
  filterCode: string;
  filterDescription: string[];
  klineInterval: KlineInterval;
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
              // Enhance signals with filter description and current prices
              const enhancedSignals = response.signals.map((signal: HistoricalSignal) => {
                const currentTicker = tickers.get(signal.symbol);
                const currentPrice = currentTicker ? parseFloat(currentTicker.c) : signal.priceAtSignal;
                const priceChange = currentPrice - signal.priceAtSignal;
                const percentChange = (priceChange / signal.priceAtSignal) * 100;
                
                return {
                  ...signal,
                  filterDesc: filterDescription.join(' AND '),
                  currentPrice,
                  priceChangeSinceSignal: priceChange,
                  percentChangeSinceSignal: percentChange,
                };
              });
              
              setSignals(enhancedSignals);
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
  }, [symbols, historicalData, tickers, filterCode, filterDescription, klineInterval]);
  
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