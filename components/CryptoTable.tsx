import React, { useMemo, useRef, useEffect, useState } from 'react';
import { Ticker, Kline } from '../types';
import TableRow from './TableRow';
import { useScreenerWorker } from '../hooks/useScreenerWorker';
import * as screenerHelpers from '../screenerHelpers'; // Import helpers

type ScreenerHelpersType = typeof screenerHelpers;

interface CryptoTableProps {
  allSymbols: string[];
  tickers: Map<string, Ticker>;
  historicalData: Map<string, Kline[]>;
  currentFilterFn: ((ticker: Ticker, klines: Kline[], helpers: ScreenerHelpersType, hvnNodes: any[]) => boolean) | null;
  onRowClick: (symbol: string) => void;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
  isLoading: boolean;
  onNewSignal: (symbol: string, timestamp: number) => void; // Callback for new signals
}

const SYMBOL_FILTER_INTERVAL_MS = 2000; // Run filter every 2 seconds to reduce UI flashing

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
  const { runScreener, resetCache } = useScreenerWorker();
  const [filteredSymbols, setFilteredSymbols] = useState<string[]>([]);
  const [isFiltering, setIsFiltering] = useState(false);
  const lastFilterTimeRef = useRef(0);
  const filterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Store data in refs to avoid re-renders
  const tickersRef = useRef(tickers);
  const historicalDataRef = useRef(historicalData);
  const allSymbolsRef = useRef(allSymbols);
  
  // Update refs when props change
  useEffect(() => {
    tickersRef.current = tickers;
  }, [tickers]);
  
  useEffect(() => {
    historicalDataRef.current = historicalData;
  }, [historicalData]);
  
  useEffect(() => {
  }, []);
  
  useEffect(() => {
    allSymbolsRef.current = allSymbols;
  }, [allSymbols]);

  // Get filter code from the filter function
  const filterCode = useMemo(() => {
    if (!currentFilterFn) return null;
    // Extract the function body
    const funcString = currentFilterFn.toString();
    const match = funcString.match(/\{([\s\S]*)\}/);
    return match ? match[1] : null;
  }, [currentFilterFn]);

  // Reset cache when filter changes
  useEffect(() => {
    resetCache();
  }, [currentFilterFn, resetCache]);

  // Run screener in worker on interval
  useEffect(() => {
    // Clear previous interval
    if (filterIntervalRef.current) {
      clearInterval(filterIntervalRef.current);
    }

    // Function to run the screener
    const runFilter = async () => {
      // Get current data from refs
      const currentAllSymbols = allSymbolsRef.current;
      const currentTickers = tickersRef.current;
      const currentHistoricalData = historicalDataRef.current;
      
      // Don't run if we don't have data yet
      if (currentAllSymbols.length === 0 || currentTickers.size === 0) {
        return;
      }
      
      const now = Date.now();
      
      // Only show "Filtering..." if it's been more than 100ms since last update
      // This prevents rapid UI flashing
      if (now - lastFilterTimeRef.current > 100) {
        setIsFiltering(true);
      }
      
      try {
        if (!filterCode) {
          // No filter - show all symbols with sufficient data
          const validSymbols = currentAllSymbols.filter(symbol => {
            const tickerData = currentTickers.get(symbol);
            const klineData = currentHistoricalData.get(symbol);
            return !!tickerData && !!klineData && klineData.length >= 20;
          });
          setFilteredSymbols(validSymbols);
        } else {
          const result = await runScreener(
            currentAllSymbols,
            currentTickers,
            currentHistoricalData,
            filterCode
          );
          
          setFilteredSymbols(result.filteredSymbols);
          
          // Handle new signals - let App.tsx handle deduplication
          result.signalSymbols.forEach(symbol => {
            onNewSignal(symbol, Date.now());
          });
        }
      } catch (error) {
        console.error('Screener error:', error);
        setFilteredSymbols([]);
      } finally {
        setIsFiltering(false);
        lastFilterTimeRef.current = now;
      }
    };

    // Run immediately
    runFilter();

    // Then run on interval
    filterIntervalRef.current = setInterval(runFilter, SYMBOL_FILTER_INTERVAL_MS);

    // Cleanup
    return () => {
      if (filterIntervalRef.current) {
        clearInterval(filterIntervalRef.current);
      }
    };
  }, [filterCode, runScreener, onNewSignal]); // Only stable dependencies

  return (
    <div className="tm-card shadow-lg p-3 md:p-4 relative">
      <h2 className="text-lg md:text-xl font-semibold text-[var(--tm-accent)] mb-3 md:mb-4 flex items-center justify-between tm-heading-md">
        <span>Live Crypto Prices</span>
        <span className="text-sm text-[var(--tm-text-muted)]">
          {isFiltering && currentFilterFn ? 'Filtering...' : 
           currentFilterFn ? <><span className="text-[var(--tm-accent)] font-semibold">{filteredSymbols.length}</span> matches</> :
           `${filteredSymbols.length} pairs`}
        </span>
      </h2>
      <div className="overflow-y-auto max-h-[500px] md:max-h-[600px]">
        <table className="w-full tm-table">
          <thead className="sticky top-0 bg-[var(--tm-bg-tertiary)] z-10">
            <tr className="text-left text-xs md:text-sm text-[var(--tm-text-muted)]">
              <th className="p-2 md:px-4 md:py-2">Pair</th>
              <th className="p-2 md:px-4 md:py-2 text-right">Price</th>
              <th className="p-2 md:px-4 md:py-2 text-right">24h Change</th>
              <th className="p-2 md:px-4 md:py-2 text-right hidden sm:table-cell">Volume</th>
              <th className="p-2 md:px-4 md:py-2 text-center text-[var(--tm-accent)]">AI Info</th>
            </tr>
          </thead>
          <tbody>
            {filteredSymbols.map((symbol) => (
              <TableRow
                key={symbol}
                symbol={symbol}
                tickerData={tickers.get(symbol)}
                onRowClick={onRowClick}
                onAiInfoClick={onAiInfoClick}
              />
            ))}
            {filteredSymbols.length === 0 && !isLoading && (
              <tr>
                <td colSpan={5} className="text-center text-[var(--tm-text-muted)] p-4">
                  {isFiltering ? 'Filtering symbols...' : 'No pairs match the filter criteria.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CryptoTable;