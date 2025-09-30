
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { PerformanceMonitor } from './components/PerformanceMonitor';
import Modal from './components/Modal';
import { Ticker, Kline, CustomIndicatorConfig, KlineInterval, GeminiModelOption, SignalLogEntry, SignalHistoryEntry, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress, KlineHistoryConfig } from './types';
// MIGRATION: Removed direct Binance WebSocket imports
// import { fetchTopPairsAndInitialKlines, connectWebSocket, connectMultiIntervalWebSocket } from './services/binanceService';
import { fetchTopPairsAndInitialKlines } from './services/binanceService'; // Keep for initial data fetch
import { getSymbolAnalysis, getMarketAnalysis } from './services/geminiService';
import { KLINE_HISTORY_LIMIT, KLINE_HISTORY_LIMIT_FOR_ANALYSIS, DEFAULT_KLINE_INTERVAL, DEFAULT_GEMINI_MODEL, GEMINI_MODELS, MAX_SIGNAL_LOG_ENTRIES } from './constants';
import * as screenerHelpers from './screenerHelpers';
// REMOVED: Historical scanner hooks - migrating to server-side execution
// import { useHistoricalScanner } from './hooks/useHistoricalScanner';
// import { useMultiTraderHistoricalScanner } from './hooks/useMultiTraderHistoricalScanner';
import { AuthProvider } from './src/contexts/AuthContext';
import { useAuth } from './src/hooks/useAuth';
import { observability } from './services/observabilityService';
import { StrategyProvider } from './src/contexts/StrategyContext';
import { useSignalLifecycle } from './src/hooks/useSignalLifecycle';
import { useStrategy } from './src/contexts/StrategyContext';
import { signalManager } from './src/services/signalManager';
import { tradeManager } from './src/services/tradeManager';
import { traderManager } from './src/services/traderManager';
import { Trader } from './src/abstractions/trader.interfaces';
// Server-side execution imports
import { useServerSignals } from './hooks/useServerSignals';
import { serverExecutionService } from './src/services/serverExecutionService';
import { useConnectionStatus } from './hooks/useConnectionStatus';
// Keep indicatorWorker for charts only
import { useIndicatorWorker } from './hooks/useIndicatorWorker';
import ActivityPanel from './src/components/ActivityPanel';
import { ConnectionStatus } from './src/components/ConnectionStatus';
import DataLoadingMockup from './components/DataLoadingMockup';
import { klineEventBus } from './src/services/klineEventBus';
import { workflowManager } from './src/services/workflowManager';
import { tradingManager } from './src/services/tradingManager';
import { memoryMonitor } from './src/utils/memoryMonitor';
import { webSocketManager } from './src/utils/webSocketManager';
import { useOptimizedMap, BatchedUpdater, LimitedMap, pruneMapByAge } from './src/utils/stateOptimizer';
import { startMemoryCleanup, getActiveSymbols } from './src/utils/memoryCleanup';
import { useSubscription } from './src/contexts/SubscriptionContext';
import { areTraderArraysEqual } from './src/utils/traderEquality';
import { memDebug } from './src/utils/memoryDebugger';
import { klineEventEmitter } from './src/utils/KlineEventEmitter';
import { DebugPanel } from './src/components/DebugPanel';
// REMOVED: sharedMarketData import - migrating to server-side execution
import { BoundedMap, createBoundedMap } from './src/memory/BoundedCollections';
// MIGRATION: Removed UpdateBatcher - using server-side data flow
// import { UpdateBatcher, createTickerBatcher } from './src/optimization/UpdateBatcher';
import { useThrottledState, useMemoryAwareState } from './src/hooks/useBoundedState';
import { KlineDataProvider } from './src/contexts/KlineDataProvider';
import { MarketDataProvider, useMarketDataSubscription } from './src/contexts/MarketDataContext';
import { klineDataService } from './src/services/klineDataService';
import { useKlineData } from './src/hooks/useKlineData';
import { usePrefetch } from './src/hooks/usePrefetch';
import { useKlineManager } from './src/hooks/useKlineManager';
import { performanceMonitor } from './src/utils/performanceMonitor';

// Define the type for the screenerHelpers module
type ScreenerHelpersType = typeof screenerHelpers;

// Debug tracking
declare global {
  interface Window {
    __tickerDebugLogged?: boolean;
    __tickerUpdateDebugLogged?: boolean;
    __noCallbackDebugLogged?: boolean;
    __firstMessageLogged?: boolean;
  }
}

// Initialize observability
observability.setupUnloadHandler();

// Initialize memory monitoring in development
if (process.env.NODE_ENV === 'development') {
  memoryMonitor.start(10000); // Monitor every 10 seconds
  // console.log('[App] Memory monitoring started');
}

