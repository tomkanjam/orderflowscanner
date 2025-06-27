import { Ticker, Kline } from '../types';
import * as helpers from '../screenerHelpers';

// Message types for communication with main thread
export interface TraderFilter {
  traderId: string;
  filterCode: string;
}

export interface MultiTraderScreenerMessage {
  id: string;
  type: 'RUN_MULTI_SCREENER' | 'RESET_CACHE';
  data?: {
    symbols: string[];
    tickers: Record<string, Ticker>; // Convert Map to object for serialization
    historicalData: Record<string, Kline[]>; // Convert Map to object
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
  symbols: string[],
  tickers: Record<string, Ticker>,
  historicalData: Record<string, Kline[]>
): TraderResult {
  try {
    // Create the filter function with HVN data
    let filterFunction: (ticker: Ticker, klines: Kline[], helpers: typeof helpers, hvnNodes: any[]) => boolean;
    
    try {
      filterFunction = new Function(
        'ticker', 
        'klines', 
        'helpers',
        'hvnNodes',
        `try { 
          ${filterCode} 
        } catch(e) { 
          console.error('Trader ${traderId} filter error for ticker:', ticker.s, e); 
          console.error('Filter code:', \`${filterCode.substring(0, 200)}...\`);
          return false; 
        }`
      ) as (ticker: Ticker, klines: Kline[], helpers: typeof helpers, hvnNodes: any[]) => boolean;
    } catch (syntaxError) {
      console.error(`Trader ${traderId} has invalid filter code syntax:`, syntaxError);
      console.error('Filter code:', filterCode.substring(0, 200) + '...');
      return { traderId, filteredSymbols: [], signalSymbols: [] };
    }
    
    const filteredSymbols: string[] = [];
    const signalSymbols: string[] = [];
    const currentMatches = new Set<string>();
    
    // Get previous matches for this trader
    const previousMatches = previousMatchesByTrader.get(traderId) || new Set<string>();
    
    // Run filter on each symbol
    for (const symbol of symbols) {
      const ticker = tickers[symbol];
      const klines = historicalData[symbol];
      
      if (!ticker || !klines || klines.length === 0) {
        continue;
      }
      
      try {
        // Calculate HVN nodes on demand
        const hvnNodes = helpers.calculateHighVolumeNodes(klines, { lookback: Math.min(klines.length, 100) });
        
        const matches = filterFunction(ticker, klines, helpers, hvnNodes);
        
        if (matches) {
          filteredSymbols.push(symbol);
          currentMatches.add(symbol);
          
          // Check if this is a new signal (wasn't matching before)
          if (!previousMatches.has(symbol)) {
            signalSymbols.push(symbol);
          }
        }
      } catch (error) {
        console.error(`Filter error for ${traderId} on ${symbol}:`, error);
      }
    }
    
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
  historicalData: Record<string, Kline[]>,
  traders: TraderFilter[]
): TraderResult[] {
  const startTime = performance.now();
  const results: TraderResult[] = [];
  
  // Run each trader's filter
  for (const trader of traders) {
    const result = runTraderFilter(
      trader.traderId,
      trader.filterCode,
      symbols,
      tickers,
      historicalData
    );
    results.push(result);
  }
  
  // Log performance
  const executionTime = performance.now() - startTime;
  console.log(`Multi-trader screener executed ${traders.length} traders on ${symbols.length} symbols in ${executionTime.toFixed(2)}ms`);
  
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
    console.log('Multi-trader screener cache cleared');
  }
});

// Export nothing as this is a worker script
export {};