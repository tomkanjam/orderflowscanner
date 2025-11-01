import React from 'react';
import { Trader } from '../../abstractions/trader.interfaces';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

  const handleCardClick = () => {
    if (onExpand) {
      onExpand(trader.id);
    }
  };

  return (
    <Card
      onClick={handleCardClick}
      className="cursor-pointer active:scale-[0.99] transition-transform"
    >
      <CardHeader>
        <CardTitle>{trader.name}</CardTitle>
        <CardDescription>
          {trader.isBuiltIn ? 'Built-in' : 'Personal'} • {signalCount} signals
        </CardDescription>
        <CardAction>
          <Switch
            checked={trader.enabled}
            onCheckedChange={() => onToggle(trader.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Toggle ${trader.name}`}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {trader.description}
        </p>

        {signalCount > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Win rate:</span>
            <Badge variant={winRate >= 50 ? 'default' : 'destructive'}>
              {winRate.toFixed(1)}%
            </Badge>
          </div>
        )}

        {isExpanded && (
          <div className="pt-3 border-t space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Category:</span>
              <span>{trader.category || 'General'}</span>
            </div>
            {trader.difficulty && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Difficulty:</span>
                <Badge variant="outline" className="capitalize">
                  {trader.difficulty}
                </Badge>
              </div>
            )}
            {trader.auto_execute_trades && (
              <Badge variant="secondary" className="w-full justify-center">
                AUTO-TRADING ENABLED
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
