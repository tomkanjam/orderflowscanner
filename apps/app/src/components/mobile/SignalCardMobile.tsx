import React from 'react';
import { TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SignalCardMobileProps {
  symbol: string;
  traderName: string;
  direction: 'buy' | 'sell';
  price: number;
  priceChange?: number;
  timestamp: number;
  status: 'active' | 'closed' | 'expired';
  pnl?: number;
  onClick: () => void;
}

export const SignalCardMobile: React.FC<SignalCardMobileProps> = ({
  symbol,
  traderName,
  direction,
  price,
  priceChange,
  timestamp,
  status,
  pnl,
  onClick,
}) => {
  const isProfitable = pnl !== undefined && pnl > 0;
  const isLoss = pnl !== undefined && pnl < 0;

  const statusColors = {
    active: 'text-primary',
    closed: 'text-muted-foreground',
    expired: 'text-amber-500',
  };

  const pnlColor = isProfitable
    ? 'text-green-500'
    : isLoss
    ? 'text-red-500'
    : 'text-muted-foreground';

  return (
    <div
      onClick={onClick}
      className="mobile-signal-card bg-card border border-border rounded-lg p-3 active:scale-98 transition-transform cursor-pointer"
    >
      {/* Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {/* Direction Icon */}
          <div
            className={`
              w-8 h-8 rounded-full flex items-center justify-center
              ${direction === 'buy' ? 'bg-green-500/20' : 'bg-red-500/20'}
            `}
          >
            {direction === 'buy' ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
          </div>

          {/* Symbol and Trader */}
          <div>
            <p className="text-sm font-bold">{symbol}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[120px]">
              {traderName}
            </p>
          </div>
        </div>

        {/* Price and Status */}
        <div className="text-right">
          <div className="flex items-center gap-1 justify-end">
            <DollarSign className="w-3 h-3 text-muted-foreground" />
            <p className="text-sm font-mono">{price.toFixed(2)}</p>
          </div>
          <span
            className={`inline-block px-2 py-0.5 text-xs rounded-full ${statusColors[status]}`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Footer Row */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{formatDistanceToNow(new Date(timestamp), { addSuffix: true })}</span>
        </div>

        {pnl !== undefined && (
          <div className={`font-medium ${pnlColor}`}>
            {pnl > 0 && '+'}
            {pnl.toFixed(2)}%
          </div>
        )}

        {priceChange !== undefined && pnl === undefined && (
          <div className={priceChange >= 0 ? 'text-green-500' : 'text-red-500'}>
            {priceChange >= 0 && '+'}
            {priceChange.toFixed(2)}%
          </div>
        )}
      </div>
    </div>
  );
};
