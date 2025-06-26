import React, { useState, useEffect, useMemo } from 'react';
import { SignalLifecycle, SignalStatus, Trade } from '../abstractions/interfaces';
import { signalManager } from '../services/signalManager';
import { tradeManager } from '../services/tradeManager';
import { TradeExecutionModal } from './TradeExecutionModal';
import { PositionManager } from './PositionManager';
import { ChevronDown, ChevronRight, TrendingUp, TrendingDown, Clock, CheckCircle, XCircle, AlertCircle, DollarSign } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface EnhancedSignalsTableProps {
  strategyId?: string;
  onAnalyzeSignal?: (signal: SignalLifecycle) => void;
  onExecuteTrade?: (signal: SignalLifecycle) => void;
  onRowClick?: (symbol: string) => void;
}

export function EnhancedSignalsTable({ strategyId, onAnalyzeSignal, onExecuteTrade, onRowClick }: EnhancedSignalsTableProps) {
  const [signals, setSignals] = useState<SignalLifecycle[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<SignalStatus | 'all'>('all');
  const [executingSignal, setExecutingSignal] = useState<SignalLifecycle | null>(null);
  
  useEffect(() => {
    // Subscribe to signal updates
    const unsubscribe = signalManager.subscribe((updatedSignals) => {
      setSignals(updatedSignals);
    });
    
    // Initial load
    setSignals(signalManager.getSignals({ strategyId }));
    
    return unsubscribe;
  }, [strategyId]);
  
  // Filter signals by status
  const filteredSignals = useMemo(() => {
    if (statusFilter === 'all') return signals;
    return signals.filter(s => s.status === statusFilter);
  }, [signals, statusFilter]);
  
  // Group signals by status for summary
  const statusCounts = useMemo(() => {
    const counts: Record<SignalStatus | 'total', number> = {
      new: 0,
      analyzing: 0,
      rejected: 0,
      monitoring: 0,
      ready: 0,
      in_position: 0,
      closed: 0,
      expired: 0,
      total: signals.length,
    };
    
    signals.forEach(signal => {
      counts[signal.status]++;
    });
    
    return counts;
  }, [signals]);
  
  const toggleRowExpanded = (signalId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(signalId)) {
      newExpanded.delete(signalId);
    } else {
      newExpanded.add(signalId);
    }
    setExpandedRows(newExpanded);
  };
  
  const getStatusIcon = (status: SignalStatus) => {
    switch (status) {
      case 'new':
        return <AlertCircle className="h-4 w-4 text-blue-500" />;
      case 'analyzing':
        return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
      case 'rejected':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      case 'monitoring':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_position':
        return <DollarSign className="h-4 w-4 text-green-500" />;
      case 'closed':
        return <DollarSign className="h-4 w-4 text-gray-500" />;
      case 'expired':
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };
  
  const getStatusColor = (status: SignalStatus) => {
    switch (status) {
      case 'new': return 'text-blue-500';
      case 'analyzing': return 'text-yellow-500';
      case 'rejected': return 'text-gray-500';
      case 'monitoring': return 'text-yellow-500';
      case 'ready': return 'text-green-500';
      case 'in_position': return 'text-green-500';
      case 'closed': return 'text-gray-500';
      case 'expired': return 'text-gray-500';
    }
  };
  
  const formatPnL = (value?: number) => {
    if (!value) return '-';
    const color = value >= 0 ? 'text-green-500' : 'text-red-500';
    return <span className={color}>{value >= 0 ? '+' : ''}{value.toFixed(2)}%</span>;
  };
  
  return (
    <div className="bg-[#0d1421] rounded-lg border border-[#1a2332]">
      {/* Status Filter Tabs */}
      <div className="border-b border-[#1a2332] p-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              statusFilter === 'all' 
                ? 'bg-[#8efbba] text-[#0d1421]' 
                : 'bg-[#1a2332] text-[#64748b] hover:text-[#e2e8f0]'
            }`}
          >
            All ({statusCounts.total})
          </button>
          <button
            onClick={() => setStatusFilter('new')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              statusFilter === 'new' 
                ? 'bg-[#8efbba] text-[#0d1421]' 
                : 'bg-[#1a2332] text-[#64748b] hover:text-[#e2e8f0]'
            }`}
          >
            New ({statusCounts.new})
          </button>
          <button
            onClick={() => setStatusFilter('monitoring')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              statusFilter === 'monitoring' 
                ? 'bg-[#8efbba] text-[#0d1421]' 
                : 'bg-[#1a2332] text-[#64748b] hover:text-[#e2e8f0]'
            }`}
          >
            Monitoring ({statusCounts.monitoring})
          </button>
          <button
            onClick={() => setStatusFilter('ready')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              statusFilter === 'ready' 
                ? 'bg-[#8efbba] text-[#0d1421]' 
                : 'bg-[#1a2332] text-[#64748b] hover:text-[#e2e8f0]'
            }`}
          >
            Ready ({statusCounts.ready})
          </button>
          <button
            onClick={() => setStatusFilter('in_position')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              statusFilter === 'in_position' 
                ? 'bg-[#8efbba] text-[#0d1421]' 
                : 'bg-[#1a2332] text-[#64748b] hover:text-[#e2e8f0]'
            }`}
          >
            Active ({statusCounts.in_position})
          </button>
          <button
            onClick={() => setStatusFilter('closed')}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              statusFilter === 'closed' 
                ? 'bg-[#8efbba] text-[#0d1421]' 
                : 'bg-[#1a2332] text-[#64748b] hover:text-[#e2e8f0]'
            }`}
          >
            Closed ({statusCounts.closed})
          </button>
        </div>
      </div>
      
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#1a2332]">
              <th className="p-3 text-left text-xs font-medium text-[#64748b] uppercase"></th>
              <th className="p-3 text-left text-xs font-medium text-[#64748b] uppercase">Symbol</th>
              <th className="p-3 text-left text-xs font-medium text-[#64748b] uppercase">Status</th>
              <th className="p-3 text-left text-xs font-medium text-[#64748b] uppercase">Entry</th>
              <th className="p-3 text-left text-xs font-medium text-[#64748b] uppercase">Current</th>
              <th className="p-3 text-left text-xs font-medium text-[#64748b] uppercase">Change</th>
              <th className="p-3 text-left text-xs font-medium text-[#64748b] uppercase">P&L</th>
              <th className="p-3 text-left text-xs font-medium text-[#64748b] uppercase">Time</th>
              <th className="p-3 text-left text-xs font-medium text-[#64748b] uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSignals.map(signal => (
              <React.Fragment key={signal.id}>
                <tr 
                  className="border-b border-[#1a2332] hover:bg-[#1a2332] transition-colors cursor-pointer"
                  onClick={(e) => {
                    // If clicking on action buttons, don't toggle expansion or select chart
                    if ((e.target as HTMLElement).closest('button')) {
                      return;
                    }
                    toggleRowExpanded(signal.id);
                    onRowClick?.(signal.symbol);
                  }}
                >
                  <td className="p-3">
                    {expandedRows.has(signal.id) ? 
                      <ChevronDown className="h-4 w-4 text-[#64748b]" /> : 
                      <ChevronRight className="h-4 w-4 text-[#64748b]" />
                    }
                  </td>
                  <td className="p-3 font-medium text-[#e2e8f0]">{signal.symbol}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(signal.status)}
                      <span className={`text-sm ${getStatusColor(signal.status)}`}>
                        {signal.status.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-[#e2e8f0] font-mono">
                    ${signal.initialPrice.toFixed(4)}
                  </td>
                  <td className="p-3 text-sm text-[#e2e8f0] font-mono">
                    ${signal.currentPrice.toFixed(4)}
                  </td>
                  <td className="p-3 text-sm">
                    <span className={signal.priceChange >= 0 ? 'text-green-500' : 'text-red-500'}>
                      {signal.priceChange >= 0 ? '+' : ''}{signal.priceChange.toFixed(2)}%
                    </span>
                  </td>
                  <td className="p-3 text-sm">
                    {signal.status === 'in_position' && formatPnL(signal.unrealizedPnl)}
                    {signal.status === 'closed' && formatPnL(signal.realizedPnl)}
                    {!['in_position', 'closed'].includes(signal.status) && '-'}
                  </td>
                  <td className="p-3 text-sm text-[#64748b]">
                    {formatDistanceToNow(signal.createdAt, { addSuffix: true })}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {signal.status === 'new' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAnalyzeSignal?.(signal);
                          }}
                          className="px-2 py-1 text-xs bg-[#8efbba] text-[#0d1421] rounded hover:bg-[#7ce3a8] transition-colors"
                        >
                          Analyze
                        </button>
                      )}
                      {signal.status === 'ready' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExecutingSignal(signal);
                          }}
                          className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                        >
                          Execute
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                
                {/* Expanded Row - Signal Details */}
                {expandedRows.has(signal.id) && (
                  <tr className="bg-[#1a2332]">
                    <td colSpan={9} className="p-4">
                      <SignalDetails signal={signal} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        
        {filteredSignals.length === 0 && (
          <div className="text-center py-8 text-[#64748b]">
            No signals found
          </div>
        )}
      </div>
      
      {/* Trade Execution Modal */}
      {executingSignal && (
        <TradeExecutionModal
          signal={executingSignal}
          onClose={() => setExecutingSignal(null)}
          onExecute={async (tradeData) => {
            try {
              await tradeManager.executeTrade(executingSignal.id, tradeData);
              setExecutingSignal(null);
            } catch (error) {
              console.error('Trade execution failed:', error);
              alert('Trade execution failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
            }
          }}
        />
      )}
    </div>
  );
}

// Signal Details Component
function SignalDetails({ signal }: { signal: SignalLifecycle }) {
  return (
    <div className="space-y-4">
      {/* Matched Conditions */}
      <div>
        <h4 className="text-sm font-medium text-[#8efbba] mb-2">Matched Conditions</h4>
        <div className="flex flex-wrap gap-2">
          {signal.matchedConditions.map((condition, i) => (
            <span key={i} className="px-2 py-1 bg-[#0d1421] rounded text-xs text-[#e2e8f0]">
              {condition}
            </span>
          ))}
        </div>
      </div>
      
      {/* Analysis Results */}
      {signal.analysis && (
        <div>
          <h4 className="text-sm font-medium text-[#8efbba] mb-2">AI Analysis</h4>
          <div className="bg-[#0d1421] rounded p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-[#64748b]">Decision:</span>
              <span className="text-sm text-[#e2e8f0]">{signal.analysis.decision.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[#64748b]">Confidence:</span>
              <span className="text-sm text-[#e2e8f0]">{(signal.analysis.confidence * 100).toFixed(1)}%</span>
            </div>
            {signal.analysis.direction && (
              <div className="flex justify-between">
                <span className="text-sm text-[#64748b]">Direction:</span>
                <span className="text-sm text-[#e2e8f0]">{signal.analysis.direction.toUpperCase()}</span>
              </div>
            )}
            <div className="pt-2 border-t border-[#1a2332]">
              <p className="text-sm text-[#e2e8f0]">{signal.analysis.reasoning}</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Monitoring History */}
      {signal.monitoringUpdates && signal.monitoringUpdates.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[#8efbba] mb-2">Monitoring History</h4>
          <div className="space-y-2">
            {signal.monitoringUpdates.map((update, i) => (
              <div key={i} className="bg-[#0d1421] rounded p-3 flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-sm text-[#e2e8f0]">{update.reason}</p>
                  <p className="text-xs text-[#64748b]">
                    {formatDistanceToNow(update.timestamp, { addSuffix: true })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-[#e2e8f0]">${update.price.toFixed(4)}</p>
                  {update.confidence && (
                    <p className="text-xs text-[#64748b]">{(update.confidence * 100).toFixed(1)}%</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Trade Details */}
      {signal.trade && signal.status === 'in_position' && (
        <PositionManager
          signal={signal}
          onClose={async (reason, finalPrice) => {
            if (signal.trade?.id) {
              await tradeManager.closeTrade(signal.trade.id, reason, finalPrice);
            }
          }}
          onModify={async (updates) => {
            if (signal.trade?.id) {
              await tradeManager.modifyTrade(signal.trade.id, updates);
            }
          }}
        />
      )}
      
      {/* Closed Trade Details */}
      {signal.trade && signal.status === 'closed' && (
        <div>
          <h4 className="text-sm font-medium text-[#8efbba] mb-2">Trade Details (Closed)</h4>
          <div className="bg-[#0d1421] rounded p-3 grid grid-cols-2 gap-3">
            <div>
              <span className="text-sm text-[#64748b]">Entry:</span>
              <p className="text-sm font-mono text-[#e2e8f0]">${signal.trade.entryPrice?.toFixed(4) || '-'}</p>
            </div>
            <div>
              <span className="text-sm text-[#64748b]">Exit:</span>
              <p className="text-sm font-mono text-[#e2e8f0]">${signal.trade.currentPrice?.toFixed(4) || '-'}</p>
            </div>
            <div>
              <span className="text-sm text-[#64748b]">Result:</span>
              <p className="text-sm">
                {formatPnL(signal.trade.pnlPercentage)}
              </p>
            </div>
            <div>
              <span className="text-sm text-[#64748b]">P&L:</span>
              <p className={`text-sm ${signal.trade.pnl && signal.trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                ${signal.trade.pnl?.toFixed(2) || '-'}
              </p>
            </div>
          </div>
          {signal.trade.closeReason && (
            <div className="mt-2 p-3 bg-[#0d1421] rounded">
              <p className="text-sm text-[#64748b] mb-1">Close Reason:</p>
              <p className="text-sm text-[#e2e8f0]">{signal.trade.closeReason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatPnL(value?: number): React.ReactNode {
  if (!value) return '-';
  const color = value >= 0 ? 'text-green-500' : 'text-red-500';
  return <span className={color}>{value >= 0 ? '+' : ''}{value.toFixed(2)}%</span>;
}