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
  // Sort live signals by timestamp, newest first
  const sortedLiveSignals = useMemo(() => {
    return [...signalLog].sort((a, b) => b.timestamp - a.timestamp);
  }, [signalLog]);
  
  // Sort historical signals by timestamp, newest first
  const sortedHistoricalSignals = useMemo(() => {
    return [...historicalSignals].sort((a, b) => b.timestamp - a.timestamp);
  }, [historicalSignals]);
  
  // Get current prices for signals
  const enhanceSignalWithCurrentPrice = (signal: CombinedSignal) => ({
    ...signal,
    currentPrice: tickers.get(signal.symbol)?.c ? parseFloat(tickers.get(signal.symbol)!.c) : signal.priceAtSignal,
    currentChangePercent: tickers.get(signal.symbol)?.P ? parseFloat(tickers.get(signal.symbol)!.P) : signal.changePercentAtSignal,
  });
  
  const liveSignalsWithPrices = useMemo(() => {
    return sortedLiveSignals.map(enhanceSignalWithCurrentPrice);
  }, [sortedLiveSignals, tickers]);
  
  const historicalSignalsWithPrices = useMemo(() => {
    return sortedHistoricalSignals.map(enhanceSignalWithCurrentPrice);
  }, [sortedHistoricalSignals, tickers]);

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
            {/* Live signals */}
            {liveSignalsWithPrices.map((signal, index) => (
              <SignalTableRow
                key={`live-${signal.symbol}-${signal.timestamp}-${index}`}
                signal={signal}
                currentPrice={signal.currentPrice}
                onRowClick={onRowClick}
                onAiInfoClick={onAiInfoClick}
              />
            ))}
            
            {/* Separator row */}
            {historicalSignalsWithPrices.length > 0 && (
              <tr className="bg-gray-700/50 border-t border-b border-gray-600">
                <td colSpan={8} className="text-center py-2 text-sm text-purple-400 font-medium">
                  📊 Historical Signals (Found in Past Data)
                </td>
              </tr>
            )}
            
            {/* Historical signals */}
            {historicalSignalsWithPrices.map((signal, index) => (
              <SignalTableRow
                key={`historical-${signal.symbol}-${signal.timestamp}-${index}`}
                signal={signal}
                currentPrice={signal.currentPrice}
                onRowClick={onRowClick}
                onAiInfoClick={onAiInfoClick}
              />
            ))}
            
            {signalLog.length === 0 && historicalSignals.length === 0 && !isLoading && (
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