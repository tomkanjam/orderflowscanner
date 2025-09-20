import { useEffect, useRef, useCallback } from 'react';
import { CustomIndicatorConfig, Kline, IndicatorDataPoint } from '../types';

interface IndicatorCalculation {
  indicator: CustomIndicatorConfig;
  klines: Kline[];
  resolve: (data: IndicatorDataPoint[]) => void;
  reject: (error: Error) => void;
  cancelled?: boolean;
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
        // Skip if calculation was cancelled
        if (pending.cancelled) {
          pendingCalculations.current.delete(id);
          return;
        }

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

  // Cancel all pending calculations for specific indicators
  const cancelCalculations = useCallback(
    (indicatorIds?: string[]) => {
      if (!indicatorIds) {
        // Cancel all pending calculations
        pendingCalculations.current.forEach(calc => {
          calc.cancelled = true;
        });
        pendingCalculations.current.clear();
        // console.log(`[DEBUG ${new Date().toISOString()}] Cancelled all pending indicator calculations`);
      } else {
        // Cancel specific indicators
        pendingCalculations.current.forEach((calc, id) => {
          if (indicatorIds.includes(calc.indicator.id)) {
            calc.cancelled = true;
            pendingCalculations.current.delete(id);
          }
        });
        // console.log(`[DEBUG ${new Date().toISOString()}] Cancelled calculations for indicators:`, indicatorIds);
      }
    },
    []
  );

  // Calculate multiple indicators in parallel with cancellation support
  const calculateIndicators = useCallback(
    async (indicators: CustomIndicatorConfig[], klines: Kline[]): Promise<Map<string, IndicatorDataPoint[]>> => {
      const results = new Map<string, IndicatorDataPoint[]>();

      // Cancel any existing calculations for these indicators
      const indicatorIds = indicators.map(ind => ind.id);
      cancelCalculations(indicatorIds);

      try {
        // Launch all calculations in parallel
        const calculations = indicators.map(async (indicator) => {
          try {
            const data = await calculateIndicator(indicator, klines);
            results.set(indicator.id, data);
          } catch (error) {
            // Don't log errors for cancelled calculations
            if (!error.message?.includes('cancelled')) {
              console.error(`Failed to calculate indicator ${indicator.name}:`, error);
            }
            results.set(indicator.id, []);
          }
        });

        await Promise.all(calculations);
      } catch (error) {
        console.error('Error calculating indicators:', error);
      }

      return results;
    },
    [calculateIndicator, cancelCalculations]
  );

  return {
    calculateIndicator,
    calculateIndicators,
    cancelCalculations
  };
}