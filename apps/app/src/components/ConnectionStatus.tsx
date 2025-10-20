import React, { useState, useEffect } from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';
import { useKlineDataContext } from '../contexts/KlineDataProvider';
import { serverExecutionService } from '../services/serverExecutionService';

export function ConnectionStatus() {
  const { status, latency, lastPing } = useConnectionStatus();
  const { cacheStats } = useKlineDataContext();
  const [serverHealth, setServerHealth] = useState<{
    redis: boolean;
    supabase: boolean;
    latency: number;
  } | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine status color
  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'disconnected':
        return 'text-red-500';
      case 'reconnecting':
        return 'text-yellow-500';
      case 'connecting':
        return 'text-blue-500';
      default:
        return 'text-gray-500';
    }
  };

  // Determine status icon
  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return '●'; // Filled circle
      case 'disconnected':
        return '○'; // Empty circle
      case 'reconnecting':
      case 'connecting':
        return '◐'; // Half circle (loading)
      default:
        return '?';
    }
  };

  // Format status text
  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return latency ? `Connected (${latency}ms)` : 'Connected';
      case 'disconnected':
        return 'Disconnected';
      case 'reconnecting':
        return 'Reconnecting...';
      case 'connecting':
        return 'Connecting...';
      default:
        return 'Unknown';
    }
  };

  // Fetch server health periodically
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const health = await serverExecutionService.checkHealth();
        setServerHealth(health);
      } catch (err) {
        console.error('[ConnectionStatus] Health check failed:', err);
        setServerHealth(null);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  // Calculate overall health
  const getOverallHealth = () => {
    if (!serverHealth) return 'unknown';
    if (serverHealth.redis && serverHealth.supabase) return 'healthy';
    if (serverHealth.redis || serverHealth.supabase) return 'degraded';
    return 'unhealthy';
  };

  const healthStatus = getOverallHealth();

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-750 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={`text-xl ${getStatusColor()} ${status === 'connected' ? '' : 'animate-pulse'}`}>
          {getStatusIcon()}
        </span>
        <div className="flex flex-col">
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
          {status === 'connected' && lastPing && (
            <span className="text-xs text-gray-400">
              Server Execution {healthStatus === 'healthy' ? '✓' : healthStatus === 'degraded' ? '⚠' : '✗'}
            </span>
          )}
        </div>

        {/* Expand/Collapse indicator */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="absolute top-full mt-2 right-0 w-64 bg-gray-800 rounded-lg shadow-lg p-4 z-50">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Server Status</h3>

          {/* Connection Details */}
          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-xs">
              <span className="text-gray-400">WebSocket</span>
              <span className={getStatusColor()}>{status}</span>
            </div>
            {latency !== null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Latency</span>
                <span className="text-gray-300">{latency}ms</span>
              </div>
            )}
          </div>

          {/* Server Health */}
          {serverHealth && (
            <>
              <div className="border-t border-gray-700 pt-3 mb-3">
                <h4 className="text-xs font-semibold text-gray-400 mb-2">Services</h4>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Redis Cache</span>
                    <span className={serverHealth.redis ? 'text-green-500' : 'text-red-500'}>
                      {serverHealth.redis ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Supabase</span>
                    <span className={serverHealth.supabase ? 'text-green-500' : 'text-red-500'}>
                      {serverHealth.supabase ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Service Latency</span>
                    <span className="text-gray-300">{serverHealth.latency}ms</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Cache Statistics */}
          {cacheStats && (
            <div className="border-t border-gray-700 pt-3">
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Cache Performance</h4>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Hit Rate</span>
                  <span className="text-gray-300">
                    {cacheStats.hits + cacheStats.misses > 0
                      ? `${Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100)}%`
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Cached Symbols</span>
                  <span className="text-gray-300">{cacheStats.size}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Total Requests</span>
                  <span className="text-gray-300">{cacheStats.hits + cacheStats.misses}</span>
                </div>
              </div>
            </div>
          )}

          {/* Last Update */}
          {lastPing && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="text-xs text-gray-400">
                Last checked: {lastPing.toLocaleTimeString()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ConnectionStatus;