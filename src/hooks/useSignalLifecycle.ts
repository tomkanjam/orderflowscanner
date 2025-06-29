import { useState, useEffect, useCallback, useRef } from 'react';
import { signalManager } from '../services/signalManager';
import { SignalLifecycle, FilterResult, AnalysisResult, Strategy } from '../abstractions/interfaces';
import { ServiceFactory } from '../services/serviceFactory';
import { binanceService } from '../services/binanceService';

interface UseSignalLifecycleOptions {
  activeStrategy: Strategy | null;
  autoAnalyze?: boolean;
  autoMonitor?: boolean;
  modelName?: string;
}

export function useSignalLifecycle(options: UseSignalLifecycleOptions) {
  const { activeStrategy, autoAnalyze = false, autoMonitor = true, modelName = 'gemini-2.0-flash-exp' } = options;
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
    const handleTickerUpdate = (ticker: any) => {
      signalManager.updatePrice(ticker.s, parseFloat(ticker.c));
    };
    
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
    if (!activeStrategy) {
      // No active strategy to create signal
      return;
    }
    
    const signal = signalManager.createSignal(filterResult, activeStrategy.id, traderId);
    
    if (autoAnalyze) {
      analysisQueue.current.push(signal.id);
      processAnalysisQueue();
    }
    
    return signal;
  }, [activeStrategy, autoAnalyze]);
  
  // Analyze a signal
  const analyzeSignal = useCallback(async (signalId: string, customModel?: string) => {
    const signal = signalManager.getSignal(signalId);
    if (!signal || !activeStrategy) return;
    
    // Update status to analyzing
    signal.status = 'analyzing';
    signalManager['notifyUpdate'](); // Force update
    
    try {
      const analysisEngine = ServiceFactory.getAnalysis();
      const marketData = {
        symbol: signal.symbol,
        price: signal.currentPrice,
        volume: 0, // Would need to get from ticker
        klines: [], // Would need to get from binance service
      };
      
      const result = await analysisEngine.analyzeSetup(
        signal.symbol,
        activeStrategy,
        marketData,
        undefined,
        customModel || modelName
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
  }, [activeStrategy, autoMonitor, modelName]);
  
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
      const monitoringSignals = signals.filter(s => s.status === 'monitoring');
      
      for (const signal of monitoringSignals) {
        try {
          // Re-analyze with current data
          const result = await analyzeSignal(signal.id);
          
          // Create monitoring update
          const update = {
            timestamp: new Date(),
            price: signal.currentPrice,
            action: result?.decision === 'enter_trade' ? 'enter' : 'continue' as const,
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