const AppContent: React.FC = () => {
  const { activeStrategy } = useStrategy();
  const { currentTier } = useSubscription();
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map());
  const [traders, setTraders] = useState<Trader[]>([]);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);

  // Use the kline manager hook for data access
  const { getKlinesForInterval, prefetchSymbols } = useKlineManager();
  
  const [klineInterval, setKlineInterval] = useState<KlineInterval>(DEFAULT_KLINE_INTERVAL);
  const [selectedGeminiModel, setSelectedGeminiModel] = useState<GeminiModelOption>(DEFAULT_GEMINI_MODEL);
  

  const [signalLog, setSignalLog] = useState<SignalLogEntry[]>([]); // New state for signal log
  
  // Signal deduplication threshold (default 50 bars)
  const [signalDedupeThreshold, setSignalDedupeThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('signalDedupeThreshold');
    return saved ? parseInt(saved, 10) : 50;
  });
  
  // Track signal history for deduplication - bounded to 1000 entries
  const [signalHistory, setSignalHistory] = useState<BoundedMap<string, SignalHistoryEntry>>(() => {
    const saved = localStorage.getItem('signalHistory');
    let existingMap: Map<string, SignalHistoryEntry> | undefined;
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        existingMap = new Map(Object.entries(parsed));
      } catch {
        console.warn('Failed to parse saved signal history');
      }
    }
    
    // Create bounded map with 1000 entry limit and LRU eviction
    return createBoundedMap(existingMap, 1000, 'LRU');
  });

  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [multiTraderEnabled, setMultiTraderEnabled] = useState<boolean>(true);
  const [isMarketAnalysisLoading, setIsMarketAnalysisLoading] = useState<boolean>(false);
  const [isSymbolAnalysisLoading, setIsSymbolAnalysisLoading] = useState<boolean>(false);
  
  
  const [statusText, setStatusText] = useState<string>('Connecting...');
  const [statusLightClass, setStatusLightClass] = useState<string>('bg-[var(--nt-text-muted)]');
  
  const [selectedSymbolForChart, setSelectedSymbolForChart] = useState<string | null>(null);
  const [selectedSignalTraderId, setSelectedSignalTraderId] = useState<string | null>(null);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalContent, setModalContent] = useState<React.ReactNode>('');
  
  // Activity panel state
  const [isActivityPanelOpen, setIsActivityPanelOpen] = useState<boolean>(true); // Always open
  const [showDataMockup, setShowDataMockup] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(window.innerWidth < 768);
  
  // Historical signals state
  const [historicalSignals, setHistoricalSignals] = useState<HistoricalSignal[]>([]);
  const [isHistoricalScanRunning, setIsHistoricalScanRunning] = useState<boolean>(false);
  const [historicalScanConfig, setHistoricalScanConfig] = useState<HistoricalScanConfig>({
    lookbackBars: 20,
    scanInterval: 1, // Fixed to check every bar
    maxSignalsPerSymbol: 5,
    includeIndicatorSnapshots: false,
  });

  // Connection status for server-side execution
  const connectionStatus = useConnectionStatus();

  // Kline history limits configuration
  const [klineHistoryConfig, setKlineHistoryConfig] = useState<KlineHistoryConfig>(() => {
    const saved = localStorage.getItem('klineHistoryConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Ensure aiAnalysisLimit exists with default
        return {
          screenerLimit: parsed.screenerLimit || KLINE_HISTORY_LIMIT,
          analysisLimit: parsed.analysisLimit || KLINE_HISTORY_LIMIT_FOR_ANALYSIS,
          aiAnalysisLimit: parsed.aiAnalysisLimit || 100
        };
      } catch {
        return {
          screenerLimit: KLINE_HISTORY_LIMIT,
          analysisLimit: KLINE_HISTORY_LIMIT_FOR_ANALYSIS,
          aiAnalysisLimit: 100
        };
      }
    }
    return {
      screenerLimit: KLINE_HISTORY_LIMIT,
      analysisLimit: KLINE_HISTORY_LIMIT_FOR_ANALYSIS,
      aiAnalysisLimit: 100
    };
  });

  const internalGeminiModelName = useMemo(() => {
    return GEMINI_MODELS.find(m => m.value === selectedGeminiModel)?.internalModel || GEMINI_MODELS[0].internalModel;
  }, [selectedGeminiModel]);
  
  // Track kline updates for bar counting with size limit
  const klineUpdateCountRef = React.useRef<LimitedMap<string, number>>(new LimitedMap(200)); // Limit to 200 symbols
  
  // Auth state
  const { user, loading: authLoading } = useAuth();
  
  // Indicator calculation hook
  const { calculateIndicators } = useIndicatorWorker();
  
  // Data update tracking for StatusBar
  const dataUpdateCallbackRef = useRef<(() => void) | null>(null);
  
  // Initialize performance monitoring
  useEffect(() => {
    performanceMonitor.start((metrics) => {
      // Optional: send to analytics service in production
      if (process.env.NODE_ENV === 'production') {
        // analyticsService.track('performance_metrics', metrics);
      }
    });

    return () => {
      performanceMonitor.stop();
    };
  }, []);

  // MIGRATION: Removed UpdateBatcher - now using MarketDataContext
  // Ticker updates now handled through server-side data flow
  // This reduces re-renders and improves performance
  
  // Register memory monitoring metrics
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Register custom metrics to track data structure sizes
      memoryMonitor.registerMetric('tickersSize', () => tickers.size);
      // Removed SharedMarketData metric - using server-side execution
      memoryMonitor.registerMetric('signalLogSize', () => signalLog.length);
      memoryMonitor.registerMetric('signalHistorySize', () => signalHistory.size);
      memoryMonitor.registerMetric('klineUpdateCountSize', () => klineUpdateCountRef.current.size);
      memoryMonitor.registerMetric('wsConnections', () => webSocketManager.getStats().activeConnections);
      
      // console.log('[App] Memory monitoring metrics registered');
    }
  }, [tickers, signalLog, signalHistory]);
  
  // Initialize workflow and trading managers
  useEffect(() => {
    if (user && !authLoading) {
      // Initialize workflow manager
      workflowManager.initialize().catch(error => {
        console.error('[WorkflowManager] Initialization error:', error);
      });
      
      // Initialize trading manager
      tradingManager.initialize().catch(error => {
        console.error('[TradingManager] Initialization error:', error);
      });
    }
    
    return () => {
      // Cleanup on unmount
      tradingManager.shutdown().catch(error => {
        console.error('[TradingManager] Shutdown error:', error);
      });
      workflowManager.shutdown();
    };
  }, [user, authLoading]);
  
  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Use refs to avoid stale closures
  const tickersRef = useRef(tickers);
  const tradersRef = useRef(traders);
  
  // Update refs when state changes
  useEffect(() => {
    tickersRef.current = tickers;
  }, [tickers]);
  
  
  useEffect(() => {
    tradersRef.current = traders;
  }, [traders]);
  
  // Stable trader update function to prevent unnecessary re-renders
  const updateTraders = useCallback((newTraders: Trader[]) => {
    if (!areTraderArraysEqual(tradersRef.current, newTraders)) {
      console.log('[App] Traders actually changed, updating state');
      tradersRef.current = newTraders;
      setTraders(newTraders);
    } else {
      console.log('[App] Traders unchanged, skipping state update');
    }
  }, []);
  
  // Signal lifecycle hook
  const { 
    signals: enhancedSignals,
    createSignalFromFilter,
    analyzeSignal,
    startMonitoring,
    stopMonitoring,
    isMonitoring 
  } = useSignalLifecycle({
    activeStrategy,
    autoAnalyze: currentTier === 'elite', // Only auto-analyze for Elite tier
    autoMonitor: currentTier === 'elite', // Only auto-monitor for Elite tier
    modelName: 'gemini-2.5-flash', // Default model if trader doesn't specify
    calculateIndicators,
    aiAnalysisLimit: klineHistoryConfig.aiAnalysisLimit,
    getMarketData: (symbol: string, traderId?: string) => {
      const ticker = tickersRef.current.get(symbol);
      if (!ticker) return null;
      
      // Determine which interval to use
      let interval: KlineInterval = KlineInterval.ONE_MINUTE; // Default
      
      // If traderId provided, use trader's interval
      if (traderId) {
        const trader = tradersRef.current.find(t => t.id === traderId);
        if (trader?.filter?.interval) {
          interval = trader.filter.interval as KlineInterval;
        }
      }
      
      // REMOVED: sharedMarketData.getKlines - will be replaced with server data
      const klines: any[] = [];
      if (!klines || klines.length === 0) {
        // Fallback to 1m if specific interval has no data
        const fallbackKlines: any[] = [];
        if (!fallbackKlines || fallbackKlines.length === 0) {
          return null;
        }
        return { ticker, klines: fallbackKlines };
      }
      return { ticker, klines };
    },
    onAnalysisComplete: (signalId: string, analysis: AnalysisResult) => {
      // Update the signal log with analysis results
      setSignalLog(prevLog => {
        return prevLog.map(entry => {
          // Find matching entry by symbol and approximate time
          const signal = signalManager.getSignal(signalId);
          if (signal && entry.symbol === signal.symbol && 
              Math.abs(entry.timestamp - signal.createdAt.getTime()) < 5000) { // Within 5 seconds
            return {
              ...entry,
              tradeDecision: analysis.decision === 'buy' ? 'BUY' : 
                            analysis.decision === 'sell' ? 'SELL' :
                            analysis.decision === 'hold' ? 'HOLD' : 'WAIT',
              reasoning: analysis.reasoning,
              tradePlan: analysis.tradePlan ? 
                `Entry: ${analysis.tradePlan.entry}, SL: ${analysis.tradePlan.stopLoss}, TP: ${analysis.tradePlan.takeProfit}` : 
                undefined,
              fullAnalysis: JSON.stringify(analysis),
            };
          }
          return entry;
        });
      });
    },
  });

  // REMOVED: Historical scanner - migrating to server-side execution
  /* const {
    isScanning: isHistoricalScanning,
    progress: historicalScanProgress,
    signals: historicalScanResults,
    error: historicalScanError,
    startScan: startHistoricalScan,
    cancelScan: cancelHistoricalScan,
    clearSignals: clearHistoricalSignals,
  } = useHistoricalScanner({
    symbols: allSymbols,
    tickers,
    filterCode: '',
    filterDescription: [],
    klineInterval,
    signalDedupeThreshold,
  });

  // Update historical signals when scan completes
  useEffect(() => {
    if (historicalScanResults.length > 0) {
      setHistoricalSignals(historicalScanResults);
    }
  }, [historicalScanResults]); */
  // Placeholder variables for now
  const isHistoricalScanning = false;
  const historicalScanProgress = null;
  const historicalScanError = null;
  const startHistoricalScan = () => {};
  const cancelHistoricalScan = () => {};
  const clearHistoricalSignals = () => {};


  // Subscribe to traders
  useEffect(() => {
    const unsubscribe = traderManager.subscribe((updatedTraders) => {
      // Traders updated
      console.log('[App] Traders updated from manager:', updatedTraders.length, 'traders');
      updatedTraders.forEach(t => {
        console.log(`[App] Trader ${t.name}: enabled=${t.enabled}, hasFilter=${!!t.filter}, hasFilterCode=${!!t.filter?.code}, filterCodeLength=${t.filter?.code?.length || 0}`);
      });
      updateTraders(updatedTraders);
    });
    
    // Initial load
    traderManager.getTraders().then((traders) => {
      console.log('[App] Initial traders loaded:', traders.length, 'traders');
      traders.forEach(t => {
        console.log(`[App] Trader ${t.name}: enabled=${t.enabled}, hasFilter=${!!t.filter}, hasFilterCode=${!!t.filter?.code}, filterCodeLength=${t.filter?.code?.length || 0}`);
      });
      updateTraders(traders);
    });
    
    return unsubscribe;
  }, [updateTraders]);

  // REMOVED: Multi-trader historical scanner - migrating to server-side execution
  /* const {
    isScanning: isMultiTraderHistoricalScanning,
    progress: multiTraderHistoricalProgress,
    signals: multiTraderHistoricalSignals,
    error: multiTraderHistoricalError,
    startScan: startMultiTraderHistoricalScan,
    cancelScan: cancelMultiTraderHistoricalScan,
    clearSignals: clearMultiTraderHistoricalSignals,
  } = useMultiTraderHistoricalScanner({
    traders,
    symbols: allSymbols,
    tickers,
    klineInterval,
    signalDedupeThreshold,
  });

  // Update historical signals from multi-trader scan
  useEffect(() => {
    if (multiTraderHistoricalSignals.length > 0) {
      setHistoricalSignals(multiTraderHistoricalSignals);
    }
  }, [multiTraderHistoricalSignals]); */
  // Placeholder variables for multi-trader historical scanner
  const isMultiTraderHistoricalScanning = false;
  const multiTraderHistoricalProgress = null;
  const multiTraderHistoricalError = null;
  const startMultiTraderHistoricalScan = () => {};
  const cancelMultiTraderHistoricalScan = () => {};
  const clearMultiTraderHistoricalSignals = () => {};

  // Multi-trader screener will be initialized after handleNewSignal is defined

  // Initialize server execution service
  useEffect(() => {
    console.log('[App] Initializing server execution service');
    serverExecutionService.initializeRealtime()
      .then(() => {
        console.log('[App] Server execution service initialized successfully');
      })
      .catch((error) => {
        console.error('[App] Failed to initialize server execution service:', error);
      });

    return () => {
      console.log('[App] Cleaning up server execution service');
      // Service cleanup happens automatically
    };
  }, []);

  // Save kline history config to localStorage
  useEffect(() => {
    localStorage.setItem('klineHistoryConfig', JSON.stringify(klineHistoryConfig));
  }, [klineHistoryConfig]);
  
  // Set up memory cleanup
  useEffect(() => {
    const cleanup = startMemoryCleanup(
      () => {
        // Get active symbols
        const recentSignalSymbols = new Set(
          enhancedSignals.slice(0, 20).map(s => s.symbol)
        );
        const selectedSymbols = new Set<string>();
        if (selectedSymbolForChart) selectedSymbols.add(selectedSymbolForChart);
        
        const activeSymbols = getActiveSymbols(
          tickersRef.current,
          recentSignalSymbols,
          selectedSymbols
        );
        
        return {
          tickers: tickersRef.current,
          activeSymbols,
          prioritySymbols: selectedSymbols
        };
      },
      (state) => {
        if (state.tickers) setTickers(state.tickers);
      },
      30000 // Clean up every 30 seconds
    );
    
    return cleanup;
  }, [enhancedSignals, selectedSymbolForChart]);
  
  
  const loadInitialData = useCallback(async (klineLimit: number) => {
    setInitialLoading(true);
    setInitialError(null);
    setStatusText('Fetching initial data...');
    setSelectedSymbolForChart(null);
    setSignalLog([]); // Clear signal log on new data load

    try {
      
      // Determine which intervals are needed by active traders
      const activeIntervals = new Set<KlineInterval>();
      const currentTraders = tradersRef.current; // Use ref to get current traders
      currentTraders.forEach(trader => {
        if (trader.enabled && trader.filter) {
          
          // Add the refresh interval
          const refreshInterval = trader.filter.interval || trader.filter.refreshInterval || KlineInterval.ONE_MINUTE;
          activeIntervals.add(refreshInterval);
          
          // Add all required timeframes
          if (trader.filter.requiredTimeframes) {
            trader.filter.requiredTimeframes.forEach(tf => activeIntervals.add(tf));
          }
        }
      });
      
      // Always include 1m as default/fallback
      activeIntervals.add(KlineInterval.ONE_MINUTE);
      
      
      // First, fetch top pairs and tickers
      const { symbols, tickers: initialTickers, klinesData: oneMinuteData } = await fetchTopPairsAndInitialKlines(KlineInterval.ONE_MINUTE, klineLimit);
      setAllSymbols(symbols);
      setTickers(initialTickers);
      
      // Initialize multi-interval data structure
      const multiIntervalData = new Map<string, Map<KlineInterval, Kline[]>>();
      
      // Add 1-minute data
      oneMinuteData.forEach((klines, symbol) => {
        if (!multiIntervalData.has(symbol)) {
          multiIntervalData.set(symbol, new Map());
        }
        multiIntervalData.get(symbol)!.set(KlineInterval.ONE_MINUTE, klines);
      });
      
      // Fetch data for other intervals if needed - reuse symbols from first call
      const otherIntervals = Array.from(activeIntervals).filter(interval => interval !== KlineInterval.ONE_MINUTE);
      
      // Fetch klines for other intervals using the same symbols from the first call
      for (const interval of otherIntervals) {
        console.log(`Fetching data for interval: ${interval}`);
        
        // Fetch klines for each symbol individually for this interval
        const intervalPromises = symbols.map(async (symbol) => {
          try {
            const klineResponse = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${klineLimit}`);
            if (!klineResponse.ok) {
              console.warn(`Failed to fetch klines for ${symbol} (${interval}). Status: ${klineResponse.status}`);
              return null;
            }
            const klines: Kline[] = await klineResponse.json();
            return { symbol, klines };
          } catch (e) {
            console.warn(`Error fetching klines for ${symbol} (${interval}):`, e);
            return null;
          }
        });
        
        const results = await Promise.all(intervalPromises);
        
        // Merge successful results into multiIntervalData
        results.forEach(result => {
          if (result && result.klines) {
            if (!multiIntervalData.has(result.symbol)) {
              multiIntervalData.set(result.symbol, new Map());
            }
            multiIntervalData.get(result.symbol)!.set(interval, result.klines);
          }
        });
      }
      
      console.log('[InitialData] Loading klines into SharedMarketData:', {
        totalSymbols: multiIntervalData.size,
        symbols: Array.from(multiIntervalData.keys()).slice(0, 5),
        intervalsPerSymbol: Array.from(multiIntervalData.values())[0]?.size || 0
      });
      
      multiIntervalData.forEach((intervalMap, symbol) => {
        intervalMap.forEach((klines, interval) => {
          if (klines.length > 0) {
            const firstTime = new Date(klines[0][0]).toISOString();
            const lastTime = new Date(klines[klines.length - 1][0]).toISOString();
            
            // Log if data is old
            const lastKlineAge = (Date.now() - klines[klines.length - 1][0]) / 60000;
            if (lastKlineAge > 10) {
              console.warn(`[InitialData] Old kline data for ${symbol}:${interval}`, {
                firstTime,
                lastTime,
                klineCount: klines.length,
                ageMinutes: lastKlineAge.toFixed(1)
              });
            }
          }
          // Batch update all klines for this symbol-interval
          // REMOVED: sharedMarketData.updateKlines - will be replaced with server data
        });
      });
      
      // Emit events for all loaded data
      multiIntervalData.forEach((intervalMap, symbol) => {
        intervalMap.forEach((_, interval) => {
          klineEventEmitter.emit(symbol, interval);
        });
      });
    } catch (error) {
      console.error("[StatusBar Debug] Error fetching initial data:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      console.error("[StatusBar Debug] Error details:", {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : 'No stack trace',
        type: error?.constructor?.name || 'Unknown'
      });
      setInitialError(`Failed to load initial market data: ${errorMessage}`);
      setAllSymbols([]);
      setTickers(new Map());
      setStatusText('Error');
      setStatusLightClass('bg-[var(--nt-error)]');
    } finally {
      setInitialLoading(false);
    }
  }, []); // No dependencies needed since we use tradersRef

  // Create a stable key that only changes when trader intervals or enabled state changes
  const traderIntervalsKey = useMemo(() => {
    return traders
      .filter(t => t.enabled)
      .map(t => {
        const intervals = t.filter?.requiredTimeframes || [t.filter?.interval || t.filter?.refreshInterval || '1m'];
        return `${t.id}:${intervals.sort().join('+')}`;
      })
      .sort()
      .join(',');
  }, [traders]);

  useEffect(() => {
    // Always load initial market data, regardless of traders
    loadInitialData(klineHistoryConfig.screenerLimit);
  }, [loadInitialData, klineHistoryConfig.screenerLimit, traderIntervalsKey]); // Only reload when intervals actually change
  
  // Persist signal deduplication threshold to localStorage
  useEffect(() => {
    localStorage.setItem('signalDedupeThreshold', signalDedupeThreshold.toString());
  }, [signalDedupeThreshold]);

  // Clear historical signals when selected trader changes
  useEffect(() => {
    if (clearMultiTraderHistoricalSignals) {
      clearMultiTraderHistoricalSignals();
    }
    if (clearHistoricalSignals) {
      clearHistoricalSignals();
    }
  }, [selectedTraderId, clearMultiTraderHistoricalSignals, clearHistoricalSignals]);
  
  // Persist signal history to localStorage with size check
  useEffect(() => {
    try {
      // Convert BoundedMap entries to array and limit to last 500 for localStorage
      const entries = Array.from(signalHistory.entries()).slice(-500);
      const historyObj = Object.fromEntries(entries);
      const json = JSON.stringify(historyObj);
      
      // Check size before saving (localStorage typically has 5-10MB limit)
      if (json.length < 2 * 1024 * 1024) { // 2MB limit for safety
        localStorage.setItem('signalHistory', json);
      } else {
        console.warn('Signal history too large for localStorage, truncating');
        const truncated = Object.fromEntries(entries.slice(-250));
        localStorage.setItem('signalHistory', JSON.stringify(truncated));
      }
    } catch (error) {
      console.error('Failed to persist signal history:', error);
    }
  }, [signalHistory]);

  // Cleanup old signals and trades periodically
  useEffect(() => {
    // Run cleanup every 5 minutes
    const cleanupInterval = setInterval(() => {
      // Clean up signals older than 1 hour
      signalManager.cleanupOldSignals(60 * 60 * 1000);
      // Clean up closed trades older than 24 hours
      tradeManager.cleanupOldTrades(24 * 60 * 60 * 1000);
    }, 5 * 60 * 1000);

    // Run initial cleanup
    signalManager.cleanupOldSignals(60 * 60 * 1000);
    tradeManager.cleanupOldTrades(24 * 60 * 60 * 1000);

    return () => clearInterval(cleanupInterval);
  }, []);

  // Periodic cleanup of app data structures to prevent memory leaks
  useEffect(() => {
    const dataCleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxSignalHistoryAge = 24 * 60 * 60 * 1000; // 24 hours
      const maxSignalLogAge = 12 * 60 * 60 * 1000; // 12 hours
      
      
      // Clean signal history - BoundedMap handles size limits automatically
      setSignalHistory(prev => {
        // BoundedMap doesn't have lastSignalTime property in SignalHistoryEntry
        // Instead, use timestamp from entry
        const toRemove: string[] = [];
        prev.forEach((entry, symbol) => {
          if (now - entry.timestamp > maxSignalHistoryAge) {
            toRemove.push(symbol);
          }
        });
        
        // Remove old entries
        toRemove.forEach(symbol => prev.delete(symbol));
        
        if (toRemove.length > 0) {
          console.log(`[App] Cleaned ${toRemove.length} old signal history entries`);
        }
        
        // Force React update by returning new BoundedMap instance
        return prev;
      });
      
      // Clean signal log
      setSignalLog(prev => {
        const filtered = prev.filter(entry => now - entry.timestamp < maxSignalLogAge);
        if (filtered.length < prev.length) {
          // console.log(`[App] Cleaned ${prev.length - filtered.length} old signal log entries`);
        }
        return filtered.slice(-MAX_SIGNAL_LOG_ENTRIES); // Also enforce max entries
      });
      
      // Clean historical signals
      setHistoricalSignals(prev => {
        const maxHistoricalAge = 4 * 60 * 60 * 1000; // 4 hours
        const filtered = prev.filter(signal => now - signal.detectedAt < maxHistoricalAge);
        if (filtered.length < prev.length) {
          // console.log(`[App] Cleaned ${prev.length - filtered.length} old historical signals`);
        }
        return filtered.slice(-1000); // Keep max 1000 historical signals
      });
      
      // Log memory stats
      if (process.env.NODE_ENV === 'development') {
        const stats = memoryMonitor.getStatus();
        if (stats && stats.current.heapUsagePercent > 0.7) {
          console.warn('[App] High memory usage detected:', stats.formattedUsage);
        }
      }
    }, 60000); // Run every minute
    
    return () => clearInterval(dataCleanupInterval);
  }, []);

  // Create stable handlers using useCallback
  const handleTickerUpdateStable = useCallback((tickerUpdate: Ticker) => {
    // Direct callback for immediate tracking
    if (dataUpdateCallbackRef.current) {
      dataUpdateCallbackRef.current();
    }

    // MIGRATION: Direct update without batching (server already batches)
    setTickers(prevTickers => {
      // Only create new Map if the value actually changed
      const currentTicker = prevTickers.get(tickerUpdate.s);
      if (currentTicker &&
          currentTicker.c === tickerUpdate.c &&
          currentTicker.P === tickerUpdate.P &&
          currentTicker.q === tickerUpdate.q) {
        return prevTickers; // No change, return same reference
      }
      // Value changed, create new Map
      const newTickers = new Map(prevTickers);
      // Add timestamp for memory cleanup tracking
      const tickerWithTimestamp = {
        ...tickerUpdate,
        _lastUpdate: Date.now()
      };
      newTickers.set(tickerUpdate.s, tickerWithTimestamp);
      return newTickers;
    });
  }, []);
  
  // Update trading manager with ticker data for demo mode
  useEffect(() => {
    tradingManager.updateMarketPrices(tickers);
  }, [tickers]);

  // Debug: Track symbols with old data (one-time check per symbol)
  const checkedSymbols = useRef(new Set<string>());
  
  const handleKlineUpdateStable = useCallback((symbol: string, interval: KlineInterval, kline: Kline, isClosed: boolean) => {
    // One-time check per symbol for missing data
    if (interval === KlineInterval.ONE_MINUTE && !checkedSymbols.current.has(symbol)) {
      checkedSymbols.current.add(symbol);
      const now = Date.now();
      const klineTime = kline[0];
      const ageMinutes = (now - klineTime) / 60000;
      
      if (ageMinutes > 60) {
        console.warn(`[MissingData] Symbol ${symbol} has old data: ${ageMinutes.toFixed(0)} minutes behind`);
      }
    }
    
    // Emit candle close event for workflows
    if (isClosed) {
      klineEventBus.emit(symbol, interval, kline).catch(error => {
        console.error('[KlineEventBus] Error emitting event:', error);
      });
    }
    
    // Track bar counts for signal deduplication (only for 1m interval)
    if (isClosed && interval === KlineInterval.ONE_MINUTE) {
      const currentCount = klineUpdateCountRef.current.get(symbol) || 0;
      klineUpdateCountRef.current.set(symbol, currentCount + 1);
      
      // Increment bar counts in signal history
      setSignalHistory(prev => {
        const entry = prev.get(symbol);
        if (entry) {
          // Update the existing entry - BoundedMap handles in place
          prev.set(symbol, {
            ...entry,
            barCount: entry.barCount + 1
          });
        }
        return prev; // Return same instance for React update
      });
    }
    
    // Update signal and trade managers with current price (use 1m interval for real-time price)
    if (interval === KlineInterval.ONE_MINUTE) {
      const currentPrice = parseFloat(kline[4]); // Close price
      signalManager.updatePrice(symbol, currentPrice);
      tradeManager.updatePrice(symbol, currentPrice);
    }
    
    // REMOVED: sharedMarketData.updateKline - will be replaced with server data
    
    // Emit lightweight event for UI updates
    klineEventEmitter.emit(symbol, interval);
    
    // Track memory after update (for debugging)
    if (process.env.NODE_ENV === 'development') {
      memDebug.takeSnapshot('After kline update', { 
        symbol, 
        interval,
        sharedDataStats: null // REMOVED: sharedMarketData.getMemoryStats
      });
    }
  }, []);

  // MIGRATION: Replace WebSocket with server-side data flow
  useEffect(() => {
    if (allSymbols.length === 0) {
      return;
    }

    const subscriptions: Array<() => void> = [];
    let isActive = true;

    // Determine which intervals are needed by active traders
    const activeIntervals = new Set<KlineInterval>();
    traders.forEach(trader => {
      if (trader.enabled) {
        const requiredTimeframes = trader.filter?.requiredTimeframes || [trader.filter?.refreshInterval || KlineInterval.ONE_MINUTE];
        requiredTimeframes.forEach(tf => activeIntervals.add(tf));
      }
    });

    // Always include 1m as default/fallback
    activeIntervals.add(KlineInterval.ONE_MINUTE);

    // Fetch initial data and subscribe to updates for each symbol
    const setupDataSubscriptions = async () => {
      try {
        setStatusText('Loading');
        setStatusLightClass('bg-[var(--nt-warning)]');

        // Fetch initial data for all symbols
        await Promise.all(
          allSymbols.map(symbol =>
            Array.from(activeIntervals).map(interval =>
              klineDataService.fetchKlines({
                symbol,
                timeframe: interval,
                limit: 100
              })
            )
          ).flat()
        );

        if (!isActive) return;

        // Subscribe to real-time updates
        allSymbols.forEach(symbol => {
          activeIntervals.forEach(interval => {
            const unsubscribe = klineDataService.subscribeToUpdates(
              symbol,
              interval,
              (update) => {
                if (isActive) {
                  // Handle kline update
                  handleKlineUpdateStable(
                    update.symbol,
                    update.timeframe as KlineInterval,
                    update.kline,
                    update.type === 'close'
                  );

                  // Update ticker from kline close price
                  if (update.type === 'close' || update.type === 'update') {
                    const ticker: Ticker = {
                      s: update.symbol,
                      c: update.kline.close,
                      P: '0', // Calculate if needed
                      q: update.kline.quoteVolume
                    };
                    handleTickerUpdateStable(ticker);
                  }
                }
              }
            );
            subscriptions.push(unsubscribe);
          });
        });

        setStatusText('Live');
        setStatusLightClass('bg-[var(--nt-success)]');

      } catch (error) {
        console.error('[App] Failed to setup data subscriptions:', error);
        setStatusText('Data Error');
        setStatusLightClass('bg-[var(--nt-error)]');
      }
    };

    // Start with a small delay to avoid React StrictMode issues
    const timer = setTimeout(setupDataSubscriptions, 500);

    return () => {
      isActive = false;
      clearTimeout(timer);
      subscriptions.forEach(unsub => unsub());
    };
  }, [allSymbols, traderIntervalsKey, handleTickerUpdateStable, handleKlineUpdateStable]); 


  // Multi-trader screener hook
  // REMOVED: handleMultiTraderResults - migrating to server-side execution
  /* const handleMultiTraderResults = useCallback((results: TraderResult[]) => {
    results.forEach(result => {
      
      result.signalSymbols.forEach(symbol => {
        const ticker = tickers.get(symbol);
        if (!ticker) {
          return;
        }
        
        const currentTimestamp = Date.now();
        
        // Check signal history for deduplication BEFORE creating any signal
        const historyEntry = signalHistory.get(symbol);
        
        // Calculate time-based deduplication threshold
        const klineIntervalMinutes = {
          '1m': 1,
          '5m': 5,
          '15m': 15,
          '1h': 60,
          '4h': 240,
          '1d': 1440,
        }[klineInterval] || 5;
        
        const minTimeBetweenSignals = klineIntervalMinutes * signalDedupeThreshold * 60 * 1000;
        const timeSinceLastSignal = historyEntry ? currentTimestamp - historyEntry.timestamp : Infinity;
        
        // Use both bar count and time-based deduplication
        const shouldCreateNewSignal = !historyEntry || 
                                     historyEntry.barCount >= signalDedupeThreshold || 
                                     timeSinceLastSignal >= minTimeBetweenSignals;
        
        // Deduplication check performed
        
        if (shouldCreateNewSignal) {
          // Create signal with trader attribution
          const trader = traders.find(t => t.id === result.traderId);
          const filterResult = {
            symbol,
            price: parseFloat(ticker.c),
            change24h: parseFloat(ticker.P),
            volume24h: parseFloat(ticker.q),
            matchedConditions: [`Trader: ${trader?.name || 'Unknown'}`]
          };
          
          // Creating signal with interval info from trader
          const interval = trader?.filter?.interval || KlineInterval.ONE_MINUTE;
          const signal = createSignalFromFilter(filterResult, result.traderId, interval);
          
          // Update signal history - reset bar count for new signal
          setSignalHistory(prev => {
            prev.set(symbol, {
              timestamp: currentTimestamp,
              barCount: 0,
            });
            return prev; // Return same instance for React update
          });
          
          // Update signal log
          setSignalLog(prevLog => {
            const traderName = traders.find(t => t.id === result.traderId)?.name || 'Unknown';
            const newEntry: SignalLogEntry = {
              timestamp: currentTimestamp,
              symbol,
              interval: klineInterval,
              filterDesc: `Trader: ${traderName}`,
              priceAtSignal: parseFloat(ticker.c),
              changePercentAtSignal: parseFloat(ticker.P),
              volumeAtSignal: parseFloat(ticker.q),
              count: 1,
            };
            
            // Keep limited log entries to prevent memory growth
            return [newEntry, ...prevLog.slice(0, MAX_SIGNAL_LOG_ENTRIES - 1)];
          });
          
          // Update trader metrics
          traderManager.incrementSignalCount(result.traderId);
        } else {
          // Skipping duplicate signal
        }
      });
    });
  }, [traders, tickers, activeStrategy, klineInterval, signalHistory, signalDedupeThreshold, createSignalFromFilter]); */

  const screenerEnabled = multiTraderEnabled && traders.some(t => t.enabled);
  // console.log(`[SIGNAL_DEBUG ${new Date().toISOString()}] Multi-trader screener status:`, {
  //   screenerEnabled,
  //   multiTraderEnabled,
  //   totalTraders: traders.length,
  //   enabledTraders: traders.filter(t => t.enabled).length,
  //   traders: traders.map(t => ({ id: t.id, name: t.name, enabled: t.enabled }))
  // });
  
  
  // Server-side signal subscription
  const { clearTraderCache } = useServerSignals({
    traders,
    onResults: (signals) => {
      console.log('[App] Received server signals:', signals);
      // Process server signals through signal manager
      signals.forEach(signal => {
        if (signal.symbols && signal.symbols.length > 0) {
          // Convert server signal format to expected format
          signal.symbols.forEach(symbol => {
            const ticker = tickers.get(symbol);
            if (ticker) {
              const trader = traders.find(t => t.id === signal.trader_id);
              if (trader) {
                console.log(`[App] Creating signal for ${symbol} from trader ${trader.name}`);
                createSignalFromFilter({
                  symbol,
                  price: parseFloat(ticker.c),
                  change: parseFloat(ticker.P),
                  volume: parseFloat(ticker.q),
                  filterDesc: trader.filter.description || [`Trader: ${trader.name}`],
                  trader
                });
              }
            }
          });
        }
      });
    },
    enabled: screenerEnabled
  });
  
  const performanceMetrics = null;
  
  
  // Log performance metrics only on significant changes (throttled)
  useEffect(() => {
    if (!performanceMetrics) return;
    
    let lastLogTime = 0;
    const LOG_INTERVAL = 10000; // Log at most once every 10 seconds
    
  }, [performanceMetrics]);

  useEffect(() => {
    const unsubscribe = traderManager.subscribeToDeletes((traderId) => {
      console.log(`[App] Trader ${traderId} deleted, clearing worker cache`);
      clearTraderCache(traderId);
    });

    return unsubscribe;
  }, [clearTraderCache]);

  const handleRunHistoricalScan = () => {
    // Only run historical scan when a trader is selected
    if (selectedTraderId) {
      // Use multi-trader scanner with only the selected trader
      if (multiTraderEnabled && traders.some(t => t.id === selectedTraderId && t.enabled)) {
        startMultiTraderHistoricalScan(historicalScanConfig);
      }
    }
  };

  
  const handleAnalyzeMarket = useCallback(async () => {
    setIsMarketAnalysisLoading(true);
    setModalTitle('📊 AI Market Analysis');
    setModalContent(<div className="text-center py-4"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--nt-accent-lime)] mx-auto"></div><p className="mt-2">Generating analysis...</p></div>);
    setIsModalOpen(true);

    try {
        const topTickersList = Array.from(tickers.values()).sort((a,b) => parseFloat(b.q) - parseFloat(a.q)).slice(0,10);
        const analysisText = await getMarketAnalysis(topTickersList, internalGeminiModelName, klineInterval);
        setModalContent(<div className="whitespace-pre-wrap text-sm md:text-base">{analysisText}</div>);
    } catch (error) {
        console.error("Market Analysis error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to get market analysis.";
        setModalContent(<p className="text-[var(--nt-error)]">{errorMessage}</p>);
    } finally {
        setIsMarketAnalysisLoading(false);
    }
  }, [tickers, internalGeminiModelName, klineInterval]);

  const handleAiInfoClick = useCallback(async (symbol: string, event: React.MouseEvent) => {
    event.stopPropagation(); 
    setIsSymbolAnalysisLoading(true); 
    setModalTitle(`✨ AI Analysis for ${symbol}`);
    setModalContent(<div className="text-center py-4"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--nt-accent-lime)] mx-auto"></div><p className="mt-2">Generating analysis for {symbol}...</p></div>);
    setIsModalOpen(true);

    const tickerData = tickers.get(symbol);
    const klineData = new Map<KlineInterval, Kline[]>();
    ['1m', '5m', '15m', '1h', '4h', '1d'].forEach((interval) => {
      // REMOVED: sharedMarketData.getKlines - will be replaced with server data
      const klines: any[] = [];
      if (klines.length > 0) {
        klineData.set(interval as KlineInterval, klines);
      }
    });

    if (!tickerData || !klineData) {
        setModalContent(<p className="text-[var(--nt-error)]">Data not available for {symbol}.</p>);
        setIsSymbolAnalysisLoading(false);
        return;
    }

    try {
        const analysisText = await getSymbolAnalysis(symbol, tickerData, klineData, null, internalGeminiModelName, klineInterval, klineHistoryConfig.analysisLimit, null);
        
        setModalContent(<div className="whitespace-pre-wrap text-sm md:text-base">{analysisText}</div>);
    } catch (error) {
        console.error(`Symbol Analysis error for ${symbol}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Failed to get analysis.";
        setModalContent(<p className="text-[var(--nt-error)]">{errorMessage}</p>);
    } finally {
        setIsSymbolAnalysisLoading(false);
    }
  }, [tickers, internalGeminiModelName, klineInterval]);


  const handleRowClick = (symbol: string, traderId?: string, signalId?: string) => {
    setSelectedSymbolForChart(symbol);
    setSelectedSignalTraderId(traderId || null);
    setSelectedSignalId(signalId || null);
  };
  
  
  // Use selected trader's indicators if available, otherwise use AI screener indicators
  const chartConfigForDisplay = useMemo(() => {
    if (!selectedSymbolForChart) return null;
    
    // First check if a specific signal's trader was clicked
    if (selectedSignalTraderId) {
      const signalTrader = traders.find(t => t.id === selectedSignalTraderId);
      if (signalTrader?.filter?.indicators) {
        return signalTrader.filter.indicators;
      }
    }
    
    // Then check if a trader filter is selected
    if (selectedTraderId) {
      const selectedTrader = traders.find(t => t.id === selectedTraderId);
      // Selected trader indicators check
      if (selectedTrader?.filter?.indicators) {
        return selectedTrader.filter.indicators;
      }
    }
    
    // No indicators configured
    return null;
  }, [selectedSymbolForChart, selectedSignalTraderId, selectedTraderId, traders]);


  // Get signals and trades for activity panel
  const allSignals = signalManager.getSignals();
  const allTrades = tradeManager.getTrades();
  
  // Calculate active signal count
  const activeSignalCount = allSignals.filter(signal => signal.status === 'active').length;

  // Add mockup toggle to keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Alt + M to toggle mockup
      if (e.altKey && e.key === 'm') {
        setShowDataMockup(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Show mockup if enabled
  if (showDataMockup) {
    return (
      <div className="min-h-screen bg-gray-900">
        <div className="absolute top-4 right-4 z-50">
          <button
            onClick={() => setShowDataMockup(false)}
            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Back to App (Alt+M)
          </button>
        </div>
        <DataLoadingMockup />
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-screen relative">
      {/* Connection Status Indicator */}
      <div className="absolute top-2 right-2 z-50 flex gap-2">
        <button
          onClick={() => setShowDataMockup(true)}
          className="px-3 py-1 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 transition-colors"
          title="View Data Loading Mockup (Alt+M)"
        >
          📊 Mockup
        </button>
        <ConnectionStatus />
      </div>
      <Sidebar
        onSelectedTraderChange={setSelectedTraderId}
        tickerCount={tickers.size}
        symbolCount={allSymbols.length}
        signalCount={activeSignalCount}
        onDataUpdateCallback={(callback) => { dataUpdateCallbackRef.current = callback; }}
      />
      <MainContent
        statusText={statusText}
        statusLightClass={statusLightClass}
        initialLoading={initialLoading}
        initialError={initialError}
        allSymbols={allSymbols}
        tickers={tickers}
        traders={traders} // Pass traders to MainContent
        selectedTraderId={selectedTraderId} // Pass selected trader
        onSelectTrader={setSelectedTraderId} // Pass selection callback
        currentFilterFn={null} 
        klineInterval={klineInterval}
        selectedSymbolForChart={selectedSymbolForChart}
        chartConfigForDisplay={chartConfigForDisplay}
        onRowClick={handleRowClick}
        selectedSignalId={selectedSignalId}
        onAiInfoClick={handleAiInfoClick}
        signalLog={signalLog} // Pass signalLog to MainContent
        historicalSignals={historicalSignals} // Pass historical signals
        hasActiveFilter={multiTraderEnabled && traders.some(t => t.enabled)}
        onRunHistoricalScan={handleRunHistoricalScan}
        isHistoricalScanning={multiTraderEnabled && traders.some(t => t.enabled) ? isMultiTraderHistoricalScanning : isHistoricalScanning}
        historicalScanProgress={multiTraderEnabled && traders.some(t => t.enabled) ? multiTraderHistoricalProgress : historicalScanProgress}
        historicalScanConfig={historicalScanConfig}
        onHistoricalScanConfigChange={setHistoricalScanConfig}
        onCancelHistoricalScan={multiTraderEnabled && traders.some(t => t.enabled) ? cancelMultiTraderHistoricalScan : cancelHistoricalScan}
        signalDedupeThreshold={signalDedupeThreshold}
        onSignalDedupeThresholdChange={setSignalDedupeThreshold}
        klineHistoryConfig={klineHistoryConfig}
        onKlineHistoryConfigChange={setKlineHistoryConfig}
        isActivityPanelOpen={isActivityPanelOpen}
        allSignals={allSignals}
        allTrades={allTrades}
        onCloseActivityPanel={() => setIsActivityPanelOpen(false)}
        isMobile={isMobile}
      />
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalTitle}
      >
        {modalContent}
      </Modal>
      
      {/* Performance Monitor */}
      <PerformanceMonitor
        metrics={performanceMetrics}
      />

      {/* Debug Panel */}
      <DebugPanel />
    </div>
  );
};

const App: React.FC = () => {
  return (
    <MarketDataProvider>
      <KlineDataProvider>
        <AppContent />
      </KlineDataProvider>
    </MarketDataProvider>
  );
};

export default App;
