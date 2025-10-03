/**
 * Worker thread for executing trader filters in parallel
 * Based on: apps/app/workers/multiTraderScreenerWorker.ts
 */

import { parentPort, workerData } from 'worker_threads';
import { Ticker, Kline, KlineInterval } from '../shared/types/types';
import * as helpers from '../shared/helpers/screenerHelpers';

interface WorkerMessage {
  type: 'RUN_FILTERS';
  data: {
    traders: Array<{
      id: string;
      name: string;
      filterCode: string;
      refreshInterval: KlineInterval;
      requiredTimeframes?: KlineInterval[];
    }>;
    marketData: {
      symbols: string[];
      tickers: Record<string, Ticker>;
      klines: Record<string, Record<string, Kline[]>>;
    };
  };
}

interface WorkerResponse {
  type: 'FILTER_RESULTS' | 'ERROR';
  data?: {
    results: Array<{
      traderId: string;
      traderName: string;
      matches: Array<{
        symbol: string;
        price: number;
        matchedConditions: string[];
      }>;
      executionTime: number;
      error?: string;
    }>;
  };
  error?: string;
}

// Track previous matches for signal deduplication
const previousMatches = new Map<string, Set<string>>();

function executeFilter(
  trader: {
    id: string;
    name: string;
    filterCode: string;
    refreshInterval: KlineInterval;
    requiredTimeframes?: KlineInterval[];
  },
  marketData: {
    symbols: string[];
    tickers: Record<string, Ticker>;
    klines: Record<string, Record<string, Kline[]>>;
  }
): {
  traderId: string;
  traderName: string;
  matches: Array<{
    symbol: string;
    price: number;
    matchedConditions: string[];
  }>;
  executionTime: number;
  error?: string;
} {
  const startTime = Date.now();
  const matches: Array<{
    symbol: string;
    price: number;
    matchedConditions: string[];
  }> = [];

  try {
    // Create filter function
    let filterFunction: (
      ticker: Ticker,
      timeframes: Record<string, Kline[]>,
      h: any,
      hvnNodes: any[]
    ) => boolean | { match: boolean; conditions?: string[] };

    try {
      filterFunction = new Function(
        'ticker',
        'timeframes',
        'helpers',
        'hvnNodes',
        `try {
          ${trader.filterCode}
        } catch(e) {
          console.error('[Worker] Filter execution error:', e);
          return false;
        }`
      ) as any;
    } catch (syntaxError) {
      console.error(`[Worker] Trader ${trader.id} has invalid filter code:`, syntaxError);
      return {
        traderId: trader.id,
        traderName: trader.name,
        matches: [],
        executionTime: Date.now() - startTime,
        error: `Invalid filter code: ${syntaxError}`
      };
    }

    const previousSymbols = previousMatches.get(trader.id) || new Set<string>();
    const currentSymbols = new Set<string>();

    // Execute filter for each symbol
    for (const symbol of marketData.symbols) {
      const ticker = marketData.tickers[symbol];
      const symbolKlines = marketData.klines[symbol];

      if (!ticker || !symbolKlines) {
        continue;
      }

      try {
        // Prepare timeframes object
        const timeframes: Record<string, Kline[]> = {};
        const requiredTimeframes = trader.requiredTimeframes || [trader.refreshInterval];

        for (const interval of requiredTimeframes) {
          if (symbolKlines[interval]) {
            timeframes[interval] = symbolKlines[interval];
          }
        }

        // Execute filter
        const result = filterFunction(ticker, timeframes, helpers, []);

        let isMatch = false;
        let matchedConditions: string[] = [];

        if (typeof result === 'boolean') {
          isMatch = result;
        } else if (result && typeof result === 'object') {
          isMatch = result.match === true;
          matchedConditions = result.conditions || [];
        }

        if (isMatch) {
          currentSymbols.add(symbol);

          // Only report if this is a new match (signal)
          if (!previousSymbols.has(symbol)) {
            matches.push({
              symbol,
              price: parseFloat(ticker.c),
              matchedConditions
            });
          }
        }
      } catch (filterError) {
        console.error(`[Worker] Error executing filter for ${symbol}:`, filterError);
      }
    }

    // Update previous matches
    previousMatches.set(trader.id, currentSymbols);

    // Log screening results for debugging
    const totalMatching = currentSymbols.size;
    const newSignals = matches.length;
    const continuingMatches = totalMatching - newSignals;

    if (totalMatching > 0 || matches.length > 0) {
      console.log(`[Worker] Trader "${trader.name}": ${totalMatching} symbols matching (${newSignals} new signals, ${continuingMatches} continuing)`);
      if (matches.length > 0) {
        console.log(`[Worker]   New signals: ${matches.map(m => m.symbol).join(', ')}`);
      }
    }

    return {
      traderId: trader.id,
      traderName: trader.name,
      matches,
      executionTime: Date.now() - startTime
    };

  } catch (error) {
    console.error(`[Worker] Unexpected error for trader ${trader.id}:`, error);
    return {
      traderId: trader.id,
      traderName: trader.name,
      matches: [],
      executionTime: Date.now() - startTime,
      error: String(error)
    };
  }
}

// Listen for messages from parent thread
if (parentPort) {
  parentPort.on('message', (message: WorkerMessage) => {
    if (message.type === 'RUN_FILTERS') {
      try {
        const results = message.data.traders.map(trader =>
          executeFilter(trader, message.data.marketData)
        );

        const response: WorkerResponse = {
          type: 'FILTER_RESULTS',
          data: { results }
        };

        parentPort!.postMessage(response);
      } catch (error) {
        const response: WorkerResponse = {
          type: 'ERROR',
          error: String(error)
        };

        parentPort!.postMessage(response);
      }
    }
  });

  // Signal ready
  parentPort.postMessage({ type: 'READY' });
} else {
  console.error('[Worker] parentPort is null - not running in worker thread');
}
