import React from 'react';
import { PrebuiltStrategy } from '../types/strategy';

interface StrategyCardProps {
  strategy: PrebuiltStrategy;
  onSelect: (strategy: PrebuiltStrategy) => void;
  isLoading: boolean;
}

const StrategyCard: React.FC<StrategyCardProps> = ({ strategy, onSelect, isLoading }) => {
  const getTimeframeBadgeColor = (timeframe: string) => {
    switch (timeframe) {
      case '1m':
        return 'bg-[var(--tm-error)]/20 text-[var(--tm-error-light)] border-[var(--tm-error)]/30';
      case '5m':
        return 'bg-[var(--tm-warning)]/20 text-[var(--tm-warning-light)] border-[var(--tm-warning)]/30';
      case '15m':
        return 'bg-[var(--tm-info)]/20 text-[var(--tm-info-light)] border-[var(--tm-info)]/30';
      case '1h':
        return 'bg-[var(--tm-success)]/20 text-[var(--tm-success-light)] border-[var(--tm-success)]/30';
      default:
        return 'bg-[var(--tm-bg-hover)]/20 text-[var(--tm-text-secondary)] border-[var(--tm-border)]/30';
    }
  };

  return (
    <div
      onClick={() => !isLoading && onSelect(strategy)}
      className={`
        tm-card p-4 cursor-pointer transition-all duration-300
        hover:border-[var(--tm-accent)]/50 relative
        ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:transform hover:scale-[1.02] hover:shadow-xl'}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-[var(--tm-text-primary)] tm-heading-md">{strategy.name}</h3>
        <span className={`text-xs px-2 py-1 rounded-md border ${getTimeframeBadgeColor(strategy.timeframe)}`}>
          {strategy.timeframe}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-[var(--tm-text-muted)] mb-4">{strategy.description}</p>

      {/* Screener Conditions */}
      <div className="mb-4">
        <h4 className="text-xs font-semibold text-[var(--tm-text-muted)] uppercase mb-2">Screener Conditions</h4>
        <ul className="space-y-1">
          {strategy.conditions.map((condition, index) => (
            <li key={index} className="text-xs text-[var(--tm-text-secondary)] flex items-start">
              <span className="text-[var(--tm-accent)] mr-1">•</span>
              {condition}
            </li>
          ))}
        </ul>
      </div>

      {/* Trade Plan */}
      <div className="bg-[var(--tm-bg-primary)]/50 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-[var(--tm-text-muted)] uppercase mb-2">Trade Plan</h4>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--tm-text-muted)]">Entry:</span>
            <span className="text-[var(--tm-text-secondary)]">{strategy.tradePlan.entry}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--tm-text-muted)]">Stop Loss:</span>
            <span className="text-[var(--tm-error)]">{strategy.tradePlan.stopLoss}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--tm-text-muted)]">Take Profit:</span>
            <span className="text-[var(--tm-success)]">{strategy.tradePlan.takeProfit}</span>
          </div>
        </div>
      </div>

      {/* Hold Time */}
      <div className="mt-3 pt-3 border-t border-[var(--tm-border)] text-center">
        <span className="text-xs text-[var(--tm-text-muted)]">Hold Time: </span>
        <span className="text-xs text-[var(--tm-text-secondary)]">{strategy.holdTime}</span>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 bg-[var(--tm-bg-primary)]/80 rounded-lg flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--tm-accent)] border-t-transparent"></div>
        </div>
      )}
    </div>
  );
};

export default StrategyCard;