import React, { useState, useEffect, useMemo } from 'react';
import { SignalLifecycle, SignalStatus } from '../abstractions/interfaces';
import { signalManager } from '../services/signalManager';
import { Ticker, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress, KlineHistoryConfig } from '../../types';
import { formatDistanceToNow } from 'date-fns';
import { Bell, BellOff, X, ChevronDown, ChevronRight, AlertCircle, Clock, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { WorkflowStatus } from './WorkflowStatus';
import { AutoTradeButton } from './AutoTradeButton';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useInView } from 'react-intersection-observer';
import { useInfiniteSignals } from '../hooks/useInfiniteSignals';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface SignalsTableProps {
  tickers: Map<string, Ticker>;
  traders?: any[];
  selectedTraderId?: string | null;
  onSelectTrader?: (traderId: string | null) => void;
  onRowClick?: (symbol: string, traderId?: string, signalId?: string) => void;
  onSignalSelect?: (signal: SignalLifecycle | null) => void;
  selectedSignalId?: string | null;
  hasActiveFilter?: boolean;
  onRunHistoricalScan?: () => void;
  isHistoricalScanning?: boolean;
  historicalScanProgress?: HistoricalScanProgress | null;
  historicalScanConfig?: HistoricalScanConfig;
  onHistoricalScanConfigChange?: (config: HistoricalScanConfig) => void;
  onCancelHistoricalScan?: () => void;
  historicalSignals?: HistoricalSignal[];
  signalDedupeThreshold?: number;
  onSignalDedupeThresholdChange?: (threshold: number) => void;
  klineHistoryConfig?: KlineHistoryConfig;
  onKlineHistoryConfigChange?: (config: KlineHistoryConfig) => void;
  showCloudSignalsOnly?: boolean;
  onShowCloudSignalsOnlyChange?: (value: boolean) => void;
}

