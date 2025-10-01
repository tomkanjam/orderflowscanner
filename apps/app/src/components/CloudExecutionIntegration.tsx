/**
 * Cloud Execution Integration
 * Example component showing how to integrate cloud execution into the app
 */

import React, { useState } from 'react';
import { Cloud } from 'lucide-react';
import { CloudStatusBadge, CloudExecutionPanel, MachineHealthDashboard } from './cloud';
import { useCloudExecution } from '../hooks/useCloudExecution';

export function CloudExecutionIntegration() {
  const cloudExecution = useCloudExecution();
  const [showPanel, setShowPanel] = useState(false);
  const [showHealth, setShowHealth] = useState(false);

  if (!cloudExecution.isEliteTier) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Status Badge in Header/Navbar */}
      <div className="flex items-center gap-4">
        <CloudStatusBadge
          onClick={() => setShowPanel(!showPanel)}
          showDetails={true}
        />

        {cloudExecution.machineStatus === 'running' && (
          <button
            onClick={() => setShowHealth(!showHealth)}
            className="btn-secondary text-sm"
          >
            View Health
          </button>
        )}
      </div>

      {/* Cloud Execution Panel Modal */}
      {showPanel && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full">
            <CloudExecutionPanel onClose={() => setShowPanel(false)} />
          </div>
        </div>
      )}

      {/* Machine Health Dashboard Modal */}
      {showHealth && cloudExecution.machineStatus === 'running' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="max-w-4xl w-full">
            <div className="bg-white rounded-lg">
              <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-xl font-semibold">Machine Health</h2>
                <button
                  onClick={() => setShowHealth(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  ×
                </button>
              </div>
              <MachineHealthDashboard />
            </div>
          </div>
        </div>
      )}

      {/* Integration Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Cloud className="w-5 h-5" />
          Cloud Execution Integration
        </h3>
        <div className="text-sm space-y-2">
          <p><strong>Status:</strong> {cloudExecution.machineStatus}</p>
          <p><strong>Connected:</strong> {cloudExecution.isConnected ? 'Yes' : 'No'}</p>
          {cloudExecution.machineStatus === 'running' && (
            <>
              <p><strong>Active Signals:</strong> {cloudExecution.metrics.activeSignals}</p>
              <p><strong>CPU Usage:</strong> {cloudExecution.metrics.cpuUsage.toFixed(1)}%</p>
            </>
          )}
        </div>

        <div className="mt-4 space-y-2 text-xs text-gray-600">
          <p><strong>Integration Instructions:</strong></p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Add CloudStatusBadge to your header/navbar</li>
            <li>Use CloudExecutionPanel in a modal for controls</li>
            <li>Use MachineHealthDashboard for detailed metrics</li>
            <li>Use useCloudExecution hook to access state</li>
            <li>Call updateConfig() when traders change</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
