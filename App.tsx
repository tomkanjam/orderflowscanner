
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import Modal from './components/Modal';
import { Ticker, Kline, CustomIndicatorConfig, KlineInterval, GeminiModelOption, SignalLogEntry, SignalHistoryEntry, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress, KlineHistoryConfig } from './types';
import { fetchTopPairsAndInitialKlines, connectWebSocket, connectMultiIntervalWebSocket } from './services/binanceService';
import { getSymbolAnalysis, getMarketAnalysis } from './services/geminiService';
import { KLINE_HISTORY_LIMIT, KLINE_HISTORY_LIMIT_FOR_ANALYSIS, DEFAULT_KLINE_INTERVAL, DEFAULT_GEMINI_MODEL, GEMINI_MODELS, MAX_SIGNAL_LOG_ENTRIES } from './constants';
import * as screenerHelpers from './screenerHelpers';
import { useHistoricalScanner } from './hooks/useHistoricalScanner';
import { useMultiTraderHistoricalScanner } from './hooks/useMultiTraderHistoricalScanner';
import { AuthProvider } from './src/contexts/AuthContext';
import { useAuth } from './src/hooks/useAuth';
import { observability } from './services/observabilityService';
import { StrategyProvider } from './src/contexts/StrategyContext';
import { useSignalLifecycle } from './src/hooks/useSignalLifecycle';
import { useStrategy } from './src/contexts/StrategyContext';
import { signalManager } from './src/services/signalManager';
import { tradeManager } from './src/services/tradeManager';
import { traderManager } from './src/services/traderManager';
import { useMultiTraderScreener } from './hooks/useMultiTraderScreener';
import { TraderResult } from './workers/multiTraderScreenerWorker';
import { useIndicatorWorker } from './hooks/useIndicatorWorker';

// Define the type for the screenerHelpers module
type ScreenerHelpersType = typeof screenerHelpers;

// Initialize observability
observability.setupUnloadHandler();

