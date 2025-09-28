import React from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';

export function ConnectionStatus() {
  const { status, latency, lastPing } = useConnectionStatus();

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

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-lg">
      <span className={`text-xl ${getStatusColor()} animate-pulse`}>
        {getStatusIcon()}
      </span>
      <div className="flex flex-col">
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusText()}
        </span>
        {status === 'connected' && lastPing && (
          <span className="text-xs text-gray-400">
            Server Execution Active
          </span>
        )}
      </div>
    </div>
  );
}

export default ConnectionStatus;