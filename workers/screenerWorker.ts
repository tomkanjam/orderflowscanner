import { Ticker, Kline } from '../types';
import * as helpers from '../screenerHelpers';

// Message types for communication with main thread
export interface ScreenerWorkerMessage {
  id: string;
  type: 'RUN_SCREENER';
  data: {
    symbols: string[];
    tickers: Record<string, Ticker>; // Convert Map to object for serialization
    historicalData: Record<string, Kline[]>; // Convert Map to object
    filterCode: string;
  };
}

export interface ScreenerWorkerResponse {
  id: string;
  type: 'SCREENER_RESULT' | 'SCREENER_ERROR';
  data?: {
    filteredSymbols: string[];
    signalSymbols: string[]; // Symbols that newly match the filter
  };
  error?: string;
}

// Cache to track which symbols previously matched
let previousMatches = new Set<string>();

// Execute the screener filter function
function runScreenerFilter(
  symbols: string[],
  tickers: Record<string, Ticker>,
  historicalData: Record<string, Kline[]>,
  filterCode: string
): { filteredSymbols: string[], signalSymbols: string[] } {
  try {
    // Create the filter function with HVN data
    const filterFunction = new Function(
      'ticker', 
      'klines', 
      'helpers',
      'hvnNodes',
      `try { ${filterCode} } catch(e) { console.error('Screener code runtime error for ticker:', ticker.s, e); return false; }`
    ) as (ticker: Ticker, klines: Kline[], helpers: typeof helpers, hvnNodes: any[]) => boolean;
    
    const filteredSymbols: string[] = [];
    const signalSymbols: string[] = [];
    const currentMatches = new Set<string>();
    
    // Run filter on each symbol
    for (const symbol of symbols) {
      const ticker = tickers[symbol];
      const klines = historicalData[symbol];
      // Calculate HVN nodes on demand
      const hvnNodes = helpers.calculateHighVolumeNodes(klines, { lookback: Math.min(klines.length, 100) });
      
      if (!ticker || !klines || klines.length === 0) {
        continue;
      }
      
      try {
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
        console.error(`Filter error for ${symbol}:`, error);
      }
    }
    
    // Update the cache for next run
    previousMatches = currentMatches;
    
    return { filteredSymbols, signalSymbols };
    
  } catch (error) {
    console.error('Screener execution failed:', error);
    throw error;
  }
}

// Listen for messages from main thread
self.addEventListener('message', (event: MessageEvent<ScreenerWorkerMessage>) => {
  const { id, type, data } = event.data;
  
  if (type === 'RUN_SCREENER') {
    try {
      const result = runScreenerFilter(
        data.symbols,
        data.tickers,
        data.historicalData,
        data.filterCode
      );
      
      const response: ScreenerWorkerResponse = {
        id,
        type: 'SCREENER_RESULT',
        data: result
      };
      
      self.postMessage(response);
    } catch (error) {
      const response: ScreenerWorkerResponse = {
        id,
        type: 'SCREENER_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      self.postMessage(response);
    }
  }
});

// Reset cache when filter changes
self.addEventListener('message', (event: MessageEvent<{ type: 'RESET_CACHE' }>) => {
  if (event.data.type === 'RESET_CACHE') {
    previousMatches.clear();
  }
});

// Export nothing as this is a worker script
export {};