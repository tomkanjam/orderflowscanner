import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export interface TriggerRecord {
  symbol: string;
  timestamp: number;
  price: number;
  changePercent: number;
  direction?: 'up' | 'down';
}

export interface TriggerHistoryProps {
  /** List of recent triggers */
  triggers: TriggerRecord[];
  /** Maximum number of triggers to display */
  maxItems?: number;
  /** Callback when "View All" is clicked */
  onViewAll?: () => void;
  /** Whether to show the View All link */
  showViewAll?: boolean;
  /** Custom className */
  className?: string;
}

/**
 * TriggerHistory Component
 * Displays recent trigger history for signals
 * Shows last 5 triggers with symbol, time, price, and percentage change
 */
export const TriggerHistory: React.FC<TriggerHistoryProps> = ({
  triggers,
  maxItems = 5,
  onViewAll,
  showViewAll = true,
  className = '',
}) => {
  const displayTriggers = triggers.slice(0, maxItems);

  const formatTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60 * 1000) {
      return 'Just now';
    } else if (diff < 60 * 60 * 1000) {
      const minutes = Math.floor(diff / (60 * 1000));
      return `${minutes}m ago`;
    } else if (diff < 24 * 60 * 60 * 1000) {
      const hours = Math.floor(diff / (60 * 60 * 1000));
      return `${hours}h ago`;
    } else {
      const days = Math.floor(diff / (24 * 60 * 60 * 1000));
      return `${days}d ago`;
    }
  };

  const formatPrice = (price: number): string => {
    if (price >= 1000) {
      return price.toLocaleString('en-US', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      });
    } else if (price >= 1) {
      return price.toFixed(3);
    } else {
      return price.toFixed(6);
    }
  };

  const formatPercent = (percent: number): string => {
    const sign = percent >= 0 ? '+' : '';
    return `${sign}${percent.toFixed(2)}%`;
  };

  if (displayTriggers.length === 0) {
    return (
      <div className={`text-center py-4 text-gray-500 ${className}`}>
        No recent triggers
      </div>
    );
  }

  return (
    <div className={`signal-card__trigger-history ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-medium text-gray-300">Recent Triggers</h4>
        {showViewAll && onViewAll && triggers.length > maxItems && (
          <button
            onClick={onViewAll}
            className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            View All ({triggers.length})
          </button>
        )}
      </div>

      {/* Trigger List */}
      <div className="space-y-2">
        {displayTriggers.map((trigger, index) => {
          const isPositive = trigger.changePercent >= 0;
          const Icon = isPositive ? TrendingUp : TrendingDown;
          
          return (
            <div
              key={`${trigger.symbol}-${trigger.timestamp}-${index}`}
              className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5 transition-colors"
            >
              {/* Symbol and Direction */}
              <div className="flex items-center gap-2 flex-1">
                <Icon 
                  className={`w-3 h-3 ${isPositive ? 'text-green-500' : 'text-red-500'}`}
                />
                <span className="font-mono text-sm text-gray-200">
                  {trigger.symbol}
                </span>
              </div>

              {/* Time */}
              <span className="text-xs text-gray-500 mx-2">
                {formatTime(trigger.timestamp)}
              </span>

              {/* Price */}
              <span className="font-mono text-sm text-gray-300 mx-2">
                ${formatPrice(trigger.price)}
              </span>

              {/* Change Percent */}
              <span 
                className={`
                  font-mono text-sm font-medium min-w-[60px] text-right
                  ${isPositive ? 'text-green-500' : 'text-red-500'}
                `}
              >
                {formatPercent(trigger.changePercent)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Top Symbols Summary */}
      {triggers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">Top Symbols:</span>
            <div className="flex gap-3">
              {getTopSymbols(triggers).map(({ symbol, count }) => (
                <span key={symbol} className="text-xs text-gray-400">
                  {symbol} ({count})
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Get top 3 most triggered symbols
 */
function getTopSymbols(triggers: TriggerRecord[]): { symbol: string; count: number }[] {
  const symbolCounts = triggers.reduce((acc, trigger) => {
    const symbol = trigger.symbol.replace('USDT', '');
    acc[symbol] = (acc[symbol] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(symbolCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([symbol, count]) => ({ symbol, count }));
}

export default React.memo(TriggerHistory);