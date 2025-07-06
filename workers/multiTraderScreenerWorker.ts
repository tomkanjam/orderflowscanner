import { Ticker, Kline, KlineInterval } from '../types';
import * as helpers from '../screenerHelpers';

// Message types for communication with main thread
export interface TraderFilter {
  traderId: string;
  filterCode: string;
  interval?: KlineInterval; // The interval this trader uses
}

export interface MultiTraderScreenerMessage {
  id: string;
  type: 'RUN_MULTI_SCREENER' | 'RESET_CACHE';
  data?: {
    symbols: string[];
    tickers: Record<string, Ticker>; // Convert Map to object for serialization
    historicalData: Record<string, Record<string, Kline[]>>; // symbol -> interval -> klines
    traders: TraderFilter[]; // Multiple trader filters to run
  };
}

export interface TraderResult {
  traderId: string;
  filteredSymbols: string[];
  signalSymbols: string[]; // Symbols that newly match the filter
}

export interface MultiTraderScreenerResponse {
  id: string;
  type: 'MULTI_SCREENER_RESULT' | 'MULTI_SCREENER_ERROR';
  data?: {
    results: TraderResult[];
    totalSymbols: number;
    executionTime: number;
  };
  error?: string;
}

// Cache to track which symbols previously matched for each trader
const previousMatchesByTrader = new Map<string, Set<string>>();

// Execute filter for a single trader
function runTraderFilter(
  traderId: string,
  filterCode: string,
  interval: KlineInterval,
  symbols: string[],
  tickers: Record<string, Ticker>,
  historicalData: Record<string, Record<string, Kline[]>>
): TraderResult {
  // console.log(`[Worker] Running filter for trader ${traderId}, checking ${symbols.length} symbols, interval: ${interval}`);
  const previousMatches = previousMatchesByTrader.get(traderId) || new Set<string>();
  
  try {
    // Create the filter function with HVN data
    let filterFunction: (ticker: Ticker, klines: Kline[], helpers: typeof helpers, hvnNodes: any[]) => boolean;
    
    try {
      // Log the first 500 chars of filter code
      // console.log(`[Worker] Trader ${traderId} filter code preview: ${filterCode.substring(0, 500)}...`);
      
      filterFunction = new Function(
        'ticker', 
        'klines', 
        'helpers',
        'hvnNodes',
        `try { 
          ${filterCode} 
        } catch(e) { 
          console.error('[Worker] Filter execution error:', e);
          return false; 
        }`
      ) as (ticker: Ticker, klines: Kline[], helpers: typeof helpers, hvnNodes: any[]) => boolean;
      
      // console.log(`[Worker] Successfully created filter function for trader ${traderId}`);
    } catch (syntaxError) {
      console.error(`[Worker] Trader ${traderId} has invalid filter code syntax:`, syntaxError);
      return { traderId, filteredSymbols: [], signalSymbols: [] };
    }
    
    const filteredSymbols: string[] = [];
    const signalSymbols: string[] = [];
    const currentMatches = new Set<string>();
    
    // Log sample data for first symbol to verify structure
    let loggedSample = false;
    let checkedCount = 0;
    let skippedNoData = 0;
    let skippedInsufficientData = 0;
    
    // Run filter on each symbol
    for (const symbol of symbols) {
      const ticker = tickers[symbol];
      const symbolData = historicalData[symbol];
      const klines = symbolData?.[interval] || symbolData?.['1m']; // Use trader's interval or fallback to 1m
      
      if (!ticker || !klines || klines.length === 0) {
        skippedNoData++;
        if (symbol === 'BTCUSDT' || symbol === 'ETHUSDT') {
          // console.log(`[Worker] ${symbol} check - ticker: ${!!ticker}, klines: ${klines ? klines.length : 'null'}, interval: ${interval}`);
        }
        continue;
      }
      
      // Skip if we don't have enough data for meaningful analysis
      // StochRSI needs at least 28 bars (14 for RSI + 14 for Stochastic)
      if (klines.length < 30) {
        skippedInsufficientData++;
        continue;
      }
      
      // Log sample data for first valid symbol
      if (!loggedSample) {
        loggedSample = true;
        // console.log(`[Worker] Sample data for ${symbol}:`, {
        //   tickerPrice: ticker.c,
        //   tickerVolume: ticker.v,
        //   tickerChange: ticker.P,
        //   klinesCount: klines.length,
        //   interval: interval,
        //   latestKline: klines.length > 0 ? {
        //     time: new Date(klines[klines.length - 1][0]).toISOString(),
        //     open: klines[klines.length - 1][1],
        //     high: klines[klines.length - 1][2],
        //     low: klines[klines.length - 1][3],
        //     close: klines[klines.length - 1][4],
        //     volume: klines[klines.length - 1][5]
        //   } : null
        // });
      }
      
      checkedCount++;
      
      try {
        // Calculate HVN nodes on demand
        const hvnNodes = helpers.calculateHighVolumeNodes(klines, { lookback: Math.min(klines.length, 100) });
        
        const matches = filterFunction(ticker, klines, helpers, hvnNodes);
        
        // Debug logging for Momentum Breakout Scalper
        if (traderId.includes('momentum') || traderId.includes('breakout')) {
          // Execute filter with detailed debugging
          try {
            const debugFilterCode = filterCode.replace(
              'return false;',
              `console.log('[Filter Debug] ${symbol} failed at:', arguments.callee.caller.arguments); return false;`
            );
            const currentClose = parseFloat(klines[klines.length - 1][4]);
            const prevClose = parseFloat(klines[klines.length - 2][4]);
            const currentVolume = parseFloat(klines[klines.length - 1][5]);
            const recentHigh = helpers.getHighestHigh(klines.slice(-21, -1), 20);
            const avgVolume = helpers.calculateAvgVolume(klines.slice(-21, -1), 20);
            
            // console.log(`[Worker] Momentum Breakout Debug for ${symbol}:`, {
            //   currentClose,
            //   prevClose,
            //   recentHigh,
            //   breakoutOccurred: prevClose < recentHigh && currentClose > recentHigh,
            //   currentVolume,
            //   avgVolume,
            //   volumeRatio: currentVolume / avgVolume,
            //   volumeThreshold: 1.5,
            //   meetsVolumeReq: currentVolume >= avgVolume * 1.5
            // });
          } catch (debugError) {
            console.error('[Worker] Debug error:', debugError);
          }
        }
        
        if (matches) {
          // console.log(`[Worker] ✅ Trader ${traderId} matched symbol ${symbol}`, {
          //   price: ticker.c,
          //   change: ticker.P,
          //   volume: ticker.v
          // });
          filteredSymbols.push(symbol);
          currentMatches.add(symbol);
          
          // Check if this is a new signal (wasn't matching before)
          if (!previousMatches.has(symbol)) {
            signalSymbols.push(symbol);
            // New signal detected
          }
        } else if (checkedCount <= 5) {
          // Log details for first few non-matches to understand why
          // console.log(`[Worker] ❌ Trader ${traderId} did not match ${symbol}`, {
          //   price: ticker.c,
          //   change: ticker.P,
          //   volume: ticker.v
          // });
        }
      } catch (error) {
        console.error(`Filter error for ${traderId} on ${symbol}:`, error);
      }
    }
    
    // Trader filter complete with summary
    // console.log(`[Worker] Trader ${traderId} filter complete:`, {
    //   totalSymbols: symbols.length,
    //   skippedNoData,
    //   skippedInsufficientData,
    //   checkedSymbols: checkedCount,
    //   matchedSymbols: filteredSymbols.length,
    //   newSignals: signalSymbols.length,
    //   matches: filteredSymbols.slice(0, 10) // Show first 10 matches
    // });
    
    // Update the cache for next run
    previousMatchesByTrader.set(traderId, currentMatches);
    
    return { traderId, filteredSymbols, signalSymbols };
    
  } catch (error) {
    console.error(`Trader ${traderId} execution failed:`, error);
    return { traderId, filteredSymbols: [], signalSymbols: [] };
  }
}

