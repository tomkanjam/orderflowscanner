/**
 * Cloud Execution Hook
 * Manages cloud execution state and WebSocket connection for Elite users
 */

import { useEffect, useState, useCallback } from 'react';
import { cloudWebSocketClient } from '../services/cloudWebSocketClient';
import { useAuth } from './useAuth';
import { useSubscription } from '../contexts/SubscriptionContext';

interface CloudExecutionState {
  isConnected: boolean;
  machineStatus: 'stopped' | 'provisioning' | 'starting' | 'running' | 'stopping' | 'error';
  metrics: {
    activeSignals: number;
    queueDepth: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  error: string | null;
}

export function useCloudExecution() {
  const { user } = useAuth();
  const { currentTier } = useSubscription();

  const [state, setState] = useState<CloudExecutionState>({
    isConnected: false,
    machineStatus: 'stopped',
    metrics: {
      activeSignals: 0,
      queueDepth: 0,
      cpuUsage: 0,
      memoryUsage: 0
    },
    error: null
  });

  const isEliteTier = currentTier === 'elite';

  useEffect(() => {
    if (!isEliteTier || !user) return;

    // Event handlers
    const handleConnected = () => {
      setState(prev => ({ ...prev, isConnected: true, error: null }));
    };

    const handleDisconnected = () => {
      setState(prev => ({ ...prev, isConnected: false }));
    };

    const handleStatusUpdate = (data: any) => {
      setState(prev => ({ ...prev, machineStatus: data.status }));
    };

    const handleMetricsUpdate = (data: any) => {
      setState(prev => ({
        ...prev,
        metrics: {
          activeSignals: data.activeSignals,
          queueDepth: data.queueDepth,
          cpuUsage: data.cpuUsage,
          memoryUsage: data.memoryUsage
        }
      }));
    };

    const handleError = (data: any) => {
      setState(prev => ({ ...prev, error: data.message }));
    };

    // Register event listeners
    cloudWebSocketClient.on('connected', handleConnected);
    cloudWebSocketClient.on('disconnected', handleDisconnected);
    cloudWebSocketClient.on('status_update', handleStatusUpdate);
    cloudWebSocketClient.on('metrics_update', handleMetricsUpdate);
    cloudWebSocketClient.on('machine_error', handleError);

    // Cleanup
    return () => {
      cloudWebSocketClient.off('connected', handleConnected);
      cloudWebSocketClient.off('disconnected', handleDisconnected);
      cloudWebSocketClient.off('status_update', handleStatusUpdate);
      cloudWebSocketClient.off('metrics_update', handleMetricsUpdate);
      cloudWebSocketClient.off('machine_error', handleError);
    };
  }, [isEliteTier, user]);

  const connect = useCallback((machineId: string, websocketUrl: string) => {
    if (!user) return;
    cloudWebSocketClient.connect(machineId, websocketUrl, user.id);
  }, [user]);

  const disconnect = useCallback(() => {
    cloudWebSocketClient.disconnect();
  }, []);

  const updateConfig = useCallback((traders: any[], version: number) => {
    cloudWebSocketClient.updateConfig(traders, version);
  }, []);

  const pauseExecution = useCallback(() => {
    cloudWebSocketClient.pauseExecution();
  }, []);

  const resumeExecution = useCallback(() => {
    cloudWebSocketClient.resumeExecution();
  }, []);

  const forceSync = useCallback(() => {
    cloudWebSocketClient.forceSync();
  }, []);

  return {
    ...state,
    isEliteTier,
    connect,
    disconnect,
    updateConfig,
    pauseExecution,
    resumeExecution,
    forceSync
  };
}
