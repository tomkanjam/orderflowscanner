/**
 * Symbol Correlation Map for Intelligent Prefetching
 *
 * This module defines relationships between trading pairs to enable
 * predictive prefetching. When a user views one symbol, we can
 * intelligently prefetch related symbols they're likely to view next.
 */

import { KlineInterval } from '../../types';

// Symbol correlations based on market relationships
export const SYMBOL_CORRELATIONS: Record<string, string[]> = {
  // Major pairs - typically viewed together
  'BTCUSDT': ['ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT'],
  'ETHUSDT': ['BTCUSDT', 'BNBUSDT', 'MATICUSDT', 'ARBUSDT'],
  'BNBUSDT': ['BTCUSDT', 'ETHUSDT', 'CAKEUSDT', 'ADAUSDT'],

  // Layer 1 chains
  'SOLUSDT': ['BTCUSDT', 'ETHUSDT', 'AVAXUSDT', 'NEARUSDT'],
  'AVAXUSDT': ['SOLUSDT', 'FTMUSDT', 'MATICUSDT', 'NEARUSDT'],
  'ADAUSDT': ['BTCUSDT', 'DOTUSDT', 'XRPUSDT', 'ALGOUSDT'],
  'DOTUSDT': ['ADAUSDT', 'ATOMUSDT', 'LINKUSDT', 'KSMUSDT'],

  // Layer 2 solutions
  'MATICUSDT': ['ETHUSDT', 'ARBUSDT', 'OPUSDT', 'IMXUSDT'],
  'ARBUSDT': ['ETHUSDT', 'MATICUSDT', 'OPUSDT', 'GMXUSDT'],
  'OPUSDT': ['ETHUSDT', 'ARBUSDT', 'MATICUSDT', 'SNXUSDT'],

  // DeFi tokens
  'UNIUSDT': ['SUSHIUSDT', 'AAVEUSDT', 'COMPUSDT', 'CRVUSDT'],
  'AAVEUSDT': ['COMPUSDT', 'MKRUSDT', 'UNIUSDT', 'SNXUSDT'],
  'LINKUSDT': ['BTCUSDT', 'ETHUSDT', 'DOTUSDT', 'APIUSDT'],

  // Meme coins
  'DOGEUSDT': ['SHIBUSDT', 'FLOKIUSDT', 'PEPEUSDT', 'BONKUSDT'],
  'SHIBUSDT': ['DOGEUSDT', 'FLOKIUSDT', 'BONEUSDT', 'LEASHUSDT'],

  // Stablecoins (users often compare)
  'USDCUSDT': ['BUSDUSDT', 'TUSDUSDT', 'DAIUSDT'],
  'BUSDUSDT': ['USDCUSDT', 'TUSDUSDT', 'USDPUSDT'],

  // Gaming tokens
  'AXSUSDT': ['SANDUSDT', 'MANAUSDT', 'ENJUSDT', 'GALAUSDT'],
  'SANDUSDT': ['AXSUSDT', 'MANAUSDT', 'ENJUSDT', 'ALICEUSDT'],
  'MANAUSDT': ['SANDUSDT', 'AXSUSDT', 'ENJUSDT', 'TLMUSDT'],

  // AI tokens
  'FETUSDT': ['AGIXUSDT', 'OCEANUSDT', 'RNDDTUSDT', 'CTXCUSDT'],
  'AGIXUSDT': ['FETUSDT', 'OCEANUSDT', 'NMRUSDT'],

  // Default for unknown symbols - suggest top pairs
  'DEFAULT': ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']
};

// Market sectors for category-based prefetching
export const MARKET_SECTORS: Record<string, string[]> = {
  'layer1': ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT'],
  'layer2': ['MATICUSDT', 'ARBUSDT', 'OPUSDT', 'IMXUSDT', 'STRKUSDT'],
  'defi': ['UNIUSDT', 'AAVEUSDT', 'COMPUSDT', 'MKRUSDT', 'CRVUSDT', 'SNXUSDT'],
  'gaming': ['AXSUSDT', 'SANDUSDT', 'MANAUSDT', 'ENJUSDT', 'GALAUSDT'],
  'ai': ['FETUSDT', 'AGIXUSDT', 'OCEANUSDT', 'NMRUSDT', 'RNDDTUSDT'],
  'meme': ['DOGEUSDT', 'SHIBUSDT', 'PEPEUSDT', 'FLOKIUSDT', 'BONKUSDT']
};

/**
 * Get correlated symbols for a given symbol
 */
export function getCorrelatedSymbols(
  symbol: string,
  limit: number = 5
): string[] {
  const correlations = SYMBOL_CORRELATIONS[symbol] || SYMBOL_CORRELATIONS['DEFAULT'];
  return correlations.slice(0, limit);
}

