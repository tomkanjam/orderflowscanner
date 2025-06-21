
import React, { useMemo, useRef, useEffect } from 'react';
import { Ticker, Kline } from '../types';
import TableRow from './TableRow';
import * as screenerHelpers from '../screenerHelpers'; // Import helpers

type ScreenerHelpersType = typeof screenerHelpers;

interface CryptoTableProps {
  allSymbols: string[];
  tickers: Map<string, Ticker>;
  historicalData: Map<string, Kline[]>;
  currentFilterFn: ((ticker: Ticker, klines: Kline[], helpers: ScreenerHelpersType) => boolean) | null;
  onRowClick: (symbol: string) => void;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
  isLoading: boolean;
  onNewSignal: (symbol: string, timestamp: number) => void; // Callback for new signals
}

const SYMBOL_FILTER_DEBOUNCE_MS = 2000;

const CryptoTable: React.FC<CryptoTableProps> = ({
  allSymbols,
  tickers,
  historicalData,
  currentFilterFn,
  onRowClick,
  onAiInfoClick,
  isLoading,
  onNewSignal,
}) => {
  const lastFilterEvaluationTimeRef = useRef<Map<string, number>>(new Map());
  const lastFilterResultRef = useRef<Map<string, boolean>>(new Map());
  const loggedSymbolsThisSessionRef = useRef<Set<string>>(new Set());

  // Clear logged symbols when the filter function changes
  useEffect(() => {
    loggedSymbolsThisSessionRef.current.clear();
    lastFilterEvaluationTimeRef.current.clear(); // Also clear evaluation cache for immediate re-eval
    lastFilterResultRef.current.clear();
  }, [currentFilterFn]);

  const filteredSymbols = useMemo(() => {
    const now = Date.now();
    const symbolsMatchingFilter: string[] = [];

    if (!currentFilterFn) {
      allSymbols.forEach(symbol => {
        const tickerData = tickers.get(symbol);
        const klineData = historicalData.get(symbol);
        if (!!tickerData && !!klineData && klineData.length >= 20) {
            symbolsMatchingFilter.push(symbol);
        }
      });
      return symbolsMatchingFilter;
    }

    allSymbols.forEach(symbol => {
      const tickerData = tickers.get(symbol);
      const klineData = historicalData.get(symbol);

      if (!tickerData || !klineData || klineData.length < 20) {
        lastFilterResultRef.current.set(symbol, false);
        return; 
      }

      const lastEvalTime = lastFilterEvaluationTimeRef.current.get(symbol);

      if (!lastEvalTime || (now - lastEvalTime >= SYMBOL_FILTER_DEBOUNCE_MS)) {
        try {
          const result = currentFilterFn(tickerData, klineData, screenerHelpers);
          lastFilterResultRef.current.set(symbol, result);
          lastFilterEvaluationTimeRef.current.set(symbol, now);
          if (result) symbolsMatchingFilter.push(symbol);
        } catch (e) {
          console.warn(`Filter function error for ${symbol}:`, e);
          lastFilterResultRef.current.set(symbol, false);
          lastFilterEvaluationTimeRef.current.set(symbol, now);
        }
      } else {
        if (lastFilterResultRef.current.get(symbol) ?? false) {
            symbolsMatchingFilter.push(symbol);
        }
      }
    });
    return symbolsMatchingFilter;
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [allSymbols, tickers, historicalData, currentFilterFn]);

  // Effect to log new signals
  useEffect(() => {
    if (currentFilterFn) { // Only log if a filter is active
      filteredSymbols.forEach(symbol => {
        if (!loggedSymbolsThisSessionRef.current.has(symbol)) {
          onNewSignal(symbol, Date.now());
          loggedSymbolsThisSessionRef.current.add(symbol);
        }
      });
    }
  }, [filteredSymbols, onNewSignal, currentFilterFn]);


  if (isLoading && allSymbols.length === 0) {
      return null;
  }
  
  if (allSymbols.length === 0 && !isLoading) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-lg">Could not load any trading pairs. Check connection or try again later.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 shadow-lg rounded-lg overflow-hidden">
      <div className="table-container max-h-[calc(100vh-450px-100px)] xl:max-h-[calc(100vh-480px-100px)] overflow-y-auto"> {/* Adjusted height for signal log */}
        <table className="min-w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Pair</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Last Price</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">24h Change (%)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">24h Volume</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Analysis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {filteredSymbols.map(symbol => (
              <TableRow
                key={symbol}
                symbol={symbol}
                tickerData={tickers.get(symbol)}
                onRowClick={onRowClick}
                onAiInfoClick={onAiInfoClick}
              />
            ))}
          </tbody>
        </table>
      </div>
      {currentFilterFn && filteredSymbols.length === 0 && (
        <div className="text-center py-10 text-gray-400 border-t border-gray-700">
          <p className="text-lg">No pairs match the current AI filter.</p>
        </div>
      )}
    </div>
  );
};

export default CryptoTable;
