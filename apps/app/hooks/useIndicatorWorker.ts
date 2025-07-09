import { useEffect, useRef, useCallback } from 'react';
import { CustomIndicatorConfig, Kline, IndicatorDataPoint } from '../types';

interface IndicatorCalculation {
  indicator: CustomIndicatorConfig;
  klines: Kline[];
  resolve: (data: IndicatorDataPoint[]) => void;
  reject: (error: Error) => void;
}

export function useIndicatorWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingCalculations = useRef<Map<string, IndicatorCalculation>>(new Map());
  const messageIdCounter = useRef(0);

  useEffect(() => {
    // Create worker
    workerRef.current = new Worker(
      new URL('../workers/indicatorWorker.ts', import.meta.url),
      { type: 'module' }
    );

    // Handle messages from worker
    workerRef.current.onmessage = (event) => {
      const { id, type, data, error } = event.data;
      const pending = pendingCalculations.current.get(id);
      
      if (pending) {
        if (type === 'INDICATOR_RESULT') {
          pending.resolve(data);
        } else if (type === 'INDICATOR_ERROR') {
          pending.reject(new Error(error));
        }
        pendingCalculations.current.delete(id);
      }
    };

    workerRef.current.onerror = (error) => {
      console.error('Indicator worker error:', error);
      // Reject all pending calculations
      pendingCalculations.current.forEach(pending => {
        pending.reject(new Error('Worker error'));
      });
      pendingCalculations.current.clear();
    };

    // Cleanup
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const calculateIndicator = useCallback(
    (indicator: CustomIndicatorConfig, klines: Kline[]): Promise<IndicatorDataPoint[]> => {
      return new Promise((resolve, reject) => {
        if (!workerRef.current) {
          reject(new Error('Worker not initialized'));
          return;
        }

        const id = `calc-${++messageIdCounter.current}`;
        
        // Store pending calculation
        pendingCalculations.current.set(id, {
          indicator,
          klines,
          resolve,
          reject
        });

        // Send message to worker
        workerRef.current.postMessage({
          id,
          type: 'CALCULATE_INDICATOR',
          data: { indicator, klines }
        });
      });
    },
    []
  );

  // Calculate multiple indicators in parallel
  const calculateIndicators = useCallback(
    async (indicators: CustomIndicatorConfig[], klines: Kline[]): Promise<Map<string, IndicatorDataPoint[]>> => {
      const results = new Map<string, IndicatorDataPoint[]>();
      
      try {
        // Launch all calculations in parallel
        const calculations = indicators.map(async (indicator) => {
          try {
            const data = await calculateIndicator(indicator, klines);
            results.set(indicator.id, data);
          } catch (error) {
            console.error(`Failed to calculate indicator ${indicator.name}:`, error);
            results.set(indicator.id, []);
          }
        });
        
        await Promise.all(calculations);
      } catch (error) {
        console.error('Error calculating indicators:', error);
      }
      
      return results;
    },
    [calculateIndicator]
  );

  return {
    calculateIndicator,
    calculateIndicators
  };
}