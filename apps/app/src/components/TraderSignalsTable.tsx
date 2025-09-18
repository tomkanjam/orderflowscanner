import React, { useState, useEffect, useMemo } from 'react';
import { SignalLifecycle, SignalStatus } from '../abstractions/interfaces';
import { signalManager } from '../services/signalManager';
import { Ticker, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress, KlineHistoryConfig } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { Bell, BellOff, TrendingUp, TrendingDown, AlertCircle, X, Eye } from 'lucide-react';
import { WorkflowStatus } from './WorkflowStatus';
import { AutoTradeButton } from './AutoTradeButton';
import { useSubscription } from '../contexts/SubscriptionContext';

interface TraderSignalsTableProps {
  tickers: Map<string, Ticker>;
  traders?: any[]; // Add traders list to look up names
  selectedTraderId?: string | null; // Currently selected trader
  onSelectTrader?: (traderId: string | null) => void; // Callback to change selection
  onRowClick?: (symbol: string, traderId?: string, signalId?: string) => void;
  onSignalSelect?: (signal: SignalLifecycle | null) => void; // Callback for selecting a signal
  selectedSignalId?: string | null; // Currently selected signal
  // Historical scanner props
  hasActiveFilter?: boolean;
  onRunHistoricalScan?: () => void;
  isHistoricalScanning?: boolean;
  historicalScanProgress?: HistoricalScanProgress | null;
  historicalScanConfig?: HistoricalScanConfig;
  onHistoricalScanConfigChange?: (config: HistoricalScanConfig) => void;
  onCancelHistoricalScan?: () => void;
  historicalSignals?: HistoricalSignal[];
  // Signal deduplication
  signalDedupeThreshold?: number;
  onSignalDedupeThresholdChange?: (threshold: number) => void;
  // Kline history configuration
  klineHistoryConfig?: KlineHistoryConfig;
  onKlineHistoryConfigChange?: (config: KlineHistoryConfig) => void;
}

