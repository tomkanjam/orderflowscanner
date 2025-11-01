import React from 'react';
import { Maximize2, Minimize2, Clock } from 'lucide-react';
import { KlineInterval } from '../../types';

interface MobileChartControlsProps {
  interval: KlineInterval;
  onIntervalChange: (interval: KlineInterval) => void;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
}

const INTERVALS: { value: KlineInterval; label: string }[] = [
  { value: '1m' as KlineInterval, label: '1m' },
  { value: '5m' as KlineInterval, label: '5m' },
  { value: '15m' as KlineInterval, label: '15m' },
  { value: '1h' as KlineInterval, label: '1h' },
  { value: '4h' as KlineInterval, label: '4h' },
  { value: '1d' as KlineInterval, label: '1d' },
];

export const MobileChartControls: React.FC<MobileChartControlsProps> = ({
  interval,
  onIntervalChange,
  isFullscreen,
  onFullscreenToggle,
}) => {
  return (
    <div className="mobile-chart-controls bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          {INTERVALS.map((item) => (
            <button
              key={item.value}
              onClick={() => onIntervalChange(item.value)}
              className={`
                px-3 py-1.5 text-xs font-medium rounded-md transition-all flex-shrink-0
                ${
                  interval === item.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-accent text-muted-foreground hover:bg-accent/80'
                }
              `}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Fullscreen Toggle */}
        <button
          onClick={onFullscreenToggle}
          className="p-2 rounded-md bg-accent hover:bg-accent/80 transition-colors flex-shrink-0"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
};
