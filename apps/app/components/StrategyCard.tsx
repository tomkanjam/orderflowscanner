import React, { useMemo } from 'react';
import { PrebuiltStrategy } from '../types/strategy';

interface StrategyCardProps {
  strategy: PrebuiltStrategy;
  onSelect: (strategy: PrebuiltStrategy) => void;
  isLoading: boolean;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ strategy, onSelect, isLoading }) => {
  // Memoize timeframe badge color calculation
  const timeframeBadgeColor = useMemo(() => {
    switch (strategy.timeframe) {
      case '1m':
        return 'bg-[var(--nt-error)]/20 text-[var(--nt-error)] border-[var(--nt-error)]/30';
      case '5m':
        return 'bg-[var(--nt-warning)]/20 text-[var(--nt-warning)] border-[var(--nt-warning)]/30';
      case '15m':
        return 'bg-[var(--nt-accent-cyan)]/20 text-[var(--nt-accent-cyan)] border-[var(--nt-accent-cyan)]/30';
      case '1h':
        return 'bg-[var(--nt-success)]/20 text-[var(--nt-success)] border-[var(--nt-success)]/30';
      default:
        return 'bg-[var(--nt-bg-hover)]/20 text-[var(--nt-text-secondary)] border-[var(--nt-border-default)]/30';
    }
  }, [strategy.timeframe]);

  return (
    <div
      onClick={() => !isLoading && onSelect(strategy)}
      className={`
        nt-card p-4 cursor-pointer transition-all duration-300
        hover:border-[var(--nt-accent-lime)]/50 relative
        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:transform hover:scale-[1.02] hover:shadow-xl'}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-[var(--nt-text-primary)] nt-heading-md">{strategy.name}</h3>
        <span className={`text-xs px-2 py-1 rounded-md border ${timeframeBadgeColor}`}>
          {strategy.timeframe}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--nt-text-muted)] mb-4">{strategy.description}</p>

      {/* Screener Conditions */}
      <div className="mb-4">
        <h4 className="text-xs font-semibold text-[var(--nt-text-muted)] uppercase mb-2">Screener Conditions</h4>
        <ul className="space-y-1">
          {strategy.conditions.map((condition, index) => (
            <li key={index} className="text-xs text-[var(--nt-text-secondary)] flex items-start">
              <span className="text-[var(--nt-accent-lime)] mr-1">•</span>
              {condition}
            </li>
          ))}
        </ul>
      </div>

      {/* Trade Plan */}
      <div className="bg-[var(--nt-bg-primary)]/50 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[var(--nt-text-muted)] uppercase mb-2">Trade Plan</h4>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--nt-text-muted)]">Entry:</span>
            <span className="text-[var(--nt-text-secondary)]">{strategy.tradePlan.entry}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--nt-text-muted)]">Stop Loss:</span>
            <span className="text-[var(--nt-error)]">{strategy.tradePlan.stopLoss}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--nt-text-muted)]">Take Profit:</span>
            <span className="text-[var(--nt-success)]">{strategy.tradePlan.takeProfit}</span>
          </div>
        </div>
      </div>

      {/* Hold Time */}
      <div className="mt-3 pt-3 border-t border-[var(--nt-border-default)] text-center">
        <span className="text-xs text-[var(--nt-text-muted)]">Hold Time: </span>
        <span className="text-xs text-[var(--nt-text-secondary)]">{strategy.holdTime}</span>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 bg-[var(--nt-bg-primary)]/80 rounded-lg flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--nt-accent-lime)] border-t-transparent"></div>
        </div>
      )}
    </div>
  );
};

// Memoize component to prevent unnecessary re-renders
// Only re-render if strategy id or isLoading changes
export default React.memo(StrategyCard, (prevProps, nextProps) => {
  return (
    prevProps.strategy.id === nextProps.strategy.id &&
    prevProps.isLoading === nextProps.isLoading
    // onSelect is likely stable from parent, so we don't compare it
  );
});