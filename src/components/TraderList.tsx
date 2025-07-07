import React, { useEffect, useState, useMemo } from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { traderManager } from '../services/traderManager';
import { Plus, Power, Edit2, Trash2, TrendingUp, TrendingDown, Activity, Lock, Star, StarOff } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { getSignalAccess } from '../utils/tierAccess';
import { SignalAccessIndicator } from './SignalAccessIndicator';
import { TierGate } from './TierGate';
import { UpgradePrompt } from './UpgradePrompt';
import { SubscriptionTier } from '../types/subscription.types';

interface TraderListProps {
  onCreateTrader: () => void;
  onEditTrader: (trader: Trader) => void;
  onSelectTrader?: (traderId: string | null) => void;
  selectedTraderId?: string | null;
}

export function TraderList({ 
  onCreateTrader, 
  onEditTrader, 
  onSelectTrader,
  selectedTraderId 
}: TraderListProps) {
  const [traders, setTraders] = useState<Trader[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentTier, preferences, canCreateSignal, remainingSignals, toggleFavoriteSignal } = useSubscription();

  useEffect(() => {
    // Subscribe to trader updates
    const unsubscribe = traderManager.subscribe((updatedTraders) => {
      setTraders(updatedTraders);
      setLoading(false);
    });

    // Initial load
    traderManager.getTraders().then(initialTraders => {
      setTraders(initialTraders);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Filter and categorize traders based on access
  const { builtInSignals, customSignals, lockedSignals } = useMemo(() => {
    const builtIn: Trader[] = [];
    const custom: Trader[] = [];
    const locked: Trader[] = [];

    traders.forEach(trader => {
      if (trader.isBuiltIn) {
        const access = getSignalAccess(trader, currentTier);
        if (access.canView) {
          builtIn.push(trader);
        } else {
          locked.push(trader);
        }
      } else {
        custom.push(trader);
      }
    });

    // Sort built-in signals by category and difficulty
    builtIn.sort((a, b) => {
      if (a.category !== b.category) {
        return (a.category || '').localeCompare(b.category || '');
      }
      const difficultyOrder = { 'beginner': 0, 'intermediate': 1, 'advanced': 2 };
      return (difficultyOrder[a.difficulty || 'beginner'] || 0) - (difficultyOrder[b.difficulty || 'beginner'] || 0);
    });

    return { builtInSignals: builtIn, customSignals: custom, lockedSignals: locked };
  }, [traders, currentTier]);

  const handleToggleTrader = async (trader: Trader) => {
    try {
      if (trader.enabled) {
        await traderManager.disableTrader(trader.id);
      } else {
        await traderManager.enableTrader(trader.id);
      }
    } catch (error) {
      console.error('Failed to toggle trader:', error);
    }
  };

  const handleDeleteTrader = async (trader: Trader) => {
    if (window.confirm(`Delete signal "${trader.name}"? This cannot be undone.`)) {
      try {
        await traderManager.deleteTrader(trader.id);
        if (selectedTraderId === trader.id) {
          onSelectTrader?.(null);
        }
      } catch (error) {
        console.error('Failed to delete trader:', error);
      }
    }
  };

  const formatPnL = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    const color = value >= 0 ? 'text-green-500' : 'text-red-500';
    return <span className={color}>{sign}{value.toFixed(2)}%</span>;
  };

  const formatMetric = (value: number) => {
    return value.toFixed(1);
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-[var(--tm-text-muted)]">
        Loading traders...
      </div>
    );
  }

  const handleToggleFavorite = async (signalId: string) => {
    try {
      await toggleFavoriteSignal(signalId);
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const renderSignal = (trader: Trader, showActions: boolean = true) => {
    const metrics = trader.mode === 'demo' 
      ? trader.metrics.demoMetrics 
      : trader.metrics.liveMetrics;
    const isSelected = selectedTraderId === trader.id;
    const isFavorite = preferences?.favorite_signals?.includes(trader.id);
    const access = getSignalAccess(trader, currentTier);

    return (
      <div
        key={trader.id}
        className={`p-3 rounded-lg border transition-all ${
          access.canView ? 'cursor-pointer' : 'opacity-60'
        } ${
          isSelected 
            ? 'bg-[var(--tm-bg-hover)] border-[var(--tm-accent)]' 
            : 'bg-[var(--tm-bg-secondary)] border-[var(--tm-border)] hover:border-[var(--tm-border-light)]'
        }`}
        onClick={() => access.canView && onSelectTrader?.(isSelected ? null : trader.id)}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-1">
            {showActions && !trader.isBuiltIn && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleTrader(trader);
                }}
                className={`p-1 rounded transition-colors ${
                  trader.enabled 
                    ? 'text-green-500 hover:bg-green-500/20' 
                    : 'text-gray-500 hover:bg-gray-500/20'
                }`}
                title={trader.enabled ? 'Disable signal' : 'Enable signal'}
              >
                <Power className="h-4 w-4" />
              </button>
            )}
            <h4 className="font-medium text-[var(--tm-text-primary)] flex-1">
              {trader.name}
            </h4>
            {trader.isBuiltIn && <SignalAccessIndicator signal={trader} />}
            {access.canFavorite && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleFavorite(trader.id);
                }}
                className="p-1 rounded transition-colors text-[var(--tm-text-muted)] hover:text-[var(--tm-warning)]"
              >
                {isFavorite ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Rest of the signal card content... */}
        {access.canView && (
          <>
            <p className="text-sm text-[var(--tm-text-secondary)] mb-2">
              {trader.description}
            </p>
            {/* Metrics and actions remain the same */}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 space-y-6">
      {/* Built-in Signals Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--tm-accent)]">
            Signals
          </h3>
        </div>

        {builtInSignals.length === 0 && lockedSignals.length === 0 ? (
          <div className="text-center py-8 text-[var(--tm-text-muted)]">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="mb-2">No signals available</p>
          </div>
        ) : (
          <div className="space-y-2">
            {builtInSignals.map(trader => renderSignal(trader, false))}
            {lockedSignals.length > 0 && currentTier === 'anonymous' && (
              <UpgradePrompt 
                feature="20+ professional signals" 
                requiredTier={SubscriptionTier.FREE}
                className="mt-4"
              />
            )}
          </div>
        )}
      </div>

      {/* Custom Signals Section */}
      <TierGate minTier="pro" fallback={
        currentTier !== 'anonymous' && (
          <UpgradePrompt 
            feature="custom signal creation" 
            requiredTier={SubscriptionTier.PRO}
          />
        )
      }>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-[var(--tm-accent)]">
              My Custom Signals
            </h3>
            <div className="flex items-center gap-3">
              {remainingSignals !== Infinity && (
                <span className="text-sm text-[var(--tm-text-muted)]">
                  {remainingSignals} remaining
                </span>
              )}
              <button
                onClick={onCreateTrader}
                disabled={!canCreateSignal()}
                className="flex items-center gap-2 px-3 py-1.5 bg-[var(--tm-accent)] text-[var(--tm-bg-primary)] 
                  rounded hover:opacity-90 transition-opacity text-sm font-medium
                  disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
                Create
              </button>
            </div>
          </div>

          {customSignals.length === 0 ? (
            <div className="text-center py-8 text-[var(--tm-text-muted)]">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-2">No custom signals yet</p>
              <p className="text-sm">Create your first signal to start automated screening</p>
            </div>
          ) : (
            <div className="space-y-2">
              {customSignals.map(trader => {
            const metrics = trader.mode === 'demo' 
              ? trader.metrics.demoMetrics 
              : trader.metrics.liveMetrics;
            const isSelected = selectedTraderId === trader.id;

            return (
              <div
                key={trader.id}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected 
                    ? 'bg-[var(--tm-bg-hover)] border-[var(--tm-accent)]' 
                    : 'bg-[var(--tm-bg-secondary)] border-[var(--tm-border)] hover:border-[var(--tm-border-light)]'
                }`}
                onClick={() => onSelectTrader?.(isSelected ? null : trader.id)}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTrader(trader);
                      }}
                      className={`p-1 rounded transition-colors ${
                        trader.enabled 
                          ? 'text-green-500 hover:bg-green-500/20' 
                          : 'text-gray-500 hover:bg-gray-500/20'
                      }`}
                      title={trader.enabled ? 'Disable signal' : 'Enable signal'}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <h4 className="font-medium text-[var(--tm-text-primary)]">
                      {trader.name}
                    </h4>
                    {trader.mode === 'demo' && (
                      <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                        DEMO
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditTrader(trader);
                      }}
                      className="p-1 text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTrader(trader);
                      }}
                      className="p-1 text-[var(--tm-text-muted)] hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-[var(--tm-text-muted)] mb-2">
                  {trader.description}
                </p>

                {/* Filter Conditions */}
                {trader.filter?.description && trader.filter.description.length > 0 && (
                  <div className="text-xs text-[var(--tm-text-muted)] mb-2">
                    {trader.filter.description.slice(0, 2).map((desc, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <span className="text-[var(--tm-accent)] mt-0.5">•</span>
                        <span>{desc}</span>
                      </div>
                    ))}
                    {trader.filter.description.length > 2 && (
                      <div className="text-[var(--tm-text-muted)] ml-3">
                        +{trader.filter.description.length - 2} more conditions
                      </div>
                    )}
                  </div>
                )}

                {/* AI Analysis Settings */}
                <div className="text-xs text-[var(--tm-text-muted)] mb-2">
                  <div>Interval: {(() => {
                    const interval = trader.filter?.interval || '1m';
                    const intervalMap: Record<string, string> = {
                      '1m': '1 Minute',
                      '5m': '5 Minutes',
                      '15m': '15 Minutes',
                      '1h': '1 Hour',
                      '4h': '4 Hours',
                      '1d': '1 Day'
                    };
                    return intervalMap[interval] || interval;
                  })()}</div>
                  <div>AI Model: {trader.strategy?.modelTier ? trader.strategy.modelTier.charAt(0).toUpperCase() + trader.strategy.modelTier.slice(1) : 'Standard'}</div>
                  <div>Analysis Data: {trader.strategy?.aiAnalysisLimit || 100} bars</div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center">
                    <div className="text-[var(--tm-text-muted)]">Signals</div>
                    <div className="font-medium text-[var(--tm-text-primary)]">
                      {trader.metrics.totalSignals}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[var(--tm-text-muted)]">Win Rate</div>
                    <div className="font-medium">
                      {metrics && metrics.trades > 0 
                        ? formatMetric((metrics.wins / metrics.trades) * 100) + '%'
                        : '-'
                      }
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[var(--tm-text-muted)]">P&L</div>
                    <div className="font-medium">
                      {metrics ? formatPnL(metrics.pnlPercent) : '-'}
                    </div>
                  </div>
                </div>

                {/* Active positions indicator */}
                {trader.metrics.activePositions > 0 && (
                  <div className="mt-2 pt-2 border-t border-[var(--tm-border)]">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-[var(--tm-text-muted)]">
                        {trader.metrics.activePositions} active position{trader.metrics.activePositions !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
            </div>
          )}
        </div>
      </TierGate>
    </div>
  );
}