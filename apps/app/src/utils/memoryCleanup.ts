/**
 * Memory cleanup utilities for managing large data structures
 */

import { Ticker, Kline, KlineInterval } from '../../types';

// Maximum number of symbols to track in memory
const MAX_TRACKED_SYMBOLS = 200;
// Maximum age for ticker data (5 minutes)
const MAX_TICKER_AGE_MS = 5 * 60 * 1000;
// Maximum total klines across all symbols
const MAX_TOTAL_KLINES = 50000;

interface TickerWithTimestamp extends Ticker {
  _lastUpdate?: number;
}

/**
 * Clean up old ticker data
 */
export function cleanupTickers(
  tickers: Map<string, Ticker>,
  activeSymbols: Set<string>
): Map<string, Ticker> {
  const now = Date.now();
  const cleaned = new Map<string, Ticker>();
  
  // Keep active symbols and recent tickers
  tickers.forEach((ticker, symbol) => {
    const tickerWithTime = ticker as TickerWithTimestamp;
    const age = tickerWithTime._lastUpdate ? now - tickerWithTime._lastUpdate : 0;
    
    if (activeSymbols.has(symbol) || age < MAX_TICKER_AGE_MS) {
      cleaned.set(symbol, ticker);
    }
  });
  
  // If still too many, keep only the most recent
  if (cleaned.size > MAX_TRACKED_SYMBOLS) {
    const sortedEntries = Array.from(cleaned.entries())
      .sort((a, b) => {
        const aTime = (a[1] as TickerWithTimestamp)._lastUpdate || 0;
        const bTime = (b[1] as TickerWithTimestamp)._lastUpdate || 0;
        return bTime - aTime;
      })
      .slice(0, MAX_TRACKED_SYMBOLS);
    
    return new Map(sortedEntries);
  }
  
  return cleaned;
}

/**
 * Clean up historical kline data
 */
export function cleanupHistoricalData(
  historicalData: Map<string, Map<KlineInterval, Kline[]>>,
  activeSymbols: Set<string>,
  prioritySymbols?: Set<string>
): Map<string, Map<KlineInterval, Kline[]>> {
  // Guard against undefined input
  if (!historicalData) {
    return new Map();
  }

  let totalKlines = 0;
  const symbolKlineCounts = new Map<string, number>();

  // Calculate total klines per symbol
  historicalData.forEach((intervalMap, symbol) => {
    let symbolTotal = 0;
    intervalMap.forEach(klines => {
      symbolTotal += klines.length;
      totalKlines += klines.length;
    });
    symbolKlineCounts.set(symbol, symbolTotal);
  });
  
  // If under limit, return as-is
  if (totalKlines <= MAX_TOTAL_KLINES) {
    return historicalData;
  }
  
  // Clean up non-active symbols first
  const cleaned = new Map<string, Map<KlineInterval, Kline[]>>();
  const toRemove: string[] = [];
  
  // Categorize symbols
  const priority: string[] = [];
  const active: string[] = [];
  const inactive: string[] = [];
  
  historicalData.forEach((_, symbol) => {
    if (prioritySymbols?.has(symbol)) {
      priority.push(symbol);
    } else if (activeSymbols.has(symbol)) {
      active.push(symbol);
    } else {
      inactive.push(symbol);
    }
  });
  
  // Sort by kline count (ascending) within each category
  const sortByKlineCount = (a: string, b: string) => {
    return (symbolKlineCounts.get(a) || 0) - (symbolKlineCounts.get(b) || 0);
  };
  
  inactive.sort(sortByKlineCount);
  active.sort(sortByKlineCount);
  priority.sort(sortByKlineCount);
  
  // Remove symbols until under limit, starting with inactive
  let remainingKlines = totalKlines;
  
  for (const symbol of inactive) {
    if (remainingKlines <= MAX_TOTAL_KLINES) break;
    const count = symbolKlineCounts.get(symbol) || 0;
    remainingKlines -= count;
    toRemove.push(symbol);
  }
  
  // If still over limit, remove active symbols
  for (const symbol of active) {
    if (remainingKlines <= MAX_TOTAL_KLINES) break;
    const count = symbolKlineCounts.get(symbol) || 0;
    remainingKlines -= count;
    toRemove.push(symbol);
  }
  
  // Copy non-removed symbols
  historicalData.forEach((intervalMap, symbol) => {
    if (!toRemove.includes(symbol)) {
      cleaned.set(symbol, intervalMap);
    }
  });
  
  return cleaned;
}

/**
 * Get active symbols based on recent activity
 */
export function getActiveSymbols(
  tickers: Map<string, Ticker>,
  recentSignalSymbols: Set<string>,
  selectedSymbols: Set<string>
): Set<string> {
  const active = new Set<string>();
  
  // Add selected symbols
  selectedSymbols.forEach(s => active.add(s));
  
  // Add recent signal symbols
  recentSignalSymbols.forEach(s => active.add(s));
  
  // Add top volume symbols
  const sortedByVolume = Array.from(tickers.entries())
    .sort((a, b) => parseFloat(b[1].q) - parseFloat(a[1].q))
    .slice(0, 50);
  
  sortedByVolume.forEach(([symbol]) => active.add(symbol));
  
  return active;
}

/**
 * Create a memory cleanup interval
 */
export function startMemoryCleanup(
  getState: () => {
    tickers: Map<string, Ticker>;
    historicalData: Map<string, Map<KlineInterval, Kline[]>>;
    activeSymbols: Set<string>;
    prioritySymbols?: Set<string>;
  },
  setState: (state: {
    tickers?: Map<string, Ticker>;
    historicalData?: Map<string, Map<KlineInterval, Kline[]>>;
  }) => void,
  intervalMs: number = 30000 // Clean up every 30 seconds
): () => void {
  const intervalId = setInterval(() => {
    const state = getState();
    
    // Clean up tickers
    const cleanedTickers = cleanupTickers(state.tickers, state.activeSymbols);
    if (cleanedTickers.size < state.tickers.size) {
      console.log(`[MemoryCleanup] Cleaned ${state.tickers.size - cleanedTickers.size} inactive tickers`);
      setState({ tickers: cleanedTickers });
    }
    
    // Clean up historical data
    const cleanedHistorical = cleanupHistoricalData(
      state.historicalData,
      state.activeSymbols,
      state.prioritySymbols
    );
    if (cleanedHistorical.size < state.historicalData.size) {
      console.log(`[MemoryCleanup] Cleaned ${state.historicalData.size - cleanedHistorical.size} symbol histories`);
      setState({ historicalData: cleanedHistorical });
    }
  }, intervalMs);
  
  return () => clearInterval(intervalId);
}