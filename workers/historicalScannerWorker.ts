import { Kline, Ticker, HistoricalScanConfig, HistoricalSignal, HistoricalScanProgress, KlineInterval } from '../types';
import * as helpers from '../screenerHelpers';

interface ScanRequest {
  symbols: string[];
  historicalData: Record<string, Kline[]>;
  tickers: Record<string, Ticker>;
  filterCode: string;
  config: HistoricalScanConfig;
  klineInterval: KlineInterval;
}

interface ScanResponse {
  type: 'progress' | 'complete' | 'error';
  progress?: HistoricalScanProgress;
  signals?: HistoricalSignal[];
  error?: string;
}

// Helper type for screenerHelpers
type ScreenerHelpersType = typeof helpers;

// Sliding window implementation
function* createSlidingWindows(
  klines: Kline[],
  config: HistoricalScanConfig
): Generator<{ window: Kline[], index: number }> {
  // Use bar count directly
  const startIndex = Math.max(0, klines.length - config.lookbackBars);
  
  for (let i = startIndex; i < klines.length; i += config.scanInterval) {
    // Ensure we have enough data for indicators (100 bars minimum)
    const windowStart = Math.max(0, i - 100);
    const window = klines.slice(windowStart, i + 1);
    yield { window, index: i };
  }
}

// Capture current indicator values
function captureIndicators(klines: Kline[]): HistoricalSignal['indicators'] {
  try {
    const closes = klines.map(k => parseFloat(k[4])); // close price is at index 4
    const highs = klines.map(k => parseFloat(k[2]));
    const lows = klines.map(k => parseFloat(k[3]));
    const volumes = klines.map(k => parseFloat(k[5]));
    
    // Get latest values
    // For MACD, we need the latest value from the series
    const macdSeries = helpers.calculateMACDValues(closes, 12, 26, 9);
    const macd = macdSeries.macd.length > 0 ? macdSeries.macd[macdSeries.macd.length - 1] : null;
    const macdSignal = macdSeries.signal.length > 0 ? macdSeries.signal[macdSeries.signal.length - 1] : null;
    const macdHistogram = macdSeries.histogram.length > 0 ? macdSeries.histogram[macdSeries.histogram.length - 1] : null;
    
    // Use calculateMA instead of calculateSMA
    const ma20 = helpers.calculateMA(klines, 20);
    const ma50 = helpers.calculateMA(klines, 50);
    
    // Calculate Bollinger Bands using standard deviation
    const bbMiddle = ma20;
    let bbUpper = null;
    let bbLower = null;
    
    if (bbMiddle !== null && closes.length >= 20) {
      const relevantCloses = closes.slice(-20);
      const avg = relevantCloses.reduce((a, b) => a + b, 0) / relevantCloses.length;
      const squareDiffs = relevantCloses.map(value => Math.pow(value - avg, 2));
      const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / relevantCloses.length;
      const stdDev = Math.sqrt(avgSquareDiff);
      bbUpper = bbMiddle + (2 * stdDev);
      bbLower = bbMiddle - (2 * stdDev);
    }
    const latestVolume = volumes[volumes.length - 1];
    
    // Get latest RSI value from the series
    const rsiSeries = helpers.calculateRSI(closes, 14);
    const latestRsi = rsiSeries && rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : null;
    
    return {
      rsi: latestRsi !== null ? latestRsi : undefined,
      macd: (macd !== null && macdSignal !== null && macdHistogram !== null) ? {
        macd: macd,
        signal: macdSignal,
        histogram: macdHistogram
      } : undefined,
      ma20: ma20 !== null ? ma20 : undefined,
      ma50: ma50 !== null ? ma50 : undefined,
      bb: (bbUpper !== null && bbMiddle !== null && bbLower !== null) ? {
        upper: bbUpper,
        middle: bbMiddle,
        lower: bbLower
      } : undefined,
      volume: latestVolume
    };
  } catch (error) {
    console.error('Error capturing indicators:', error);
    return undefined;
  }
}

// Signal detection logic
function detectSignal(
  symbol: string,
  ticker: Ticker,
  window: Kline[],
  filterFn: Function,
  config: HistoricalScanConfig,
  klineInterval: KlineInterval,
  klines: Kline[],
  index: number
): HistoricalSignal | null {
  try {
    const isSignal = filterFn(ticker, window, helpers);
    
    if (isSignal) {
      const lastKline = window[window.length - 1];
      const barsFromEnd = klines.length - 1 - index;
      
      const signal: HistoricalSignal = {
        id: `${symbol}-${lastKline[0]}`, // openTime as unique ID
        timestamp: Date.now(),
        symbol,
        barIndex: window.length - 1,
        klineTimestamp: lastKline[0],
        priceAtSignal: parseFloat(lastKline[4]), // close price
        volumeAtSignal: parseFloat(lastKline[5]),
        changePercentAtSignal: parseFloat(ticker.P),
        filterDesc: '', // Will be set by main thread
        interval: klineInterval,
        isHistorical: true,
        count: 1,
        barsAgo: barsFromEnd
      };
      
      // Capture indicator snapshots if requested
      if (config.includeIndicatorSnapshots) {
        signal.indicators = captureIndicators(window);
      }
      
      return signal;
    }
  } catch (error) {
    console.error(`Error processing ${symbol}:`, error);
  }
  
  return null;
}

// Main worker message handler
self.onmessage = (event: MessageEvent<ScanRequest>) => {
  const { symbols, historicalData, tickers, filterCode, config, klineInterval } = event.data;
  
  try {
    // Create filter function
    const filterFn = new Function(
      'ticker',
      'klines',
      'helpers',
      `try { ${filterCode} } catch(e) { console.error('Filter error:', e); return false; }`
    ) as (ticker: Ticker, klines: Kline[], helpers: ScreenerHelpersType) => boolean;
    
    const allSignals: HistoricalSignal[] = [];
    let processedSymbols = 0;
    
    // Process each symbol
    for (const symbol of symbols) {
      const klines = historicalData[symbol];
      const ticker = tickers[symbol];
      
      if (!klines || !ticker || klines.length === 0) {
        processedSymbols++;
        continue;
      }
      
      const symbolSignals: HistoricalSignal[] = [];
      
      // Scan using sliding windows
      for (const { window, index } of createSlidingWindows(klines, config)) {
        if (window.length < 20) continue; // Skip if not enough data for basic indicators
        
        const signal = detectSignal(symbol, ticker, window, filterFn, config, klineInterval, klines, index);
        
        if (signal) {
          symbolSignals.push(signal);
          
          // Limit signals per symbol
          if (symbolSignals.length >= config.maxSignalsPerSymbol) {
            break;
          }
        }
      }
      
      allSignals.push(...symbolSignals);
      processedSymbols++;
      
      // Send progress update every 10 symbols or at the end
      if (processedSymbols % 10 === 0 || processedSymbols === symbols.length) {
        const progress: HistoricalScanProgress = {
          currentSymbol: symbol,
          symbolIndex: processedSymbols,
          totalSymbols: symbols.length,
          percentComplete: Math.round((processedSymbols / symbols.length) * 100),
          signalsFound: allSignals.length,
        };
        
        self.postMessage({ type: 'progress', progress } as ScanResponse);
      }
    }
    
    // Sort signals by time (newest first)
    allSignals.sort((a, b) => b.klineTimestamp - a.klineTimestamp);
    
    // Send completion
    self.postMessage({ type: 'complete', signals: allSignals } as ScanResponse);
    
  } catch (error) {
    self.postMessage({ 
      type: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error occurred during scanning' 
    } as ScanResponse);
  }
};

// Export empty object to make this a module
export {};