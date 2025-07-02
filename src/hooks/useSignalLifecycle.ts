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
  getMarketData?: (symbol: string, traderId?: string) => { ticker: any; klines: any[] } | null; // Function to get market data
}

export function useSignalLifecycle(options: UseSignalLifecycleOptions) {
  const { activeStrategy, autoAnalyze = false, autoMonitor = true, modelName = 'gemini-2.5-flash', aiAnalysisLimit: globalAiAnalysisLimit = 100, calculateIndicators, getMarketData } = options;
  const [signals, setSignals] = useState<SignalLifecycle[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [reanalyzingSignals, setReanalyzingSignals] = useState<Set<string>>(new Set());
  const monitoringInterval = useRef<NodeJS.Timeout>();
  const analysisQueue = useRef<string[]>([]);
  const activeAnalyses = useRef<Map<string, Promise<void>>>(new Map());
  const traderAnalysisCounts = useRef<Map<string, number>>(new Map());
  
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
      signalManager.updateSignalStatus(signal.id, 'analysis_queued');
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
          // Get raw market data - pass traderId to get correct interval
          const rawData = getMarketData(signal.symbol, signal.traderId);
          
          // Debug log to see what's being returned
          if (rawData && !Array.isArray(rawData.klines)) {
            console.warn(`getMarketData returned non-array klines for ${signal.symbol}:`, typeof rawData.klines, rawData.klines);
          }
          if (!rawData) {
            console.warn(`getMarketData returned null for ${signal.symbol}`);
          }
          
          if (rawData && rawData.klines && Array.isArray(rawData.klines)) {
            // Use trader's specific aiAnalysisLimit or fall back to global
            const traderAiLimit = trader.strategy?.aiAnalysisLimit || globalAiAnalysisLimit;
            
            // Calculate trader's specific indicators
            const indicatorValues = await calculateIndicators(trader.filter.indicators, rawData.klines);
            
            // Convert Map to object for easier use
            const indicatorData: Record<string, any> = {};
            console.log(`[DEBUG] useSignalLifecycle calculated indicators for ${signal.symbol}:`, {
              traderId: signal.traderId,
              indicatorCount: indicatorValues.size,
              indicatorIds: Array.from(indicatorValues.keys()),
              traderIndicators: trader.filter.indicators!.map((ind: any) => ({ id: ind.id, name: ind.name }))
            });
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
            
            console.log(`[DEBUG] Market data for ${signal.symbol} AI analysis:`, {
              klineCount: limitedKlines.length,
              indicatorCount: Object.keys(indicatorData).length,
              indicators: Object.keys(indicatorData),
              traderAiLimit,
              indicatorDetails: Object.entries(indicatorData).map(([name, data]) => ({
                name,
                hasValue: data.value !== undefined,
                hasHistory: data.history?.length > 0,
                historyLength: data.history?.length || 0
              }))
            });
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
  
  // Process analysis queue with concurrent limit
  const processAnalysisQueue = useCallback(async () => {
    // Process queue while respecting concurrent limits
    while (analysisQueue.current.length > 0) {
      const nextSignalId = analysisQueue.current[0];
      const signal = signalManager.getSignal(nextSignalId);
      
      if (!signal) {
        analysisQueue.current.shift();
        continue;
      }
      
      // Get trader's max concurrent analysis limit
      let maxConcurrent = 3; // Default global limit
      if (signal.traderId) {
        const trader = await traderManager.getTrader(signal.traderId);
        if (trader?.strategy?.maxConcurrentAnalysis) {
          maxConcurrent = trader.strategy.maxConcurrentAnalysis;
        }
      }
      
      // Check if trader has reached concurrent limit
      const currentCount = traderAnalysisCounts.current.get(signal.traderId || 'global') || 0;
      if (currentCount >= maxConcurrent) {
        // Check if any active analyses are complete
        for (const [id, promise] of activeAnalyses.current.entries()) {
          const sig = signalManager.getSignal(id);
          if (sig?.traderId === signal.traderId) {
            await Promise.race([promise, Promise.resolve()]);
          }
        }
        // Re-check after potential completion
        const updatedCount = traderAnalysisCounts.current.get(signal.traderId || 'global') || 0;
        if (updatedCount >= maxConcurrent) {
          break; // Still at limit, wait for next process cycle
        }
      }
      
      // Remove from queue and start analysis
      analysisQueue.current.shift();
      
      // Increment trader's concurrent count
      const traderId = signal.traderId || 'global';
      traderAnalysisCounts.current.set(traderId, currentCount + 1);
      
      // Start analysis and track promise
      const analysisPromise = analyzeSignal(nextSignalId)
        .finally(() => {
          // Decrement count and remove from active analyses
          const count = traderAnalysisCounts.current.get(traderId) || 0;
          traderAnalysisCounts.current.set(traderId, Math.max(0, count - 1));
          activeAnalyses.current.delete(nextSignalId);
          
          // Process queue again after completion
          setTimeout(processAnalysisQueue, 100);
        });
      
      activeAnalyses.current.set(nextSignalId, analysisPromise);
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
    
    // Monitor all signals in monitoring or in_position status every 30 seconds
    monitoringInterval.current = setInterval(async () => {
      const monitoringSignals = signals.filter((s: SignalLifecycle) => 
        s.status === 'monitoring' || s.status === 'in_position'
      );
      
      for (const signal of monitoringSignals) {
        try {
          // Mark signal as being re-analyzed
          setReanalyzingSignals(prev => new Set(prev).add(signal.id));
          
          // Re-analyze with current data
          const result = await analyzeSignal(signal.id);
          
          if (result) {
            // Update the full analysis result
            signalManager.updateReanalysis(signal.id, result);
            
            // Also create monitoring update for history
            const update = {
              timestamp: new Date(),
              price: signal.currentPrice,
              action: (result.decision === 'enter_trade' ? 'enter' : 'continue') as 'enter' | 'continue',
              reason: result.reasoning || 'Monitoring update',
              confidence: result.confidence,
            };
            
            signalManager.addMonitoringUpdate(signal.id, update);
          }
        } catch (error) {
          console.error('Monitoring update failed:', error);
        } finally {
          // Remove from re-analyzing set
          setReanalyzingSignals(prev => {
            const newSet = new Set(prev);
            newSet.delete(signal.id);
            return newSet;
          });
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
  
  // Cancel a queued analysis
  const cancelQueuedAnalysis = useCallback((signalId: string) => {
    const signal = signalManager.getSignal(signalId);
    if (!signal || signal.status !== 'analysis_queued') return;
    
    // Remove from queue
    const index = analysisQueue.current.indexOf(signalId);
    if (index > -1) {
      analysisQueue.current.splice(index, 1);
    }
    
    // Update status back to 'new'
    signalManager.updateSignalStatus(signalId, 'new');
  }, []);

  return {
    signals,
    createSignalFromFilter,
    analyzeSignal,
    cancelQueuedAnalysis,
    startMonitoring,
    stopMonitoring,
    isMonitoring,
    reanalyzingSignals,
    signalManager,
  };
}