import React, { useEffect, useState } from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { traderManager } from '../services/traderManager';
import { Plus, Power, Edit2, Trash2, TrendingUp, TrendingDown, Activity } from 'lucide-react';

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
    if (window.confirm(`Delete trader "${trader.name}"? This cannot be undone.`)) {
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

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-[var(--tm-accent)]">
          Traders ({traders.length})
        </h3>
        <button
          onClick={onCreateTrader}
          className="flex items-center gap-2 px-3 py-1.5 bg-[var(--tm-accent)] text-[var(--tm-bg-primary)] rounded hover:opacity-90 transition-opacity text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Create
        </button>
      </div>

      {traders.length === 0 ? (
        <div className="text-center py-8 text-[var(--tm-text-muted)]">
          <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="mb-2">No traders yet</p>
          <p className="text-sm">Create your first trader to start automated screening</p>
        </div>
      ) : (
        <div className="space-y-2">
          {traders.map(trader => {
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
                onClick={() => onSelectTrader?.(trader.id)}
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
                      title={trader.enabled ? 'Disable trader' : 'Enable trader'}
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
  );
}