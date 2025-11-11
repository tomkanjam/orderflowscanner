
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { MobileHeader } from './src/components/mobile/MobileHeader';
import { BottomNavigation, MobileTab } from './src/components/mobile/BottomNavigation';
import { SideDrawer } from './src/components/mobile/SideDrawer';
import { useIsMobile } from './src/components/mobile/hooks/useMediaQuery';

import Modal from './components/Modal';
import { Ticker, Kline, CustomIndicatorConfig, KlineInterval, GeminiModelOption, SignalLogEntry, SignalHistoryEntry, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress, KlineHistoryConfig } from './types';
import { fetchTopPairsAndInitialKlines, connectWebSocket, connectMultiIntervalWebSocket } from './services/binanceService';
// REMOVED: getSymbolAnalysis, getMarketAnalysis - All analysis now handled by backend
import { KLINE_HISTORY_LIMIT, KLINE_HISTORY_LIMIT_FOR_ANALYSIS, DEFAULT_KLINE_INTERVAL, DEFAULT_GEMINI_MODEL, GEMINI_MODELS, MAX_SIGNAL_LOG_ENTRIES } from './constants';
import * as screenerHelpers from './screenerHelpers';
import { useHistoricalScanner } from './hooks/useHistoricalScanner';
import { useMultiTraderHistoricalScanner } from './hooks/useMultiTraderHistoricalScanner';
import { AuthProvider } from './src/contexts/AuthContext';
import { useAuth } from './src/hooks/useAuth';
import { observability } from './services/observabilityService';
import { StrategyProvider } from './src/contexts/StrategyContext';
import { useStrategy } from './src/contexts/StrategyContext';
import { signalManager } from './src/services/signalManager';
import { tradeManager } from './src/services/tradeManager';
import { traderManager } from './src/services/traderManager';
import { serverExecutionService } from './src/services/serverExecutionService';
import { Trader } from './src/abstractions/trader.interfaces';
import { useIndicatorWorker } from './hooks/useIndicatorWorker';
import ActivityPanel from './src/components/ActivityPanel';
import { tradingManager } from './src/services/tradingManager';
import { memoryMonitor } from './src/utils/memoryMonitor';
import { webSocketManager } from './src/utils/webSocketManager';
import { useOptimizedMap, BatchedUpdater, LimitedMap, pruneMapByAge } from './src/utils/stateOptimizer';
import { startMemoryCleanup, getActiveSymbols } from './src/utils/memoryCleanup';
import { useSubscription } from './src/contexts/SubscriptionContext';
import { areTraderArraysEqual } from './src/utils/traderEquality';
import { filterTradersByTierAccess } from './src/utils/tierAccess';
import { memDebug } from './src/utils/memoryDebugger';
import { klineEventEmitter } from './src/utils/KlineEventEmitter';
import { sharedMarketData } from './src/shared/SharedMarketData';
import { BoundedMap, createBoundedMap } from './src/memory/BoundedCollections';
import { UpdateBatcher, createTickerBatcher } from './src/optimization/UpdateBatcher';
import { useThrottledState, useMemoryAwareState } from './src/hooks/useBoundedState';
import { useCloudExecution } from './src/hooks/useCloudExecution';
import { KlineDataProvider } from './src/contexts/KlineDataProvider';
import { MarketDataProvider } from './src/contexts/MarketDataContext';

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
  const cloudExecution = useCloudExecution();
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map());
  // REMOVED: historicalData state - now using SharedMarketData directly to prevent memory leaks
  const [traders, setTraders] = useState<Trader[]>([]);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);
  
  // Helper to get klines for a specific interval
  const getKlinesForInterval = useCallback((symbol: string, interval: KlineInterval): Kline[] => {
    return sharedMarketData.getKlines(symbol, interval);
  }, []);
  
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

  // Mobile navigation state
  const isMobile = useIsMobile(); // Use hook instead of state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('activity');

  // Signal source filter state
  const [showCloudSignalsOnly, setShowCloudSignalsOnly] = useState<boolean>(false);
  
  // Historical signals state
  const [historicalSignals, setHistoricalSignals] = useState<HistoricalSignal[]>([]);
  const [isHistoricalScanRunning, setIsHistoricalScanRunning] = useState<boolean>(false);
  const [historicalScanConfig, setHistoricalScanConfig] = useState<HistoricalScanConfig>({
    lookbackBars: 20,
    scanInterval: 1, // Fixed to check every bar
    maxSignalsPerSymbol: 5,
    includeIndicatorSnapshots: false,
  });

  // Kline history limits configuration
  const [klineHistoryConfig, setKlineHistoryConfig] = useState<KlineHistoryConfig>(() => {
    const saved = localStorage.getItem('klineHistoryConfig');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migration: Cap screenerLimit to current constant (prevents old cached values)
        const migratedScreenerLimit = Math.min(
          parsed.screenerLimit || KLINE_HISTORY_LIMIT,
          KLINE_HISTORY_LIMIT
        );

        return {
          screenerLimit: migratedScreenerLimit,
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
  
  // Memory-aware batched ticker updater to reduce state updates and memory allocation
  const tickerBatchUpdater = useRef<UpdateBatcher<string, Ticker>>();
  useEffect(() => {
    const batcher = createTickerBatcher((updates) => {
      setTickers(prevTickers => {
        const newTickers = new Map(prevTickers);
        updates.forEach((ticker, symbol) => {
          // Add timestamp for memory cleanup tracking
          const tickerWithTimestamp = {
            ...ticker,
            _lastUpdate: Date.now()
          };
          newTickers.set(symbol, tickerWithTimestamp);
        });
        return newTickers;
      });
    });
    
    tickerBatchUpdater.current = batcher;
    
    return () => {
      batcher.dispose();
    };
  }, []);
  
  // Register memory monitoring metrics
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Register custom metrics to track data structure sizes
      memoryMonitor.registerMetric('tickersSize', () => tickers.size);
      memoryMonitor.registerMetric('sharedDataSize', () => {
        // Track SharedMarketData usage instead
        const stats = sharedMarketData.getMemoryStats();
        return stats.usedSymbols;
      });
      memoryMonitor.registerMetric('signalLogSize', () => signalLog.length);
      memoryMonitor.registerMetric('signalHistorySize', () => signalHistory.size);
      memoryMonitor.registerMetric('klineUpdateCountSize', () => klineUpdateCountRef.current.size);
      memoryMonitor.registerMetric('wsConnections', () => webSocketManager.getStats().activeConnections);
      
      // console.log('[App] Memory monitoring metrics registered');
    }
  }, [tickers, signalLog, signalHistory]);
  
  // Initialize workflow and trading managers
  useEffect(() => {
    let unsubscribeSignals: (() => void) | null = null;

    if (user && !authLoading) {
      // Initialize trading manager
      tradingManager.initialize().catch(error => {
        console.error('[TradingManager] Initialization error:', error);
      });

      // Initialize server execution Realtime subscriptions for signal updates
      serverExecutionService.initializeRealtime().catch(error => {
        console.error('[ServerExecutionService] Realtime initialization error:', error);
      });

      // Subscribe to real-time signal updates and add them to signalManager
      unsubscribeSignals = serverExecutionService.onSignal((signal) => {
        console.log('[App] Received new signal from real-time subscription:', signal);
        // Convert TraderSignal to signalManager format
        const dbSignal = {
          id: signal.id,
          trader_id: signal.trader_id,
          symbol: signal.symbols[0], // TraderSignal has array, database has single symbol
          created_at: signal.timestamp,
          price_at_signal: signal.metadata?.price_at_signal,
          metadata: signal.metadata
        };
        signalManager.addSignalFromDatabase(dbSignal);
      });

      // Fetch existing signals from database and load into SignalManager
      // Get current user's trader IDs for filtering
      const traderIds = traders.map(t => t.id);
      serverExecutionService.fetchRecentSignals({
        limit: 50,
        offset: 0,
        traderIds,
        userSpecific: true
      }).then(signals => {
        if (signals.length > 0) {
          console.log(`[App] Fetched ${signals.length} user-specific signals from database`);
          // Convert TraderSignal format to SignalManager format
          const dbSignals = signals.map(s => ({
            id: s.id,
            trader_id: s.trader_id,
            symbol: s.symbols[0], // TraderSignal has array, database has single symbol
            created_at: s.timestamp,
            price_at_signal: s.metadata?.price_at_signal,
            metadata: s.metadata
          }));
          signalManager.loadInitialSignals(dbSignals);
        }
      }).catch(error => {
        console.error('[App] Failed to fetch initial signals:', error);
      });
    }

    // Return cleanup function
    return () => {
      // Cleanup on unmount
      if (unsubscribeSignals) {
        unsubscribeSignals();
      }
      tradingManager.shutdown().catch(error => {
        console.error('[TradingManager] Shutdown error:', error);
      });
      serverExecutionService.cleanup().catch(error => {
        console.error('[ServerExecutionService] Cleanup error:', error);
      });
    };
  }, [user, authLoading]);
  
  // Mobile detection now handled by useIsMobile hook
  
  // Use refs to avoid stale closures
  const tickersRef = useRef(tickers);
  // Removed historicalDataRef - using SharedMarketData directly
  const tradersRef = useRef(traders);
  
  // Update refs when state changes
  useEffect(() => {
    tickersRef.current = tickers;
  }, [tickers]);
  
  // Removed historicalData ref update - using SharedMarketData directly
  
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

  // Historical scanner hook
  const {
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
  }, [historicalScanResults]);


  // Subscribe to traders
  useEffect(() => {
    const unsubscribe = traderManager.subscribe((updatedTraders) => {
      // Traders updated
      console.log('[App] Traders updated from manager:', updatedTraders.length, 'traders');
      updatedTraders.forEach(t => {
        console.log(`[App] Trader ${t.name}: enabled=${t.enabled}, hasFilter=${!!t.filter}, hasFilterCode=${!!t.filter?.code}, filterCodeLength=${t.filter?.code?.length || 0}`);
      });

      // [USER PREFERENCES] Apply effective enabled state (considers user preferences for built-in signals)
      const tradersWithPreferences = updatedTraders.map(trader => ({
        ...trader,
        enabled: traderManager.getEffectiveEnabled(trader, user?.id)
      }));

      // [TIER ACCESS] Filter by tier before setting state
      const accessibleTraders = filterTradersByTierAccess(
        tradersWithPreferences,
        currentTier,
        user?.id || null
      );

      // [TIER ACCESS] Log filter results
      const blockedCount = updatedTraders.length - accessibleTraders.length;
      if (blockedCount > 0) {
        console.log(`[App] Tier filter blocked ${blockedCount} traders for tier: ${currentTier}`);
        const blockedNames = updatedTraders
          .filter(t => !accessibleTraders.includes(t))
          .map(t => `${t.name} (${t.accessTier})`)
          .join(', ');
        console.log(`[App] Blocked traders: ${blockedNames}`);
      }

      updateTraders(accessibleTraders); // Pass filtered list
    });

    // Initial load
    traderManager.getTraders().then((traders) => {
      console.log('[App] Initial traders loaded:', traders.length, 'traders');
      traders.forEach(t => {
        console.log(`[App] Trader ${t.name}: enabled=${t.enabled}, hasFilter=${!!t.filter}, hasFilterCode=${!!t.filter?.code}, filterCodeLength=${t.filter?.code?.length || 0}`);
      });

      // [USER PREFERENCES] Apply effective enabled state (considers user preferences for built-in signals)
      const tradersWithPreferences = traders.map(trader => ({
        ...trader,
        enabled: traderManager.getEffectiveEnabled(trader, user?.id)
      }));

      // [TIER ACCESS] Filter on initial load
      const accessibleTraders = filterTradersByTierAccess(
        tradersWithPreferences,
        currentTier,
        user?.id || null
      );

      console.log('[App] Accessible traders after tier filter:', accessibleTraders.length);
      updateTraders(accessibleTraders);
    });

    return unsubscribe;
  }, [updateTraders, currentTier, user?.id]);

  // Multi-trader historical scanner
  const {
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
  }, [multiTraderHistoricalSignals]);

  // Multi-trader screener will be initialized after handleNewSignal is defined

  // Save kline history config to localStorage
  useEffect(() => {
    localStorage.setItem('klineHistoryConfig', JSON.stringify(klineHistoryConfig));
  }, [klineHistoryConfig]);

  // Get signals and trades for activity panel (declared early to avoid TDZ in useEffect)
  const allSignals = signalManager.getSignals();
  const allTrades = tradeManager.getTrades();

  // Set up memory cleanup
  useEffect(() => {
    const cleanup = startMemoryCleanup(
      () => {
        // Get active symbols
        const recentSignalSymbols = new Set(
          allSignals.slice(0, 20).map(s => s.symbol)
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
          // Historical data now in SharedMarketData,
          activeSymbols,
          prioritySymbols: selectedSymbols
        };
      },
      (state) => {
        if (state.tickers) setTickers(state.tickers);
        // Historical data now in SharedMarketData, no need to restore
      },
      30000 // Clean up every 30 seconds
    );
    
    return cleanup;
  }, [allSignals, selectedSymbolForChart]);
  
  
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
      
      // Write initial klines to SharedMarketData
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
          sharedMarketData.updateKlines(symbol, interval, klines);
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
      // SharedMarketData is already empty on error
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
      
      // Clean up SharedArrayBuffer for inactive symbols
      if (sharedMarketData) {
        const removedCount = sharedMarketData.cleanupOldSymbols(5 * 60 * 1000); // 5 minutes inactive
        if (removedCount > 0) {
          console.log(`[App] Cleaned ${removedCount} inactive symbols from SharedArrayBuffer`);
        }
      }
      
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
    
    // Use memory-aware batched updater for better performance
    if (tickerBatchUpdater.current) {
      tickerBatchUpdater.current.add(tickerUpdate.s, tickerUpdate);
    } else {
      // Fallback to direct update if batch updater not ready
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
    }
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
    
    // Write directly to SharedMarketData (no state cloning!)
    sharedMarketData.updateKline(symbol, interval, kline);
    
    // Emit lightweight event for UI updates
    klineEventEmitter.emit(symbol, interval);
    
    // Track memory after update (for debugging)
    if (process.env.NODE_ENV === 'development') {
      memDebug.takeSnapshot('After kline update', { 
        symbol, 
        interval,
        sharedDataStats: sharedMarketData.getMemoryStats()
      });
    }
  }, []);

  // Separate WebSocket connection effect with stable dependencies
  useEffect(() => {
    // Only proceed if we have symbols and no error
    if (allSymbols.length === 0) {
      return;
    }

    let isCleanedUp = false;
    
    // Add a small delay to avoid React StrictMode rapid cleanup
    const connectionTimer = setTimeout(() => {
      if (isCleanedUp) {
        return;
      }

      const handleTickerUpdate = (tickerUpdate: Ticker) => {
        if (!isCleanedUp) {
          handleTickerUpdateStable(tickerUpdate);
        }
      };

      const handleKlineUpdate = (symbol: string, interval: KlineInterval, kline: Kline, isClosed: boolean) => {
        if (!isCleanedUp) {
          handleKlineUpdateStable(symbol, interval, kline, isClosed);
        }
      };
      
      // Determine which intervals are needed by active traders
      const activeIntervals = new Set<KlineInterval>();
      traders.forEach(trader => {
        if (trader.enabled) {
          // Add all required timeframes for this trader
          const requiredTimeframes = trader.filter?.requiredTimeframes || [trader.filter?.refreshInterval || KlineInterval.ONE_MINUTE];
          requiredTimeframes.forEach(tf => activeIntervals.add(tf));
        }
      });
      
      // Always include 1m as default/fallback
      activeIntervals.add(KlineInterval.ONE_MINUTE);
      
      // Create WebSocket URL for multi-interval connection
      const tickerStreams = allSymbols.map(s => `${s.toLowerCase()}@ticker`);
      const klineStreams: string[] = [];
      allSymbols.forEach(symbol => {
        activeIntervals.forEach(interval => {
          klineStreams.push(`${symbol.toLowerCase()}@kline_${interval}`);
        });
      });
      const allStreams = [...tickerStreams, ...klineStreams].join('/');
      const wsUrl = `wss://stream.binance.com:9443/stream?streams=${allStreams}`;
      
      // Connect using WebSocket manager
      try {
        webSocketManager.connect(
          'main-connection',
          wsUrl,
          {
            onOpen: () => {
              if (!isCleanedUp) {
                setStatusText('Live');
                setStatusLightClass('bg-[var(--nt-success)]');
              }
            },
            onMessage: (event) => {
              if (isCleanedUp) return;
              
              try {
                const message = JSON.parse(event.data as string);
                
                // Debug: Log first message of any type
                
                if (message.stream && message.data) {
                  if (message.stream.includes('@ticker')) {
                    const tickerData = message.data;
                    // Debug: Log first ticker message
                    handleTickerUpdate({
                      s: tickerData.s,
                      P: tickerData.P,
                      c: tickerData.c,
                      q: tickerData.q,
                      ...tickerData
                    });
                  } else if (message.stream.includes('@kline')) {
                    const klineData = message.data;
                    const k = klineData.k;
                    
                    // Extract interval from stream name
                    const streamParts = message.stream.split('_');
                    const interval = streamParts[streamParts.length - 1] as KlineInterval;
                    
                    const kline: Kline = [
                      k.t, k.o, k.h, k.l, k.c, k.v, k.T, k.q, k.n, k.V, k.Q, k.B
                    ];
                    handleKlineUpdate(klineData.s, interval, kline, k.x);
                  }
                }
              } catch (e) {
                console.error("Error processing WebSocket message:", e);
              }
            },
            onError: (error) => {
              if (!isCleanedUp) {
                console.error("WebSocket Error:", error);
                setStatusText('WS Error');
                setStatusLightClass('bg-[var(--nt-error)]');
              }
            },
            onClose: () => {
              if (!isCleanedUp) {
                setStatusText('Disconnected');
                setStatusLightClass('bg-[var(--nt-warning)]');
              }
            }
          },
          true // Enable auto-reconnect
        );
      } catch (e) {
        console.error("[StatusBar Debug] Failed to connect WebSocket:", e);
        console.error("[StatusBar Debug] WebSocket error details:", {
          message: e instanceof Error ? e.message : 'Unknown error',
          type: e?.constructor?.name || 'Unknown'
        });
        setStatusText('WS Failed');
        setStatusLightClass('bg-[var(--nt-error)]');
      }
    }, 500); // 500ms delay to ensure React StrictMode completes and all components are mounted

    return () => {
      isCleanedUp = true;
      clearTimeout(connectionTimer);
      webSocketManager.disconnect('main-connection');
    };
  // Only re-run when symbols, required intervals, or handlers change
  }, [allSymbols, traderIntervalsKey, handleTickerUpdateStable, handleKlineUpdateStable]); 



  const screenerEnabled = multiTraderEnabled && traders.some(t => t.enabled);
  // console.log(`[SIGNAL_DEBUG ${new Date().toISOString()}] Multi-trader screener status:`, {
  //   screenerEnabled,
  //   multiTraderEnabled,
  //   totalTraders: traders.length,
  //   enabledTraders: traders.filter(t => t.enabled).length,
  //   traders: traders.map(t => ({ id: t.id, name: t.name, enabled: t.enabled }))
  // });
  
  

  // Note: Worker cache cleanup removed - now handled by Go backend

  const handleRunHistoricalScan = () => {
    // Only run historical scan when a trader is selected
    if (selectedTraderId) {
      // Use multi-trader scanner with only the selected trader
      if (multiTraderEnabled && traders.some(t => t.id === selectedTraderId && t.enabled)) {
        startMultiTraderHistoricalScan(historicalScanConfig);
      }
    }
  };

  
  // Stub for signal creation (now handled by Go backend)
  const createSignalFromFilter = useCallback((filterResult: any, traderId?: string, interval?: KlineInterval) => {
    console.log('[App] Signal creation now handled by Go backend');
    return null;
  }, []);

  const handleAnalyzeMarket = useCallback(async () => {
    setIsMarketAnalysisLoading(true);
    setModalTitle('📊 AI Market Analysis');
    setModalContent(<div className="text-center py-4"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--nt-accent-lime)] mx-auto"></div><p className="mt-2">Generating analysis...</p></div>);
    setIsModalOpen(true);

    try {
        // TODO: Market analysis removed - all analysis now handled by backend (issue #41)
        setModalContent(<p className="text-[var(--nt-warning)]">Market analysis feature temporarily disabled. All analysis now handled by backend server.</p>);

        /* Original code commented out:
        const topTickersList = Array.from(tickers.values()).sort((a,b) => parseFloat(b.q) - parseFloat(a.q)).slice(0,10);
        const analysisText = await getMarketAnalysis(topTickersList, internalGeminiModelName, klineInterval);
        setModalContent(<div className="whitespace-pre-wrap text-sm md:text-base">{analysisText}</div>);
        */
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
    // Get all intervals for the symbol from SharedMarketData
    const klineData = new Map<KlineInterval, Kline[]>();
    ['1m', '5m', '15m', '1h', '4h', '1d'].forEach((interval) => {
      const klines = sharedMarketData.getKlines(symbol, interval as KlineInterval);
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

  // Get pre-calculated indicator data from selected signal (if available)
  const preCalculatedIndicators = useMemo(() => {
    if (!selectedSignalId) return undefined;

    const selectedSignal = allSignals.find(s => s.id === selectedSignalId);
    return selectedSignal?.indicator_data;
  }, [selectedSignalId, allSignals]);

  // Calculate active signal count
  const activeSignalCount = allSignals.filter(signal => signal.status === 'active').length;

  // Filter signal log based on toggle state and machine status
  // Priority: manual toggle > machine status
  const filteredSignalLog = useMemo(() => {
    // If manual toggle is enabled, always show only cloud signals
    if (showCloudSignalsOnly) {
      return signalLog.filter(signal => signal.source === 'cloud');
    }

    // Otherwise, auto-filter based on machine status
    // When machine is running, only show cloud signals
    // When machine is not running, show browser-generated signals
    if (cloudExecution.machineStatus === 'running') {
      return signalLog.filter(signal => signal.source === 'cloud');
    }

    // Show all signals (browser-generated) when machine is not running
    return signalLog;
  }, [signalLog, cloudExecution.machineStatus, showCloudSignalsOnly]);

  // Connection status for mobile header
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  // Track connection status for mobile header
  useEffect(() => {
    if (statusText === 'Live') {
      setConnectionStatus('connected');
    } else if (statusText === 'Disconnected' || statusText === 'WS Failed') {
      setConnectionStatus('disconnected');
    } else {
      setConnectionStatus('reconnecting');
    }
  }, [statusText]);

  // Mobile layout
  if (isMobile) {
    return (
      <div className="mobile-layout">
        {/* Mobile Header */}
        <MobileHeader
          onMenuClick={() => setIsDrawerOpen(true)}
          connectionStatus={connectionStatus}
        />

        {/* Side Drawer with Sidebar */}
        <SideDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}>
          <Sidebar
            onSelectedTraderChange={setSelectedTraderId}
            tickerCount={tickers.size}
            symbolCount={allSymbols.length}
            signalCount={activeSignalCount}
            onDataUpdateCallback={(callback) => { dataUpdateCallbackRef.current = callback; }}
          />
        </SideDrawer>

        {/* Main Content */}
        <div className="mobile-content">
          <MainContent
            statusText={statusText}
            statusLightClass={statusLightClass}
            initialLoading={initialLoading}
            initialError={initialError}
            allSymbols={allSymbols}
            tickers={tickers}
            traders={traders}
            selectedTraderId={selectedTraderId}
            onSelectTrader={setSelectedTraderId}
            currentFilterFn={null}
            klineInterval={klineInterval}
            selectedSymbolForChart={selectedSymbolForChart}
            chartConfigForDisplay={chartConfigForDisplay}
            preCalculatedIndicators={preCalculatedIndicators}
            onRowClick={handleRowClick}
            selectedSignalId={selectedSignalId}
            onAiInfoClick={handleAiInfoClick}
            signalLog={filteredSignalLog}
            historicalSignals={historicalSignals}
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
            showCloudSignalsOnly={showCloudSignalsOnly}
            onShowCloudSignalsOnlyChange={setShowCloudSignalsOnly}
            activeMobileTab={activeMobileTab}
          />
        </div>

        {/* Bottom Navigation */}
        <div className="mobile-bottom-nav">
          <BottomNavigation
            activeTab={activeMobileTab}
            onTabChange={setActiveMobileTab}
            signalCount={activeSignalCount}
          />
        </div>

        {/* Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={modalTitle}
        >
          {modalContent}
        </Modal>
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex flex-col md:flex-row min-h-screen relative">
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
        preCalculatedIndicators={preCalculatedIndicators}
        onRowClick={handleRowClick}
        selectedSignalId={selectedSignalId}
        onAiInfoClick={handleAiInfoClick}
        signalLog={filteredSignalLog} // Pass filtered signal log based on machine status
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
        showCloudSignalsOnly={showCloudSignalsOnly}
        onShowCloudSignalsOnlyChange={setShowCloudSignalsOnly}
      />
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalTitle}
      >
        {modalContent}
      </Modal>
      
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
