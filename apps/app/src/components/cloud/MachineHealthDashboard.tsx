/**
 * Machine Health Dashboard
 * Detailed health monitoring and diagnostics for Fly machine
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Cpu,
  HardDrive,
  Wifi,
  Database,
  Users,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  Clock,
  Zap
} from 'lucide-react';
import { cloudWebSocketClient } from '../../services/cloudWebSocketClient';

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastCheck: Date;
  components: {
    binance: boolean;
    database: boolean;
    workers: boolean;
  };
  metrics: {
    cpuUsage: number;
    memoryUsage: number;
    activeSignals: number;
    queueDepth: number;
  };
}

interface MetricsHistory {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  queueDepth: number;
}

export function MachineHealthDashboard() {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<MetricsHistory[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<'cpu' | 'memory' | 'queue'>('cpu');

  useEffect(() => {
    // Listen for metrics updates
    const handleMetricsUpdate = (data: any) => {
      // Update current health data
      setHealthData(prev => prev ? {
        ...prev,
        metrics: {
          cpuUsage: data.cpuUsage,
          memoryUsage: data.memoryUsage,
          activeSignals: data.activeSignals,
          queueDepth: data.queueDepth
        },
        lastCheck: new Date()
      } : null);

      // Add to history
      setMetricsHistory(prev => {
        const newHistory = [...prev, {
          timestamp: Date.now(),
          cpuUsage: data.cpuUsage,
          memoryUsage: data.memoryUsage,
          queueDepth: data.queueDepth
        }];

        // Keep last 60 data points (5 minutes at 5s intervals)
        return newHistory.slice(-60);
      });
    };

    const handleStatusUpdate = (data: any) => {
      setHealthData(prev => prev ? {
        ...prev,
        uptime: data.uptime
      } : {
        status: 'healthy',
        uptime: data.uptime,
        lastCheck: new Date(),
        components: {
          binance: true,
          database: true,
          workers: true
        },
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          activeSignals: 0,
          queueDepth: 0
        }
      });
    };

    cloudWebSocketClient.on('metrics_update', handleMetricsUpdate);
    cloudWebSocketClient.on('status_update', handleStatusUpdate);

    return () => {
      cloudWebSocketClient.off('metrics_update', handleMetricsUpdate);
      cloudWebSocketClient.off('status_update', handleStatusUpdate);
    };
  }, []);

  const getHealthStatus = (): 'healthy' | 'degraded' | 'unhealthy' => {
    if (!healthData) return 'unhealthy';

    const { components, metrics } = healthData;

    // Check component health
    if (!components.binance || !components.database || !components.workers) {
      return 'unhealthy';
    }

    // Check metrics
    if (metrics.cpuUsage > 90 || metrics.memoryUsage > 90) {
      return 'unhealthy';
    }

    if (metrics.cpuUsage > 70 || metrics.memoryUsage > 70 || metrics.queueDepth > 20) {
      return 'degraded';
    }

    return 'healthy';
  };

  const getStatusIcon = () => {
    const status = getHealthStatus();
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-6 h-6 text-yellow-500" />;
      case 'unhealthy':
        return <XCircle className="w-6 h-6 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    const status = getHealthStatus();
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800';
      case 'unhealthy':
        return 'bg-red-100 text-red-800';
    }
  };

  const formatUptime = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const renderMiniChart = () => {
    if (metricsHistory.length < 2) {
      return <div className="text-sm text-gray-500">Collecting data...</div>;
    }

    const data = metricsHistory.map(m => {
      switch (selectedMetric) {
        case 'cpu':
          return m.cpuUsage;
        case 'memory':
          return m.memoryUsage;
        case 'queue':
          return m.queueDepth;
      }
    });

    const max = Math.max(...data, 1);
    const height = 80;
    const width = 300;
    const points = data.map((value, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - (value / max) * height;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width={width} height={height} className="w-full">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={points}
          className="text-blue-500"
        />
        <line
          x1="0"
          y1={height}
          x2={width}
          y2={height}
          stroke="currentColor"
          strokeWidth="1"
          className="text-gray-300"
        />
      </svg>
    );
  };

  if (!healthData) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="text-center text-gray-500">
          <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>No health data available</p>
          <p className="text-sm mt-2">Machine must be running to show health metrics</p>
        </div>
      </div>
    );
  }

  const status = getHealthStatus();

  return (
    <div className="bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div>
              <h2 className="text-xl font-semibold">Machine Health</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </span>
                <span className="text-sm text-gray-600">
                  Last checked: {healthData.lastCheck.toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Metrics */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          System Metrics
        </h3>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">CPU Usage</span>
              <Cpu className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold">{healthData.metrics.cpuUsage.toFixed(1)}%</p>
            </div>
            <div className="mt-2 bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  healthData.metrics.cpuUsage > 90
                    ? 'bg-red-500'
                    : healthData.metrics.cpuUsage > 70
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${healthData.metrics.cpuUsage}%` }}
              />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Memory Usage</span>
              <HardDrive className="w-4 h-4 text-gray-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold">{healthData.metrics.memoryUsage.toFixed(1)}%</p>
            </div>
            <div className="mt-2 bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  healthData.metrics.memoryUsage > 90
                    ? 'bg-red-500'
                    : healthData.metrics.memoryUsage > 70
                    ? 'bg-yellow-500'
                    : 'bg-green-500'
                }`}
                style={{ width: `${healthData.metrics.memoryUsage}%` }}
              />
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Active Signals</span>
              <Zap className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold">{healthData.metrics.activeSignals}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Queue Depth</span>
              <TrendingUp className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-semibold">{healthData.metrics.queueDepth}</p>
          </div>
        </div>

        {/* Mini Chart */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Performance History</h4>
            <select
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="cpu">CPU Usage</option>
              <option value="memory">Memory Usage</option>
              <option value="queue">Queue Depth</option>
            </select>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            {renderMiniChart()}
          </div>
        </div>
      </div>

      {/* Component Health */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Component Status
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Wifi className="w-5 h-5 text-gray-500" />
              <span className="font-medium">Binance WebSocket</span>
            </div>
            {healthData.components.binance ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-gray-500" />
              <span className="font-medium">Database Connection</span>
            </div>
            {healthData.components.database ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-gray-500" />
              <span className="font-medium">Worker Threads</span>
            </div>
            {healthData.components.workers ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <XCircle className="w-5 h-5 text-red-500" />
            )}
          </div>
        </div>
      </div>

      {/* System Info */}
      <div className="p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5" />
          System Information
        </h3>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Uptime</span>
            <span className="font-medium">{formatUptime(healthData.uptime)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Last Health Check</span>
            <span className="font-medium">{healthData.lastCheck.toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">WebSocket Status</span>
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${cloudWebSocketClient.getIsConnected() ? 'bg-green-500' : 'bg-red-500'}`}></span>
              <span className="font-medium">
                {cloudWebSocketClient.getIsConnected() ? 'Connected' : 'Disconnected'}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
