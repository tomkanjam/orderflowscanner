
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import Modal from './components/Modal';
import { Ticker, Kline, AiFilterResponse, CustomIndicatorConfig, KlineInterval, GeminiModelOption, SignalLogEntry } from './types';
import { fetchTopPairsAndInitialKlines, connectWebSocket } from './services/binanceService';
import { generateFilterAndChartConfig, getSymbolAnalysis, getMarketAnalysis } from './services/geminiService';
import { KLINE_HISTORY_LIMIT, DEFAULT_KLINE_INTERVAL, DEFAULT_GEMINI_MODEL, GEMINI_MODELS } from './constants';
import * as screenerHelpers from './screenerHelpers';

// Define the type for the screenerHelpers module
type ScreenerHelpersType = typeof screenerHelpers;

const App: React.FC = () => {
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [tickers, setTickers] = useState<Map<string, Ticker>>(new Map());
  const [historicalData, setHistoricalData] = useState<Map<string, Kline[]>>(new Map());
  
  const [klineInterval, setKlineInterval] = useState<KlineInterval>(DEFAULT_KLINE_INTERVAL);
  const [selectedGeminiModel, setSelectedGeminiModel] = useState<GeminiModelOption>(DEFAULT_GEMINI_MODEL);
  
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [currentFilterFn, setCurrentFilterFn] = useState<((ticker: Ticker, klines: Kline[], helpers: ScreenerHelpersType) => boolean) | null>(null);
  const [aiFilterDescription, setAiFilterDescription] = useState<string[] | null>(null);
  const [fullAiFilterResponse, setFullAiFilterResponse] = useState<AiFilterResponse | null>(null);
  const [currentChartConfig, setCurrentChartConfig] = useState<CustomIndicatorConfig[] | null>(null);

  const [signalLog, setSignalLog] = useState<SignalLogEntry[]>([]); // New state for signal log

  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const [isAiScreenerLoading, setIsAiScreenerLoading] = useState<boolean>(false);
  const [aiScreenerError, setAiScreenerError] = useState<string | null>(null);
  const [isMarketAnalysisLoading, setIsMarketAnalysisLoading] = useState<boolean>(false);
  const [isSymbolAnalysisLoading, setIsSymbolAnalysisLoading] = useState<boolean>(false);
  
  const [statusText, setStatusText] = useState<string>('Connecting...');
  const [statusLightClass, setStatusLightClass] = useState<string>('bg-gray-500');
  
  const [selectedSymbolForChart, setSelectedSymbolForChart] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalTitle, setModalTitle] = useState<string>('');
  const [modalContent, setModalContent] = useState<React.ReactNode>('');

  const internalGeminiModelName = useMemo(() => {
    return GEMINI_MODELS.find(m => m.value === selectedGeminiModel)?.internalModel || GEMINI_MODELS[0].internalModel;
  }, [selectedGeminiModel]);

  const loadInitialData = useCallback(async (interval: KlineInterval) => {
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
      const { symbols, tickers: initialTickers, klinesData } = await fetchTopPairsAndInitialKlines(interval);
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
      setStatusLightClass('bg-red-500');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialData(klineInterval);
  }, [klineInterval, loadInitialData]);

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
        setTickers(prevTickers => new Map(prevTickers).set(tickerUpdate.s, tickerUpdate));
      }
    };

    const handleKlineUpdate = (symbol: string, kline: Kline, isClosed: boolean) => {
      if (!isCleanedUp) {
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
              setStatusLightClass('bg-green-500'); 
            }
          },
          (errorEvent) => { 
            if (!isCleanedUp) {
              console.error("WebSocket Error:", errorEvent); 
              setStatusText('WS Error'); 
              setStatusLightClass('bg-red-500');
              
              // Reconnect after error
              reconnectTimeout = setTimeout(connectWebSocketWithRetry, 5000);
            }
          },
          () => { 
            if (!isCleanedUp) {
              setStatusText('Disconnected'); 
              setStatusLightClass('bg-yellow-500');
              
              // Reconnect after close
              reconnectTimeout = setTimeout(connectWebSocketWithRetry, 3000);
            }
          }
        );
      } catch(e) {
        if (!isCleanedUp) {
          console.error("Failed to connect WebSocket:", e);
          setStatusText('WS Failed');
          setStatusLightClass('bg-red-500');
          
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
  // Only re-run when symbols or interval changes
  }, [allSymbols, klineInterval]); 

  const handleNewSignal = useCallback((symbol: string, timestamp: number) => {
    const tickerData = tickers.get(symbol);
    if (!tickerData) return;
    
    setSignalLog(prevLog => {
      const shortDesc = aiFilterDescription && aiFilterDescription.length > 0 ? aiFilterDescription[0] : "AI Filter Active";
      const newEntry: SignalLogEntry = {
        timestamp,
        symbol,
        interval: klineInterval,
        filterDesc: shortDesc,
        priceAtSignal: parseFloat(tickerData.c),
        changePercentAtSignal: parseFloat(tickerData.P),
        volumeAtSignal: parseFloat(tickerData.q),
      };
      // Keep max 500 log entries for performance, prepending new ones
      return [newEntry, ...prevLog.slice(0, 499)]; 
    });
  }, [aiFilterDescription, klineInterval, tickers]);

  const handleRunAiScreener = useCallback(async () => {
    if (!aiPrompt.trim()) {
      setAiScreenerError("Please enter conditions for the AI screener.");
      return;
    }
    setIsAiScreenerLoading(true);
    setAiScreenerError(null);
    setCurrentFilterFn(null);
    setAiFilterDescription(null);
    setCurrentChartConfig(null);
    setFullAiFilterResponse(null); 
    setSignalLog([]); // Clear signal log for new filter

    try {
      const response: AiFilterResponse = await generateFilterAndChartConfig(aiPrompt, internalGeminiModelName, klineInterval);
      
      const filterFunction = new Function(
          'ticker', 
          'klines', 
          'helpers', 
          // The AI is expected to provide a valid function body that returns a boolean.
          // The try-catch here is for runtime errors within that valid body.
          `try { ${response.screenerCode} } catch(e) { console.error('Screener code runtime error for ticker:', ticker.s, e); return false; }`
      ) as (ticker: Ticker, klines: Kline[], helpers: ScreenerHelpersType) => boolean;
      
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
    }
  }, [aiPrompt, klineInterval, internalGeminiModelName]);

  const handleClearFilter = () => {
    setAiPrompt('');
    setCurrentFilterFn(null);
    setAiFilterDescription(null);
    setCurrentChartConfig(null);
    setFullAiFilterResponse(null);
    setAiScreenerError(null);
    setSignalLog([]); // Clear signal log when filter is cleared
  };

  const handleShowAiResponse = () => {
    if (!fullAiFilterResponse) return;
    setModalTitle('📄 Full AI Filter Response');
    const formattedResponse = (
        <pre className="bg-gray-900 p-3 md:p-4 rounded-md block whitespace-pre-wrap text-xs md:text-sm text-yellow-300 overflow-x-auto">
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
    setModalContent(<div className="text-center py-4"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mx-auto"></div><p className="mt-2">Generating analysis...</p></div>);
    setIsModalOpen(true);

    try {
        const topTickersList = Array.from(tickers.values()).sort((a,b) => parseFloat(b.q) - parseFloat(a.q)).slice(0,10);
        const analysisText = await getMarketAnalysis(topTickersList, internalGeminiModelName, klineInterval);
        setModalContent(<div className="whitespace-pre-wrap text-sm md:text-base">{analysisText}</div>);
    } catch (error) {
        console.error("Market Analysis error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to get market analysis.";
        setModalContent(<p className="text-red-400">{errorMessage}</p>);
    } finally {
        setIsMarketAnalysisLoading(false);
    }
  }, [tickers, internalGeminiModelName, klineInterval]);

  const handleAiInfoClick = useCallback(async (symbol: string, event: React.MouseEvent) => {
    event.stopPropagation(); 
    setIsSymbolAnalysisLoading(true); 
    setModalTitle(`✨ AI Analysis for ${symbol}`);
    setModalContent(<div className="text-center py-4"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mx-auto"></div><p className="mt-2">Generating analysis for {symbol}...</p></div>);
    setIsModalOpen(true);

    const tickerData = tickers.get(symbol);
    const klineData = historicalData.get(symbol);

    if (!tickerData || !klineData) {
        setModalContent(<p className="text-red-400">Data not available for {symbol}.</p>);
        setIsSymbolAnalysisLoading(false);
        return;
    }

    try {
        const analysisText = await getSymbolAnalysis(symbol, tickerData, klineData, currentChartConfig, internalGeminiModelName, klineInterval);
        setModalContent(<div className="whitespace-pre-wrap text-sm md:text-base">{analysisText}</div>);
    } catch (error) {
        console.error(`Symbol Analysis error for ${symbol}:`, error);
        const errorMessage = error instanceof Error ? error.message : "Failed to get analysis.";
        setModalContent(<p className="text-red-400">{errorMessage}</p>);
    } finally {
        setIsSymbolAnalysisLoading(false);
    }
  }, [tickers, historicalData, currentChartConfig, internalGeminiModelName, klineInterval]);


  const handleRowClick = (symbol: string) => {
    setSelectedSymbolForChart(symbol);
  };
  
  const chartConfigForDisplay = selectedSymbolForChart ? currentChartConfig : null;


  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-gray-900 text-white">
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
        onClearFilter={handleClearFilter}
        onAnalyzeMarket={handleAnalyzeMarket}
        isMarketAnalysisLoading={isMarketAnalysisLoading}
        onShowAiResponse={handleShowAiResponse}
        aiScreenerError={aiScreenerError}
      />
      <MainContent
        statusText={statusText}
        statusLightClass={statusLightClass}
        initialLoading={initialLoading}
        initialError={initialError}
        allSymbols={allSymbols}
        tickers={tickers}
        historicalData={historicalData}
        currentFilterFn={currentFilterFn} 
        klineInterval={klineInterval}
        selectedSymbolForChart={selectedSymbolForChart}
        chartConfigForDisplay={chartConfigForDisplay}
        onRowClick={handleRowClick}
        onAiInfoClick={handleAiInfoClick}
        signalLog={signalLog} // Pass signalLog to MainContent
        onNewSignal={handleNewSignal} // Pass handleNewSignal
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

export default App;