/**
 * Get symbols from the same sector
 */
export function getSectorSymbols(symbol: string): string[] {
  for (const [sector, symbols] of Object.entries(MARKET_SECTORS)) {
    if (symbols.includes(symbol)) {
      // Return other symbols from the same sector
      return symbols.filter(s => s !== symbol);
    }
  }
  return [];
}

/**
 * Intelligent prefetch queue with priority scoring
 */
export class PrefetchQueue {
  private queue: Map<string, number> = new Map(); // symbol -> priority score
  private maxSize: number = 20;
  private fetching: Set<string> = new Set();

  /**
   * Add symbol to prefetch queue with priority
   */
  add(symbol: string, priority: number = 1): void {
    if (this.fetching.has(symbol)) {
      return; // Already fetching
    }

    const currentPriority = this.queue.get(symbol) || 0;
    this.queue.set(symbol, Math.max(currentPriority, priority));

    // Trim queue if too large
    if (this.queue.size > this.maxSize) {
      this.trimQueue();
    }
  }

  /**
   * Add correlated symbols based on user viewing pattern
   */
  addCorrelated(baseSymbol: string): void {
    const correlated = getCorrelatedSymbols(baseSymbol);

    // Add with decreasing priority
    correlated.forEach((symbol, index) => {
      const priority = 10 - index * 2; // 10, 8, 6, 4, 2
      this.add(symbol, priority);
    });

    // Also add sector symbols with lower priority
    const sectorSymbols = getSectorSymbols(baseSymbol);
    sectorSymbols.slice(0, 3).forEach(symbol => {
      this.add(symbol, 3);
    });
  }

  /**
   * Get next symbol to prefetch
   */
  getNext(): string | null {
    if (this.queue.size === 0) {
      return null;
    }

    // Sort by priority and get highest
    const sorted = Array.from(this.queue.entries())
      .sort((a, b) => b[1] - a[1]);

    if (sorted.length === 0) {
      return null;
    }

    const [symbol] = sorted[0];
    this.queue.delete(symbol);
    this.fetching.add(symbol);

    return symbol;
  }

  /**
   * Mark symbol as fetched
   */
  markFetched(symbol: string): void {
    this.fetching.delete(symbol);
  }

  /**
   * Get queue size
   */
  size(): number {
    return this.queue.size;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue.clear();
    this.fetching.clear();
  }

  private trimQueue(): void {
    // Remove lowest priority items
    const sorted = Array.from(this.queue.entries())
      .sort((a, b) => b[1] - a[1]);

    const toKeep = sorted.slice(0, this.maxSize);
    this.queue = new Map(toKeep);
  }
}

/**
 * Prefetch strategy based on user behavior
 */
export class PrefetchStrategy {
  private viewHistory: string[] = [];
  private maxHistory = 10;
  private queue = new PrefetchQueue();

  /**
   * Record user viewing a symbol
   */
  recordView(symbol: string): void {
    this.viewHistory.push(symbol);

    // Trim history
    if (this.viewHistory.length > this.maxHistory) {
      this.viewHistory.shift();
    }

    // Update prefetch queue based on new view
    this.queue.addCorrelated(symbol);
  }

  /**
   * Get symbols to prefetch based on current context
   */
  getSymbolsToPrefetch(currentSymbol: string, limit: number = 3): string[] {
    const symbols: string[] = [];

    // First, add directly correlated symbols
    const correlated = getCorrelatedSymbols(currentSymbol, limit);
    symbols.push(...correlated);

    // Then add from queue if room
    while (symbols.length < limit && this.queue.size() > 0) {
      const next = this.queue.getNext();
      if (next && !symbols.includes(next)) {
        symbols.push(next);
      }
    }

    return symbols.slice(0, limit);
  }

  /**
   * Analyze viewing patterns for better predictions
   */
  analyzePatterns(): { mostViewed: string[], patterns: string[][] } {
    // Count frequency
    const frequency = new Map<string, number>();
    this.viewHistory.forEach(symbol => {
      frequency.set(symbol, (frequency.get(symbol) || 0) + 1);
    });

    // Find most viewed
    const mostViewed = Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([symbol]) => symbol);

    // Find sequential patterns (symbol A often followed by symbol B)
    const patterns: string[][] = [];
    for (let i = 0; i < this.viewHistory.length - 1; i++) {
      patterns.push([this.viewHistory[i], this.viewHistory[i + 1]]);
    }

    return { mostViewed, patterns };
  }

  /**
   * Clear history and queue
   */
  clear(): void {
    this.viewHistory = [];
    this.queue.clear();
  }
}

// Singleton instance
export const prefetchStrategy = new PrefetchStrategy();