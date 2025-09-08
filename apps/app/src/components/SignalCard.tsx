import React, { useState } from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { Plus, Power, Edit2, Trash2, TrendingUp, TrendingDown, Activity, Lock, Star, StarOff } from 'lucide-react';
import { SignalAccessIndicator } from './SignalAccessIndicator';
import { ActivityIndicator } from './cards/ActivityIndicator';
import { CardExpandable } from './cards/CardExpandable';
import { TriggerHistory, TriggerRecord } from './cards/TriggerHistory';
import { activityTracker } from '../services/activityTracker';
import './SignalCard.css';

/**
 * Props for the SignalCard component
 */
interface SignalCardProps {
  /** The trader/signal data to display */
  signal: Trader;
  /** Whether this signal is currently selected */
  isSelected: boolean;
  /** Whether this signal is marked as favorite */
  isFavorite: boolean;
  /** Whether the user can view the signal details */
  canView: boolean;
  /** Whether the user can favorite this signal */
  canFavorite: boolean;
  /** Show enable/disable toggle (typically for custom signals) */
  showEnableToggle?: boolean;
  /** Show edit/delete controls (for admins or signal owners) */
  showEditDelete?: boolean;
  /** Show access indicator badge (typically for built-in signals) */
  showAccessIndicator?: boolean;
  /** Show AI features (for Elite tier) */
  showAIFeatures?: boolean;
  /** Handler for when the card is clicked */
  onSelect?: () => void;
  /** Handler for toggling signal enabled state */
  onToggleEnable?: () => void;
  /** Handler for editing the signal */
  onEdit?: () => void;
  /** Handler for deleting the signal */
  onDelete?: () => void;
  /** Handler for toggling favorite status */
  onToggleFavorite?: () => void;
}

/**
 * Error boundary for SignalCard to prevent entire list from crashing
 */
class SignalCardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('SignalCard error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/10">
          <p className="text-sm text-red-400">Error loading signal</p>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * SignalCard - A reusable component for displaying trading signals
 * 
 * This component displays a trading signal card with:
 * - Signal name, status, and description
 * - Performance metrics (signals, win rate, P&L)
 * - Control buttons (enable/disable, edit, delete, favorite)
 * - Access indicators and tier restrictions
 * 
 * @example
 * ```tsx
 * <SignalCard
 *   signal={traderData}
 *   isSelected={selectedId === trader.id}
 *   isFavorite={favorites.includes(trader.id)}
 *   canView={true}
 *   canFavorite={true}
 *   showEditDelete={isAdmin}
 *   onSelect={() => handleSelect(trader.id)}
 *   onEdit={() => handleEdit(trader)}
 *   onDelete={() => handleDelete(trader)}
 *   onToggleFavorite={() => toggleFavorite(trader.id)}
 * />
 * ```
 */
export const SignalCard = React.memo(function SignalCard({
  signal,
  isSelected,
  isFavorite,
  canView,
  canFavorite,
  showEnableToggle = false,
  showEditDelete = false,
  showAccessIndicator = false,
  showAIFeatures = false,
  onSelect,
  onToggleEnable,
  onEdit,
  onDelete,
  onToggleFavorite
}: SignalCardProps) {
  // Local state for card expansion
  const [expanded, setExpanded] = useState(false);
  // Safely access metrics with error handling
  const getMetrics = () => {
    try {
      return signal.mode === 'demo' 
        ? signal.metrics?.demoMetrics 
        : signal.metrics?.liveMetrics;
    } catch (error) {
      console.error('Error accessing metrics:', error);
      return null;
    }
  };

  const metrics = getMetrics();

  /**
   * Formats P&L percentage with color coding
   * @param value - The P&L value to format
   * @returns Formatted JSX element with appropriate styling
   */
  const formatPnL = (value: number) => {
    try {
      const sign = value >= 0 ? '+' : '';
      const color = value >= 0 ? 'text-green-500' : 'text-red-500';
      return <span className={color}>{sign}{value.toFixed(2)}%</span>;
    } catch (error) {
      console.error('Error formatting P&L:', error);
      return <span>-</span>;
    }
  };

  /**
   * Formats metric values to 1 decimal place
   * @param value - The metric value to format
   * @returns Formatted string
   */
  const formatMetric = (value: number) => {
    try {
      return value.toFixed(1);
    } catch (error) {
      console.error('Error formatting metric:', error);
      return '-';
    }
  };

  /**
   * Converts interval codes to human-readable format
   * @param interval - The interval code (e.g., '1m', '1h')
   * @returns Human-readable interval string
   */
  const formatInterval = (interval: string) => {
    const intervalMap: Record<string, string> = {
      '1m': '1 Minute',
      '5m': '5 Minutes',
      '15m': '15 Minutes',
      '1h': '1 Hour',
      '4h': '4 Hours',
      '1d': '1 Day'
    };
    return intervalMap[interval] || interval;
  };

  /**
   * Safely handles click events with error handling
   * @param handler - The click handler to execute
   * @returns Event handler function
   */
  const safeClickHandler = (handler?: () => void) => {
    return (e: React.MouseEvent) => {
      try {
        e.stopPropagation();
        handler?.();
      } catch (error) {
        console.error('Error in click handler:', error);
      }
    };
  };

  return (
    <SignalCardErrorBoundary>
      <div
        className={`p-3 rounded-lg border transition-all ${
          canView ? 'cursor-pointer' : 'opacity-60'
        } ${
          isSelected 
            ? 'bg-[var(--nt-bg-hover)] border-[var(--nt-text-primary)]' 
            : 'bg-[var(--nt-bg-secondary)] border-[var(--nt-border-default)] hover:border-[var(--nt-border-light)]'
        }`}
        onClick={() => canView && onSelect?.()}
        role="button"
        tabIndex={canView ? 0 : -1}
        aria-selected={isSelected}
        aria-label={`Signal: ${signal.name}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 flex-1">
            {showEnableToggle && (
              <button
                onClick={safeClickHandler(onToggleEnable)}
                className={`p-1 rounded transition-colors ${
                  signal.enabled 
                    ? 'text-green-500 hover:bg-green-500/20' 
                    : 'text-gray-500 hover:bg-gray-500/20'
                }`}
                title={signal.enabled ? 'Disable signal' : 'Enable signal'}
                aria-label={signal.enabled ? 'Disable signal' : 'Enable signal'}
              >
                <Power className="h-4 w-4" />
              </button>
            )}
            <h4 className="font-medium text-[var(--nt-text-primary)] flex-1">
              {signal.name || 'Unnamed Signal'}
            </h4>
            {signal.mode === 'demo' && (
              <span className="text-xs px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded">
                DEMO
              </span>
            )}
            {showAccessIndicator && <SignalAccessIndicator signal={signal} />}
            {canFavorite && (
              <button
                onClick={safeClickHandler(onToggleFavorite)}
                className="p-1 rounded transition-colors text-[var(--nt-text-muted)] hover:text-[var(--nt-warning)]"
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                {isFavorite ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
              </button>
            )}
          </div>
          {showEditDelete && (
            <div className="flex items-center gap-1">
              <button
                onClick={safeClickHandler(onEdit)}
                className="p-1 text-[var(--nt-text-muted)] hover:text-[var(--nt-text-primary)] transition-colors"
                title="Edit signal"
                aria-label="Edit signal"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={safeClickHandler(onDelete)}
                className="p-1 text-[var(--nt-text-muted)] hover:text-red-500 transition-colors"
                title="Delete signal"
                aria-label="Delete signal"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Content - only show if user can view */}
        {canView && (
          <>
            {/* Description */}
            <p className="text-sm text-[var(--nt-text-secondary)] mb-2">
              {signal.description || 'No description available'}
            </p>

            {/* Filter Conditions (for custom signals) */}
            {!signal.isBuiltIn && signal.filter?.description && signal.filter.description.length > 0 && (
              <div className="text-xs text-[var(--nt-text-muted)] mb-2">
                {signal.filter.description.slice(0, 2).map((desc, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <span className="text-[var(--nt-accent-lime)] mt-0.5">•</span>
                    <span>{desc}</span>
                  </div>
                ))}
                {signal.filter.description.length > 2 && (
                  <div className="text-[var(--nt-text-muted)] ml-3">
                    +{signal.filter.description.length - 2} more conditions
                  </div>
                )}
              </div>
            )}

            {/* AI Analysis Settings (for custom signals, Elite only) */}
            {!signal.isBuiltIn && showAIFeatures && (
              <div className="text-xs text-[var(--nt-text-muted)] mb-2">
                <div>Interval: {formatInterval(signal.filter?.interval || '1m')}</div>
                <div>AI Model: {signal.strategy?.modelTier ? signal.strategy.modelTier.charAt(0).toUpperCase() + signal.strategy.modelTier.slice(1) : 'Standard'}</div>
                <div>Analysis Data: {signal.strategy?.aiAnalysisLimit || 100} bars</div>
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center">
                <div className="text-[var(--nt-text-muted)]">
                  {showAIFeatures ? 'Signals' : 'Triggered'}
                </div>
                <div className="font-medium text-[var(--nt-text-primary)]">
                  {signal.metrics?.totalSignals ?? 0}
                </div>
              </div>
              {showAIFeatures ? (
                <>
                  <div className="text-center">
                    <div className="text-[var(--nt-text-muted)]">Win Rate</div>
                    <div className="font-medium">
                      {metrics && metrics.trades > 0 
                        ? formatMetric((metrics.wins / metrics.trades) * 100) + '%'
                        : '-'
                      }
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[var(--nt-text-muted)]">P&L</div>
                    <div className="font-medium">
                      {metrics ? formatPnL(metrics.pnlPercent) : '-'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-center">
                    <div className="text-[var(--nt-text-muted)]">Interval</div>
                    <div className="font-medium text-[var(--nt-text-primary)]">
                      {formatInterval(signal.filter?.interval || '1m')}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-[var(--nt-text-muted)]">Last</div>
                    <div className="font-medium text-[var(--nt-text-primary)]">
                      {signal.metrics?.lastSignalAt 
                        ? new Date(signal.metrics.lastSignalAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
                        : '-'
                      }
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Active positions indicator (Elite only) */}
            {showAIFeatures && signal.metrics?.activePositions > 0 && (
              <div className="mt-2 pt-2 border-t border-[var(--nt-border-default)]">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-[var(--nt-text-muted)]">
                    {signal.metrics.activePositions} active position{signal.metrics.activePositions !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SignalCardErrorBoundary>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for React.memo optimization
  // Only re-render if these key props change
  return (
    prevProps.signal.id === nextProps.signal.id &&
    prevProps.signal.name === nextProps.signal.name &&
    prevProps.signal.enabled === nextProps.signal.enabled &&
    prevProps.signal.metrics?.totalSignals === nextProps.signal.metrics?.totalSignals &&
    prevProps.signal.metrics?.activePositions === nextProps.signal.metrics?.activePositions &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isFavorite === nextProps.isFavorite &&
    prevProps.canView === nextProps.canView &&
    prevProps.canFavorite === nextProps.canFavorite &&
    prevProps.showEnableToggle === nextProps.showEnableToggle &&
    prevProps.showEditDelete === nextProps.showEditDelete &&
    prevProps.showAccessIndicator === nextProps.showAccessIndicator
  );
});