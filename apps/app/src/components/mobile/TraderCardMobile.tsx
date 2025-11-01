import React from 'react';
import { Trader } from '../../abstractions/trader.interfaces';
import { Activity, TrendingUp, Star } from 'lucide-react';

interface TraderCardMobileProps {
  trader: Trader;
  onToggle: (traderId: string) => void;
  onFavorite?: (traderId: string) => void;
  onClick?: (trader: Trader) => void;
  isFavorite?: boolean;
}

export const TraderCardMobile: React.FC<TraderCardMobileProps> = ({
  trader,
  onToggle,
  onFavorite,
  onClick,
  isFavorite = false,
}) => {
  const handleCardClick = () => {
    if (onClick) {
      onClick(trader);
    }
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    onToggle(trader.id);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    if (onFavorite) {
      onFavorite(trader.id);
    }
  };

  // Get category display text
  const getCategoryText = () => {
    if (trader.isBuiltIn) return 'Built-in';
    return trader.category || 'Personal';
  };

  // Get difficulty color
  const getDifficultyColor = () => {
    switch (trader.difficulty) {
      case 'beginner': return 'text-green-500';
      case 'intermediate': return 'text-yellow-500';
      case 'advanced': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  // Get signal count from metrics
  const signalCount = trader.metrics?.totalSignals || 0;
  const winRate = trader.metrics?.winRate || 0;
  const hasMetrics = signalCount > 0;

  return (
    <div
      className="bg-card border border-border rounded-lg p-3 active:scale-[0.98] transition-transform relative cursor-pointer"
      onClick={handleCardClick}
    >
      {/* Favorite Star (top right corner) */}
      {onFavorite && (
        <button
          className="absolute top-2 right-2 p-1 hover:bg-accent rounded z-10"
          onClick={handleFavoriteClick}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star
            className={`w-4 h-4 ${isFavorite ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground'}`}
          />
        </button>
      )}

      {/* Header Row */}
      <div className="flex items-center justify-between mb-2 pr-8">
        <div className="flex items-center gap-2">
          {/* Icon/Initial */}
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-4 h-4 text-accent-foreground" />
          </div>

          {/* Name and Category */}
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{trader.name}</h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{getCategoryText()}</span>
              {trader.difficulty && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <span className={getDifficultyColor()}>
                    {trader.difficulty}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Enable/Disable Toggle */}
        <button
          onClick={handleToggleClick}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
            trader.enabled ? 'bg-primary' : 'bg-muted'
          }`}
          role="switch"
          aria-checked={trader.enabled}
          aria-label={`Toggle ${trader.name}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out ${
              trader.enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
        {trader.description}
      </p>

      {/* Performance Metrics */}
      <div className="flex gap-4 text-xs">
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">
            {signalCount} {signalCount === 1 ? 'signal' : 'signals'}
          </span>
        </div>

        {hasMetrics && (
          <div className="flex items-center gap-1">
            <TrendingUp className={`w-3 h-3 ${winRate >= 50 ? 'text-green-500' : 'text-red-500'}`} />
            <span className={winRate >= 50 ? 'text-green-500' : 'text-red-500'}>
              {winRate.toFixed(1)}% win rate
            </span>
          </div>
        )}

        {!hasMetrics && (
          <span className="text-muted-foreground italic">No signals yet</span>
        )}
      </div>

      {/* Elite tier badge if auto-execute enabled */}
      {trader.auto_execute_trades && (
        <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-xs text-purple-500">
          <span className="font-semibold">AUTO</span>
        </div>
      )}
    </div>
  );
};
