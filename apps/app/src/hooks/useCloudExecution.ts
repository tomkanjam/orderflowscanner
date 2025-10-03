/**
 * Cloud Execution Hook
 * Manages cloud execution state and WebSocket connection for Elite users
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { cloudWebSocketClient } from '../services/cloudWebSocketClient';
import { useAuth } from './useAuth';
import { useSubscription } from '../contexts/SubscriptionContext';
import { fetchMachineStatus } from '../services/cloudExecutionService';
import type { MachineStatus } from '../types/cloud.types';

interface CloudExecutionState {
  isConnected: boolean;
  machineStatus: MachineStatus;
  machineId: string | null;
  websocketUrl: string | null;
  region: string | null;
  metrics: {
    activeSignals: number;
    queueDepth: number;
    cpuUsage: number;
    memoryUsage: number;
  };
  error: string | null;
  loading: boolean;
  lastFetchTimestamp: number | null;
}

const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds for transitional states

export function useCloudExecution() {
  const { user } = useAuth();
  const { currentTier } = useSubscription();
  const pollIntervalRef = useRef<number | null>(null);

  const [state, setState] = useState<CloudExecutionState>({
    isConnected: false,
    machineStatus: 'stopped',
    machineId: null,
    websocketUrl: null,
    region: null,
    metrics: {
      activeSignals: 0,
      queueDepth: 0,
      cpuUsage: 0,
      memoryUsage: 0
    },
    error: null,
    loading: false,
    lastFetchTimestamp: null
  });

  const isEliteTier = currentTier === 'elite';

  // Helper function to check if status is transitional
  const isTransitionalStatus = (status: MachineStatus): boolean => {
    return status === 'starting' || status === 'stopping' || status === 'provisioning';
  };

  // Start polling for status updates
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return; // Already polling

    console.log('[useCloudExecution] Starting status polling...');
    pollIntervalRef.current = window.setInterval(async () => {
      if (!user) return;

      try {
        const machine = await fetchMachineStatus(user.id);
        if (machine) {
          console.log(`[useCloudExecution] Poll: ${machine.machine_id} is ${machine.status}`);

          setState(prev => ({
            ...prev,
            machineStatus: machine.status,
            machineId: machine.machine_id,
            websocketUrl: machine.websocket_url,
            region: machine.region,
            error: machine.error_message,
            lastFetchTimestamp: Date.now()
          }));

          // Stop polling if we reach a stable state
          if (!isTransitionalStatus(machine.status)) {
            console.log('[useCloudExecution] Reached stable state, stopping poll');
            stopPolling();

            // Auto-connect WebSocket if now running
            if (machine.status === 'running' && machine.websocket_url) {
              cloudWebSocketClient.connect(
                machine.machine_id,
                machine.websocket_url,
                user.id
              );
            }
          }
        }
      } catch (error) {
        console.error('[useCloudExecution] Poll error:', error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to poll machine status'
        }));
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }, [user]);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      console.log('[useCloudExecution] Stopping status polling');
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  // Fetch initial machine state on mount
  useEffect(() => {
    if (!isEliteTier || !user) return;

    const loadMachineState = async () => {
      console.log('[useCloudExecution] Fetching initial machine state...');
      setState(prev => ({ ...prev, loading: true, error: null }));

      try {
        const machine = await fetchMachineStatus(user.id);

        if (machine) {
          console.log(`[useCloudExecution] Machine found: ${machine.machine_id}, status: ${machine.status}`);

          setState(prev => ({
            ...prev,
            machineStatus: machine.status,
            machineId: machine.machine_id,
            websocketUrl: machine.websocket_url,
            region: machine.region,
            loading: false,
            lastFetchTimestamp: Date.now(),
            error: machine.error_message
          }));

          // Handle different states
          if (isTransitionalStatus(machine.status)) {
            // Start polling for transitional states
            console.log(`[useCloudExecution] Machine in transitional state (${machine.status}), starting poll`);
            startPolling();
          } else if (machine.status === 'running' && machine.websocket_url) {
            // Auto-reconnect WebSocket if machine is running
            console.log(`[useCloudExecution] Auto-connecting to WebSocket: ${machine.websocket_url}`);
            cloudWebSocketClient.connect(
              machine.machine_id,
              machine.websocket_url,
              user.id
            );
          }
        } else {
          console.log('[useCloudExecution] No machine found for user');
          setState(prev => ({
            ...prev,
            machineStatus: 'stopped',
            loading: false,
            lastFetchTimestamp: Date.now()
          }));
        }
      } catch (error) {
        console.error('[useCloudExecution] Failed to fetch machine state:', error);
        setState(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Failed to load machine status',
          loading: false
        }));
      }
    };

    loadMachineState();
  }, [isEliteTier, user, startPolling]);

  // Setup WebSocket event listeners
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

  const retry = useCallback(async () => {
    if (!user) return;

    console.log('[useCloudExecution] Manual retry triggered');
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const machine = await fetchMachineStatus(user.id);

      if (machine) {
        setState(prev => ({
          ...prev,
          machineStatus: machine.status,
          machineId: machine.machine_id,
          websocketUrl: machine.websocket_url,
          region: machine.region,
          loading: false,
          lastFetchTimestamp: Date.now(),
          error: machine.error_message
        }));

        // Handle state transitions
        if (isTransitionalStatus(machine.status)) {
          startPolling();
        } else if (machine.status === 'running' && machine.websocket_url) {
          cloudWebSocketClient.connect(
            machine.machine_id,
            machine.websocket_url,
            user.id
          );
        }
      } else {
        setState(prev => ({
          ...prev,
          machineStatus: 'stopped',
          loading: false,
          lastFetchTimestamp: Date.now()
        }));
      }
    } catch (error) {
      console.error('[useCloudExecution] Retry failed:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to retry',
        loading: false
      }));
    }
  }, [user, startPolling]);

  return {
    ...state,
    isEliteTier,
    connect,
    disconnect,
    updateConfig,
    pauseExecution,
    resumeExecution,
    forceSync,
    retry
  };
}
