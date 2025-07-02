import React, { useState, useMemo } from 'react';
import { Signal, SignalStatus, MonitoringUpdate, Trade } from '../../src/abstractions/interfaces';

interface ActivityPanelProps {
  signals: Signal[];
  trades?: Trade[];
  isOpen: boolean;
  onClose: () => void;
  isMobile?: boolean;
}

interface ActivityEvent {
  id: string;
  timestamp: number;
  type: 'signal_created' | 'signal_analyzed' | 'signal_monitoring' | 'signal_ready' | 'trade_opened' | 'trade_closed';
  symbol: string;
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
  isMobile = false 
}) => {
  const [filter, setFilter] = useState<'all' | 'signals' | 'trades'>('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

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
          status: signal.status,
          price: signal.currentPrice,
          message: 'Entry signal triggered'
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
  }, [signals, trades]);

  // Filter events
  const filteredEvents = useMemo(() => {
    if (filter === 'all') return activityEvents;
    if (filter === 'signals') return activityEvents.filter(e => e.type.startsWith('signal_'));
    if (filter === 'trades') return activityEvents.filter(e => e.type.startsWith('trade_'));
    return activityEvents;
  }, [activityEvents, filter]);

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
      default: return '•';
    }
  };

  const getEventColor = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'signal_created': return 'text-[var(--tm-text-dim)]';
      case 'signal_analyzed': return 'text-[var(--tm-info)]';
      case 'signal_monitoring': return 'text-[var(--tm-warning)]';
      case 'signal_ready': return 'text-[var(--tm-success)]';
      case 'trade_opened': return 'text-[var(--tm-accent)]';
      case 'trade_closed': return 'text-[var(--tm-secondary)]';
      default: return 'text-[var(--tm-text-dim)]';
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
    <>
      <div className="p-4 border-b border-[var(--tm-border)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Trade Activity</h3>
          <button
            onClick={onClose}
            className="text-[var(--tm-text-muted)] hover:text-[var(--tm-text)]"
          >
            ✕
          </button>
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'all' 
                ? 'bg-[var(--tm-accent)] text-white' 
                : 'bg-[var(--tm-bg-secondary)] text-[var(--tm-text-dim)]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('signals')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'signals' 
                ? 'bg-[var(--tm-accent)] text-white' 
                : 'bg-[var(--tm-bg-secondary)] text-[var(--tm-text-dim)]'
            }`}
          >
            Signals
          </button>
          <button
            onClick={() => setFilter('trades')}
            className={`px-3 py-1 rounded text-sm ${
              filter === 'trades' 
                ? 'bg-[var(--tm-accent)] text-white' 
                : 'bg-[var(--tm-bg-secondary)] text-[var(--tm-text-dim)]'
            }`}
          >
            Trades
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredEvents.length === 0 ? (
          <div className="p-4 text-center text-[var(--tm-text-muted)]">
            No activity to show
          </div>
        ) : (
          <div className="divide-y divide-[var(--tm-border)]">
            {filteredEvents.map(event => {
              const isExpanded = expandedEvents.has(event.id);
              
              return (
                <div
                  key={event.id}
                  className="p-4 hover:bg-[var(--tm-bg-secondary)] cursor-pointer transition-colors"
                  onClick={() => toggleEventExpanded(event.id)}
                >
                  <div className="flex items-start gap-3">
                    <span className={`text-xl ${getEventColor(event.type)}`}>
                      {getEventIcon(event.type)}
                    </span>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{event.symbol}</span>
                        <span className="text-xs text-[var(--tm-text-muted)]">
                          {formatTime(event.timestamp)}
                        </span>
                      </div>
                      
                      <div className={`text-sm ${getEventColor(event.type)} mt-1`}>
                        {event.message}
                      </div>
                      
                      {event.confidence !== undefined && (
                        <div className="text-xs text-[var(--tm-text-dim)] mt-1">
                          Confidence: {(event.confidence * 100).toFixed(0)}%
                        </div>
                      )}
                      
                      {isExpanded && event.details && (
                        <div className="mt-2 p-2 bg-[var(--tm-bg)] rounded text-xs">
                          {event.details.matchedConditions && (
                            <div className="mb-1">
                              <span className="text-[var(--tm-text-muted)]">Conditions:</span>
                              <ul className="mt-1">
                                {event.details.matchedConditions.map((condition: string, i: number) => (
                                  <li key={i}>• {condition}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {event.details.reasoning && (
                            <div className="mb-1">
                              <span className="text-[var(--tm-text-muted)]">Reasoning:</span>
                              <div className="mt-1">{event.details.reasoning}</div>
                            </div>
                          )}
                          
                          {event.details.reason && (
                            <div className="mb-1">
                              <span className="text-[var(--tm-text-muted)]">Reason:</span>
                              <div className="mt-1">{event.details.reason}</div>
                            </div>
                          )}
                          
                          {event.details.targets && (
                            <div className="mb-1">
                              <span className="text-[var(--tm-text-muted)]">Targets:</span>
                              <div className="mt-1">
                                Entry: ${event.details.targets.entry} | 
                                Stop: ${event.details.targets.stop} | 
                                Target: ${event.details.targets.target}
                              </div>
                            </div>
                          )}
                          
                          {event.details.pnl !== undefined && (
                            <div className="mb-1">
                              <span className="text-[var(--tm-text-muted)]">P&L:</span>
                              <div className={`mt-1 font-medium ${event.details.pnl >= 0 ? 'text-[var(--tm-success)]' : 'text-[var(--tm-error)]'}`}>
                                ${event.details.pnl.toFixed(2)} ({event.details.pnlPct.toFixed(2)}%)
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
    </>
  );

  // Desktop side panel
  if (!isMobile) {
    return (
      <div className={`w-80 border-l border-[var(--tm-border)] bg-[var(--tm-bg-primary)] flex flex-col ${isOpen ? '' : 'hidden'}`}>
        {panelContent}
      </div>
    );
  }

  // Mobile bottom sheet
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300">
      <div 
        className="bg-[var(--tm-bg-primary)] rounded-t-xl shadow-lg max-h-[70vh] flex flex-col"
        style={{ transform: isOpen ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div className="w-12 h-1 bg-[var(--tm-border)] rounded-full mx-auto mt-2 mb-2" />
        {panelContent}
      </div>
    </div>
  );
};

export default ActivityPanel;