// Execute multiple trader filters in parallel
function runMultiTraderScreener(
  symbols: string[],
  tickers: Record<string, Ticker>,
  historicalData: Record<string, Record<string, Kline[]>>,
  traders: TraderFilter[]
): TraderResult[] {
  const startTime = performance.now();
  const results: TraderResult[] = [];
  
  // Run each trader's filter
  for (const trader of traders) {
    const result = runTraderFilter(
      trader.traderId,
      trader.filterCode,
      trader.interval || '1m' as KlineInterval,
      symbols,
      tickers,
      historicalData
    );
    results.push(result);
  }
  
  // Log performance
  const executionTime = performance.now() - startTime;
  // Multi-trader screener execution complete
  
  return results;
}

// Listen for messages from main thread
self.addEventListener('message', (event: MessageEvent<MultiTraderScreenerMessage>) => {
  const { id, type, data } = event.data;
  
  if (type === 'RUN_MULTI_SCREENER' && data) {
    const startTime = performance.now();
    
    try {
      const results = runMultiTraderScreener(
        data.symbols,
        data.tickers,
        data.historicalData,
        data.traders
      );
      
      const response: MultiTraderScreenerResponse = {
        id,
        type: 'MULTI_SCREENER_RESULT',
        data: {
          results,
          totalSymbols: data.symbols.length,
          executionTime: performance.now() - startTime
        }
      };
      
      self.postMessage(response);
    } catch (error) {
      const response: MultiTraderScreenerResponse = {
        id,
        type: 'MULTI_SCREENER_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      self.postMessage(response);
    }
  } else if (type === 'RESET_CACHE') {
    // Clear all trader caches
    previousMatchesByTrader.clear();
  }
});

// Export nothing as this is a worker script
export {};