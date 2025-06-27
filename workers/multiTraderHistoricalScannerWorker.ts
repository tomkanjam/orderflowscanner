import { Ticker, Kline, HistoricalSignal, HistoricalScanConfig } from '../types';
import * as helpers from '../screenerHelpers';

interface TraderData {
  id: string;
  name: string;
  filterCode: string;
  filterDescription: string[];
}

interface ScanMessage {
  type: 'scan';
  symbols: string[];
  historicalData: Record<string, Kline[]>;
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
  config: HistoricalScanConfig
): TraderHistoricalSignal[] {
  const signals: TraderHistoricalSignal[] = [];
  
  try {
    // Create the filter function
    const filterFunction = new Function(
      'ticker', 
      'klines', 
      'helpers',
      'hvnNodes',
      `try { ${trader.filterCode} } catch(e) { console.error('Trader ${trader.id} filter error:', e); return false; }`
    ) as (ticker: Ticker, klines: Kline[], helpers: typeof helpers, hvnNodes: any[]) => boolean;
    
    const { lookbackBars, maxSignalsPerSymbol } = config;
    const startIndex = Math.max(0, klines.length - lookbackBars);
    
    // Scan through historical data
    for (let i = startIndex; i < klines.length && signals.length < maxSignalsPerSymbol; i++) {
      // Create a slice of klines up to this point
      const historicalSlice = klines.slice(0, i + 1);
      
      if (historicalSlice.length < 2) continue; // Need at least 2 klines
      
      try {
        // Calculate HVN nodes for this point in history
        const hvnNodes = helpers.calculateHighVolumeNodes(historicalSlice, { 
          lookback: Math.min(historicalSlice.length, 100) 
        });
        
        // Run the filter
        const matches = filterFunction(ticker, historicalSlice, helpers, hvnNodes);
        
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
      const klines = historicalData[symbol];
      const ticker = tickers[symbol];
      
      if (!klines || !ticker || klines.length === 0) {
        completedOperations += traders.length;
        continue;
      }
      
      for (const trader of traders) {
        // Run the trader's filter on this symbol's historical data
        const signals = runTraderOnHistoricalData(trader, symbol, klines, ticker, config);
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