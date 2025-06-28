
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import Modal from './components/Modal';
import { Ticker, Kline, AiFilterResponse, CustomIndicatorConfig, KlineInterval, GeminiModelOption, SignalLogEntry, SignalHistoryEntry, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress, KlineHistoryConfig } from './types';
import { fetchTopPairsAndInitialKlines, connectWebSocket } from './services/binanceService';
import { generateFilterAndChartConfig, generateFilterAndChartConfigStream, getSymbolAnalysis, getMarketAnalysis, StreamingUpdate } from './services/geminiService';
import { KLINE_HISTORY_LIMIT, KLINE_HISTORY_LIMIT_FOR_ANALYSIS, DEFAULT_KLINE_INTERVAL, DEFAULT_GEMINI_MODEL, GEMINI_MODELS } from './constants';
import * as screenerHelpers from './screenerHelpers';
import { useHistoricalScanner } from './hooks/useHistoricalScanner';
import { useMultiTraderHistoricalScanner } from './hooks/useMultiTraderHistoricalScanner';
import { AuthProvider } from './src/contexts/AuthContext';
import { useAuth } from './src/hooks/useAuth';
import { EmailAuthModal } from './src/components/auth/EmailAuthModal';
import { observability } from './services/observabilityService';
import { StrategyProvider } from './src/contexts/StrategyContext';
import { useSignalLifecycle } from './src/hooks/useSignalLifecycle';
import { useStrategy } from './src/contexts/StrategyContext';
import { signalManager } from './src/services/signalManager';
import { tradeManager } from './src/services/tradeManager';
import { traderManager } from './src/services/traderManager';
import { useMultiTraderScreener } from './hooks/useMultiTraderScreener';
import { TraderResult } from './workers/multiTraderScreenerWorker';

// Define the type for the screenerHelpers module
type ScreenerHelpersType = typeof screenerHelpers;

// Initialize observability
observability.setupUnloadHandler();

