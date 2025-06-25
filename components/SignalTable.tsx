import React, { useMemo, useState } from 'react';
import { Ticker, SignalLogEntry, HistoricalSignal, CombinedSignal, HistoricalScanConfig, HistoricalScanProgress } from '../types';
import SignalTableRow from './SignalTableRow';
import StrategyGrid from './StrategyGrid';
import { PrebuiltStrategy } from '../types/strategy';

interface SignalTableProps {
  signalLog: SignalLogEntry[];
  historicalSignals?: HistoricalSignal[];
  tickers: Map<string, Ticker>;
  onRowClick: (symbol: string) => void;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
  isLoading: boolean;
  // Historical scanner props
  hasActiveFilter?: boolean;
  hasActiveScreener?: boolean;
  onRunHistoricalScan?: () => void;
  isHistoricalScanning?: boolean;
  historicalScanProgress?: HistoricalScanProgress | null;
  historicalScanConfig?: HistoricalScanConfig;
  onHistoricalScanConfigChange?: (config: HistoricalScanConfig) => void;
  onCancelHistoricalScan?: () => void;
  // Strategy selection
  onSetAiPrompt?: (prompt: string) => void;
}

const SignalTable: React.FC<SignalTableProps> = ({
  signalLog,
  historicalSignals = [],
  tickers,
  onRowClick,
  onAiInfoClick,
  isLoading,
  hasActiveFilter,
  hasActiveScreener,
  onRunHistoricalScan,
  isHistoricalScanning,
  historicalScanProgress,
  historicalScanConfig,
  onHistoricalScanConfigChange,
  onCancelHistoricalScan,
  onSetAiPrompt,
}) => {
  const [loadingStrategyId, setLoadingStrategyId] = useState<string | null>(null);

  const handleStrategySelect = (strategy: PrebuiltStrategy) => {
    if (onSetAiPrompt) {
      // Join all conditions with commas for a natural language prompt
      const prompt = strategy.conditions.join(', ');
      onSetAiPrompt(prompt);
      
      // Show loading state briefly to indicate action
      setLoadingStrategyId(strategy.id);
      setTimeout(() => {
        setLoadingStrategyId(null);
      }, 500);
    }
  };

  // Sort live signals by timestamp, newest first
  const sortedLiveSignals = useMemo(() => {
    return [...signalLog].sort((a, b) => b.timestamp - a.timestamp);
  }, [signalLog]);
  
  // Sort historical signals by klineTimestamp (when they occurred), newest first
  const sortedHistoricalSignals = useMemo(() => {
    return [...historicalSignals].sort((a, b) => b.klineTimestamp - a.klineTimestamp);
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

  // Show strategy grid if no active screener
  if (!hasActiveScreener && signalLog.length === 0 && historicalSignals.length === 0) {
    return (
      <div className="tm-card shadow-lg p-6 md:p-8">
        <StrategyGrid 
          onSelectStrategy={handleStrategySelect}
          loadingStrategyId={loadingStrategyId}
        />
      </div>
    );
  }

  return (
    <div className="tm-card shadow-lg p-3 md:p-4 relative">
      <div className="flex items-center justify-between mb-3 md:mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg md:text-xl font-semibold text-[var(--tm-accent)] tm-heading-md">
            Signal History
          </h2>
          <span className="text-sm text-[var(--tm-text-muted)]">
            {signalLog.length} live {historicalSignals.length > 0 && `+ ${historicalSignals.length} historical`}
          </span>
        </div>
        
        {/* Historical Scanner Controls */}
        {hasActiveFilter && historicalScanConfig && (
          <div className="flex items-center gap-3">
            <select 
              value={historicalScanConfig.lookbackBars} 
              onChange={e => onHistoricalScanConfigChange?.({
                ...historicalScanConfig,
                lookbackBars: +e.target.value
              })}
              disabled={isHistoricalScanning}
              className="tm-input px-2 py-1 text-sm disabled:opacity-50"
            >
              <option value={20}>20 bars</option>
              <option value={50}>50 bars</option>
              <option value={100}>100 bars</option>
              <option value={200}>200 bars</option>
              <option value={500}>500 bars</option>
              <option value={1000}>1000 bars</option>
              <option value={1500}>1500 bars</option>
            </select>
            
            {!isHistoricalScanning ? (
              <button
                onClick={onRunHistoricalScan}
                className="tm-btn tm-btn-accent font-medium px-3 py-1 text-sm whitespace-nowrap"
              >
                📊 Scan {historicalSignals.length > 0 ? `(${historicalSignals.length})` : ''}
              </button>
            ) : (
              <>
                {historicalScanProgress && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-24 bg-[var(--tm-bg-hover)] rounded-full h-1.5">
                      <div 
                        className="bg-[var(--tm-secondary)] h-1.5 rounded-full transition-all duration-300"
                        style={{ width: `${historicalScanProgress.percentComplete}%` }}
                      />
                    </div>
                    <span className="text-[var(--tm-text-muted)] text-xs">
                      {historicalScanProgress.percentComplete}%
                    </span>
                  </div>
                )}
                <button
                  onClick={onCancelHistoricalScan}
                  className="tm-btn font-medium px-3 py-1 text-sm bg-[var(--tm-error)] hover:bg-[var(--tm-error-dark)] text-[var(--tm-text-primary)]"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="overflow-y-auto max-h-[500px] md:max-h-[600px]">
        <table className="w-full tm-table">
          <thead className="sticky top-0 bg-[var(--tm-bg-tertiary)] z-10">
            <tr className="text-left text-xs md:text-sm text-[var(--tm-text-muted)]">
              <th className="p-2 md:px-4 md:py-2">Time</th>
              {/* <th className="p-2 md:px-4 md:py-2 text-center">Count</th> */}
              <th className="p-2 md:px-4 md:py-2">Pair</th>
              <th className="p-2 md:px-4 md:py-2 text-right">Signal Price</th>
              {/* <th className="p-2 md:px-4 md:py-2 text-right">Current Price</th> */}
              <th className="p-2 md:px-4 md:py-2 text-right">Gain/Loss</th>
              <th className="p-2 md:px-4 md:py-2 text-right hidden sm:table-cell">Volume</th>
              {/* <th className="p-2 md:px-4 md:py-2 text-center">Analyze</th> */}
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
              <tr className="bg-[var(--tm-bg-tertiary)]/50 border-t border-b border-[var(--tm-border-light)]">
                <td colSpan={5} className="text-center py-2 text-sm text-[var(--tm-secondary)] font-medium">
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
                <td colSpan={5} className="text-center text-[var(--tm-text-muted)] p-4">
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