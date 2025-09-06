import React, { useState, useEffect } from 'react';
import { workflowManager } from '../services/workflowManager';
import { Clock, Activity, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface WorkflowStatusProps {
  signalId?: string;
  compact?: boolean;
}

export function WorkflowStatus({ signalId, compact = false }: WorkflowStatusProps) {
  const [activeWorkflows, setActiveWorkflows] = useState<any[]>([]);
  const [lastDecision, setLastDecision] = useState<any>(null);

  useEffect(() => {
    // Get active workflows
    const updateWorkflows = () => {
      const workflows = workflowManager.getActiveWorkflows();
      if (signalId) {
        setActiveWorkflows(workflows.filter(w => w.entity_id === signalId));
      } else {
        setActiveWorkflows(workflows);
      }
    };

    updateWorkflows();
    const interval = setInterval(updateWorkflows, 5000);
    
    return () => clearInterval(interval);
  }, [signalId]);

  if (compact && activeWorkflows.length > 0) {
    const workflow = activeWorkflows[0];
    return (
      <div className="flex items-center gap-2 text-sm">
        <Activity className="w-4 h-4 text-yellow-500 animate-pulse" />
        <span className="text-[var(--tm-text-muted)]">
          Monitoring on {workflow.interval} candles
        </span>
      </div>
    );
  }

  if (activeWorkflows.length === 0) {
    return null;
  }

  return (
    <div className="tm-card p-3">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Activity className="w-4 h-4" />
        Active Workflows
      </h3>
      
      <div className="space-y-2">
        {activeWorkflows.map(workflow => (
          <div key={workflow.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Clock className="w-3 h-3 text-[var(--tm-text-muted)]" />
              <span className="text-[var(--tm-text-secondary)]">
                {workflow.workflow_type === 'signal_monitoring' ? 'Signal Monitoring' : 'Position Management'}
              </span>
              <span className="text-[var(--tm-text-muted)]">
                {workflow.symbol} · {workflow.interval}
              </span>
            </div>
            
            {workflow.last_run_at && (
              <span className="text-xs text-[var(--tm-text-muted)]">
                Last: {new Date(workflow.last_run_at).toLocaleTimeString()}
              </span>
            )}
          </div>
        ))}
      </div>
      
      {lastDecision && (
        <div className="mt-3 pt-3 border-t border-[var(--tm-border)]">
          <div className="text-xs text-[var(--tm-text-muted)]">
            Last Decision: {' '}
            {lastDecision.decision === 'enter' && <CheckCircle className="inline w-3 h-3 text-green-500" />}
            {lastDecision.decision === 'abandon' && <XCircle className="inline w-3 h-3 text-red-500" />}
            {lastDecision.decision === 'continue' && <AlertCircle className="inline w-3 h-3 text-yellow-500" />}
            {' '}{lastDecision.decision} ({lastDecision.confidence}% confidence)
          </div>
        </div>
      )}
    </div>
  );
}

// Extension for workflow manager to get active workflows
declare module '../services/workflowManager' {
  interface WorkflowManager {
    getActiveWorkflows(): any[];
  }
}

// Add method to workflow manager
(workflowManager as any).getActiveWorkflows = function() {
  return Array.from((this as any).activeWorkflows.values());
};