const AppContent: React.FC = () => {
  const { activeStrategy } = useStrategy();
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map());
  const [historicalData, setHistoricalData] = useState<Map<string, Kline[]>>(new Map());
  const [traders, setTraders] = useState<any[]>([]);
  const [selectedTraderId, setSelectedTraderId] = useState<string | null>(null);
  
  const [klineInterval, setKlineInterval] = useState<KlineInterval>(DEFAULT_KLINE_INTERVAL);
  const [selectedGeminiModel, setSelectedGeminiModel] = useState<GeminiModelOption>(DEFAULT_GEMINI_MODEL);
  
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [currentFilterFn, setCurrentFilterFn] = useState<((ticker: Ticker, klines: Kline[], helpers: ScreenerHelpersType, hvnNodes: any[]) => boolean) | null>(null);
  const [aiFilterDescription, setAiFilterDescription] = useState<string[] | null>(null);
  const [fullAiFilterResponse, setFullAiFilterResponse] = useState<AiFilterResponse | null>(null);
  const [currentChartConfig, setCurrentChartConfig] = useState<CustomIndicatorConfig[] | null>(null);

  const [signalLog, setSignalLog] = useState<SignalLogEntry[]>([]); // New state for signal log
  const [strategy, setStrategy] = useState<string>(''); // User's trading strategy
  
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
  const [isAiScreenerLoading, setIsAiScreenerLoading] = useState<boolean>(false);
  const [multiTraderEnabled, setMultiTraderEnabled] = useState<boolean>(true);
  const [aiScreenerError, setAiScreenerError] = useState<string | null>(null);
  const [isMarketAnalysisLoading, setIsMarketAnalysisLoading] = useState<boolean>(false);
  const [isSymbolAnalysisLoading, setIsSymbolAnalysisLoading] = useState<boolean>(false);
  
  // Streaming state
  const [streamingProgress, setStreamingProgress] = useState<string>('');
  const [streamingTokenCount, setStreamingTokenCount] = useState<number>(0);
  
  const [statusText, setStatusText] = useState<string>('Connecting...');
  const [statusLightClass, setStatusLightClass] = useState<string>('bg-[var(--tm-text-muted)]');
  
  const [selectedSymbolForChart, setSelectedSymbolForChart] = useState<string | null>(null);
  
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
        return JSON.parse(saved);
      } catch {
        return {
          screenerLimit: KLINE_HISTORY_LIMIT,
          analysisLimit: KLINE_HISTORY_LIMIT_FOR_ANALYSIS
        };
      }
    }
    return {
      screenerLimit: KLINE_HISTORY_LIMIT,
      analysisLimit: KLINE_HISTORY_LIMIT_FOR_ANALYSIS
    };
  });

  const internalGeminiModelName = useMemo(() => {
    return GEMINI_MODELS.find(m => m.value === selectedGeminiModel)?.internalModel || GEMINI_MODELS[0].internalModel;
  }, [selectedGeminiModel]);
  
  // Track kline updates for bar counting
  const klineUpdateCountRef = React.useRef<Map<string, number>>(new Map());
  
  // Auth state
  const { user, loading: authLoading } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState('');
  
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
    filterCode: fullAiFilterResponse?.screenerCode || '',
    filterDescription: aiFilterDescription || [],
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
      console.log('Traders updated:', updatedTraders.map(t => ({
        name: t.name,
        hasIndicators: !!t.filter?.indicators,
        indicatorCount: t.filter?.indicators?.length || 0
      })));
      setTraders(updatedTraders);
    });
    
    // Initial load
    traderManager.getTraders().then((traders) => {
      console.log('Initial traders load:', traders.map(t => ({
        name: t.name,
        hasIndicators: !!t.filter?.indicators,
        indicatorCount: t.filter?.indicators?.length || 0
      })));
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
  
  // Auto-run historical scan when we have fewer than 10 live signals
  const hasAutoScanned = useRef(false);
  useEffect(() => {
    // Only auto-scan once per filter, when we have an active filter, 
    // not already scanning, and fewer than 10 live signals
    if (currentFilterFn && 
        !isHistoricalScanning && 
        !hasAutoScanned.current && 
        signalLog.length < 10 &&
        historicalSignals.length === 0) { // Don't auto-scan if we already have historical signals
      
      console.log(`[${new Date().toISOString().slice(11, 23)}] Auto-running historical scan: ${signalLog.length} live signals found`);
      hasAutoScanned.current = true;
      
      // Use 200 bars when no live signals are found, otherwise use default
      const autoScanConfig = signalLog.length === 0 
        ? { ...historicalScanConfig, lookbackBars: 200 }
        : historicalScanConfig;
      
      // Small delay to ensure initial signals are displayed first
      setTimeout(() => {
        startHistoricalScan(autoScanConfig);
      }, 1000);
    }
    
    // Reset auto-scan flag when filter changes
    if (!currentFilterFn) {
      hasAutoScanned.current = false;
    }
  }, [currentFilterFn, signalLog.length, isHistoricalScanning, startHistoricalScan, historicalScanConfig, historicalSignals.length]);
  
  const loadInitialData = useCallback(async (interval: KlineInterval, klineLimit: number) => {
    setInitialLoading(true);
    setInitialError(null);
    setStatusText('Fetching initial data...');
    setSelectedSymbolForChart(null);
    setCurrentFilterFn(null); 
    setAiFilterDescription(null);
    setCurrentChartConfig(null);
    setFullAiFilterResponse(null);
    setSignalLog([]); // Clear signal log on new data load

    try {
      const { symbols, tickers: initialTickers, klinesData } = await fetchTopPairsAndInitialKlines(interval, klineLimit);
      setAllSymbols(symbols);
      setTickers(initialTickers);
      setHistoricalData(klinesData);
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
  }, []); // Empty dependency array since we're only using setters

  useEffect(() => {
    loadInitialData(klineInterval, klineHistoryConfig.screenerLimit);
  }, [klineInterval, klineHistoryConfig.screenerLimit]); // Remove loadInitialData from deps since it's stable
  
  // Persist signal deduplication threshold to localStorage
  useEffect(() => {
    localStorage.setItem('signalDedupeThreshold', signalDedupeThreshold.toString());
  }, [signalDedupeThreshold]);
  
  // Persist signal history to localStorage
  useEffect(() => {
    const historyObj = Object.fromEntries(signalHistory);
    localStorage.setItem('signalHistory', JSON.stringify(historyObj));
  }, [signalHistory]);

  // Create stable handlers using useCallback
  const handleTickerUpdateStable = useCallback((tickerUpdate: Ticker) => {
    setTickers(prevTickers => {
      const newTickers = new Map(prevTickers);
      newTickers.set(tickerUpdate.s, tickerUpdate);
      return newTickers;
    });
  }, []);

  const handleKlineUpdateStable = useCallback((symbol: string, kline: Kline, isClosed: boolean) => {
    // Track bar counts for signal deduplication
    if (isClosed) {
      const currentCount = klineUpdateCountRef.current.get(symbol) || 0;
      klineUpdateCountRef.current.set(symbol, currentCount + 1);
      
      // Increment bar counts in signal history
      setSignalHistory(prev => {
        const newHistory = new Map(prev);
        const entry = newHistory.get(symbol);
        if (entry) {
          newHistory.set(symbol, {
            ...entry,
            barCount: entry.barCount + 1
          });
        }
        return newHistory;
      });
    }
    
    // Update signal and trade managers with current price
    const currentPrice = parseFloat(kline[4]); // Close price
    signalManager.updatePrice(symbol, currentPrice);
    tradeManager.updatePrice(symbol, currentPrice);
    
    setHistoricalData(prevKlines => {
      const newKlinesMap = new Map(prevKlines);
      const symbolKlines = newKlinesMap.get(symbol) ? [...newKlinesMap.get(symbol)!] : [];
      
      if (symbolKlines.length === 0) { 
          symbolKlines.push(kline);
      } else {
          if (isClosed) {
              if(kline[0] > symbolKlines[symbolKlines.length - 1][0]) {
                  symbolKlines.push(kline);
                  if (symbolKlines.length > KLINE_HISTORY_LIMIT) {
                      symbolKlines.shift();
                  }
              } else if (kline[0] === symbolKlines[symbolKlines.length - 1][0]) {
                  symbolKlines[symbolKlines.length - 1] = kline;
              }

          } else { 
              if (symbolKlines.length > 0 && symbolKlines[symbolKlines.length - 1][0] === kline[0]) {
                  symbolKlines[symbolKlines.length - 1] = kline;
              } else {
                  symbolKlines.push(kline);
                   if (symbolKlines.length > KLINE_HISTORY_LIMIT) {
                      symbolKlines.shift();
                  }
              }
          }
      }
      newKlinesMap.set(symbol, symbolKlines);
      
      return newKlinesMap;
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

    const handleKlineUpdate = (symbol: string, kline: Kline, isClosed: boolean) => {
      if (!isCleanedUp) {
        handleKlineUpdateStable(symbol, kline, isClosed);
      }
    };
    
    const connectWebSocketWithRetry = () => {
      if (isCleanedUp) return;
      
      try {
        ws = connectWebSocket(
          allSymbols,
          klineInterval,
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
  // Only re-run when symbols or interval changes, plus stable handlers
  }, [allSymbols, klineInterval, handleTickerUpdateStable, handleKlineUpdateStable]); 

  const handleNewSignal = useCallback((symbol: string, timestamp: number) => {
    const tickerData = tickers.get(symbol);
    if (!tickerData) return;
    
    // Check signal history for deduplication
    const historyEntry = signalHistory.get(symbol);
    const shouldCreateNewSignal = !historyEntry || historyEntry.barCount >= signalDedupeThreshold;
    
    console.log(`[${new Date(timestamp).toISOString()}] Signal for ${symbol}: barCount=${historyEntry?.barCount || 0}, threshold=${signalDedupeThreshold}, newSignal=${shouldCreateNewSignal}`);
    
    // Create signal through the new signal lifecycle system
    if (shouldCreateNewSignal && activeStrategy) {
      const filterResult = {
        symbol,
        price: parseFloat(tickerData.c),
        change24h: parseFloat(tickerData.P),
        volume24h: parseFloat(tickerData.q),
        matchedConditions: aiFilterDescription || ['Filter matched'],
      };
      
      createSignalFromFilter(filterResult);
    }
    
    setSignalLog(prevLog => {
      const shortDesc = aiFilterDescription && aiFilterDescription.length > 0 ? aiFilterDescription[0] : "AI Filter Active";
      
      if (shouldCreateNewSignal) {
        // Create new signal
        const newEntry: SignalLogEntry = {
          timestamp,
          symbol,
          interval: klineInterval,
          filterDesc: shortDesc,
          priceAtSignal: parseFloat(tickerData.c),
          changePercentAtSignal: parseFloat(tickerData.P),
          volumeAtSignal: parseFloat(tickerData.q),
          count: 1, // Initial count
        };
        
        // Update signal history - reset bar count for new signal
        setSignalHistory(prev => {
          const newHistory = new Map(prev);
          newHistory.set(symbol, {
            timestamp,
            barCount: 0,
          });
          return newHistory;
        });
        
        // Keep max 500 log entries for performance, prepending new ones
        return [newEntry, ...prevLog.slice(0, 499)];
      } else {
        // Increment count on existing signal by finding it in the array
        return prevLog.map(entry => {
          if (entry.symbol === symbol) {
            // Find the most recent signal for this symbol
            const sameSymbolSignals = prevLog.filter(e => e.symbol === symbol);
            if (sameSymbolSignals[0] === entry) {
              // This is the most recent signal for this symbol
              return {
                ...entry,
                count: (entry.count || 1) + 1,
              };
            }
          }
          return entry;
        });
      }
    });
  }, [aiFilterDescription, klineInterval, tickers, signalHistory, signalDedupeThreshold, activeStrategy, createSignalFromFilter]);

  // Multi-trader screener hook
  const handleMultiTraderResults = useCallback((results: TraderResult[]) => {
    results.forEach(result => {
      result.signalSymbols.forEach(symbol => {
        const ticker = tickers.get(symbol);
        if (ticker) {
          // Create signal with trader attribution
          const filterResult = {
            symbol,
            price: parseFloat(ticker.c),
            change24h: parseFloat(ticker.P),
            volume24h: parseFloat(ticker.q),
            matchedConditions: [`Trader: ${traders.find(t => t.id === result.traderId)?.name || 'Unknown'}`]
          };
          
          const signal = signalManager.createSignal(
            filterResult, 
            activeStrategy?.id || 'default',
            result.traderId
          );
          
          // Handle new signal
          handleNewSignal(symbol, Date.now());
          
          // Update trader metrics
          traderManager.incrementSignalCount(result.traderId);
        }
      });
    });
  }, [traders, tickers, activeStrategy, handleNewSignal]);

  const { isRunning: isMultiTraderRunning } = useMultiTraderScreener({
    traders,
    symbols: allSymbols,
    tickers,
    historicalData,
    onResults: handleMultiTraderResults,
    enabled: multiTraderEnabled && traders.some(t => t.enabled),
    interval: 5000 // Run every 5 seconds
  });

  const handleRunAiScreener = useCallback(async () => {
    if (!aiPrompt.trim()) {
      setAiScreenerError("Please enter conditions for the AI screener.");
      return;
    }
    
    // Check authentication
    if (authLoading) {
      return;
    }
    
    if (!user) {
      setPendingPrompt(aiPrompt);
      setShowAuthModal(true);
      return;
    }
    
    setIsAiScreenerLoading(true);
    setAiScreenerError(null);
    setCurrentFilterFn(null);
    setAiFilterDescription(null);
    setCurrentChartConfig(null);
    setFullAiFilterResponse(null); 
    setSignalLog([]); // Clear signal log for new filter
    setStreamingProgress('');
    setStreamingTokenCount(0);

    try {
      const response: AiFilterResponse = await generateFilterAndChartConfigStream(
        aiPrompt, 
        internalGeminiModelName, 
        klineInterval, 
        klineHistoryConfig.screenerLimit,
        (update: StreamingUpdate) => {
          switch (update.type) {
            case 'progress':
              console.log(`[${new Date().toISOString().slice(11, 23)}] [App] Progress update received:`, update.message);
              setStreamingProgress(update.message || '');
              if (update.tokenCount) setStreamingTokenCount(update.tokenCount);
              break;
            case 'stream':
              if (update.tokenCount) setStreamingTokenCount(update.tokenCount);
              break;
            case 'complete':
              break;
            case 'error':
              console.error(`[${new Date().toISOString().slice(11, 23)}] Streaming error:`, update.error);
              break;
          }
        }
      );
      
      const filterFunction = new Function(
          'ticker', 
          'klines', 
          'helpers',
          'hvnNodes',
          // The AI is expected to provide a valid function body that returns a boolean.
          // The try-catch here is for runtime errors within that valid body.
          `try { ${response.screenerCode} } catch(e) { console.error('Screener code runtime error for ticker:', ticker.s, e); return false; }`
      ) as (ticker: Ticker, klines: Kline[], helpers: ScreenerHelpersType, hvnNodes: any[]) => boolean;
      
      setCurrentFilterFn(() => filterFunction); 
      setAiFilterDescription(response.description);
      setCurrentChartConfig(response.indicators);
      setFullAiFilterResponse(response);

    } catch (error) {
      console.error("AI Screener error:", error);
      const errorMessage = error instanceof Error ? error.message : "AI processing failed.";
      setAiScreenerError(errorMessage);
    } finally {
      setIsAiScreenerLoading(false);
      // Keep the last progress message visible for a bit
      setTimeout(() => {
        setStreamingProgress('');
      }, 2000);
    }
  }, [aiPrompt, klineInterval, internalGeminiModelName, klineHistoryConfig.screenerLimit, authLoading, user]);

  // Monitor user auth state changes and handle pending screener
  useEffect(() => {
    // If user just authenticated and we have a pending prompt
    if (user && !authLoading && pendingPrompt) {
      setAiPrompt(pendingPrompt);
      setPendingPrompt('');
      // Small delay to ensure state is updated
      setTimeout(() => {
        handleRunAiScreener();
      }, 100);
    }
  }, [user, authLoading, pendingPrompt, handleRunAiScreener]);

  // Handle auth callback from magic link
  useEffect(() => {
    const handleAuthCallback = async () => {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      
      if (accessToken) {
        // Get stored prompt
        const pendingPrompt = localStorage.getItem('pendingScreenerPrompt');
        
        if (pendingPrompt) {
          // Set the prompt and remove from storage
          setAiPrompt(pendingPrompt);
          localStorage.removeItem('pendingScreenerPrompt');
          
          // Small delay to ensure auth state is updated
          setTimeout(() => {
            if (user) {
              handleRunAiScreener();
            }
          }, 100);
        }
        
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };
    
    handleAuthCallback();
  }, [user, handleRunAiScreener]);

  const handleRunHistoricalScan = () => {
    // Use multi-trader scanner if traders are enabled, otherwise use single filter scanner
    if (multiTraderEnabled && traders.some(t => t.enabled)) {
      startMultiTraderHistoricalScan(historicalScanConfig);
    } else if (currentFilterFn) {
      startHistoricalScan(historicalScanConfig);
    }
  };

  const handleShowAiResponse = () => {
    if (!fullAiFilterResponse) return;
    setModalTitle('📄 Full AI Filter Response');
    const formattedResponse = (
        <pre className="bg-[var(--tm-bg-primary)] p-3 md:p-4 rounded-md block whitespace-pre-wrap text-xs md:text-sm text-[var(--tm-accent)] overflow-x-auto">
          <code>
            {JSON.stringify(fullAiFilterResponse, null, 2)}
          </code>
        </pre>
      );
    setModalContent(formattedResponse);
    setIsModalOpen(true);
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
        const analysisText = await getSymbolAnalysis(symbol, tickerData, klineData, currentChartConfig, internalGeminiModelName, klineInterval, klineHistoryConfig.analysisLimit, strategy);
        
        // Parse the analysis if strategy is provided
        let decisionMatch = null;
        let reasoningMatch = null;
        let tradePlanMatch = null;
        
        if (strategy && strategy.trim()) {
            // Extract decision, reasoning, and trade plan from the analysis
            decisionMatch = analysisText.match(/DECISION:\s*(BUY|SELL|HOLD|WAIT)/i);
            reasoningMatch = analysisText.match(/REASONING:\s*([^\n]+)/i);
            tradePlanMatch = analysisText.match(/TRADE PLAN:\s*([^\n]+)/i);
            
            if (decisionMatch) {
                const decision = decisionMatch[1].toUpperCase() as 'BUY' | 'SELL' | 'HOLD' | 'WAIT';
                const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';
                const tradePlan = tradePlanMatch ? tradePlanMatch[1].trim() : '';
                
                // Update the signal log with analysis results
                setSignalLog(prevLog => 
                    prevLog.map(signal => 
                        signal.symbol === symbol 
                            ? { ...signal, tradeDecision: decision, reasoning, tradePlan, fullAnalysis: analysisText }
                            : signal
                    )
                );
            }
        }
        
        // Format the modal content with structured display if strategy is used
        if (strategy && strategy.trim() && decisionMatch) {
            const decision = decisionMatch[1].toUpperCase();
            const reasoning = reasoningMatch ? reasoningMatch[1].trim() : '';
            const tradePlan = tradePlanMatch ? tradePlanMatch[1].trim() : '';
            
            // Extract the technical analysis part (everything after the trade plan)
            const technicalAnalysisStart = analysisText.indexOf('\n\n', analysisText.indexOf('TRADE PLAN:'));
            const technicalAnalysis = technicalAnalysisStart > -1 ? analysisText.substring(technicalAnalysisStart).trim() : '';
            
            setModalContent(
                <div className="space-y-4 text-sm md:text-base">
                    <div className="border-l-4 border-[var(--tm-accent)] pl-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-[var(--tm-text-muted)] font-semibold">Decision:</span>
                            <span className={`px-3 py-1 text-sm font-bold rounded ${
                                decision === 'BUY' ? 'bg-[var(--tm-success)] text-[var(--tm-text-primary)]' :
                                decision === 'SELL' ? 'bg-[var(--tm-error)] text-[var(--tm-text-primary)]' :
                                decision === 'HOLD' ? 'bg-[var(--tm-info)] text-[var(--tm-text-primary)]' :
                                'bg-[var(--tm-bg-hover)] text-[var(--tm-text-primary)]'
                            }`}>
                                {decision}
                            </span>
                        </div>
                        <div className="mb-2">
                            <span className="text-[var(--tm-text-muted)] font-semibold">Reasoning:</span>
                            <p className="text-[var(--tm-text-secondary)] mt-1">{reasoning}</p>
                        </div>
                        <div>
                            <span className="text-[var(--tm-text-muted)] font-semibold">Trade Plan:</span>
                            <p className="text-[var(--tm-text-secondary)] mt-1">{tradePlan}</p>
                        </div>
                    </div>
                    {technicalAnalysis && (
                        <div>
                            <h4 className="text-[var(--tm-text-muted)] font-semibold mb-2">Technical Analysis:</h4>
                            <div className="whitespace-pre-wrap text-[var(--tm-text-secondary)]">{technicalAnalysis}</div>
                        </div>
                    )}
                </div>
            );
        } else {
            setModalContent(<div className="whitespace-pre-wrap text-sm md:text-base">{analysisText}</div>);
        }
    } catch (error) {
        console.error(`Symbol Analysis error for ${symbol}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Failed to get analysis.";
        setModalContent(<p className="text-[var(--tm-error)]">{errorMessage}</p>);
    } finally {
        setIsSymbolAnalysisLoading(false);
    }
  }, [tickers, historicalData, currentChartConfig, internalGeminiModelName, klineInterval, strategy]);


  const handleRowClick = (symbol: string) => {
    setSelectedSymbolForChart(symbol);
  };
  
  
  // Use selected trader's indicators if available, otherwise use AI screener indicators
  const chartConfigForDisplay = useMemo(() => {
    if (!selectedSymbolForChart) return null;
    
    // If a trader is selected, use its indicators
    if (selectedTraderId) {
      const selectedTrader = traders.find(t => t.id === selectedTraderId);
      console.log('Selected trader:', selectedTrader?.name, 'Indicators:', selectedTrader?.filter?.indicators);
      if (selectedTrader?.filter?.indicators) {
        return selectedTrader.filter.indicators;
      }
    }
    
    // Otherwise use the AI screener's indicators
    return currentChartConfig;
  }, [selectedSymbolForChart, selectedTraderId, traders, currentChartConfig]);


  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <Sidebar
        klineInterval={klineInterval}
        onKlineIntervalChange={setKlineInterval}
        selectedGeminiModel={selectedGeminiModel}
        onGeminiModelChange={setSelectedGeminiModel}
        aiPrompt={aiPrompt}
        onAiPromptChange={setAiPrompt}
        onRunAiScreener={handleRunAiScreener}
        isAiScreenerLoading={isAiScreenerLoading}
        aiFilterDescription={aiFilterDescription}
        onAnalyzeMarket={handleAnalyzeMarket}
        isMarketAnalysisLoading={isMarketAnalysisLoading}
        onShowAiResponse={handleShowAiResponse}
        aiScreenerError={aiScreenerError}
        strategy={strategy}
        onStrategyChange={setStrategy}
        signalDedupeThreshold={signalDedupeThreshold}
        onSignalDedupeThresholdChange={setSignalDedupeThreshold}
        hasActiveFilter={!!currentFilterFn}
        onRunHistoricalScan={handleRunHistoricalScan}
        isHistoricalScanning={isHistoricalScanning}
        historicalScanProgress={historicalScanProgress}
        historicalScanConfig={historicalScanConfig}
        onHistoricalScanConfigChange={setHistoricalScanConfig}
        onCancelHistoricalScan={cancelHistoricalScan}
        historicalSignalsCount={historicalSignals.length}
        klineHistoryConfig={klineHistoryConfig}
        onKlineHistoryConfigChange={setKlineHistoryConfig}
        streamingProgress={streamingProgress}
        streamingTokenCount={streamingTokenCount}
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
        currentFilterFn={multiTraderEnabled && traders.some(t => t.enabled) ? null : currentFilterFn} 
        klineInterval={klineInterval}
        selectedSymbolForChart={selectedSymbolForChart}
        chartConfigForDisplay={chartConfigForDisplay}
        onRowClick={handleRowClick}
        onAiInfoClick={handleAiInfoClick}
        signalLog={signalLog} // Pass signalLog to MainContent
        onNewSignal={handleNewSignal} // Pass handleNewSignal
        historicalSignals={historicalSignals} // Pass historical signals
        hasActiveFilter={!!currentFilterFn || (multiTraderEnabled && traders.some(t => t.enabled))}
        onRunHistoricalScan={handleRunHistoricalScan}
        isHistoricalScanning={multiTraderEnabled && traders.some(t => t.enabled) ? isMultiTraderHistoricalScanning : isHistoricalScanning}
        historicalScanProgress={multiTraderEnabled && traders.some(t => t.enabled) ? multiTraderHistoricalProgress : historicalScanProgress}
        historicalScanConfig={historicalScanConfig}
        onHistoricalScanConfigChange={setHistoricalScanConfig}
        onCancelHistoricalScan={multiTraderEnabled && traders.some(t => t.enabled) ? cancelMultiTraderHistoricalScan : cancelHistoricalScan}
        onSetAiPrompt={setAiPrompt}
        signalDedupeThreshold={signalDedupeThreshold}
        onSignalDedupeThresholdChange={setSignalDedupeThreshold}
      />
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalTitle}
      >
        {modalContent}
      </Modal>
      <EmailAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={() => {
          setShowAuthModal(false);
          // Auth success will trigger the callback handler
        }}
        pendingPrompt={pendingPrompt}
      />
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
