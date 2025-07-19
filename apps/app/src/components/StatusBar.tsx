import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { Activity, Wifi, WifiOff, Zap, Database } from 'lucide-react';

interface StatusBarProps {
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  tickerCount: number;
  symbolCount: number;
  signalCount: number;
  lastUpdate: number | null; // Changed from Date to timestamp
  updateFrequency: number; // updates per second
}

export const StatusBar = memo<StatusBarProps>(({
  connectionStatus,
  tickerCount,
  symbolCount,
  signalCount,
  lastUpdate,
  updateFrequency
}) => {
  const [isDataFlowing, setIsDataFlowing] = useState(false);
  const dataFlowTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Pulse animation when data is flowing
  useEffect(() => {
    if (updateFrequency > 0) {
      setIsDataFlowing(true);
      if (dataFlowTimeoutRef.current) {
        clearTimeout(dataFlowTimeoutRef.current);
      }
      dataFlowTimeoutRef.current = setTimeout(() => {
        setIsDataFlowing(false);
      }, 1000);
    }
    
    return () => {
      if (dataFlowTimeoutRef.current) {
        clearTimeout(dataFlowTimeoutRef.current);
      }
    };
  }, [updateFrequency]);
  
  // Memoize connection config to prevent recreating objects
  const connectionConfig = useMemo(() => ({
    connected: {
      icon: Wifi,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      pulseColor: 'bg-green-500',
      label: 'Live'
    },
    reconnecting: {
      icon: Wifi,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      pulseColor: 'bg-yellow-500',
      label: 'Reconnecting'
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      pulseColor: 'bg-red-500',
      label: 'Offline'
    }
  }), []);
  
  const config = connectionConfig[connectionStatus];
  const ConnectionIcon = config.icon;
  
  return (
    <div className="sticky top-0 z-10 h-12 bg-[var(--tm-bg-secondary)] border-b border-[var(--tm-border)] px-3 py-2">
      <div className="flex items-center justify-between h-full text-xs">
        {/* App Name and Connection Status */}
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-[var(--tm-accent)]">vyx</span>
          <div className="flex items-center gap-2">
            <div className={`relative ${config.bgColor} rounded-full p-1.5`}>
              <ConnectionIcon className={`w-3.5 h-3.5 ${config.color}`} />
            </div>
            <span className={`font-medium ${config.color}`}>{config.label}</span>
          </div>
        </div>
        
        {/* Data Feed Metrics */}
        <div className="flex items-center gap-4 ml-auto">
          {/* Symbol Count */}
          <div className="flex items-center gap-1 text-[var(--tm-text-secondary)]">
            <Database className="w-3.5 h-3.5" />
            <span>{symbolCount}</span>
          </div>
          
          {/* Update Frequency */}
          <div className={`flex items-center gap-1 ${updateFrequency > 0 ? 'text-[var(--tm-accent)]' : 'text-[var(--tm-text-secondary)]'}`}>
            <Activity className={`w-3.5 h-3.5 ${updateFrequency > 0 ? 'animate-pulse' : ''}`} />
            <span>{updateFrequency}/s</span>
          </div>
          
          {/* Active Signals */}
          {signalCount > 0 && (
            <div className="flex items-center gap-1 text-[var(--tm-accent)]">
              <Zap className="w-3.5 h-3.5" />
              <span>{signalCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

StatusBar.displayName = 'StatusBar';