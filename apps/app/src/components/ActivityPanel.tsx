import React, { useState, useMemo, useEffect } from 'react';
import { Signal, SignalStatus, MonitoringUpdate, Trade } from '../../src/abstractions/interfaces';
import { workflowManager, MonitoringDecision } from '../services/workflowManager';

interface ActivityPanelProps {
  signals: Signal[];
  trades?: Trade[];
  isOpen: boolean;
  onClose: () => void;
  isMobile?: boolean;
  selectedSignalId?: string | null;
  onRowClick?: (symbol: string, traderId?: string, signalId?: string) => void;
}

interface ActivityEvent {
  id: string;
  timestamp: number;
  type: 'signal_created' | 'signal_analyzed' | 'signal_monitoring' | 'signal_ready' | 'trade_opened' | 'trade_closed' | 'monitoring_decision';
  symbol: string;
  signalId?: string;
  status?: SignalStatus;
  price?: number;
  message?: string;
  confidence?: number;
  action?: string;
  details?: any;
}

const ActivityPanel: React.FC<ActivityPanelProps> = ({
  signals,
  trades = [],
  isOpen,
  onClose,
  isMobile = false,
  selectedSignalId,
  onRowClick
}) => {
  const [filter, setFilter] = useState<'all' | 'signals' | 'trades'>('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [monitoringDecisions, setMonitoringDecisions] = useState<Map<string, MonitoringDecision[]>>(new Map());

  // Fetch monitoring decisions when a signal is selected
  useEffect(() => {
    if (selectedSignalId) {
      workflowManager.getMonitoringDecisions(selectedSignalId).then(decisions => {
        setMonitoringDecisions(prev => {
          const newMap = new Map(prev);
          newMap.set(selectedSignalId, decisions);
          return newMap;
        });
      }).catch(error => {
        console.error('Failed to fetch monitoring decisions:', error);
      });
    }
  }, [selectedSignalId]);

  // Convert signals and trades to activity events
  const activityEvents = useMemo(() => {
    const events: ActivityEvent[] = [];

    // Process signals
    signals.forEach(signal => {
      // Signal created event
      events.push({
        id: `${signal.id}-created`,
        timestamp: signal.createdAt,
        type: 'signal_created',
        symbol: signal.symbol,
        signalId: signal.id,
        status: signal.status,
        price: signal.initialPrice,
        message: `Signal created at $${signal.initialPrice.toLocaleString()}`,
        details: {
          matchedConditions: signal.matchedConditions,
          strategy: signal.strategy
        }
      });

      // Analysis event
      if (signal.analysisResult) {
        events.push({
          id: `${signal.id}-analyzed`,
          timestamp: signal.analyzedAt || signal.createdAt + 60000,
          type: 'signal_analyzed',
          symbol: signal.symbol,
          signalId: signal.id,
          status: signal.status,
          confidence: signal.analysisResult.confidence,
          message: signal.analysisResult.approved ? 'Analysis approved' : 'Analysis rejected',
          details: {
            reasoning: signal.analysisResult.reasoning,
            targets: signal.analysisResult.targets
          }
        });
      }

      // Monitoring updates
      signal.monitoringUpdates?.forEach((update, index) => {
        events.push({
          id: `${signal.id}-monitor-${index}`,
          timestamp: update.timestamp,
          type: 'signal_monitoring',
          symbol: signal.symbol,
          signalId: signal.id,
          status: signal.status,
          price: update.price,
          action: update.action,
          message: `Monitoring: ${update.action}`,
          details: {
            reason: update.reason,
            confidence: update.confidence
          }
        });
      });

      // Ready event
      if (signal.status === 'ready') {
        events.push({
          id: `${signal.id}-ready`,
          timestamp: signal.updatedAt,
          type: 'signal_ready',
          symbol: signal.symbol,
          signalId: signal.id,
          status: signal.status,
          price: signal.currentPrice,
          message: 'Entry signal triggered'
        });
      }
    });

    // Add monitoring decisions from workflowManager
    monitoringDecisions.forEach((decisions, signalId) => {
      const signal = signals.find(s => s.id === signalId);
      if (signal) {
        decisions.forEach((decision, index) => {
          events.push({
            id: `${signalId}-decision-${index}`,
            timestamp: decision.timestamp.getTime(),
            type: 'monitoring_decision',
            symbol: signal.symbol,
            signalId: signalId,
            price: decision.price,
            confidence: decision.confidence,
            message: `Monitoring decision: ${decision.decision.toUpperCase()}`,
            details: {
              reasoning: decision.reasoning,
              decision: decision.decision,
              indicators: decision.indicators,
              tradePlan: decision.trade_plan
            }
          });
        });
      }
    });

    // Process trades
    trades.forEach(trade => {
      if (trade.entryPrice) {
        events.push({
          id: `${trade.id}-opened`,
          timestamp: new Date(trade.createdAt).getTime(),
          type: 'trade_opened',
          symbol: trade.symbol,
          price: trade.entryPrice,
          message: `Trade opened at $${trade.entryPrice.toLocaleString()}`,
          details: {
            size: trade.positionSize,
            direction: trade.direction
          }
        });
      }

      if (trade.status === 'closed' && trade.closedAt && trade.currentPrice) {
        events.push({
          id: `${trade.id}-closed`,
          timestamp: new Date(trade.closedAt).getTime(),
          type: 'trade_closed',
          symbol: trade.symbol,
          price: trade.currentPrice,
          message: `Trade closed at $${trade.currentPrice.toLocaleString()} (${trade.pnlPercentage?.toFixed(2)}%)`,
          details: {
            pnl: trade.pnl,
            pnlPct: trade.pnlPercentage
          }
        });
      }
    });

    // Sort by timestamp descending
    return events.sort((a, b) => b.timestamp - a.timestamp);
  }, [signals, trades, monitoringDecisions]);

  // Filter events
  const filteredEvents = useMemo(() => {
    let events = activityEvents;
    
    // Filter by selected signal if specified
    if (selectedSignalId) {
      events = events.filter(e => e.signalId === selectedSignalId || 
        (e.type === 'trade_opened' && trades.find(t => t.id === e.id.split('-')[0])?.signalId === selectedSignalId) ||
        (e.type === 'trade_closed' && trades.find(t => t.id === e.id.split('-')[0])?.signalId === selectedSignalId)
      );
    }
    
    // Apply type filter
    if (filter === 'signals') return events.filter(e => e.type.startsWith('signal_') || e.type === 'monitoring_decision');
    if (filter === 'trades') return events.filter(e => e.type.startsWith('trade_'));
    return events;
  }, [activityEvents, filter, selectedSignalId, trades]);

  const toggleEventExpanded = (eventId: string) => {
    setExpandedEvents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const getEventIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'signal_created': return '📍';
      case 'signal_analyzed': return '🔍';
      case 'signal_monitoring': return '📊';
      case 'signal_ready': return '✅';
      case 'trade_opened': return '💰';
      case 'trade_closed': return '🏁';
      case 'monitoring_decision': return '🎯';
      default: return '•';
    }
  };

  const getEventColor = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'signal_created': return 'text-[var(--nt-text-muted)]';
      case 'signal_analyzed': return 'text-[var(--nt-info)]';
      case 'signal_monitoring': return 'text-[var(--nt-warning)]';
      case 'signal_ready': return 'text-[var(--nt-success)]';
      case 'trade_opened': return 'text-[var(--nt-accent-lime)]';
      case 'trade_closed': return 'text-[var(--nt-accent-cyan)]';
      case 'monitoring_decision': return 'text-[var(--nt-accent-lime)]';
      default: return 'text-[var(--nt-text-muted)]';
    }
  };

  const formatTime = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return new Date(timestamp).toLocaleString();
  };

  if (!isOpen) return null;

  const panelContent = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-[var(--nt-border-default)] flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">
            {selectedSignalId ? 'Signal History' : 'Trader Activity'}
          </h3>
          {selectedSignalId && (
            <span className="text-sm text-[var(--nt-text-muted)]">
              (Click another signal to change view)
            </span>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'all' 
                ? 'bg-[var(--nt-accent-lime)] text-white' 
                : 'bg-[var(--nt-bg-secondary)] text-[var(--nt-text-muted)]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('signals')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'signals' 
                ? 'bg-[var(--nt-accent-lime)] text-white' 
                : 'bg-[var(--nt-bg-secondary)] text-[var(--nt-text-muted)]'
            }`}
          >
            Signals
          </button>
          <button
            onClick={() => setFilter('trades')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'trades' 
                ? 'bg-[var(--nt-accent-lime)] text-white' 
                : 'bg-[var(--nt-bg-secondary)] text-[var(--nt-text-muted)]'
            }`}
          >
            Trades
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredEvents.length === 0 ? (
          <div className="p-4 text-center text-[var(--nt-text-muted)]">
            No activity to show
          </div>
        ) : (
          <div className="divide-y divide-[var(--nt-border-default)]">
            {filteredEvents.map(event => {
              const isExpanded = expandedEvents.has(event.id);

              return (
                <div
                  key={event.id}
                  className="p-4 hover:bg-[var(--nt-bg-secondary)] cursor-pointer transition-colors"
                  onClick={() => {
                    toggleEventExpanded(event.id);
                    // Call onRowClick to select symbol for chart display
                    if (onRowClick && event.symbol) {
                      // Find the signal to get traderId
                      const signal = signals.find(s => s.id === event.signalId);
                      onRowClick(event.symbol, signal?.traderId, event.signalId);
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-xl ${getEventColor(event.type)}`}>
                      {getEventIcon(event.type)}
                    </span>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{event.symbol}</span>
                        <span className="text-xs text-[var(--nt-text-muted)]">
                          {formatTime(event.timestamp)}
                        </span>
                      </div>
                      
                      <div className={`text-sm ${getEventColor(event.type)} mt-1`}>
                        {event.message}
                      </div>
                      
                      {event.confidence !== undefined && (
                        <div className="text-xs text-[var(--nt-text-muted)] mt-1">
                          Confidence: {(event.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                      
                      {isExpanded && event.details && (
                        <div className="mt-2 p-2 bg-[var(--nt-bg-primary)] rounded text-xs">
                          {event.details.matchedConditions && (
                            <div className="mb-1">
                              <span className="text-[var(--nt-text-muted)]">Conditions:</span>
                              <ul className="mt-1">
                                {event.details.matchedConditions.map((condition: string, i: number) => (
                                  <li key={i}>• {condition}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {event.details.reasoning && (
                            <div className="mb-1">
                              <span className="text-[var(--nt-text-muted)]">Reasoning:</span>
                              <div className="mt-1">{event.details.reasoning}</div>
                            </div>
                          )}
                          
                          {event.details.reason && (
                            <div className="mb-1">
                              <span className="text-[var(--nt-text-muted)]">Reason:</span>
                              <div className="mt-1">{event.details.reason}</div>
                            </div>
                          )}
                          
                          {event.details.targets && (
                            <div className="mb-1">
                              <span className="text-[var(--nt-text-muted)]">Targets:</span>
                              <div className="mt-1">
                                Entry: ${event.details.targets.entry} | 
                                Stop: ${event.details.targets.stop} | 
                                Target: ${event.details.targets.target}
                              </div>
                            </div>
                          )}
                          
                          {event.details.pnl !== undefined && (
                            <div className="mb-1">
                              <span className="text-[var(--nt-text-muted)]">P&L:</span>
                              <div className={`mt-1 font-medium ${event.details.pnl >= 0 ? 'text-[var(--nt-success)]' : 'text-[var(--nt-error)]'}`}>
                                ${event.details.pnl.toFixed(2)} ({event.details.pnlPct.toFixed(2)}%)
                              </div>
                            </div>
                          )}
                          
                          {event.details.decision && (
                            <div className="mb-1">
                              <span className="text-[var(--nt-text-muted)]">Decision:</span>
                              <div className="mt-1 font-medium text-[var(--nt-accent-lime)]">{event.details.decision.toUpperCase()}</div>
                            </div>
                          )}
                          
                          {event.details.tradePlan && (
                            <div className="mb-1">
                              <span className="text-[var(--nt-text-muted)]">Trade Plan:</span>
                              <div className="mt-1">
                                Entry: ${event.details.tradePlan.entry} |
                                Stop: ${event.details.tradePlan.stopLoss} |
                                Target: ${event.details.tradePlan.takeProfit}
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
      </div>
    </div>
  );

  // Desktop side panel
  if (!isMobile) {
    return (
      <div className="w-80 border-l border-[var(--nt-border-default)] bg-[var(--nt-bg-primary)] h-full overflow-hidden">
        {panelContent}
      </div>
    );
  }

  // Mobile bottom sheet
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300">
      <div 
        className="bg-[var(--nt-bg-primary)] rounded-t-xl shadow-lg max-h-[70vh] flex flex-col"
        style={{ transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div className="w-12 h-1 bg-[var(--nt-border-default)] rounded-full mx-auto mt-2 mb-2" />
        {panelContent}
      </div>
    </div>
  );
};

export default ActivityPanel;