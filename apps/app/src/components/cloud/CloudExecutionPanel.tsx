/**
 * Cloud Execution Panel
 * Main control panel for Elite users to manage their Fly machine
 */

import React, { useState, useEffect } from 'react';
import {
  Cloud,
  Power,
  Pause,
  Play,
  Settings,
  Activity,
  TrendingUp,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { cloudWebSocketClient } from '../../services/cloudWebSocketClient';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { supabase } from '../../config/supabase';

interface CloudExecutionPanelProps {
  onClose?: () => void;
}

type MachineStatus = 'stopped' | 'provisioning' | 'starting' | 'running' | 'stopping' | 'error';

export function CloudExecutionPanel({ onClose }: CloudExecutionPanelProps) {
  const { user } = useAuth();
  const { profile, currentTier } = useSubscription();

  // State
  const [status, setStatus] = useState<MachineStatus>('stopped');
  const [isConnected, setIsConnected] = useState(false);
  const [metrics, setMetrics] = useState({
    activeSignals: 0,
    queueDepth: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    uptime: 0
  });
  const [config, setConfig] = useState({
    region: 'sin' as 'sin' | 'iad' | 'fra',
    cpuPriority: 'normal' as 'low' | 'normal' | 'high',
    notificationsEnabled: true
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check if user is Elite tier
  const isEliteTier = currentTier === 'elite';

  useEffect(() => {
    if (!isEliteTier || !user) return;

    // TODO: Fetch machine status from Supabase
    // For now, start in stopped state

    // Setup WebSocket event listeners
    cloudWebSocketClient.on('connected', handleConnected);
    cloudWebSocketClient.on('disconnected', handleDisconnected);
    cloudWebSocketClient.on('status_update', handleStatusUpdate);
    cloudWebSocketClient.on('metrics_update', handleMetricsUpdate);
    cloudWebSocketClient.on('machine_error', handleMachineError);

    return () => {
      cloudWebSocketClient.off('connected', handleConnected);
      cloudWebSocketClient.off('disconnected', handleDisconnected);
      cloudWebSocketClient.off('status_update', handleStatusUpdate);
      cloudWebSocketClient.off('metrics_update', handleMetricsUpdate);
      cloudWebSocketClient.off('machine_error', handleMachineError);
    };
  }, [isEliteTier, user]);

  const handleConnected = () => {
    setIsConnected(true);
    setError('');
  };

  const handleDisconnected = () => {
    setIsConnected(false);
  };

  const handleStatusUpdate = (data: any) => {
    setStatus(data.status);
    setMetrics(prev => ({ ...prev, uptime: data.uptime }));
  };

  const handleMetricsUpdate = (data: any) => {
    setMetrics(prev => ({
      ...prev,
      activeSignals: data.activeSignals,
      queueDepth: data.queueDepth,
      cpuUsage: data.cpuUsage,
      memoryUsage: data.memoryUsage
    }));
  };

  const handleMachineError = (data: any) => {
    setError(data.message);
  };

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
      // Call Supabase Edge Function to provision machine
      const response = await supabase.functions.invoke('provision-machine', {
        body: {
          userId: user.id,
          region: config.region,
          cpuPriority: config.cpuPriority
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to provision machine');
      }

      const { machineId, websocketUrl, status: machineStatus } = response.data;

      console.log('[CloudExecution] Machine provisioned:', machineId);

      setStatus(machineStatus);

      // Connect to WebSocket
      cloudWebSocketClient.connect(machineId, websocketUrl, user.id);

      // Simulate transition to running for demo
      // TODO: Remove this once Fly machine is actually deployed
      setTimeout(() => {
        setStatus('starting');
        setTimeout(() => {
          setStatus('running');
          setLoading(false);
        }, 2000);
      }, 3000);

    } catch (err) {
      console.error('Failed to start machine:', err);
      setError(err instanceof Error ? err.message : 'Failed to start machine');
      setStatus('error');
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

      console.log('[CloudExecution] Machine stopped');

      setStatus('stopping');

      // Disconnect WebSocket
      cloudWebSocketClient.disconnect();

      // Simulate transition to stopped
      setTimeout(() => {
        setStatus('stopped');
        setLoading(false);
      }, 2000);

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
    cloudWebSocketClient.pauseExecution();
  };

  const handleResume = () => {
    if (status !== 'running') {
      setError('Cannot resume: machine is not running');
      return;
    }
    cloudWebSocketClient.resumeExecution();
  };

  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'provisioning':
      case 'starting':
      case 'stopping':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Power className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800';
      case 'provisioning':
      case 'starting':
      case 'stopping':
        return 'bg-blue-100 text-blue-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (!isEliteTier) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center">
          <Cloud className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Cloud Execution</h3>
          <p className="text-gray-600 mb-4">
            Available for Elite tier users only
          </p>
          <button className="btn-primary">
            Upgrade to Elite
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cloud className="w-6 h-6 text-blue-500" />
            <div>
              <h2 className="text-xl font-semibold">Cloud Execution</h2>
              <p className="text-sm text-gray-600">24/7 signal detection on dedicated infrastructure</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Status:</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
              </div>
              {status === 'running' && (
                <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>Uptime: {formatUptime(metrics.uptime)}</span>
                  {isConnected && (
                    <span className="ml-2 flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
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
                className="btn-primary flex items-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Power className="w-4 h-4" />
                )}
                Start Machine
              </button>
            )}

            {status === 'running' && (
              <>
                <button
                  onClick={handlePause}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
                <button
                  onClick={handleStop}
                  disabled={loading}
                  className="btn-secondary flex items-center gap-2"
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

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Metrics */}
      {status === 'running' && (
        <div className="p-6 grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Active Signals</span>
              <Activity className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold mt-1">{metrics.activeSignals}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Queue Depth</span>
              <TrendingUp className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold mt-1">{metrics.queueDepth}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">CPU Usage</span>
              <Activity className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-semibold">{metrics.cpuUsage.toFixed(1)}%</p>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all"
                  style={{ width: `${metrics.cpuUsage}%` }}
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Memory Usage</span>
              <Activity className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <p className="text-2xl font-semibold">{metrics.memoryUsage.toFixed(1)}%</p>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all"
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
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configuration
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Region
              </label>
              <select
                value={config.region}
                onChange={(e) => setConfig({ ...config, region: e.target.value as any })}
                className="w-full p-2 border border-gray-300 rounded-lg"
              >
                <option value="sin">Singapore (Closest to Binance)</option>
                <option value="iad">US East (Virginia)</option>
                <option value="fra">Europe (Frankfurt)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                CPU Priority
              </label>
              <select
                value={config.cpuPriority}
                onChange={(e) => setConfig({ ...config, cpuPriority: e.target.value as any })}
                className="w-full p-2 border border-gray-300 rounded-lg"
              >
                <option value="low">Low (Cost-optimized)</option>
                <option value="normal">Normal (Balanced)</option>
                <option value="high">High (Performance)</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Push Notifications
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.notificationsEnabled}
                  onChange={(e) => setConfig({ ...config, notificationsEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
