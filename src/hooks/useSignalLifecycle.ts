import { useState, useEffect, useCallback, useRef } from 'react';
import { signalManager } from '../services/signalManager';
import { SignalLifecycle, FilterResult, Strategy } from '../abstractions/interfaces';
import { ServiceFactory } from '../services/serviceFactory';
import { traderManager } from '../services/traderManager';
import { MODEL_TIERS } from '../constants/models';

interface UseSignalLifecycleOptions {
  activeStrategy: Strategy | null;
  autoAnalyze?: boolean;
  autoMonitor?: boolean;
  modelName?: string;
  aiAnalysisLimit?: number; // Number of bars to send to AI (default: 100, range: 1-1000)
  calculateIndicators?: (indicators: any[], klines: any[]) => Promise<Map<string, any[]>>; // Function to calculate trader indicators
  getMarketData?: (symbol: string) => { ticker: any; klines: any[] } | null; // Function to get market data
}

export function useSignalLifecycle(options: UseSignalLifecycleOptions) {
  const { activeStrategy, autoAnalyze = false, autoMonitor = true, modelName = 'gemini-2.5-flash', aiAnalysisLimit: globalAiAnalysisLimit = 100, calculateIndicators, getMarketData } = options;
  const [signals, setSignals] = useState<SignalLifecycle[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const monitoringInterval = useRef<NodeJS.Timeout>();
  const analysisQueue = useRef<string[]>([]);
  const isAnalyzing = useRef(false);
  
  // Subscribe to signal updates
  useEffect(() => {
    const unsubscribe = signalManager.subscribe(setSignals);
    return unsubscribe;
  }, []);
  
  // Subscribe to price updates
  useEffect(() => {
    
    // Subscribe to ticker updates from binance service
    // Note: In real implementation, we'd need to expose this from binanceService
    // For now, this is a placeholder
    // Would subscribe to price updates here
    
    return () => {
      // Cleanup subscription
    };
  }, []);
  
  // Create signal from filter result
  const createSignalFromFilter = useCallback((filterResult: FilterResult, traderId?: string) => {
    // Allow trader signals without active strategy
    if (!activeStrategy && !traderId) {
      console.warn('No active strategy and no trader ID provided for signal creation');
      return;
    }
    
    // Use trader ID as strategy ID when no active strategy
    const strategyId = activeStrategy?.id || `trader-${traderId}`;
    const signal = signalManager.createSignal(filterResult, strategyId, traderId);
    
    if (autoAnalyze) {
      // Queue all signals for analysis (including trader signals)
      analysisQueue.current.push(signal.id);
      processAnalysisQueue();
    }
    
    return signal;
  }, [activeStrategy, autoAnalyze]);
  
  // Analyze a signal
  const analyzeSignal = useCallback(async (signalId: string, customModel?: string) => {
    const signal = signalManager.getSignal(signalId);
    if (!signal) return;
    
    // For trader signals, fetch trader's strategy
    let strategyToUse: Strategy | null = activeStrategy;
    
    if (!activeStrategy && signal.traderId) {
      // Get trader from traderManager to access their strategy
      const trader = await traderManager.getTrader(signal.traderId);
      
      if (!trader) {
        console.error('Trader not found for signal:', signalId);
        return;
      }
      
      // Create a Strategy object from trader data
      strategyToUse = {
        id: `trader-${trader.id}`,
        userId: 'system',
        name: trader.name,
        description: trader.strategy.instructions, // Use trader's strategy instructions
        filterCode: trader.filter.code,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }
    
    if (!strategyToUse) {
      console.error('No strategy available for signal analysis');
      return;
    }
    
    // Update status to analyzing
    signal.status = 'analyzing';
    signalManager['notifyUpdate'](); // Force update
    
    try {
      const analysisEngine = ServiceFactory.getAnalysis();
      
      // Get market data
      let marketData: any = {
        symbol: signal.symbol,
        price: signal.currentPrice,
        volume: 0,
        klines: [],
        calculatedIndicators: {} as Record<string, any>,
      };
      
      // If trader signal, get trader's indicators and calculate them
      if (signal.traderId && calculateIndicators && getMarketData) {
        const trader = await traderManager.getTrader(signal.traderId);
        if (trader?.filter?.indicators && trader.filter.indicators.length > 0) {
          // Get raw market data
          const rawData = getMarketData(signal.symbol);
          
          if (rawData) {
            // Use trader's specific aiAnalysisLimit or fall back to global
            const traderAiLimit = trader.strategy?.aiAnalysisLimit || globalAiAnalysisLimit;
            
            // Calculate trader's specific indicators
            const indicatorValues = await calculateIndicators(trader.filter.indicators, rawData.klines);
            
            // Convert Map to object for easier use
            const indicatorData: Record<string, any> = {};
            indicatorValues.forEach((values, indicatorId) => {
              const indicator = trader.filter.indicators!.find((ind: any) => ind.id === indicatorId);
              if (indicator && values.length > 0) {
                // Get the latest value(s)
                const latestValue = values[values.length - 1];
                // Limit historical values to trader's aiAnalysisLimit
                const limitedValues = values.slice(-traderAiLimit);
                indicatorData[indicator.name] = {
                  id: indicator.id,
                  name: indicator.name,
                  value: latestValue.y,
                  ...(latestValue.y2 !== undefined && { value2: latestValue.y2 }),
                  ...(latestValue.y3 !== undefined && { value3: latestValue.y3 }),
                  ...(latestValue.y4 !== undefined && { value4: latestValue.y4 }),
                  history: limitedValues.map(v => ({
                    value: v.y,
                    ...(v.y2 !== undefined && { value2: v.y2 }),
                    ...(v.y3 !== undefined && { value3: v.y3 }),
                    ...(v.y4 !== undefined && { value4: v.y4 }),
                  })),
                };
              }
            });
            
            // Limit klines to trader's aiAnalysisLimit
            const limitedKlines = rawData.klines.slice(-traderAiLimit);
            
            marketData = {
              symbol: signal.symbol,
              price: signal.currentPrice,
              volume: rawData.ticker ? parseFloat(rawData.ticker.q) : 0,
              klines: limitedKlines,
              calculatedIndicators: indicatorData,
            };
          }
        }
      }
      
      // Determine which model to use for this trader
      let modelToUse = customModel || modelName;
      if (signal.traderId && !customModel) {
        const trader = await traderManager.getTrader(signal.traderId);
        if (trader?.strategy?.modelTier) {
          modelToUse = MODEL_TIERS[trader.strategy.modelTier].model;
        }
      }
      
      const result = await analysisEngine.analyzeSetup(
        signal.symbol,
        strategyToUse,
        marketData,
        undefined,
        modelToUse
      );
      
      signalManager.updateWithAnalysis(signalId, result);
      
      // Auto-start monitoring if enabled and decision is good_setup
      if (autoMonitor && result.decision === 'good_setup') {
        startMonitoringSignal(signalId);
      }
      
      return result;
    } catch (error) {
      console.error('Analysis failed:', error);
      // Reset status on error
      signal.status = 'new';
      signalManager['notifyUpdate']();
      throw error;
    }
  }, [activeStrategy, autoMonitor, modelName, globalAiAnalysisLimit, calculateIndicators, getMarketData]);
  
  // Process analysis queue
  const processAnalysisQueue = useCallback(async () => {
    if (isAnalyzing.current || analysisQueue.current.length === 0) return;
    
    isAnalyzing.current = true;
    const signalId = analysisQueue.current.shift()!;
    
    try {
      await analyzeSignal(signalId);
    } catch (error) {
      console.error('Queue analysis failed:', error);
    }
    
    isAnalyzing.current = false;
    
    // Process next in queue
    if (analysisQueue.current.length > 0) {
      setTimeout(processAnalysisQueue, 1000); // Wait 1s between analyses
    }
  }, [analyzeSignal]);
  
  // Start monitoring a signal
  const startMonitoringSignal = useCallback((signalId: string) => {
    const signal = signalManager.getSignal(signalId);
    if (!signal || signal.status !== 'monitoring') return;
    
    // In a real implementation, this would use the monitoring engine
    console.log('Would start monitoring signal:', signalId);
  }, []);
  
  // Start global monitoring
  const startMonitoring = useCallback(() => {
    if (isMonitoring || !activeStrategy) return;
    
    setIsMonitoring(true);
    
    // Monitor all signals in monitoring status every 30 seconds
    monitoringInterval.current = setInterval(async () => {
      const monitoringSignals = signals.filter((s: SignalLifecycle) => s.status === 'monitoring');
      
      for (const signal of monitoringSignals) {
        try {
          // Re-analyze with current data
          const result = await analyzeSignal(signal.id);
          
          // Create monitoring update
          const update = {
            timestamp: new Date(),
            price: signal.currentPrice,
            action: (result?.decision === 'enter_trade' ? 'enter' : 'continue') as 'enter' | 'continue',
            reason: result?.reasoning || 'Monitoring update',
            confidence: result?.confidence,
          };
          
          signalManager.addMonitoringUpdate(signal.id, update);
        } catch (error) {
          console.error('Monitoring update failed:', error);
        }
      }
    }, 30000); // Every 30 seconds
  }, [isMonitoring, activeStrategy, signals, analyzeSignal]);
  
  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
    if (monitoringInterval.current) {
      clearInterval(monitoringInterval.current);
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (monitoringInterval.current) {
        clearInterval(monitoringInterval.current);
      }
    };
  }, []);
  
  return {
    signals,
    createSignalFromFilter,
    analyzeSignal,
    startMonitoring,
    stopMonitoring,
    isMonitoring,
    signalManager,
  };
}