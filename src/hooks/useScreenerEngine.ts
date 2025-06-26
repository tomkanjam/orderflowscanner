import { useState, useEffect, useCallback } from 'react';
import { ServiceFactory } from '../services/serviceFactory';
import { IScreenerEngine, MarketData, FilterResult } from '../abstractions/interfaces';

export function useScreenerEngine() {
  const [engine, setEngine] = useState<IScreenerEngine | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Initialize screener engine based on user tier
    // In a real app, we'd get the user tier from auth context
    const userTier = 'free'; // TODO: Get from auth context
    ServiceFactory.setUserTier(userTier);
    
    const screenerEngine = ServiceFactory.getScreener();
    setEngine(screenerEngine);
    setIsInitialized(true);
  }, []);

  const executeFilter = useCallback(async (
    filterCode: string,
    marketData: Map<string, MarketData>
  ): Promise<FilterResult[]> => {
    if (!engine) {
      throw new Error('Screener engine not initialized');
    }
    return engine.executeFilter(filterCode, marketData);
  }, [engine]);

  const validateFilter = useCallback(async (
    filterCode: string
  ): Promise<{ valid: boolean; error?: string }> => {
    if (!engine) {
      throw new Error('Screener engine not initialized');
    }
    return engine.validateFilterCode(filterCode);
  }, [engine]);

  const subscribeToUpdates = useCallback((
    callback: (data: MarketData) => void
  ): (() => void) => {
    if (!engine) {
      console.warn('Screener engine not initialized');
      return () => {};
    }
    return engine.subscribeToUpdates(callback);
  }, [engine]);

  return {
    isInitialized,
    executeFilter,
    validateFilter,
    subscribeToUpdates,
  };
}