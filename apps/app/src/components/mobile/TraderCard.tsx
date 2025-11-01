import React from 'react';
import { Trader } from '../../abstractions/trader.interfaces';
import { Switch } from '@/components/ui/switch';

interface TraderCardProps {
  trader: Trader;
  onToggle: (traderId: string) => void;
  isExpanded?: boolean;
  onExpand?: (traderId: string) => void;
}

export const TraderCard: React.FC<TraderCardProps> = ({
  trader,
  onToggle,
  isExpanded = false,
  onExpand,
}) => {
  const signalCount = trader.metrics?.totalSignals || 0;
  const winRate = trader.metrics?.winRate || 0;

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleCardClick = () => {
    if (onExpand) {
      onExpand(trader.id);
    }
  };

  return (
    <div
      onClick={handleCardClick}
      className="bg-card border border-border rounded-lg p-4 active:scale-[0.99] transition-all cursor-pointer"
    >
      {/* Header Row: Name & Toggle */}
      <div className="flex items-center gap-3 mb-2">
        {/* Name & Category */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-base truncate">{trader.name}</h3>
          <p className="text-xs text-muted-foreground">
            {trader.isBuiltIn ? 'Built-in' : 'Personal'} • {signalCount} signals
          </p>
        </div>

        {/* Toggle Switch - Using shadcn/ui component */}
        <div onClick={handleToggleClick}>
          <Switch
            checked={trader.enabled}
            onCheckedChange={() => onToggle(trader.id)}
            aria-label={`Toggle ${trader.name}`}
          />
        </div>
      </div>

      {/* Description - Always show first line */}
      <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
        {trader.description}
      </p>

      {/* Performance Metrics */}
      {signalCount > 0 && (
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Win rate:</span>
            <span className={winRate >= 50 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
              {winRate.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Expanded Details */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-border space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Category:</span>
            <span>{trader.category || 'General'}</span>
          </div>
          {trader.difficulty && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Difficulty:</span>
              <span className="capitalize">{trader.difficulty}</span>
            </div>
          )}
          {trader.auto_execute_trades && (
            <div className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded text-xs text-purple-500">
              <span className="font-semibold">AUTO-TRADING ENABLED</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
