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
    <div className="sticky top-0 z-10 h-12 bg-[var(--nt-bg-secondary)] border-b border-[var(--nt-border-default)] px-3 py-2 font-mono">
      <div className="flex items-center justify-between h-full text-xs">
        {/* App Name with Logo */}
        <div className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[var(--nt-accent-lime)]">
            <path d="M13 12L20 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M4 5L8 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            <path d="M8 15L4 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <span className="text-lg font-bold text-[var(--nt-accent-lime)]">vyx</span>
        </div>
        
        {/* Status Metrics */}
        <div className="flex items-center gap-4">
          {/* Update Frequency */}
          <div className="flex items-center gap-1 text-white">
            <Activity className={`w-3.5 h-3.5 ${updateFrequency > 0 ? 'animate-pulse' : ''}`} />
            <span>{updateFrequency}/s</span>
          </div>
          
          {/* Symbol Count */}
          <div className="flex items-center gap-1 text-[var(--nt-text-secondary)]">
            <Database className="w-3.5 h-3.5" />
            <span>{symbolCount}</span>
          </div>
          
          {/* Active Signals */}
          {signalCount > 0 && (
            <div className="flex items-center gap-1 text-[var(--nt-accent-lime)]">
              <Zap className="w-3.5 h-3.5" />
              <span>{signalCount}</span>
            </div>
          )}
          
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div className={`relative ${config.bgColor} rounded-full p-1.5`}>
              <ConnectionIcon className={`w-3.5 h-3.5 ${config.color}`} />
            </div>
            <span className={`font-medium ${config.color}`}>{config.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

StatusBar.displayName = 'StatusBar';