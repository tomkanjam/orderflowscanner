import React, { useMemo, useState, useEffect } from 'react';
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
  const [newSignalTimestamps, setNewSignalTimestamps] = useState<Set<number>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('signalSoundEnabled') === 'true';
  });

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

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem('signalSoundEnabled', newValue.toString());
  };

  // Track new signals and play sound
  useEffect(() => {
    const currentTime = Date.now();
    const twoSecondsAgo = currentTime - 2000;
    
    // Find signals that are new (within last 2 seconds)
    const newSignals = signalLog.filter(signal => 
      signal.timestamp > twoSecondsAgo && !newSignalTimestamps.has(signal.timestamp)
    );
    
    if (newSignals.length > 0) {
      setNewSignalTimestamps(prev => {
        const next = new Set(prev);
        newSignals.forEach(signal => next.add(signal.timestamp));
        return next;
      });
      
      // Play sound if enabled
      if (soundEnabled) {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800; // Frequency in Hz
        gainNode.gain.value = 0.3; // Volume
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1); // 100ms beep
      }
      
      // Clean up old timestamps after animation completes
      setTimeout(() => {
        setNewSignalTimestamps(prev => {
          const next = new Set(prev);
          newSignals.forEach(signal => next.delete(signal.timestamp));
          return next;
        });
      }, 2000);
    }
  }, [signalLog, soundEnabled]);

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
        
        <div className="flex items-center gap-3">
          {/* Sound toggle */}
          <button
            onClick={toggleSound}
            className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-[var(--tm-bg-hover)] hover:bg-[var(--tm-bg-active)] transition-colors"
            title={soundEnabled ? "Disable sound notifications" : "Enable sound notifications"}
          >
            <span>{soundEnabled ? '🔔' : '🔕'}</span>
            <span className="hidden sm:inline">Sound</span>
          </button>
          
          {/* Historical Scanner Controls */}
          {hasActiveFilter && historicalScanConfig && (
            <>
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
                className="tm-btn tm-btn-primary font-medium px-3 py-1 text-sm whitespace-nowrap"
              >
                📊 Scan {historicalSignals.length > 0 ? `(${historicalSignals.length})` : ''}
              </button>
            ) : (
              <>
                {historicalScanProgress && (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-24 bg-[var(--tm-bg-hover)] rounded-full h-1.5">
                      <div 
                        className="bg-[var(--tm-accent)] h-1.5 rounded-full transition-all duration-300"
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
            </>
          )}
        </div>
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
                isNew={newSignalTimestamps.has(signal.timestamp)}
              />
            ))}
            
            {/* Separator row */}
            {historicalSignalsWithPrices.length > 0 && (
              <tr className="bg-[var(--tm-bg-tertiary)]/50 border-t border-b border-[var(--tm-border-light)]">
                <td colSpan={5} className="text-center py-2 text-sm text-[var(--tm-accent)] font-medium">
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