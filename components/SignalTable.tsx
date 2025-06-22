import React, { useMemo } from 'react';
import { Ticker, SignalLogEntry, HistoricalSignal, CombinedSignal } from '../types';
import SignalTableRow from './SignalTableRow';

interface SignalTableProps {
  signalLog: SignalLogEntry[];
  historicalSignals?: HistoricalSignal[];
  tickers: Map<string, Ticker>;
  onRowClick: (symbol: string) => void;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
  isLoading: boolean;
}

const SignalTable: React.FC<SignalTableProps> = ({
  signalLog,
  historicalSignals = [],
  tickers,
  onRowClick,
  onAiInfoClick,
  isLoading,
}) => {
  // Combine and sort all signals
  const allSignals = useMemo(() => {
    const combined: CombinedSignal[] = [
      ...signalLog,
      ...historicalSignals
    ];
    
    // Sort by timestamp, newest first
    return combined.sort((a, b) => b.timestamp - a.timestamp);
  }, [signalLog, historicalSignals]);
  
  // Get current prices for all signals
  const signalsWithCurrentPrices = useMemo(() => {
    return allSignals.map(signal => ({
      ...signal,
      currentPrice: tickers.get(signal.symbol)?.c ? parseFloat(tickers.get(signal.symbol)!.c) : signal.priceAtSignal,
      currentChangePercent: tickers.get(signal.symbol)?.P ? parseFloat(tickers.get(signal.symbol)!.P) : signal.changePercentAtSignal,
    }));
  }, [allSignals, tickers]);

  return (
    <div className="bg-gray-800 shadow-lg rounded-lg p-3 md:p-4 relative">
      <h2 className="text-lg md:text-xl font-semibold text-yellow-400 mb-3 md:mb-4 flex items-center justify-between">
        <span>Signal History</span>
        <span className="text-sm text-gray-400">
          {signalLog.length} live {historicalSignals.length > 0 && `+ ${historicalSignals.length} historical`}
        </span>
      </h2>
      <div className="overflow-y-auto max-h-[500px] md:max-h-[600px]">
        <table className="w-full">
          <thead className="sticky top-0 bg-gray-700 z-10">
            <tr className="text-left text-xs md:text-sm text-gray-400">
              <th className="p-2 md:px-4 md:py-2">Time</th>
              <th className="p-2 md:px-4 md:py-2 text-center">Count</th>
              <th className="p-2 md:px-4 md:py-2">Pair</th>
              <th className="p-2 md:px-4 md:py-2 text-right">Signal Price</th>
              <th className="p-2 md:px-4 md:py-2 text-right">Current Price</th>
              <th className="p-2 md:px-4 md:py-2 text-right">Gain/Loss</th>
              <th className="p-2 md:px-4 md:py-2 text-right hidden sm:table-cell">Volume</th>
              <th className="p-2 md:px-4 md:py-2 text-center">Analyze</th>
            </tr>
          </thead>
          <tbody>
            {signalsWithCurrentPrices.map((signal, index) => (
              <SignalTableRow
                key={`${signal.symbol}-${signal.timestamp}-${index}`}
                signal={signal}
                currentPrice={signal.currentPrice}
                onRowClick={onRowClick}
                onAiInfoClick={onAiInfoClick}
              />
            ))}
            {signalLog.length === 0 && !isLoading && (
              <tr>
                <td colSpan={8} className="text-center text-gray-500 p-4">
                  No signals generated yet. Run an AI screener to start capturing signals.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SignalTable;