import { Ticker, Kline, HistoricalSignal, HistoricalScanConfig, KlineInterval } from '../types';
import * as helpers from '../screenerHelpers';

interface TraderData {
  id: string;
  name: string;
  filterCode: string;
  filterDescription: string[];
  interval?: KlineInterval;
}

interface ScanMessage {
  type: 'scan';
  symbols: string[];
  historicalData: Record<string, Record<string, Kline[]>>;
  tickers: Record<string, Ticker>;
  traders: TraderData[];
  config: HistoricalScanConfig;
  klineInterval: string;
}

interface TraderHistoricalSignal extends HistoricalSignal {
  traderId: string;
  traderName: string;
}

// Run a trader's filter on historical data
function runTraderOnHistoricalData(
  trader: TraderData,
  symbol: string,
  klines: Kline[],
  ticker: Ticker,
  config: HistoricalScanConfig,
  symbolData: Record<string, Kline[]>
): TraderHistoricalSignal[] {
  const signals: TraderHistoricalSignal[] = [];
  
  try {
    // Create a wrapped helpers object that handles null returns gracefully
    const wrappedHelpers = new Proxy(helpers, {
      get(target, prop) {
        const original = target[prop as keyof typeof helpers];
        if (typeof original === 'function') {
          return (...args: any[]) => {
            try {
              const result = original.apply(target, args);
              // If the result is null and the filter tries to access properties, return a safe default
              if (result === null) {
                // Return an empty array for functions that normally return arrays
                if (prop === 'calculateRSI' || prop === 'calculateMACD' || prop === 'calculateBollingerBands' || 
                    prop === 'calculateStochRSI' || prop === 'calculateVolumeDelta') {
                  return [];
                }
                // Return 0 for functions that normally return numbers
                return 0;
              }
              return result;
            } catch (error) {
              console.error(`Helper function ${String(prop)} error:`, error);
              return prop === 'calculateRSI' || prop === 'calculateMACD' ? [] : 0;
            }
          };
        }
        return original;
      }
    });
    
    // Create the filter function with timeframes support
    const filterFunction = new Function(
      'ticker', 
      'klines', 
      'helpers',
      'hvnNodes',
      'timeframes',
      `try { ${trader.filterCode} } catch(e) { console.error('Trader ${trader.id} filter error:', e); return false; }`
    ) as (ticker: Ticker, klines: Kline[], helpers: typeof helpers, hvnNodes: any[], timeframes: Record<string, Kline[]>) => boolean;
    
    const { lookbackBars, maxSignalsPerSymbol } = config;
    const startIndex = Math.max(0, klines.length - lookbackBars);
    
    // Scan through historical data
    for (let i = startIndex; i < klines.length && signals.length < maxSignalsPerSymbol; i++) {
      // Create a slice of klines up to this point
      const historicalSlice = klines.slice(0, i + 1);
      
      // Skip if we don't have enough data for meaningful analysis
      // StochRSI needs at least 28 bars (14 for RSI + 14 for Stochastic)
      if (historicalSlice.length < 30) continue;
      
      try {
        // Calculate HVN nodes for this point in history
        const hvnNodes = helpers.calculateHighVolumeNodes(historicalSlice, { 
          lookback: Math.min(historicalSlice.length, 100) 
        });
        
        // Create timeframes object with historical slices for each interval
        const timeframes: Record<string, Kline[]> = {};
        for (const [interval, fullKlines] of Object.entries(symbolData)) {
          // Create historical slice for each timeframe up to the current point
          if (fullKlines && fullKlines.length > 0) {
            // Find the corresponding historical point for this interval
            const currentTimestamp = historicalSlice[historicalSlice.length - 1][0];
            let sliceEndIndex = fullKlines.findIndex(k => k[0] > currentTimestamp);
            if (sliceEndIndex === -1) sliceEndIndex = fullKlines.length;
            timeframes[interval] = fullKlines.slice(0, sliceEndIndex);
          }
        }
        
        // Run the filter with wrapped helpers and timeframes
        const matches = filterFunction(ticker, historicalSlice, wrappedHelpers, hvnNodes, timeframes);
        
        if (matches) {
          const kline = klines[i];
          const signal: TraderHistoricalSignal = {
            timestamp: Date.now(), // When we found it
            klineTimestamp: kline[0], // When it occurred
            symbol,
            interval: config.scanInterval.toString(),
            filterDesc: trader.filterDescription.length > 0 ? trader.filterDescription[0] : 'Trader Signal',
            priceAtSignal: parseFloat(kline[4]), // Close price
            changePercentAtSignal: parseFloat(ticker.P),
            volumeAtSignal: parseFloat(kline[5]),
            count: 1,
            traderId: trader.id,
            traderName: trader.name,
          };
          
          // Add indicator snapshot if requested
          if (config.includeIndicatorSnapshots) {
            // This would require passing indicators from the trader
            // For now, we'll skip this feature
          }
          
          signals.push(signal);
        }
      } catch (error) {
        console.error(`Error scanning ${symbol} at index ${i}:`, error);
      }
    }
  } catch (error) {
    console.error(`Failed to create filter function for trader ${trader.id}:`, error);
  }
  
  return signals;
}

// Main worker message handler
self.addEventListener('message', (event: MessageEvent<ScanMessage>) => {
  const { type, symbols, historicalData, tickers, traders, config, klineInterval } = event.data;
  
  if (type !== 'scan') return;
  
  const allSignals: TraderHistoricalSignal[] = [];
  const totalOperations = symbols.length * traders.length;
  let completedOperations = 0;
  
  try {
    // Process each symbol for each trader
    for (const symbol of symbols) {
      const symbolData = historicalData[symbol];
      const ticker = tickers[symbol];
      
      if (!symbolData || !ticker) {
        completedOperations += traders.length;
        continue;
      }
      
      for (const trader of traders) {
        // Get klines for the trader's interval, fallback to 1m
        const interval = trader.interval || '1m' as KlineInterval;
        const klines = symbolData[interval] || symbolData['1m'];
        
        if (!klines || klines.length === 0) {
          completedOperations++;
          continue;
        }
        
        // Run the trader's filter on this symbol's historical data
        const signals = runTraderOnHistoricalData(trader, symbol, klines, ticker, config, symbolData);
        allSignals.push(...signals);
        
        completedOperations++;
        
        // Send progress update
        const percentComplete = Math.round((completedOperations / totalOperations) * 100);
        self.postMessage({
          type: 'progress',
          progress: {
            currentSymbol: symbol,
            processedSymbols: Math.floor(completedOperations / traders.length),
            totalSymbols: symbols.length,
            percentComplete,
            foundSignals: allSignals.length,
          }
        });
      }
    }
    
    // Send completion message
    self.postMessage({
      type: 'complete',
      signals: allSignals,
    });
    
  } catch (error) {
    console.error('Historical scanner error:', error);
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
});