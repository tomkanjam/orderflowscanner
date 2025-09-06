import React, { useState, useEffect } from 'react';
import { Play, Pause, AlertCircle } from 'lucide-react';
import { tradingManager } from '../services/tradingManager';
import { signalManager } from '../services/signalManager';

interface AutoTradeButtonProps {
  signalId: string;
}

export function AutoTradeButton({ signalId }: AutoTradeButtonProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string>('');
  const [signal, setSignal] = useState(signalManager.getSignal(signalId));

  useEffect(() => {
    // Subscribe to signal updates
    const unsubscribe = signalManager.subscribe((signals) => {
      const updatedSignal = signals.find(s => s.id === signalId);
      if (updatedSignal) {
        setSignal(updatedSignal);
      }
    });

    return unsubscribe;
  }, [signalId]);

  const handleExecuteTrade = async () => {
    if (!signal || signal.status !== 'ready') return;

    setIsExecuting(true);
    setError('');

    try {
      await tradingManager.executeSignal(signal);
      // Signal will be updated via subscription
    } catch (error: any) {
      console.error('Failed to execute trade:', error);
      setError(error.message || 'Failed to execute trade');
    } finally {
      setIsExecuting(false);
    }
  };

  // Don't show button if signal is not ready or already has a trade
  if (!signal || signal.status !== 'ready' || signal.trade) {
    return null;
  }

  // Check if auto-execute is enabled
  const isAutoExecuteEnabled = tradingManager.isAutoExecuteEnabled();

  return (
    <div className="flex items-center gap-2">
      {!isAutoExecuteEnabled && (
        <button
          onClick={handleExecuteTrade}
          disabled={isExecuting}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-green-500 hover:bg-green-600 text-white disabled:opacity-50"
          title="Execute trade manually"
        >
          {isExecuting ? (
            <>
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
              <span>Executing...</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3" />
              <span>Execute</span>
            </>
          )}
        </button>
      )}

      {error && (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <AlertCircle className="w-3 h-3" />
          <span>{error}</span>
        </div>
      )}

      {isAutoExecuteEnabled && (
        <div className="flex items-center gap-1 text-xs text-[var(--tm-text-muted)]">
          <Play className="w-3 h-3" />
          <span>Auto-execute enabled</span>
        </div>
      )}
    </div>
  );
}