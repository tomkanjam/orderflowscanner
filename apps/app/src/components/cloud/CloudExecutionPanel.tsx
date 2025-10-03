/**
 * Cloud Execution Panel
 * Main control panel for Elite users to manage their Fly machine
 */

import React, { useState } from 'react';
import {
  Cloud,
  Power,
  Pause,
  Settings,
  Activity,
  TrendingUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { useCloudExecution } from '../../hooks/useCloudExecution';
import { cloudWebSocketClient } from '../../services/cloudWebSocketClient';
import { supabase } from '../../config/supabase';

interface CloudExecutionPanelProps {
  onClose?: () => void;
}

export function CloudExecutionPanel({ onClose }: CloudExecutionPanelProps) {
  const { user } = useAuth();
  const { currentTier } = useSubscription();

  // Use cloud execution hook for state management
  const cloudExecution = useCloudExecution();

  // Local UI state
  const [config, setConfig] = useState({
    region: cloudExecution.region || 'sin' as 'sin' | 'iad' | 'fra',
    cpuPriority: 'normal' as 'low' | 'normal' | 'high',
    notificationsEnabled: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Extract values from hook
  const {
    machineStatus: status,
    isConnected,
    metrics,
    loading: fetchingStatus,
    error: hookError,
    machineId,
    isEliteTier
  } = cloudExecution;

  const handleStart = async () => {
    // Validation
    if (!user) {
      setError('User not authenticated');
      return;
    }

    if (!isEliteTier) {
      setError('Elite tier required for cloud execution');
      return;
    }

    if (status === 'running' || status === 'starting' || status === 'provisioning') {
      setError('Machine is already running or starting');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('[CloudExecution] Calling provision-machine with:', {
        userId: user.id,
        userEmail: user.email,
        region: config.region,
        cpuPriority: config.cpuPriority
      });

      // Call Supabase Edge Function to provision machine
      const response = await supabase.functions.invoke('provision-machine', {
        body: {
          userId: user.id,
          region: config.region,
          cpuPriority: config.cpuPriority
        }
      });

      console.log('[CloudExecution] Full response:', response);
      console.log('[CloudExecution] Response data:', response.data);
      console.log('[CloudExecution] Response error:', response.error);

      if (response.error) {
        // Try to get more details from the error
        const errorContext = (response.error as any).context;
        console.error('[CloudExecution] Error context:', errorContext);

        // If context is a Response object, try to read the body
        if (errorContext && typeof errorContext.text === 'function') {
          try {
            const errorBody = await errorContext.text();
            console.error('[CloudExecution] Error response body:', errorBody);

            // Try to parse as JSON
            try {
              const errorJson = JSON.parse(errorBody);
              console.error('[CloudExecution] Parsed error:', errorJson);
              throw new Error(errorJson.error || errorJson.message || response.error.message);
            } catch (e) {
              // Not JSON, just throw the text
              throw new Error(errorBody || response.error.message);
            }
          } catch (e) {
            console.error('[CloudExecution] Could not read error body:', e);
          }
        }

        throw new Error(response.error.message || 'Failed to provision machine');
      }

      // Check for error in response data
      if (response.data?.error) {
        console.error('[CloudExecution] Data error:', response.data);
        throw new Error(response.data.error || response.data.message || 'Failed to provision machine');
      }

      const { machineId, websocketUrl, status: machineStatus } = response.data;

      console.log('[CloudExecution] Machine provisioned:', machineId);

      // Update hook state immediately with new machine info
      // Hook will start polling for status updates and connect WebSocket when ready
      cloudExecution.setMachineProvisioned(
        machineId,
        websocketUrl,
        machineStatus,
        config.region
      );

      setLoading(false);

    } catch (err) {
      console.error('Failed to start machine:', err);
      setError(err instanceof Error ? err.message : 'Failed to start machine');
      setLoading(false);
    }
  };

  const handleStop = async () => {
    // Validation
    if (status !== 'running') {
      setError('Machine is not running');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Call Supabase Edge Function to stop machine
      const response = await supabase.functions.invoke('stop-machine', {
        body: {
          userId: user.id
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to stop machine');
      }

      console.log('[CloudExecution] Machine stopping');

      // Update hook state to 'stopping' and start polling
      cloudExecution.setMachineStopping();

      // Disconnect WebSocket
      cloudWebSocketClient.disconnect();

      setLoading(false);

    } catch (err) {
      console.error('Failed to stop machine:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop machine');
      setLoading(false);
    }
  };

  const handlePause = () => {
    if (status !== 'running') {
      setError('Cannot pause: machine is not running');
      return;
    }
    cloudExecution.pauseExecution();
  };

  const handleResume = () => {
    if (status !== 'running') {
      setError('Cannot resume: machine is not running');
      return;
    }
    cloudExecution.resumeExecution();
  };

  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <CheckCircle2 className="w-5 h-5 text-[var(--nt-success)]" />;
      case 'provisioning':
      case 'starting':
      case 'stopping':
        return <Loader2 className="w-5 h-5 text-[var(--nt-info)] animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-[var(--nt-error)]" />;
      default:
        return <Power className="w-5 h-5 text-[var(--nt-text-muted)]" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'bg-[var(--nt-success-light)] text-[var(--nt-success)]';
      case 'provisioning':
      case 'starting':
      case 'stopping':
        return 'bg-[var(--nt-info-light)] text-[var(--nt-info)]';
      case 'error':
        return 'bg-[var(--nt-error-light)] text-[var(--nt-error)]';
      default:
        return 'bg-[var(--nt-bg-elevated)] text-[var(--nt-text-muted)]';
    }
  };

  if (!isEliteTier) {
    return (
      <div className="bg-[var(--nt-bg-tertiary)] rounded-lg shadow-lg p-6 border border-[var(--nt-border-default)]">
        <div className="text-center">
          <Cloud className="w-16 h-16 text-[var(--nt-text-muted)] mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2 text-[var(--nt-text-primary)]">Cloud Execution</h3>
          <p className="text-[var(--nt-text-secondary)] mb-4">
            Available for Elite tier users only
          </p>
          <button className="px-4 py-2 bg-[var(--nt-bg-primary)] text-[var(--nt-accent-lime)] border border-[var(--nt-accent-lime)] rounded hover:bg-[var(--nt-accent-lime)] hover:text-[var(--nt-bg-primary)] transition-all">
            Upgrade to Elite
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--nt-bg-tertiary)] rounded-lg shadow-lg border border-[var(--nt-border-default)]">
      {/* Header */}
      <div className="border-b border-[var(--nt-border-default)] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cloud className="w-6 h-6 text-[var(--nt-accent-cyan)]" />
            <div>
              <h2 className="text-xl font-semibold text-[var(--nt-text-primary)]">Cloud Execution</h2>
              <p className="text-sm text-[var(--nt-text-secondary)]">24/7 signal detection on dedicated infrastructure</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--nt-bg-hover)] rounded-lg transition text-[var(--nt-text-secondary)] text-2xl leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="p-6 border-b border-[var(--nt-border-default)]">
        {fetchingStatus ? (
          <div className="flex items-center gap-3 text-[var(--nt-text-secondary)]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading machine status...</span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {getStatusIcon()}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-[var(--nt-text-primary)]">Status:</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </span>
                  {machineId && (
                    <span className="text-xs text-[var(--nt-text-muted)] ml-2">
                      ({machineId})
                    </span>
                  )}
                </div>
              {status === 'running' && (
                <div className="flex items-center gap-2 mt-1 text-sm text-[var(--nt-text-secondary)]">
                  <Clock className="w-4 h-4" />
                  <span>Uptime: {formatUptime(metrics.uptime)}</span>
                  {isConnected && (
                    <span className="ml-2 flex items-center gap-1">
                      <span className="w-2 h-2 bg-[var(--nt-success)] rounded-full animate-pulse"></span>
                      Connected
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Control Buttons */}
          <div className="flex items-center gap-2">
            {status === 'stopped' && (
              <button
                onClick={handleStart}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--nt-bg-primary)] text-[var(--nt-accent-lime)]
                  border border-[var(--nt-accent-lime)] rounded hover:bg-[var(--nt-accent-lime)] hover:text-[var(--nt-bg-primary)]
                  transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Power className="w-4 h-4" />
                )}
                Start Machine
              </button>
            )}

            {(status === 'starting' || status === 'provisioning') && (
              <div className="text-sm text-[var(--nt-text-secondary)]">
                Machine is starting, please wait...
              </div>
            )}

            {status === 'stopping' && (
              <div className="text-sm text-[var(--nt-text-secondary)]">
                Machine is stopping...
              </div>
            )}

            {status === 'error' && (
              <button
                onClick={() => cloudExecution.retry()}
                disabled={fetchingStatus}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--nt-bg-primary)] text-[var(--nt-accent-lime)]
                  border border-[var(--nt-accent-lime)] rounded hover:bg-[var(--nt-accent-lime)] hover:text-[var(--nt-bg-primary)]
                  transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fetchingStatus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Power className="w-4 h-4" />
                )}
                Retry
              </button>
            )}

            {status === 'running' && (
              <>
                <button
                  onClick={handlePause}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--nt-bg-primary)] text-[var(--nt-accent-cyan)]
                    border border-[var(--nt-accent-cyan)] rounded hover:bg-[var(--nt-accent-cyan)] hover:text-[var(--nt-bg-primary)]
                    transition-all"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
                <button
                  onClick={handleStop}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 bg-[var(--nt-bg-primary)] text-[var(--nt-error)]
                    border border-[var(--nt-error)] rounded hover:bg-[var(--nt-error)] hover:text-[var(--nt-bg-primary)]
                    transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Power className="w-4 h-4" />
                  )}
                  Stop
                </button>
              </>
            )}
          </div>
        </div>
        )}

        {(error || hookError) && (
          <div className="mt-4 p-3 bg-[var(--nt-error-light)] border border-[var(--nt-error)] rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-[var(--nt-error)] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-[var(--nt-error)]">{error || hookError}</p>
            </div>
          </div>
        )}
      </div>

      {/* Metrics */}
      {status === 'running' && (
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="bg-[var(--nt-bg-secondary)] rounded-lg p-4 border border-[var(--nt-border-default)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--nt-text-secondary)]">Active Signals</span>
              <Activity className="w-4 h-4 text-[var(--nt-text-muted)]" />
            </div>
            <p className="text-2xl font-semibold mt-1 text-[var(--nt-text-primary)]">{metrics.activeSignals}</p>
          </div>

          <div className="bg-[var(--nt-bg-secondary)] rounded-lg p-4 border border-[var(--nt-border-default)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--nt-text-secondary)]">Queue Depth</span>
              <TrendingUp className="w-4 h-4 text-[var(--nt-text-muted)]" />
            </div>
            <p className="text-2xl font-semibold mt-1 text-[var(--nt-text-primary)]">{metrics.queueDepth}</p>
          </div>

          <div className="bg-[var(--nt-bg-secondary)] rounded-lg p-4 border border-[var(--nt-border-default)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--nt-text-secondary)]">CPU Usage</span>
              <Activity className="w-4 h-4 text-[var(--nt-text-muted)]" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-semibold text-[var(--nt-text-primary)]">{metrics.cpuUsage.toFixed(1)}%</p>
              <div className="flex-1 bg-[var(--nt-bg-primary)] rounded-full h-2">
                <div
                  className="bg-[var(--nt-accent-cyan)] h-2 rounded-full transition-all"
                  style={{ width: `${metrics.cpuUsage}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-[var(--nt-bg-secondary)] rounded-lg p-4 border border-[var(--nt-border-default)]">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--nt-text-secondary)]">Memory Usage</span>
              <Activity className="w-4 h-4 text-[var(--nt-text-muted)]" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-semibold text-[var(--nt-text-primary)]">{metrics.memoryUsage.toFixed(1)}%</p>
              <div className="flex-1 bg-[var(--nt-bg-primary)] rounded-full h-2">
                <div
                  className="bg-[var(--nt-accent-lime)] h-2 rounded-full transition-all"
                  style={{ width: `${metrics.memoryUsage}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration (when stopped) */}
      {status === 'stopped' && (
        <div className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-[var(--nt-text-primary)]">
            <Settings className="w-5 h-5" />
            Configuration
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-2">
                Region
              </label>
              <select
                value={config.region}
                onChange={(e) => setConfig({ ...config, region: e.target.value as any })}
                className="w-full p-2 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg
                  text-[var(--nt-text-primary)] focus:border-[var(--nt-accent-lime)] focus:outline-none transition-colors"
              >
                <option value="sin">Singapore (Closest to Binance)</option>
                <option value="iad">US East (Virginia)</option>
                <option value="fra">Europe (Frankfurt)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--nt-text-primary)] mb-2">
                CPU Priority
              </label>
              <select
                value={config.cpuPriority}
                onChange={(e) => setConfig({ ...config, cpuPriority: e.target.value as any })}
                className="w-full p-2 bg-[var(--nt-bg-secondary)] border border-[var(--nt-border-default)] rounded-lg
                  text-[var(--nt-text-primary)] focus:border-[var(--nt-accent-lime)] focus:outline-none transition-colors"
              >
                <option value="low">Low (Cost-optimized)</option>
                <option value="normal">Normal (Balanced)</option>
                <option value="high">High (Performance)</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--nt-text-primary)]">
                Push Notifications
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notificationsEnabled}
                  onChange={(e) => setConfig({ ...config, notificationsEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[var(--nt-bg-primary)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[var(--nt-accent-lime-glow)] rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--nt-bg-elevated)] after:border-[var(--nt-border-default)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--nt-accent-lime)] border border-[var(--nt-border-default)]"></div>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
