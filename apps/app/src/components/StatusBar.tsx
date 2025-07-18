import React, { useState, useEffect, useRef, memo, useMemo } from 'react';
import { Activity, Wifi, WifiOff, TrendingUp, Clock, Zap, Shield, Database } from 'lucide-react';
import { useAuthContext } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { getTierDisplayName, getTierColor } from '../utils/tierAccess';
import { webSocketManager } from '../utils/webSocketManager';

interface StatusBarProps {
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  tickerCount: number;
  symbolCount: number;
  signalCount: number;
  lastUpdate: number | null; // Changed from Date to timestamp
  updateFrequency: number; // updates per second
}

// Memoized time display component to prevent re-renders
const TimeDisplay = memo(({ lastUpdate }: { lastUpdate: number | null }) => {
  const [displayTime, setDisplayTime] = useState('--');
  
  useEffect(() => {
    if (!lastUpdate) {
      setDisplayTime('--');
      return;
    }
    
    const updateDisplay = () => {
      const seconds = Math.floor((Date.now() - lastUpdate) / 1000);
      
      let display: string;
      if (seconds < 5) {
        display = 'now';
      } else if (seconds < 60) {
        display = `${seconds}s`;
      } else if (seconds < 3600) {
        display = `${Math.floor(seconds / 60)}m`;
      } else {
        display = `${Math.floor(seconds / 3600)}h`;
      }
      
      setDisplayTime(prev => {
        // Only update if the display value actually changed
        return prev !== display ? display : prev;
      });
    };
    
    // Initial update
    updateDisplay();
    
    // Update only when the display value would change
    const interval = setInterval(updateDisplay, 1000);
    
    return () => clearInterval(interval);
  }, [lastUpdate]);
  
  return <span>{displayTime}</span>;
});

TimeDisplay.displayName = 'TimeDisplay';

export const StatusBar = memo<StatusBarProps>(({
  connectionStatus,
  tickerCount,
  symbolCount,
  signalCount,
  lastUpdate,
  updateFrequency
}) => {
  const { user } = useAuthContext();
  const { currentTier } = useSubscription();
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
  
  // Memoize tier styles
  const tierStyles = useMemo(() => ({
    backgroundColor: `${getTierColor(currentTier)}20`,
    color: getTierColor(currentTier)
  }), [currentTier]);
  
  return (
    <div className="absolute bottom-0 left-0 right-0 h-12 bg-[var(--tm-bg-primary)]/95 backdrop-blur-sm border-t border-[var(--tm-border)] px-3 py-2">
      <div className="flex items-center justify-between h-full text-xs">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <div className={`relative ${config.bgColor} rounded-full p-1.5`}>
            <ConnectionIcon className={`w-3.5 h-3.5 ${config.color}`} />
            {connectionStatus === 'connected' && isDataFlowing && (
              <div className={`absolute inset-0 rounded-full ${config.pulseColor} animate-ping opacity-75`} />
            )}
          </div>
          <span className={`font-medium ${config.color}`}>{config.label}</span>
        </div>
        
        {/* Data Feed Metrics */}
        <div className="flex items-center gap-3 flex-1 justify-center">
          {/* Symbol Count */}
          <div className="flex items-center gap-1 text-[var(--tm-text-secondary)]">
            <Database className="w-3.5 h-3.5" />
            <span>{symbolCount}</span>
          </div>
          
          {/* Update Frequency */}
          <div className={`flex items-center gap-1 ${updateFrequency > 0 ? 'text-[var(--tm-accent)]' : 'text-[var(--tm-text-secondary)]'}`}>
            <Activity className={`w-3.5 h-3.5 ${updateFrequency > 0 ? 'animate-pulse' : ''}`} />
            <span>{updateFrequency > 0 ? `${updateFrequency}/s` : '0/s'}</span>
          </div>
          
          {/* Last Update */}
          <div className="flex items-center gap-1 text-[var(--tm-text-secondary)]">
            <Clock className="w-3.5 h-3.5" />
            <TimeDisplay lastUpdate={lastUpdate} />
          </div>
        </div>
        
        {/* User Status */}
        <div className="flex items-center gap-2">
          {/* Active Signals */}
          {signalCount > 0 && (
            <div className="flex items-center gap-1 text-[var(--tm-text-secondary)]">
              <Zap className="w-3.5 h-3.5" />
              <span>{signalCount}</span>
            </div>
          )}
          
          {/* Tier Badge */}
          {user && (
            <div 
              className="flex items-center gap-1 px-2 py-0.5 rounded-full"
              style={tierStyles}
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="font-medium">{getTierDisplayName(currentTier)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

StatusBar.displayName = 'StatusBar';