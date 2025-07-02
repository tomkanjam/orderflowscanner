import React from 'react';
import { SignalLifecycle } from '../abstractions/interfaces';
import { X, TrendingUp, TrendingDown, Activity, Clock, Target, AlertCircle, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SignalHistorySidebarProps {
  signal: SignalLifecycle | null;
  onClose: () => void;
  tickers: Map<string, any>;
  traders: any[];
}

export function SignalHistorySidebar({ signal, onClose, tickers, traders }: SignalHistorySidebarProps) {
  if (!signal) return null;

  const ticker = tickers.get(signal.symbol);
  const trader = traders.find(t => t.id === signal.traderId);
  
  // Get price change since signal creation
  const priceChange = ticker ? ((ticker.c - signal.initialPrice) / signal.initialPrice) * 100 : 0;
  
  // Decision icons and colors
  const getDecisionIcon = (decision: string) => {
    switch (decision) {
      case 'buy':
      case 'enter_trade':
        return <TrendingUp className="w-4 h-4" />;
      case 'sell':
        return <TrendingDown className="w-4 h-4" />;
      case 'hold':
      case 'monitor':
      case 'good_setup':
        return <Activity className="w-4 h-4" />;
      case 'no_trade':
      case 'bad_setup':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };
  
  const getDecisionColor = (decision: string) => {
    switch (decision) {
      case 'buy':
      case 'enter_trade':
        return 'text-green-500 bg-green-500/10';
      case 'sell':
        return 'text-red-500 bg-red-500/10';
      case 'hold':
      case 'monitor':
      case 'good_setup':
        return 'text-yellow-500 bg-yellow-500/10';
      case 'no_trade':
      case 'bad_setup':
        return 'text-gray-500 bg-gray-500/10';
      default:
        return 'text-gray-500 bg-gray-500/10';
    }
  };
  
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'new':
        return 'bg-blue-500/10 text-blue-500';
      case 'analyzing':
      case 'analysis_queued':
        return 'bg-yellow-500/10 text-yellow-500';
      case 'monitoring':
        return 'bg-purple-500/10 text-purple-500';
      case 'ready':
        return 'bg-green-500/10 text-green-500';
      case 'in_position':
        return 'bg-teal-500/10 text-teal-500';
      case 'rejected':
      case 'expired':
        return 'bg-gray-500/10 text-gray-500';
      case 'closed':
        return 'bg-red-500/10 text-red-500';
      default:
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="h-full w-full bg-[var(--tm-bg-primary)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[var(--tm-border)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-[var(--tm-text-primary)]">Signal History</h2>
          <button
            onClick={onClose}
            className="text-[var(--tm-text-muted)] hover:text-[var(--tm-text-primary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Signal Overview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-[var(--tm-text-primary)]">{signal.symbol}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(signal.status)}`}>
                {signal.status.replace('_', ' ')}
              </span>
            </div>
            <span className={`text-lg font-mono ${priceChange >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-[var(--tm-text-muted)]">Entry Price:</span>
              <span className="ml-2 font-mono">${signal.initialPrice.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-[var(--tm-text-muted)]">Current:</span>
              <span className="ml-2 font-mono">${ticker?.c ? parseFloat(ticker.c).toFixed(4) : '---'}</span>
            </div>
            <div>
              <span className="text-[var(--tm-text-muted)]">Trader:</span>
              <span className="ml-2">{trader?.name || 'Unknown'}</span>
            </div>
            <div>
              <span className="text-[var(--tm-text-muted)]">Created:</span>
              <span className="ml-2">{formatDistanceToNow(signal.createdAt, { addSuffix: true })}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Analysis Timeline */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold text-[var(--tm-text-secondary)] mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Analysis Timeline
          {signal.analysisHistory && signal.analysisHistory.length > 0 && (
            <span className="text-xs text-[var(--tm-text-muted)]">
              ({signal.analysisHistory.length} {signal.analysisHistory.length === 1 ? 'analysis' : 'analyses'})
            </span>
          )}
        </h3>
        
        {(!signal.analysisHistory || signal.analysisHistory.length === 0) ? (
          <div className="text-center py-8 text-[var(--tm-text-muted)]">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No analysis yet</p>
            <p className="text-xs mt-1">Analysis will appear here once completed</p>
          </div>
        ) : (
          <div className="space-y-4">
            {signal.analysisHistory.slice().reverse().map((analysis, idx) => {
              const isLatest = idx === 0;
              const isDecisionChange = idx > 0 && 
                signal.analysisHistory![signal.analysisHistory!.length - idx].decision !== 
                signal.analysisHistory![signal.analysisHistory!.length - idx - 1].decision;
              
              return (
                <div 
                  key={idx} 
                  className={`relative pl-8 pb-4 ${idx < signal.analysisHistory!.length - 1 ? 'border-l-2 border-[var(--tm-border)]' : ''}`}
                  style={{ marginLeft: '12px' }}
                >
                  {/* Timeline dot */}
                  <div className={`absolute -left-[9px] w-4 h-4 rounded-full border-2 ${
                    isLatest ? 'bg-blue-500 border-blue-500' : 
                    isDecisionChange ? 'bg-yellow-500 border-yellow-500' : 
                    'bg-[var(--tm-bg-secondary)] border-[var(--tm-border)]'
                  }`} />
                  
                  {/* Analysis Card */}
                  <div className={`bg-[var(--tm-bg-secondary)] rounded-lg p-4 ${
                    isLatest ? 'ring-2 ring-blue-500/20' : ''
                  }`}>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg flex items-center gap-1.5 ${getDecisionColor(analysis.decision)}`}>
                          {getDecisionIcon(analysis.decision)}
                          <span className="text-xs font-medium uppercase">
                            {analysis.decision.replace('_', ' ')}
                          </span>
                        </div>
                        {isLatest && (
                          <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded-full">
                            Latest
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-[var(--tm-text-muted)]">
                          {new Date(analysis.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="text-xs text-[var(--tm-text-muted)]">
                          {new Date(analysis.timestamp).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    
                    {/* Confidence */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[var(--tm-text-muted)]">Confidence</span>
                        <span className="text-xs font-medium">{Math.round(analysis.confidence * 100)}%</span>
                      </div>
                      <div className="w-full bg-[var(--tm-bg-hover)] rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full transition-all ${
                            analysis.confidence >= 0.8 ? 'bg-green-500' :
                            analysis.confidence >= 0.6 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                          style={{ width: `${analysis.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                    
                    {/* Reasoning */}
                    <div className="space-y-2">
                      <p className="text-sm text-[var(--tm-text-secondary)] leading-relaxed">
                        {analysis.reasoning}
                      </p>
                      
                      {/* Trade Plan */}
                      {analysis.tradePlan && (
                        <div className="mt-3 p-3 bg-[var(--tm-bg-hover)] rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <Target className="w-4 h-4 text-[var(--tm-text-muted)]" />
                            <span className="text-xs font-medium text-[var(--tm-text-secondary)]">Trade Plan</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[var(--tm-text-muted)]">Entry:</span>
                              <span className="ml-2 font-mono">{analysis.tradePlan.entry}</span>
                            </div>
                            <div>
                              <span className="text-[var(--tm-text-muted)]">Stop Loss:</span>
                              <span className="ml-2 font-mono text-red-500">{analysis.tradePlan.stopLoss}</span>
                            </div>
                            <div>
                              <span className="text-[var(--tm-text-muted)]">Take Profit:</span>
                              <span className="ml-2 font-mono text-green-500">{analysis.tradePlan.takeProfit}</span>
                            </div>
                            <div>
                              <span className="text-[var(--tm-text-muted)]">Size:</span>
                              <span className="ml-2">{analysis.tradePlan.positionSize}</span>
                            </div>
                            {analysis.tradePlan.notes && (
                              <div className="col-span-2">
                                <span className="text-[var(--tm-text-muted)]">Notes:</span>
                                <p className="mt-1 text-[var(--tm-text-secondary)]">{analysis.tradePlan.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Key Levels */}
                      {analysis.keyLevels && (
                        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                          {analysis.keyLevels.support && analysis.keyLevels.support.length > 0 && (
                            <div>
                              <span className="text-[var(--tm-text-muted)]">Support:</span>
                              <div className="font-mono text-red-500">
                                {analysis.keyLevels.support.map(s => `$${s.toFixed(4)}`).join(', ')}
                              </div>
                            </div>
                          )}
                          {analysis.keyLevels.resistance && analysis.keyLevels.resistance.length > 0 && (
                            <div>
                              <span className="text-[var(--tm-text-muted)]">Resistance:</span>
                              <div className="font-mono text-green-500">
                                {analysis.keyLevels.resistance.map(r => `$${r.toFixed(4)}`).join(', ')}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Monitoring Updates Section */}
        {signal.monitoringUpdates && signal.monitoringUpdates.length > 0 && (
          <div className="mt-8">
            <h3 className="text-sm font-semibold text-[var(--tm-text-secondary)] mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Monitoring Updates
              <span className="text-xs text-[var(--tm-text-muted)]">
                ({signal.monitoringUpdates.length})
              </span>
            </h3>
            
            <div className="space-y-2">
              {signal.monitoringUpdates.slice(-10).reverse().map((update, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-[var(--tm-bg-secondary)] rounded text-xs">
                  <span className="text-[var(--tm-text-muted)]">
                    {new Date(update.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={`font-medium ${
                    update.action === 'enter' ? 'text-green-500' :
                    update.action === 'cancel' ? 'text-red-500' :
                    'text-[var(--tm-text-secondary)]'
                  }`}>
                    {update.action.toUpperCase()}
                  </span>
                  <span className="font-mono">${update.price.toFixed(4)}</span>
                  {update.confidence && (
                    <span className="text-[var(--tm-text-muted)]">
                      {Math.round(update.confidence * 100)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}