function TraderSignalsTableComponent({
  tickers,
  traders = [],
  selectedTraderId,
  onSelectTrader,
  onRowClick,
  onSignalSelect,
  selectedSignalId,
  hasActiveFilter,
  onRunHistoricalScan,
  isHistoricalScanning,
  historicalScanProgress,
  historicalScanConfig,
  onHistoricalScanConfigChange,
  onCancelHistoricalScan,
  historicalSignals = [],
  signalDedupeThreshold = 50,
  onSignalDedupeThresholdChange,
  klineHistoryConfig,
  onKlineHistoryConfigChange,
}: TraderSignalsTableProps) {
  const { currentTier } = useSubscription();
  const [signals, setSignals] = useState<SignalLifecycle[]>([]);
  const [newSignalTimestamps, setNewSignalTimestamps] = useState<Set<number>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('traderSignalSoundEnabled') === 'true';
  });
  const [showDedupeSettings, setShowDedupeSettings] = useState(false);

  // Subscribe to signal updates
  useEffect(() => {
    const unsubscribe = signalManager.subscribe((updatedSignals) => {
      setSignals(updatedSignals);
    });
    
    // Initial load
    setSignals(signalManager.getSignals());
    
    return unsubscribe;
  }, []);

  // Track new signals and play sound
  useEffect(() => {
    const currentTime = Date.now();
    const twoSecondsAgo = currentTime - 2000;
    
    // Find signals that are new (within last 2 seconds)
    const newSignals = signals.filter(signal => 
      signal.createdAt.getTime() > twoSecondsAgo && !newSignalTimestamps.has(signal.createdAt.getTime())
    );
    
    if (newSignals.length > 0) {
      setNewSignalTimestamps(prev => {
        const next = new Set(prev);
        newSignals.forEach(signal => next.add(signal.createdAt.getTime()));
        return next;
      });
      
      // Play sound if enabled
      if (soundEnabled) {
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const now = audioContext.currentTime;
          
          // Create a pleasant two-tone notification sound
          const createTone = (frequency: number, startTime: number, duration: number) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            
            // Envelope shaping for smoother sound
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.01); // Quick fade in
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration - 0.01); // Fade out
            
            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
          };
          
          // Play two ascending tones for a pleasant notification
          createTone(523.25, now, 0.12);          // C5
          createTone(659.25, now + 0.1, 0.15);   // E5
        } catch (err) {
          console.log('Could not play notification sound:', err);
        }
      }
      
      // Clean up old timestamps after animation completes
      setTimeout(() => {
        setNewSignalTimestamps(prev => {
          const next = new Set(prev);
          newSignals.forEach(signal => next.delete(signal.createdAt.getTime()));
          return next;
        });
      }, 3000);
    }
  }, [signals, soundEnabled]);

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    localStorage.setItem('traderSignalSoundEnabled', newValue.toString());
  };


  // Filter and sort signals by timestamp, newest first
  const sortedSignals = useMemo(() => {
    const filteredSignals = selectedTraderId 
      ? signals.filter(s => s.traderId === selectedTraderId)
      : signals;
    return [...filteredSignals].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [signals, selectedTraderId]);

  // Filter and sort historical signals by klineTimestamp
  const sortedHistoricalSignals = useMemo(() => {
    const filteredHistoricalSignals = selectedTraderId 
      ? historicalSignals.filter(s => s.traderId === selectedTraderId)
      : historicalSignals;
    return [...filteredHistoricalSignals].sort((a, b) => b.klineTimestamp - a.klineTimestamp);
  }, [historicalSignals, selectedTraderId]);

  // Get current prices for signals
  const enhanceSignalWithCurrentPrice = (signal: SignalLifecycle) => {
    const ticker = tickers.get(signal.symbol);
    return {
      ...signal,
      currentMarketPrice: ticker ? parseFloat(ticker.c) : signal.currentPrice,
      currentMarketChange: ticker ? parseFloat(ticker.P) : 0,
      volume24h: ticker ? parseFloat(ticker.q) : 0, // Add volume from ticker
    };
  };

  const enhancedSignals = useMemo(() => {
    return sortedSignals.map(enhanceSignalWithCurrentPrice);
  }, [sortedSignals, tickers]);

  // Get selected trader name
  const selectedTrader = useMemo(() => {
    if (!selectedTraderId || !traders) return null;
    return traders.find(t => t.id === selectedTraderId);
  }, [selectedTraderId, traders]);

  const getStatusColor = (status: SignalStatus) => {
    switch (status) {
      case 'new': return 'text-amber-500';
      case 'analysis_queued': return 'text-orange-500';
      case 'analyzing': return 'text-yellow-500';
      case 'rejected': return 'text-gray-500';
      case 'monitoring': return 'text-yellow-500';
      case 'ready': return 'text-green-500';
      case 'in_position': return 'text-green-500';
      case 'closed': return 'text-gray-500';
      case 'expired': return 'text-gray-500';
    }
  };

  const formatPriceChange = (initialPrice: number, currentPrice: number) => {
    const change = ((currentPrice - initialPrice) / initialPrice) * 100;
    const color = change >= 0 ? 'text-green-500' : 'text-red-500';
    return (
      <span className={color}>
        {change >= 0 ? '+' : ''}{change.toFixed(2)}%
      </span>
    );
  };

  return (
    <div className="nt-card shadow-lg p-2 md:p-3 relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg md:text-xl font-semibold text-[var(--nt-text-primary)] nt-heading-md">
            Signal Triggers
          </h2>
          {selectedTrader && (
            <div className="flex items-center gap-2 px-3 py-1 bg-[var(--nt-accent-lime)]/10 border border-[var(--nt-accent-lime)] rounded-md">
              <span className="text-sm font-medium text-[var(--nt-accent-lime)]">{selectedTrader.name}</span>
              <button
                onClick={() => onSelectTrader?.(null)}
                className="text-[var(--nt-accent-lime)] hover:text-[var(--nt-accent-lime)] transition-colors"
                title="Clear signal filter"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <span className="text-sm text-[var(--nt-text-muted)]">
            {sortedSignals.length} active {selectedTraderId && sortedHistoricalSignals.length > 0 && `+ ${sortedHistoricalSignals.length} historical`}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Sound toggle - only show when no trader selected */}
          {!selectedTraderId && (
            <button
              onClick={toggleSound}
              className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-[var(--nt-bg-hover)] hover:bg-[var(--nt-bg-elevated)] transition-colors"
              title={soundEnabled ? "Disable sound notifications" : "Enable sound notifications"}
            >
              {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              <span className="hidden sm:inline">Sound</span>
            </button>
          )}
          
          {/* Signal Deduplication Settings - only show when trader selected */}
          {selectedTraderId && (
            <button
              onClick={() => setShowDedupeSettings(!showDedupeSettings)}
              className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-[var(--nt-bg-hover)] hover:bg-[var(--nt-bg-elevated)] transition-colors"
            >
              <span className="hidden sm:inline">Dedupe: {signalDedupeThreshold} bars</span>
              <span className="sm:hidden">{signalDedupeThreshold}</span>
            </button>
          )}
          
          {/* Historical Scanner Controls - only show when trader selected */}
          {selectedTraderId && hasActiveFilter && historicalScanConfig && (
            <>
              <select 
                value={historicalScanConfig.lookbackBars} 
                onChange={e => onHistoricalScanConfigChange?.({
                  ...historicalScanConfig,
                  lookbackBars: +e.target.value
                })}
                disabled={isHistoricalScanning}
                className="nt-input px-2 py-1 text-sm disabled:opacity-50"
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
                  📊 Scan History
                </button>
              ) : (
                <>
                  {historicalScanProgress && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-24 bg-[var(--nt-bg-hover)] rounded-full h-1.5">
                        <div 
                          className="bg-[var(--nt-accent-lime)] h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${historicalScanProgress.percentComplete}%` }}
                        />
                      </div>
                      <span className="text-[var(--nt-text-muted)] text-xs">
                        {historicalScanProgress.percentComplete}%
                      </span>
                    </div>
                  )}
                  <button
                    onClick={onCancelHistoricalScan}
                    className="tm-btn font-medium px-3 py-1 text-sm bg-[var(--nt-error)] hover:bg-[var(--nt-error)] text-[var(--nt-text-primary)]"
                  >
                    Cancel
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Deduplication Settings Dropdown */}
      {showDedupeSettings && (
        <div className="mb-3 p-2 bg-[var(--nt-bg-hover)] rounded-lg">
          <label className="text-sm text-[var(--nt-text-secondary)] mb-2 block">
            Signal Deduplication Threshold
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="200"
              step="10"
              value={signalDedupeThreshold}
              onChange={(e) => onSignalDedupeThresholdChange?.(parseInt(e.target.value))}
              className="flex-1"
            />
            <input
              type="number"
              min="10"
              max="200"
              value={signalDedupeThreshold}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (!isNaN(value) && value >= 10 && value <= 200) {
                  onSignalDedupeThresholdChange?.(value);
                }
              }}
              className="w-16 nt-input text-sm px-2 py-1"
            />
            <span className="text-sm text-[var(--nt-text-muted)]">bars</span>
          </div>
          <p className="text-xs text-[var(--nt-text-muted)] mt-2">
            Signals for the same symbol within this bar count will increment the count instead of creating a new entry.
          </p>
        </div>
      )}

      <div className="overflow-y-auto max-h-[500px] md:max-h-[600px]">
        <table className="w-full tm-table">
          <thead className="sticky top-0 bg-[var(--nt-bg-tertiary)] z-10">
            <tr className="text-left text-xs md:text-sm text-[var(--nt-text-muted)]">
              <th className="p-2 md:px-4 md:py-2">Time</th>
              <th className="p-2 md:px-4 md:py-2">Symbol</th>
              <th className="p-2 md:px-4 md:py-2">Signal</th>
              {currentTier === 'elite' && (
                <th className="p-2 md:px-4 md:py-2">Status</th>
              )}
              <th className="p-2 md:px-4 md:py-2 text-right">Entry Price</th>
              <th className="p-2 md:px-4 md:py-2 text-right">Current</th>
              <th className="p-2 md:px-4 md:py-2 text-right">Change</th>
              <th className="p-2 md:px-4 md:py-2 text-right hidden sm:table-cell">Volume</th>
            </tr>
          </thead>
          <tbody>
            {/* Active Trader Signals */}
            {enhancedSignals.map((signal) => (
              <React.Fragment key={signal.id}>
                <tr 
                  className={`border-b border-[var(--nt-border-default)] hover:bg-[var(--nt-bg-hover)] transition-colors cursor-pointer ${
                    selectedSignalId === signal.id ? 'bg-amber-500/10 border-l-4 border-l-amber-500' : ''
                  }`}
                  onClick={() => {
                    onRowClick?.(signal.symbol, signal.traderId, signal.id);
                    onSignalSelect?.(signal);
                  }}
>
                  <td className="p-2 md:px-4 md:py-2 text-xs md:text-sm text-[var(--nt-text-muted)]">
                    {formatDistanceToNow(signal.createdAt, { addSuffix: true })}
                  </td>
                  <td className={`p-2 md:px-4 md:py-2 font-medium text-[var(--nt-text-primary)] ${
                    newSignalTimestamps.has(signal.createdAt.getTime()) ? 'signal-new-symbol' : ''
                  }`}>
                    {signal.symbol}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-xs text-[var(--nt-text-secondary)]">
                    {signal.traderId 
                      ? traders.find(t => t.id === signal.traderId)?.name || signal.traderId
                      : 'AI Screener'}
                  </td>
                  {currentTier === 'elite' && (
                    <td className="p-2 md:px-4 md:py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs ${getStatusColor(signal.status)}`}>
                            {signal.status.replace('_', ' ')}
                          </span>
                          {signal.status === 'analysis_queued' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                // Remove from queue and update status back to 'new'
                                signalManager.updateSignalStatus(signal.id, 'new');
                              }}
                              className="text-xs text-orange-500 hover:text-orange-600 underline"
                              title="Cancel queued analysis"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                        {/* Analysis indicator */}
                        {signal.analysis && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-medium ${
                              signal.analysis.decision === 'buy' || signal.analysis.decision === 'enter_trade' ? 'text-green-500' :
                              signal.analysis.decision === 'sell' ? 'text-red-500' :
                              signal.analysis.decision === 'hold' || signal.analysis.decision === 'monitor' || signal.analysis.decision === 'good_setup' ? 'text-yellow-500' :
                              'text-gray-500'
                            }`}>
                              {signal.analysis.decision === 'buy' && 'BUY'}
                              {signal.analysis.decision === 'sell' && 'SELL'}
                              {signal.analysis.decision === 'hold' && 'HOLD'}
                              {signal.analysis.decision === 'monitor' && 'MONITOR'}
                              {signal.analysis.decision === 'no_trade' && 'NO TRADE'}
                              {signal.analysis.decision === 'enter_trade' && 'ENTER'}
                              {signal.analysis.decision === 'good_setup' && 'GOOD SETUP'}
                              {signal.analysis.decision === 'bad_setup' && 'BAD SETUP'}
                            </span>
                            {signal.analysisHistory && signal.analysisHistory.length > 0 && (
                              <span className="text-xs text-[var(--nt-text-muted)]">
                                ({signal.analysisHistory.length})
                              </span>
                            )}
                            {/* Show pulsing indicator if analyzed within last 5 seconds */}
                            {signal.analyzedAt && 
                             new Date().getTime() - new Date(signal.analyzedAt).getTime() < 5000 && (
                              <span className="inline-block w-2 h-2 bg-amber-500 rounded-full animate-pulse" 
                                    title="Recently analyzed" />
                            )}
                          </div>
                        )}
                        {/* Action buttons */}
                        <div className="flex items-center gap-2 mt-1">
                          {signal.status === 'monitoring' && (
                            <WorkflowStatus signalId={signal.id} compact={true} />
                          )}
                          {signal.status === 'ready' && (
                            <AutoTradeButton signalId={signal.id} />
                          )}
                          <span className="text-xs text-[var(--nt-text-muted)] hover:text-cyan-500">
                            Click for details →
                          </span>
                        </div>
                      </div>
                    </td>
                  )}
                  <td className="p-2 md:px-4 md:py-2 text-right text-sm font-mono">
                    ${signal.initialPrice.toFixed(4)}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-right text-sm font-mono">
                    ${signal.currentMarketPrice.toFixed(4)}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-right text-sm">
                    {formatPriceChange(signal.initialPrice, signal.currentMarketPrice)}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-right text-sm hidden sm:table-cell">
                    {signal.volume24h ? signal.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
                  </td>
                </tr>
              </React.Fragment>
            ))}
            
            {/* Separator row - only show when trader selected */}
            {selectedTraderId && sortedHistoricalSignals.length > 0 && (
              <tr className="bg-[var(--nt-bg-tertiary)]/50 border-t border-b border-[var(--nt-border-light)]">
                <td colSpan={8} className="text-center py-2 text-sm text-[var(--nt-accent-lime)] font-medium">
                  📊 Historical Signals (Found in Past Data)
                </td>
              </tr>
            )}
            
            {/* Historical signals - only show when trader selected */}
            {selectedTraderId && sortedHistoricalSignals.map((signal, index) => {
              const ticker = tickers.get(signal.symbol);
              const currentPrice = ticker ? parseFloat(ticker.c) : signal.priceAtSignal;
              
              return (
                <tr 
                  key={`historical-${signal.symbol}-${signal.timestamp}-${index}`}
                  className="border-b border-[var(--nt-border-default)] hover:bg-[var(--nt-bg-hover)] transition-colors cursor-pointer opacity-75"
                  onClick={() => onRowClick?.(signal.symbol, signal.traderId)}
>
                  <td className="p-2 md:px-4 md:py-2 text-xs md:text-sm text-[var(--nt-text-muted)]">
                    {new Date(signal.klineTimestamp).toLocaleString()}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 font-medium text-[var(--nt-text-primary)]">
                    {signal.symbol}
                    {(signal.count || 0) > 1 && (
                      <span className="ml-1 text-xs text-[var(--nt-accent-lime)]">x{signal.count}</span>
                    )}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-xs text-[var(--nt-text-secondary)]">
                    Historical
                  </td>
                  <td className="p-2 md:px-4 md:py-2">
                    <span className="text-xs text-gray-500">past signal</span>
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-right text-sm font-mono">
                    ${signal.priceAtSignal.toFixed(4)}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-right text-sm font-mono">
                    ${currentPrice.toFixed(4)}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-right text-sm">
                    {formatPriceChange(signal.priceAtSignal, currentPrice)}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-right text-sm hidden sm:table-cell">
                    {signal.volumeAtSignal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              );
            })}
            
            {signals.length === 0 && historicalSignals.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-[var(--nt-text-muted)] p-4">
                  No signals generated yet. Enable your traders to start capturing signals.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
// Compare key props that affect rendering
export const TraderSignalsTable = React.memo(TraderSignalsTableComponent, (prevProps, nextProps) => {
  return (
    // Compare basic selection props
    prevProps.selectedTraderId === nextProps.selectedTraderId &&
    prevProps.selectedSignalId === nextProps.selectedSignalId &&
    
    // Compare scanning state
    prevProps.isHistoricalScanning === nextProps.isHistoricalScanning &&
    prevProps.historicalScanProgress?.percentComplete === nextProps.historicalScanProgress?.percentComplete &&
    
    // Compare data lengths (not deep comparison for performance)
    prevProps.historicalSignals?.length === nextProps.historicalSignals?.length &&
    prevProps.traders?.length === nextProps.traders?.length &&
    
    // Compare configuration objects by reference
    prevProps.historicalScanConfig === nextProps.historicalScanConfig &&
    prevProps.klineHistoryConfig === nextProps.klineHistoryConfig &&
    prevProps.signalDedupeThreshold === nextProps.signalDedupeThreshold &&
    
    // Reference equality for tickers Map
    prevProps.tickers === nextProps.tickers &&
    
    // Flag comparisons
    prevProps.hasActiveFilter === nextProps.hasActiveFilter
    
    // Note: Callbacks are assumed to be stable (wrapped in useCallback by parent)
  );
});