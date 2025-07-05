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
  onAnalysisComplete?: (signalId: string, analysis: AnalysisResult) => void; // Callback when analysis completes
}

// Helper function to calculate milliseconds until next candle close
function getMillisecondsToNextCandle(interval: string): number {
  const now = new Date();
  const currentTime = now.getTime();
  
  // Parse interval to get duration in minutes
  const intervalMinutes: Record<string, number> = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '1h': 60,
    '4h': 240,
    '1d': 1440,
  };
  
  const minutes = intervalMinutes[interval] || 1;
  const milliseconds = minutes * 60 * 1000;
  
  // Calculate time until next candle
  const nextCandleTime = Math.ceil(currentTime / milliseconds) * milliseconds;
  return nextCandleTime - currentTime;
}

export function useSignalLifecycle(options: UseSignalLifecycleOptions) {
  const { activeStrategy, autoAnalyze = false, autoMonitor = true, modelName = 'gemini-2.5-flash', aiAnalysisLimit: globalAiAnalysisLimit = 100, calculateIndicators, getMarketData, onAnalysisComplete } = options;
  const [signals, setSignals] = useState<SignalLifecycle[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [reanalyzingSignals, setReanalyzingSignals] = useState<Set<string>>(new Set());
  const monitoringIntervals = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const analysisQueue = useRef<string[]>([]);
  const activeAnalyses = useRef<Map<string, Promise<void>>>(new Map());
  const traderAnalysisCounts = useRef<Map<string, number>>(new Map());
  
  // Cleanup old trader analysis counts periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const maxSize = 100;
      if (traderAnalysisCounts.current.size > maxSize) {
        // Keep only the most recent entries
        const entries = Array.from(traderAnalysisCounts.current.entries());
        const toKeep = entries.slice(-maxSize);
        traderAnalysisCounts.current = new Map(toKeep);
        console.log(`[useSignalLifecycle] Cleaned trader analysis counts from ${entries.length} to ${maxSize}`);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
    
    return () => clearInterval(cleanupInterval);
  }, []);
  
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
  const createSignalFromFilter = useCallback((filterResult: FilterResult, traderId?: string, interval?: string) => {
    // Allow trader signals without active strategy
    if (!activeStrategy && !traderId) {
      console.warn('No active strategy and no trader ID provided for signal creation');
      return;
    }
    
    // Use trader ID as strategy ID when no active strategy
    const strategyId = activeStrategy?.id || `trader-${traderId}`;
    const signal = signalManager.createSignal(filterResult, strategyId, traderId, interval);
    
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
      
      // Call the onAnalysisComplete callback if provided
      if (onAnalysisComplete) {
        onAnalysisComplete(signalId, result);
      }
      
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
  
  // Helper function to re-analyze signals for a specific interval
  const reanalyzeSignalsForInterval = useCallback(async (interval: string) => {
    const monitoringSignals = signals.filter((s: SignalLifecycle) => 
      (s.status === 'monitoring' || s.status === 'in_position') && 
      s.interval === interval
    );
    
    console.log(`Candle closed for ${interval}, re-analyzing ${monitoringSignals.length} signals`);
    
    for (const signal of monitoringSignals) {
      try {
        // Mark signal as being re-analyzed
        setReanalyzingSignals(prev => new Set(prev).add(signal.id));
        
        // Get market data for analysis
        const marketData = getMarketData(signal.symbol);
        if (!marketData) {
          console.warn(`No market data available for ${signal.symbol}`);
          continue;
        }
        
        // Determine strategy to use
        let strategyToUse = activeStrategy;
        if (signal.traderId) {
          const trader = await traderManager.getTrader(signal.traderId);
          if (trader?.strategy) {
            strategyToUse = trader.strategy.instructions;
          }
        }
        
        // Determine model to use
        let modelToUse = modelName;
        if (signal.traderId) {
          const trader = await traderManager.getTrader(signal.traderId);
          if (trader?.strategy?.modelTier) {
            modelToUse = MODEL_TIERS[trader.strategy.modelTier].model;
          }
        }
        
        // Calculate indicators
        const indicatorData: any = {};
        for (const calculator of calculateIndicators) {
          const data = calculator.calculate(signal.symbol);
          if (data) {
            indicatorData[calculator.name] = data;
          }
        }
        
        // Get analysis engine
        const analysisEngine = ServiceFactory.getAnalysis();
        
        // Directly call analysis engine to avoid duplicate history entries
        const result = await analysisEngine.analyzeSetup(
          signal.symbol,
          strategyToUse,
          marketData,
          undefined,
          modelToUse
        );
        
        if (result) {
          console.log(`[useSignalLifecycle] Re-analysis complete for signal ${signal.id}:`, {
            decision: result.decision,
            confidence: result.confidence,
            historyLength: signal.analysisHistory?.length || 0
          });
          
          // Use updateReanalysis which is designed for monitoring updates
          signalManager.updateReanalysis(signal.id, result);
          
          // Call the onAnalysisComplete callback for re-analysis too
          if (onAnalysisComplete) {
            onAnalysisComplete(signal.id, result);
          }
          
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
  }, [signals, analyzeSignal]);
  
  // Setup candle-based monitoring for an interval
  const setupIntervalMonitoring = useCallback((interval: string) => {
    // Clear existing timer for this interval
    const existingTimer = monitoringIntervals.current.get(interval);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Calculate time to next candle close
    const msToNextCandle = getMillisecondsToNextCandle(interval);
    
    console.log(`Setting up monitoring for ${interval}, next candle in ${Math.round(msToNextCandle / 1000)}s`);
    
    // Set timer for next candle close
    const timer = setTimeout(() => {
      // Re-analyze signals for this interval
      reanalyzeSignalsForInterval(interval);
      
      // Setup timer for the next candle
      setupIntervalMonitoring(interval);
    }, msToNextCandle);
    
    monitoringIntervals.current.set(interval, timer);
  }, [reanalyzeSignalsForInterval]);
  
  // Start global monitoring
  const startMonitoring = useCallback(() => {
    if (isMonitoring || !activeStrategy) return;
    
    setIsMonitoring(true);
    
    // Get all unique intervals from monitoring/in_position signals
    const intervals = new Set<string>();
    signals.forEach(signal => {
      if ((signal.status === 'monitoring' || signal.status === 'in_position') && signal.interval) {
        intervals.add(signal.interval);
      }
    });
    
    // Setup monitoring for each interval
    intervals.forEach(interval => {
      setupIntervalMonitoring(interval);
    });
    
    console.log(`Started candle-based monitoring for ${intervals.size} intervals`);
  }, [isMonitoring, activeStrategy, signals, setupIntervalMonitoring]);
  
  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
    
    // Clear all interval timers
    monitoringIntervals.current.forEach((timer, interval) => {
      clearTimeout(timer);
      console.log(`Stopped monitoring for ${interval}`);
    });
    monitoringIntervals.current.clear();
  }, []);
  
  // Re-setup monitoring when signals change (new intervals might be added)
  useEffect(() => {
    if (isMonitoring) {
      // Get all unique intervals from monitoring/in_position signals
      const currentIntervals = new Set<string>();
      signals.forEach(signal => {
        if ((signal.status === 'monitoring' || signal.status === 'in_position') && signal.interval) {
          currentIntervals.add(signal.interval);
        }
      });
      
      // Setup monitoring for new intervals
      currentIntervals.forEach(interval => {
        if (!monitoringIntervals.current.has(interval)) {
          setupIntervalMonitoring(interval);
        }
      });
      
      // Remove monitoring for intervals no longer needed
      monitoringIntervals.current.forEach((timer, interval) => {
        if (!currentIntervals.has(interval)) {
          clearTimeout(timer);
          monitoringIntervals.current.delete(interval);
          console.log(`Removed monitoring for ${interval} (no active signals)`);
        }
      });
    }
  }, [signals, isMonitoring, setupIntervalMonitoring]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all interval timers
      monitoringIntervals.current.forEach(timer => {
        clearTimeout(timer);
      });
      monitoringIntervals.current.clear();
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