const AppContent: React.FC = () => {
  const { activeStrategy } = useStrategy();
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map());
  const [historicalData, setHistoricalData] = useState<Map<string, Map<KlineInterval, Kline[]>>>(new Map());
  const [traders, setTraders] = useState<any[]>([]);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);
  
  // Helper to get klines for a specific interval
  const getKlinesForInterval = useCallback((symbol: string, interval: KlineInterval): Kline[] => {
    return historicalData.get(symbol)?.get(interval) || [];
  }, [historicalData]);
  
  const [klineInterval, setKlineInterval] = useState<KlineInterval>(DEFAULT_KLINE_INTERVAL);
  const [selectedGeminiModel, setSelectedGeminiModel] = useState<GeminiModelOption>(DEFAULT_GEMINI_MODEL);
  

  const [signalLog, setSignalLog] = useState<SignalLogEntry[]>([]); // New state for signal log
  
  // Signal deduplication threshold (default 50 bars)
  const [signalDedupeThreshold, setSignalDedupeThreshold] = useState<number>(() => {
    const saved = localStorage.getItem('signalDedupeThreshold');
    return saved ? parseInt(saved, 10) : 50;
  });
  
  // Track signal history for deduplication
  const [signalHistory, setSignalHistory] = useState<Map<string, SignalHistoryEntry>>(() => {
    const saved = localStorage.getItem('signalHistory');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return new Map(Object.entries(parsed));
      } catch {
        return new Map();
      }
    }
    return new Map();
  });

  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [multiTraderEnabled, setMultiTraderEnabled] = useState<boolean>(true);
  const [isMarketAnalysisLoading, setIsMarketAnalysisLoading] = useState<boolean>(false);
  const [isSymbolAnalysisLoading, setIsSymbolAnalysisLoading] = useState<boolean>(false);
  
  
  const [statusText, setStatusText] = useState<string>('Connecting...');
  const [statusLightClass, setStatusLightClass] = useState<string>('bg-[var(--tm-text-muted)]');
  
  const [selectedSymbolForChart, setSelectedSymbolForChart] = useState<string | null>(null);
  const [selectedSignalTraderId, setSelectedSignalTraderId] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalContent, setModalContent] = useState<React.ReactNode>('');
  
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
  
  // Track kline updates for bar counting
  const klineUpdateCountRef = React.useRef<Map<string, number>>(new Map());
  
  // Auth state
  const { user, loading: authLoading } = useAuth();
  
  // Indicator calculation hook
  const { calculateIndicators } = useIndicatorWorker();
  
  // Use refs to avoid stale closures
  const tickersRef = useRef(tickers);
  const historicalDataRef = useRef(historicalData);
  
  // Update refs when state changes
  useEffect(() => {
    tickersRef.current = tickers;
  }, [tickers]);
  
  useEffect(() => {
    historicalDataRef.current = historicalData;
  }, [historicalData]);
  
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
    autoAnalyze: true,
    autoMonitor: true,
    modelName: 'gemini-2.5-flash', // Default model if trader doesn't specify
    calculateIndicators,
    aiAnalysisLimit: klineHistoryConfig.aiAnalysisLimit,
    getMarketData: (symbol: string) => {
      const ticker = tickersRef.current.get(symbol);
      const intervalMap = historicalDataRef.current.get(symbol);
      if (!ticker || !intervalMap) return null;
      // Get klines for 1m interval (default for real-time analysis)
      const klines = intervalMap.get(KlineInterval.ONE_MINUTE);
      if (!klines) return null;
      return { ticker, klines };
    },
  });

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
    historicalData,
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
      setTraders(updatedTraders);
    });
    
    // Initial load
    traderManager.getTraders().then((traders) => {
      // Initial traders loaded
      setTraders(traders);
    });
    
    return unsubscribe;
  }, []);

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
    historicalData,
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
  
  
  const loadInitialData = useCallback(async (klineLimit: number) => {
    setInitialLoading(true);
    setInitialError(null);
    setStatusText('Fetching initial data...');
    setSelectedSymbolForChart(null);
    setSignalLog([]); // Clear signal log on new data load

    try {
      // Determine which intervals are needed by active traders
      const activeIntervals = new Set<KlineInterval>();
      traders.forEach(trader => {
        if (trader.enabled) {
          activeIntervals.add(trader.filter?.interval || KlineInterval.ONE_MINUTE);
        }
      });
      
      // Always include 1m as default/fallback
      activeIntervals.add(KlineInterval.ONE_MINUTE);
      
      console.log('Loading data for intervals:', Array.from(activeIntervals));
      
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
      
      // Fetch data for other intervals if needed
      const otherIntervals = Array.from(activeIntervals).filter(interval => interval !== KlineInterval.ONE_MINUTE);
      
      for (const interval of otherIntervals) {
        console.log(`Fetching data for interval: ${interval}`);
        const { klinesData: intervalData } = await fetchTopPairsAndInitialKlines(interval, klineLimit);
        
        // Merge into multiIntervalData
        intervalData.forEach((klines, symbol) => {
          if (!multiIntervalData.has(symbol)) {
            multiIntervalData.set(symbol, new Map());
          }
          multiIntervalData.get(symbol)!.set(interval, klines);
        });
      }
      
      setHistoricalData(multiIntervalData);
    } catch (error) {
      console.error("Error fetching initial data:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      setInitialError(`Failed to load initial market data: ${errorMessage}`);
      setAllSymbols([]);
      setTickers(new Map());
      setHistoricalData(new Map());
      setStatusText('Error');
      setStatusLightClass('bg-[var(--tm-error)]');
    } finally {
      setInitialLoading(false);
    }
  }, [traders]); // Depend on traders to determine which intervals to load

  useEffect(() => {
    loadInitialData(klineHistoryConfig.screenerLimit);
  }, [loadInitialData, klineHistoryConfig.screenerLimit, traders]); // Re-load when traders or kline config changes
  
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
  
  // Persist signal history to localStorage
  useEffect(() => {
    const historyObj = Object.fromEntries(signalHistory);
    localStorage.setItem('signalHistory', JSON.stringify(historyObj));
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

  // Create stable handlers using useCallback
  const handleTickerUpdateStable = useCallback((tickerUpdate: Ticker) => {
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
      newTickers.set(tickerUpdate.s, tickerUpdate);
      return newTickers;
    });
  }, []);

  const handleKlineUpdateStable = useCallback((symbol: string, interval: KlineInterval, kline: Kline, isClosed: boolean) => {
    // Track bar counts for signal deduplication (only for 1m interval)
    if (isClosed && interval === KlineInterval.ONE_MINUTE) {
      const currentCount = klineUpdateCountRef.current.get(symbol) || 0;
      klineUpdateCountRef.current.set(symbol, currentCount + 1);
      
      // Increment bar counts in signal history
      setSignalHistory(prev => {
        const entry = prev.get(symbol);
        if (!entry) return prev; // No entry, no change
        
        // Only create new Map if we need to update
        const newHistory = new Map(prev);
        newHistory.set(symbol, {
          ...entry,
          barCount: entry.barCount + 1
        });
        return newHistory;
      });
    }
    
    // Update signal and trade managers with current price (use 1m interval for real-time price)
    if (interval === KlineInterval.ONE_MINUTE) {
      const currentPrice = parseFloat(kline[4]); // Close price
      signalManager.updatePrice(symbol, currentPrice);
      tradeManager.updatePrice(symbol, currentPrice);
    }
    
    setHistoricalData(prevData => {
      const symbolData = prevData.get(symbol);
      
      // For new symbols, create new interval map
      if (!symbolData) {
        const newData = new Map(prevData);
        const intervalMap = new Map<KlineInterval, Kline[]>();
        intervalMap.set(interval, [kline]);
        newData.set(symbol, intervalMap);
        return newData;
      }
      
      const intervalKlines = symbolData.get(interval);
      
      // For new intervals, add to the symbol's interval map
      if (!intervalKlines) {
        const newData = new Map(prevData);
        const newIntervalMap = new Map(symbolData);
        newIntervalMap.set(interval, [kline]);
        newData.set(symbol, newIntervalMap);
        return newData;
      }
      
      // Work with existing array
      const klines = [...intervalKlines];
      
      let needsUpdate = false;
      
      if (isClosed) {
          if(kline[0] > klines[klines.length - 1][0]) {
              klines.push(kline);
              if (klines.length > KLINE_HISTORY_LIMIT) {
                  klines.shift();
              }
              needsUpdate = true;
          } else if (kline[0] === klines[klines.length - 1][0]) {
              klines[klines.length - 1] = kline;
              needsUpdate = true;
          }
      } else { 
          if (klines.length > 0 && klines[klines.length - 1][0] === kline[0]) {
              klines[klines.length - 1] = kline;
              needsUpdate = true;
          } else {
              klines.push(kline);
               if (klines.length > KLINE_HISTORY_LIMIT) {
                  klines.shift();
              }
              needsUpdate = true;
          }
      }
      
      // Only create new Maps if data actually changed
      if (!needsUpdate) {
          return prevData;
      }
      
      const newData = new Map(prevData);
      const newIntervalMap = new Map(symbolData);
      newIntervalMap.set(interval, klines);
      newData.set(symbol, newIntervalMap);
      return newData;
    });
  }, []);

  // Separate WebSocket connection effect with stable dependencies
  useEffect(() => {
    // Only proceed if we have symbols and no error
    if (allSymbols.length === 0) {
      return;
    }

    let ws: WebSocket | null = null;
    let isCleanedUp = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

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
        activeIntervals.add(trader.filter?.interval || KlineInterval.ONE_MINUTE);
      }
    });
    
    // Always include 1m as default/fallback
    activeIntervals.add(KlineInterval.ONE_MINUTE);
    
    const connectWebSocketWithRetry = () => {
      if (isCleanedUp) return;
      
      try {
        ws = connectMultiIntervalWebSocket(
          allSymbols,
          activeIntervals,
          handleTickerUpdate,
          handleKlineUpdate,
          () => { 
            if (!isCleanedUp) {
              setStatusText('Live'); 
              setStatusLightClass('bg-[var(--tm-success)]'); 
            }
          },
          (errorEvent) => { 
            if (!isCleanedUp) {
              console.error("WebSocket Error:", errorEvent); 
              setStatusText('WS Error'); 
              setStatusLightClass('bg-[var(--tm-error)]');
              
              // Reconnect after error
              reconnectTimeout = setTimeout(connectWebSocketWithRetry, 5000);
            }
          },
          () => { 
            if (!isCleanedUp) {
              setStatusText('Disconnected'); 
              setStatusLightClass('bg-[var(--tm-warning)]');
              
              // Reconnect after close
              reconnectTimeout = setTimeout(connectWebSocketWithRetry, 3000);
            }
          }
        );
      } catch(e) {
        if (!isCleanedUp) {
          console.error("Failed to connect WebSocket:", e);
          setStatusText('WS Failed');
          setStatusLightClass('bg-[var(--tm-error)]');
          
          // Retry connection
          reconnectTimeout = setTimeout(connectWebSocketWithRetry, 5000);
        }
      }
    };
    
    // Initial connection with small delay
    reconnectTimeout = setTimeout(connectWebSocketWithRetry, 500);
    

    return () => {
      isCleanedUp = true;
      
      // Clear any pending reconnect timeout
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      
      // Close WebSocket if it exists
      if (ws) {
        // Remove event handlers to prevent callbacks during cleanup
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.onopen = null;
        
        // Only close if not already closed
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      }
    };
  // Only re-run when symbols, traders or handlers change
  }, [allSymbols, traders, handleTickerUpdateStable, handleKlineUpdateStable]); 


  // Multi-trader screener hook
  const handleMultiTraderResults = useCallback((results: TraderResult[]) => {
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
          const filterResult = {
            symbol,
            price: parseFloat(ticker.c),
            change24h: parseFloat(ticker.P),
            volume24h: parseFloat(ticker.q),
            matchedConditions: [`Trader: ${traders.find(t => t.id === result.traderId)?.name || 'Unknown'}`]
          };
          
          // Creating signal
          
          const signal = createSignalFromFilter(filterResult, result.traderId);
          
          // Update signal history - reset bar count for new signal
          setSignalHistory(prev => {
            const newHistory = new Map(prev);
            newHistory.set(symbol, {
              timestamp: currentTimestamp,
              barCount: 0,
            });
            return newHistory;
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
  }, [traders, tickers, activeStrategy, klineInterval, signalHistory, signalDedupeThreshold, createSignalFromFilter]);

  const { isRunning: isMultiTraderRunning } = useMultiTraderScreener({
    traders,
    symbols: allSymbols,
    tickers,
    historicalData,
    onResults: handleMultiTraderResults,
    enabled: multiTraderEnabled && traders.some(t => t.enabled),
    interval: 5000 // Run every 5 seconds
  });


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
    setModalContent(<div className="text-center py-4"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--tm-accent)] mx-auto"></div><p className="mt-2">Generating analysis...</p></div>);
    setIsModalOpen(true);

    try {
        const topTickersList = Array.from(tickers.values()).sort((a,b) => parseFloat(b.q) - parseFloat(a.q)).slice(0,10);
        const analysisText = await getMarketAnalysis(topTickersList, internalGeminiModelName, klineInterval);
        setModalContent(<div className="whitespace-pre-wrap text-sm md:text-base">{analysisText}</div>);
    } catch (error) {
        console.error("Market Analysis error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to get market analysis.";
        setModalContent(<p className="text-[var(--tm-error)]">{errorMessage}</p>);
    } finally {
        setIsMarketAnalysisLoading(false);
    }
  }, [tickers, internalGeminiModelName, klineInterval]);

  const handleAiInfoClick = useCallback(async (symbol: string, event: React.MouseEvent) => {
    event.stopPropagation(); 
    setIsSymbolAnalysisLoading(true); 
    setModalTitle(`✨ AI Analysis for ${symbol}`);
    setModalContent(<div className="text-center py-4"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--tm-accent)] mx-auto"></div><p className="mt-2">Generating analysis for {symbol}...</p></div>);
    setIsModalOpen(true);

    const tickerData = tickers.get(symbol);
    const klineData = historicalData.get(symbol);

    if (!tickerData || !klineData) {
        setModalContent(<p className="text-[var(--tm-error)]">Data not available for {symbol}.</p>);
        setIsSymbolAnalysisLoading(false);
        return;
    }

    try {
        const analysisText = await getSymbolAnalysis(symbol, tickerData, klineData, null, internalGeminiModelName, klineInterval, klineHistoryConfig.analysisLimit, null);
        
        setModalContent(<div className="whitespace-pre-wrap text-sm md:text-base">{analysisText}</div>);
    } catch (error) {
        console.error(`Symbol Analysis error for ${symbol}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Failed to get analysis.";
        setModalContent(<p className="text-[var(--tm-error)]">{errorMessage}</p>);
    } finally {
        setIsSymbolAnalysisLoading(false);
    }
  }, [tickers, historicalData, internalGeminiModelName, klineInterval]);


  const handleRowClick = (symbol: string, traderId?: string) => {
    setSelectedSymbolForChart(symbol);
    setSelectedSignalTraderId(traderId || null);
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


  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar
        onSelectedTraderChange={setSelectedTraderId}
      />
      <MainContent
        statusText={statusText}
        statusLightClass={statusLightClass}
        initialLoading={initialLoading}
        initialError={initialError}
        allSymbols={allSymbols}
        tickers={tickers}
        historicalData={historicalData}
        traders={traders} // Pass traders to MainContent
        selectedTraderId={selectedTraderId} // Pass selected trader
        onSelectTrader={setSelectedTraderId} // Pass selection callback
        currentFilterFn={null} 
        klineInterval={klineInterval}
        selectedSymbolForChart={selectedSymbolForChart}
        chartConfigForDisplay={chartConfigForDisplay}
        onRowClick={handleRowClick}
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
    <AuthProvider>
      <StrategyProvider>
        <AppContent />
      </StrategyProvider>
    </AuthProvider>
  );
};

export default App;
