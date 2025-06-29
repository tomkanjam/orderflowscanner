import React, { useState, useEffect, useMemo } from 'react';
import { SignalLifecycle, SignalStatus } from '../abstractions/interfaces';
import { signalManager } from '../services/signalManager';
import { Ticker, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { Bell, BellOff, TrendingUp, TrendingDown, AlertCircle, X } from 'lucide-react';

interface TraderSignalsTableProps {
  tickers: Map<string, Ticker>;
  traders?: any[]; // Add traders list to look up names
  selectedTraderId?: string | null; // Currently selected trader
  onSelectTrader?: (traderId: string | null) => void; // Callback to change selection
  onRowClick?: (symbol: string, traderId?: string) => void;
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
}

export function TraderSignalsTable({
  tickers,
  traders = [],
  selectedTraderId,
  onSelectTrader,
  onRowClick,
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
}: TraderSignalsTableProps) {
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
      }, 2000);
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
      case 'new': return 'text-blue-500';
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
    <div className="tm-card shadow-lg p-2 md:p-3 relative">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg md:text-xl font-semibold text-[var(--tm-accent)] tm-heading-md">
            Trader Signals
          </h2>
          {selectedTrader && (
            <div className="flex items-center gap-2 px-3 py-1 bg-[var(--tm-accent)]/10 border border-[var(--tm-accent)] rounded-md">
              <span className="text-sm font-medium text-[var(--tm-accent)]">{selectedTrader.name}</span>
              <button
                onClick={() => onSelectTrader?.(null)}
                className="text-[var(--tm-accent)] hover:text-[var(--tm-accent-dark)] transition-colors"
                title="Clear trader filter"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <span className="text-sm text-[var(--tm-text-muted)]">
            {sortedSignals.length} active {selectedTraderId && sortedHistoricalSignals.length > 0 && `+ ${sortedHistoricalSignals.length} historical`}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Sound toggle - only show when no trader selected */}
          {!selectedTraderId && (
            <button
              onClick={toggleSound}
              className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-[var(--tm-bg-hover)] hover:bg-[var(--tm-bg-active)] transition-colors"
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
              className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-[var(--tm-bg-hover)] hover:bg-[var(--tm-bg-active)] transition-colors"
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
                  📊 Scan History
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

      {/* Deduplication Settings Dropdown */}
      {showDedupeSettings && (
        <div className="mb-3 p-2 bg-[var(--tm-bg-hover)] rounded-lg">
          <label className="text-sm text-[var(--tm-text-secondary)] mb-2 block">
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
              className="w-16 tm-input text-sm px-2 py-1"
            />
            <span className="text-sm text-[var(--tm-text-muted)]">bars</span>
          </div>
          <p className="text-xs text-[var(--tm-text-muted)] mt-2">
            Signals for the same symbol within this bar count will increment the count instead of creating a new entry.
          </p>
        </div>
      )}

      <div className="overflow-y-auto max-h-[500px] md:max-h-[600px]">
        <table className="w-full tm-table">
          <thead className="sticky top-0 bg-[var(--tm-bg-tertiary)] z-10">
            <tr className="text-left text-xs md:text-sm text-[var(--tm-text-muted)]">
              <th className="p-2 md:px-4 md:py-2">Time</th>
              <th className="p-2 md:px-4 md:py-2">Symbol</th>
              <th className="p-2 md:px-4 md:py-2">Trader</th>
              <th className="p-2 md:px-4 md:py-2">Status</th>
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
                  className={`border-b border-[var(--tm-border)] hover:bg-[var(--tm-bg-hover)] transition-colors cursor-pointer ${
                    newSignalTimestamps.has(signal.createdAt.getTime()) ? 'animate-pulse bg-[var(--tm-accent)]/10' : ''
                  }`}
                  onClick={() => onRowClick?.(signal.symbol, signal.traderId)}
>
                  <td className="p-2 md:px-4 md:py-2 text-xs md:text-sm text-[var(--tm-text-muted)]">
                    {formatDistanceToNow(signal.createdAt, { addSuffix: true })}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 font-medium text-[var(--tm-text-primary)]">
                    {signal.symbol}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-xs text-[var(--tm-text-secondary)]">
                    {signal.traderId 
                      ? traders.find(t => t.id === signal.traderId)?.name || signal.traderId
                      : 'AI Screener'}
                  </td>
                  <td className="p-2 md:px-4 md:py-2">
                    <span className={`text-xs ${getStatusColor(signal.status)}`}>
                      {signal.status.replace('_', ' ')}
                    </span>
                  </td>
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
              <tr className="bg-[var(--tm-bg-tertiary)]/50 border-t border-b border-[var(--tm-border-light)]">
                <td colSpan={8} className="text-center py-2 text-sm text-[var(--tm-accent)] font-medium">
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
                  className="border-b border-[var(--tm-border)] hover:bg-[var(--tm-bg-hover)] transition-colors cursor-pointer opacity-75"
                  onClick={() => onRowClick?.(signal.symbol, signal.traderId)}
>
                  <td className="p-2 md:px-4 md:py-2 text-xs md:text-sm text-[var(--tm-text-muted)]">
                    {new Date(signal.klineTimestamp).toLocaleString()}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 font-medium text-[var(--tm-text-primary)]">
                    {signal.symbol}
                    {(signal.count || 0) > 1 && (
                      <span className="ml-1 text-xs text-[var(--tm-accent)]">x{signal.count}</span>
                    )}
                  </td>
                  <td className="p-2 md:px-4 md:py-2 text-xs text-[var(--tm-text-secondary)]">
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
                <td colSpan={8} className="text-center text-[var(--tm-text-muted)] p-4">
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