function SignalsTableComponent({
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
  showCloudSignalsOnly = false,
  onShowCloudSignalsOnlyChange,
}: SignalsTableProps) {
  const { currentTier } = useSubscription();
  const [signals, setSignals] = useState<SignalLifecycle[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [newSignalTimestamps, setNewSignalTimestamps] = useState<Set<number>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem('traderSignalSoundEnabled') === 'true';
  });
  const [showDedupeSettings, setShowDedupeSettings] = useState(false);

  // Infinite scroll setup
  const traderIds = useMemo(() => {
    if (selectedTraderId) {
      return [selectedTraderId];
    }
    return traders.filter(t => t.enabled).map(t => t.id);
  }, [traders, selectedTraderId]);

  const { loadMore, isLoading: isLoadingMore, hasMore, reset } = useInfiniteSignals({
    traderIds,
    batchSize: 50
  });

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px',
  });

  // Load more when scrolling into view
  useEffect(() => {
    if (inView && hasMore && !isLoadingMore) {
      loadMore();
    }
  }, [inView, hasMore, isLoadingMore, loadMore]);

  // Reset infinite scroll when traders change
  useEffect(() => {
    reset();
  }, [traderIds, reset]);

  // Subscribe to signal updates
  useEffect(() => {
    const unsubscribe = signalManager.subscribe((updatedSignals) => {
      setSignals(updatedSignals);
    });

    setSignals(signalManager.getSignals());

    return unsubscribe;
  }, []);

  // Track new signals and play sound
  useEffect(() => {
    const currentTime = Date.now();
    const twoSecondsAgo = currentTime - 2000;

    const newSignals = signals.filter(signal =>
      signal.createdAt.getTime() > twoSecondsAgo && !newSignalTimestamps.has(signal.createdAt.getTime())
    );

    if (newSignals.length > 0) {
      setNewSignalTimestamps(prev => {
        const next = new Set(prev);
        newSignals.forEach(signal => next.add(signal.createdAt.getTime()));
        return next;
      });

      if (soundEnabled) {
        try {
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const now = audioContext.currentTime;

          const createTone = (frequency: number, startTime: number, duration: number) => {
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;

            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration - 0.01);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
          };

          createTone(523.25, now, 0.12);
          createTone(659.25, now + 0.1, 0.15);
        } catch (err) {
          console.log('Could not play notification sound:', err);
        }
      }

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

  const toggleRowExpanded = (signalId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(signalId)) {
      newExpanded.delete(signalId);
    } else {
      newExpanded.add(signalId);
    }
    setExpandedRows(newExpanded);
  };

  // Filter and sort signals
  const sortedSignals = useMemo(() => {
    let filteredSignals: SignalLifecycle[];

    if (selectedTraderId) {
      filteredSignals = signals.filter(s => s.traderId === selectedTraderId);
    } else {
      filteredSignals = signals.filter(s => {
        const trader = traders.find(t => t.id === s.traderId);
        return trader?.enabled !== false;
      });
    }

    return [...filteredSignals].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [signals, selectedTraderId, traders]);

  const sortedHistoricalSignals = useMemo(() => {
    const filteredHistoricalSignals = selectedTraderId
      ? historicalSignals.filter(s => s.traderId === selectedTraderId)
      : historicalSignals;
    return [...filteredHistoricalSignals].sort((a, b) => b.klineTimestamp - a.klineTimestamp);
  }, [historicalSignals, selectedTraderId]);

  const enhanceSignalWithCurrentPrice = (signal: SignalLifecycle) => {
    const ticker = tickers.get(signal.symbol);
    return {
      ...signal,
      currentMarketPrice: ticker ? parseFloat(ticker.c) : signal.currentPrice,
      currentMarketChange: ticker ? parseFloat(ticker.P) : 0,
      volume24h: ticker ? parseFloat(ticker.q) : 0,
    };
  };

  const enhancedSignals = useMemo(() => {
    return sortedSignals.map(enhanceSignalWithCurrentPrice);
  }, [sortedSignals, tickers]);

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

  const getStatusIcon = (status: SignalStatus) => {
    switch (status) {
      case 'new': return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case 'analyzing': return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-gray-500" />;
      case 'monitoring': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'ready': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_position': return <DollarSign className="h-4 w-4 text-green-500" />;
      case 'closed': return <DollarSign className="h-4 w-4 text-gray-500" />;
      case 'expired': return <Clock className="h-4 w-4 text-gray-500" />;
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
    <div className="bg-card rounded-lg border border-border shadow-lg p-2 md:p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-4">
          <h2 className="text-lg md:text-xl font-semibold text-foreground">
            Signal Triggers
          </h2>
          {selectedTrader && (
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary rounded-md">
              <span className="text-sm font-medium text-primary">{selectedTrader.name}</span>
              <button
                onClick={() => onSelectTrader?.(null)}
                className="text-primary hover:text-primary/80 transition-colors"
                title="Clear signal filter"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          <span className="text-sm text-muted-foreground">
            {sortedSignals.length} active {selectedTraderId && sortedHistoricalSignals.length > 0 && `+ ${sortedHistoricalSignals.length} historical`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {!selectedTraderId && (
            <button
              onClick={() => onShowCloudSignalsOnlyChange?.(!showCloudSignalsOnly)}
              className={cn(
                "flex items-center gap-2 px-3 py-1 text-sm rounded-md transition-colors",
                showCloudSignalsOnly
                  ? 'bg-primary/10 border border-primary text-primary'
                  : 'bg-muted hover:bg-muted/80'
              )}
              title={showCloudSignalsOnly ? "Show all signals" : "Show only cloud signals"}
            >
              <span className="hidden sm:inline">{showCloudSignalsOnly ? 'Cloud Only' : 'All Signals'}</span>
              <span className="sm:hidden">{showCloudSignalsOnly ? '☁️' : '📡'}</span>
            </button>
          )}

          {!selectedTraderId && (
            <button
              onClick={toggleSound}
              className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-muted hover:bg-muted/80 transition-colors"
              title={soundEnabled ? "Disable sound notifications" : "Enable sound notifications"}
            >
              {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
              <span className="hidden sm:inline">Sound</span>
            </button>
          )}

          {selectedTraderId && (
            <button
              onClick={() => setShowDedupeSettings(!showDedupeSettings)}
              className="flex items-center gap-2 px-3 py-1 text-sm rounded-md bg-muted hover:bg-muted/80 transition-colors"
            >
              <span className="hidden sm:inline">Dedupe: {signalDedupeThreshold} bars</span>
              <span className="sm:hidden">{signalDedupeThreshold}</span>
            </button>
          )}

          {selectedTraderId && hasActiveFilter && historicalScanConfig && (
            <>
              <select
                value={historicalScanConfig.lookbackBars}
                onChange={e => onHistoricalScanConfigChange?.({
                  ...historicalScanConfig,
                  lookbackBars: +e.target.value
                })}
                disabled={isHistoricalScanning}
                className="px-2 py-1 text-sm rounded-md border border-input bg-background disabled:opacity-50"
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
                  className="px-3 py-1 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 whitespace-nowrap"
                >
                  📊 Scan History
                </button>
              ) : (
                <>
                  {historicalScanProgress && (
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-24 bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${historicalScanProgress.percentComplete}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {historicalScanProgress.percentComplete}%
                      </span>
                    </div>
                  )}
                  <button
                    onClick={onCancelHistoricalScan}
                    className="px-3 py-1 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
        <div className="mb-3 p-2 bg-muted rounded-lg">
          <label className="text-sm text-muted-foreground mb-2 block">
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
              className="w-16 px-2 py-1 text-sm rounded-md border border-input bg-background"
            />
            <span className="text-sm text-muted-foreground">bars</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Signals for the same symbol within this bar count will increment the count instead of creating a new entry.
          </p>
        </div>
      )}

      {/* Table */}
      <div className="overflow-y-auto max-h-[500px] md:max-h-[600px]">
        <Table>
          <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur z-10">
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Signal</TableHead>
              {currentTier === 'elite' && <TableHead>Status</TableHead>}
              <TableHead className="text-right">Entry Price</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Change</TableHead>
              <TableHead className="text-right hidden sm:table-cell">Volume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {enhancedSignals.map((signal) => (
              <React.Fragment key={signal.id}>
                <TableRow
                  className={cn(
                    "cursor-pointer",
                    selectedSignalId === signal.id && "bg-amber-500/10 border-l-4 border-l-amber-500"
                  )}
                  onClick={() => {
                    toggleRowExpanded(signal.id);
                    onRowClick?.(signal.symbol, signal.traderId, signal.id);
                    onSignalSelect?.(signal);
                  }}
                >
                  <TableCell>
                    {expandedRows.has(signal.id) ?
                      <ChevronDown className="h-4 w-4 text-muted-foreground" /> :
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    }
                  </TableCell>
                  <TableCell className="text-xs md:text-sm text-muted-foreground">
                    {formatDistanceToNow(signal.createdAt, { addSuffix: true })}
                  </TableCell>
                  <TableCell className={cn(
                    "font-medium",
                    newSignalTimestamps.has(signal.createdAt.getTime()) && "animate-pulse text-amber-500"
                  )}>
                    {signal.symbol}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {signal.traderId
                      ? traders.find(t => t.id === signal.traderId)?.name || signal.traderId
                      : 'AI Screener'}
                  </TableCell>
                  {currentTier === 'elite' && (
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(signal.status)}
                          <span className={cn("text-xs", getStatusColor(signal.status))}>
                            {signal.status.replace('_', ' ')}
                          </span>
                        </div>
                        {signal.analysis && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className={cn(
                              "text-xs font-medium",
                              signal.analysis.decision === 'buy' || signal.analysis.decision === 'enter_trade' ? 'text-green-500' :
                              signal.analysis.decision === 'sell' ? 'text-red-500' :
                              signal.analysis.decision === 'hold' || signal.analysis.decision === 'monitor' || signal.analysis.decision === 'good_setup' ? 'text-yellow-500' :
                              'text-gray-500'
                            )}>
                              {signal.analysis.decision.toUpperCase().replace('_', ' ')}
                            </span>
                            {signal.analysisHistory && signal.analysisHistory.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({signal.analysisHistory.length})
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {signal.status === 'monitoring' && (
                            <WorkflowStatus signalId={signal.id} compact={true} />
                          )}
                          {signal.status === 'ready' && (
                            <AutoTradeButton signalId={signal.id} />
                          )}
                        </div>
                      </div>
                    </TableCell>
                  )}
                  <TableCell className="text-right text-sm font-mono">
                    ${signal.initialPrice.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    ${signal.currentMarketPrice.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatPriceChange(signal.initialPrice, signal.currentMarketPrice)}
                  </TableCell>
                  <TableCell className="text-right text-sm hidden sm:table-cell">
                    {signal.volume24h ? signal.volume24h.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
                  </TableCell>
                </TableRow>

                {/* Expanded Row Details */}
                {expandedRows.has(signal.id) && (
                  <TableRow className="bg-muted">
                    <TableCell colSpan={currentTier === 'elite' ? 9 : 8} className="p-4">
                      <SignalDetails signal={signal} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}

            {/* Historical Signals Separator */}
            {selectedTraderId && sortedHistoricalSignals.length > 0 && (
              <TableRow className="bg-muted/50 border-t border-b">
                <TableCell colSpan={currentTier === 'elite' ? 9 : 8} className="text-center py-2 text-sm text-primary font-medium">
                  📊 Historical Signals (Found in Past Data)
                </TableCell>
              </TableRow>
            )}

            {/* Historical Signals */}
            {selectedTraderId && sortedHistoricalSignals.map((signal, index) => {
              const ticker = tickers.get(signal.symbol);
              const currentPrice = ticker ? parseFloat(ticker.c) : signal.priceAtSignal;

              return (
                <TableRow
                  key={`historical-${signal.symbol}-${signal.timestamp}-${index}`}
                  className="opacity-75 cursor-pointer"
                  onClick={() => onRowClick?.(signal.symbol, signal.traderId)}
                >
                  <TableCell></TableCell>
                  <TableCell className="text-xs md:text-sm text-muted-foreground">
                    {new Date(signal.klineTimestamp).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">
                    {signal.symbol}
                    {(signal.count || 0) > 1 && (
                      <span className="ml-1 text-xs text-primary">x{signal.count}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    Historical
                  </TableCell>
                  {currentTier === 'elite' && (
                    <TableCell>
                      <span className="text-xs text-gray-500">past signal</span>
                    </TableCell>
                  )}
                  <TableCell className="text-right text-sm font-mono">
                    ${signal.priceAtSignal.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">
                    ${currentPrice.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatPriceChange(signal.priceAtSignal, currentPrice)}
                  </TableCell>
                  <TableCell className="text-right text-sm hidden sm:table-cell">
                    {signal.volumeAtSignal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </TableCell>
                </TableRow>
              );
            })}

            {signals.length === 0 && historicalSignals.length === 0 && !isLoadingMore && (
              <TableRow>
                <TableCell colSpan={currentTier === 'elite' ? 9 : 8} className="text-center text-muted-foreground p-4">
                  No signals generated yet. Enable your traders to start capturing signals.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Infinite Scroll Loader */}
        {hasMore && (
          <div ref={loadMoreRef} className="py-4 text-center">
            {isLoadingMore ? (
              <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-muted-foreground">Loading more signals...</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Scroll to load more</span>
            )}
          </div>
        )}

        {!hasMore && signals.length > 0 && (
          <div className="py-3 text-center">
            <span className="text-xs text-muted-foreground">All signals loaded</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Signal Details Component
function SignalDetails({ signal }: { signal: SignalLifecycle }) {
  return (
    <div className="space-y-4">
      {/* Matched Conditions */}
      <div>
        <h4 className="text-sm font-medium text-primary mb-2">Matched Conditions</h4>
        <div className="flex flex-wrap gap-2">
          {signal.matchedConditions.map((condition, i) => (
            <span key={i} className="px-2 py-1 bg-background rounded text-xs">
              {condition}
            </span>
          ))}
        </div>
      </div>

      {/* Analysis Results */}
      {signal.analysis && (
        <div>
          <h4 className="text-sm font-medium text-primary mb-2">AI Analysis</h4>
          <div className="bg-background rounded p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Decision:</span>
              <span className="text-sm">{signal.analysis.decision.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">Confidence:</span>
              <span className="text-sm">{(signal.analysis.confidence * 100).toFixed(1)}%</span>
            </div>
            {signal.analysis.direction && (
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Direction:</span>
                <span className="text-sm">{signal.analysis.direction.toUpperCase()}</span>
              </div>
            )}
            <div className="pt-2 border-t">
              <p className="text-sm">{signal.analysis.reasoning}</p>
            </div>
          </div>
        </div>
      )}

      {/* Monitoring History */}
      {signal.monitoringUpdates && signal.monitoringUpdates.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-primary mb-2">Monitoring History</h4>
          <div className="space-y-2">
            {signal.monitoringUpdates.map((update, i) => (
              <div key={i} className="bg-background rounded p-3 flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-sm">{update.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDistanceToNow(update.timestamp, { addSuffix: true })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono">${update.price.toFixed(4)}</p>
                  {update.confidence && (
                    <p className="text-xs text-muted-foreground">{(update.confidence * 100).toFixed(1)}%</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export const SignalsTable = React.memo(SignalsTableComponent, (prevProps, nextProps) => {
  return (
    prevProps.selectedTraderId === nextProps.selectedTraderId &&
    prevProps.selectedSignalId === nextProps.selectedSignalId &&
    prevProps.isHistoricalScanning === nextProps.isHistoricalScanning &&
    prevProps.historicalScanProgress?.percentComplete === nextProps.historicalScanProgress?.percentComplete &&
    prevProps.historicalSignals?.length === nextProps.historicalSignals?.length &&
    prevProps.traders?.length === nextProps.traders?.length &&
    prevProps.historicalScanConfig === nextProps.historicalScanConfig &&
    prevProps.signalDedupeThreshold === nextProps.signalDedupeThreshold &&
    prevProps.tickers === nextProps.tickers &&
    prevProps.hasActiveFilter === nextProps.hasActiveFilter &&
    prevProps.showCloudSignalsOnly === nextProps.showCloudSignalsOnly
  );
});
