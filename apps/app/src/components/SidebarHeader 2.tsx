import React, { useMemo, memo, useState } from 'react';
import { Wifi, WifiOff, Zap, Database } from 'lucide-react';
import { UpdateFrequencyMetric } from './UpdateFrequencyMetric';

interface SidebarHeaderProps {
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  updateFrequency: number; // updates per second
  updateHistory?: number[]; // 30-second rolling window for sparkline
  symbolCount: number;
  signalCount: number;
}

export const SidebarHeader = memo<SidebarHeaderProps>(({
  connectionStatus,
  updateFrequency,
  updateHistory = [],
  symbolCount,
  signalCount
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  // Memoize connection config to prevent recreating objects
  const connectionConfig = useMemo(() => ({
    connected: {
      icon: Wifi,
      color: 'text-green-500',
      label: 'Live'
    },
    reconnecting: {
      icon: Wifi,
      color: 'text-yellow-500',
      label: 'Reconnecting'
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-red-500',
      label: 'Offline'
    }
  }), []);

  const config = connectionConfig[connectionStatus];
  const ConnectionIcon = config.icon;

  return (
    <div className="px-4 py-4 border-b border-border">
      <div className="flex items-center justify-between">
        {/* Logo + Name */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary-foreground">
              <path d="M13 12L20 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M4 5L8 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M8 15L4 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-lg">vyx</span>
        </div>

        {/* Metrics Badge */}
        <div
          className="flex items-center gap-3 text-xs cursor-help relative"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {/* Update Frequency with Sparkline */}
          <UpdateFrequencyMetric
            frequency={updateFrequency}
            history={updateHistory}
          />

          {/* Symbol Count */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Database className="w-3 h-3" />
            <span>{symbolCount}</span>
          </div>

          {/* Signal Count - only show if > 0 */}
          {signalCount > 0 && (
            <div className="flex items-center gap-1 text-primary">
              <Zap className="w-3 h-3" />
              <span>{signalCount}</span>
            </div>
          )}

          {/* Custom Tooltip */}
          {showTooltip && (
            <div className="absolute top-full right-0 mt-2 px-3 py-2 bg-background border border-border rounded-lg shadow-lg whitespace-nowrap z-50 text-xs">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-primary/20 rounded flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-primary rounded"></div>
                  </div>
                  <span>WebSocket update frequency (30s trend)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-3 h-3" />
                  <span>Symbols being tracked</span>
                </div>
                {signalCount > 0 && (
                  <div className="flex items-center gap-2">
                    <Zap className="w-3 h-3 text-primary" />
                    <span>Active signals firing</span>
                  </div>
                )}
              </div>
              {/* Tooltip arrow */}
              <div className="absolute bottom-full right-4 mb-px">
                <div className="w-2 h-2 bg-background border-l border-t border-border rotate-45"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

SidebarHeader.displayName = 'SidebarHeader';
