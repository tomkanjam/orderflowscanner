import React, { useMemo, memo } from 'react';
import { Activity, Wifi, WifiOff, Zap, Database } from 'lucide-react';

interface SidebarHeaderProps {
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  updateFrequency: number; // updates per second
  symbolCount: number;
  signalCount: number;
}

export const SidebarHeader = memo<SidebarHeaderProps>(({
  connectionStatus,
  updateFrequency,
  symbolCount,
  signalCount
}) => {
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
        <div className="flex items-center gap-3 text-xs">
          {/* Update Frequency */}
          <div className="flex items-center gap-1">
            <Activity className={`w-3 h-3 ${updateFrequency > 0 ? 'animate-pulse' : ''}`} />
            <span>{updateFrequency}/s</span>
          </div>

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

          {/* Connection Status */}
          <div className="flex items-center gap-1">
            <ConnectionIcon className={`w-3 h-3 ${config.color}`} />
            <span className={config.color}>{config.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

SidebarHeader.displayName = 'SidebarHeader';
