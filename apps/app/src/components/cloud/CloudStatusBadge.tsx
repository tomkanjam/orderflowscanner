/**
 * Cloud Status Badge
 * Compact badge showing cloud execution status in the UI
 */

import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Wifi,
  WifiOff
} from 'lucide-react';
import { cloudWebSocketClient } from '../../services/cloudWebSocketClient';
import { useSubscription } from '../../contexts/SubscriptionContext';

interface CloudStatusBadgeProps {
  onClick?: () => void;
  showDetails?: boolean;
}

type MachineStatus = 'stopped' | 'provisioning' | 'starting' | 'running' | 'stopping' | 'error';

export function CloudStatusBadge({ onClick, showDetails = false }: CloudStatusBadgeProps) {
  const { currentTier } = useSubscription();
  const [status, setStatus] = useState<MachineStatus>('stopped');
  const [isConnected, setIsConnected] = useState(false);
  const [activeSignals, setActiveSignals] = useState(0);
  const [uptime, setUptime] = useState(0);

  const isEliteTier = currentTier === 'elite';

  useEffect(() => {
    if (!isEliteTier) return;

    const handleConnected = () => setIsConnected(true);
    const handleDisconnected = () => setIsConnected(false);

    const handleStatusUpdate = (data: any) => {
      setStatus(data.status);
      setUptime(data.uptime);
    };

    const handleMetricsUpdate = (data: any) => {
      setActiveSignals(data.activeSignals);
    };

    cloudWebSocketClient.on('connected', handleConnected);
    cloudWebSocketClient.on('disconnected', handleDisconnected);
    cloudWebSocketClient.on('status_update', handleStatusUpdate);
    cloudWebSocketClient.on('metrics_update', handleMetricsUpdate);

    // Check initial connection state
    setIsConnected(cloudWebSocketClient.getIsConnected());

    return () => {
      cloudWebSocketClient.off('connected', handleConnected);
      cloudWebSocketClient.off('disconnected', handleDisconnected);
      cloudWebSocketClient.off('status_update', handleStatusUpdate);
      cloudWebSocketClient.off('metrics_update', handleMetricsUpdate);
    };
  }, [isEliteTier]);

  if (!isEliteTier) {
    return null;
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'provisioning':
      case 'starting':
      case 'stopping':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'stopped':
      default:
        return <CloudOff className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100';
      case 'provisioning':
      case 'starting':
      case 'stopping':
        return 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100';
      case 'stopped':
      default:
        return 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return 'Running';
      case 'provisioning':
        return 'Provisioning...';
      case 'starting':
        return 'Starting...';
      case 'stopping':
        return 'Stopping...';
      case 'error':
        return 'Error';
      case 'stopped':
      default:
        return 'Stopped';
    }
  };

  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return '<1m';
    }
  };

  // Compact version
  if (!showDetails) {
    return (
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition ${getStatusColor()}`}
        title="Cloud Execution Status"
      >
        {getStatusIcon()}
        <span>Cloud</span>
        {status === 'running' && (
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
        )}
      </button>
    );
  }

  // Detailed version
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-3 px-4 py-2 rounded-lg border text-sm transition ${getStatusColor()}`}
    >
      <div className="flex items-center gap-2">
        <Cloud className="w-5 h-5" />
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Cloud Execution</span>
            {status === 'running' && isConnected && (
              <Wifi className="w-4 h-4 text-green-500" />
            )}
            {status === 'running' && !isConnected && (
              <WifiOff className="w-4 h-4 text-yellow-500" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs opacity-75">
            {getStatusIcon()}
            <span>{getStatusText()}</span>
            {status === 'running' && (
              <>
                <span>•</span>
                <span>{activeSignals} signals</span>
                <span>•</span>
                <span>{formatUptime(uptime)}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
