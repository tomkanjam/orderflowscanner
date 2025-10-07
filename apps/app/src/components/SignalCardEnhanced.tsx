import React, { useState } from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { Power, Edit2, Trash2, Star, StarOff, ChevronDown, Cloud, CloudOff } from 'lucide-react';
import { SignalAccessIndicator } from './SignalAccessIndicator';
import { ActivityIndicator } from './cards/ActivityIndicator';
import { TriggerHistory, TriggerRecord } from './cards/TriggerHistory';
import { activityTracker } from '../services/activityTracker';
import './SignalCard.css';

interface SignalCardEnhancedProps {
  signal: Trader;
  isSelected: boolean;
  isFavorite: boolean;
  canView: boolean;
  canFavorite: boolean;
  showEnableToggle?: boolean;
  showEditDelete?: boolean;
  showAccessIndicator?: boolean;
  showAIFeatures?: boolean;
  showCloudExecution?: boolean; // Show cloud execution controls for Elite custom traders
  cloudMachineStatus?: 'stopped' | 'provisioning' | 'starting' | 'running' | 'stopping' | 'error';
  onSelect?: () => void;
  onToggleEnable?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleFavorite?: () => void;
  onToggleCloudExecution?: () => void;
}

/**
 * Enhanced SignalCard with expand/collapse functionality
 * Follows the design spec: 88px collapsed, 280px expanded for signals
 */
export const SignalCardEnhanced = React.memo(function SignalCardEnhanced({
  signal,
  isSelected,
  isFavorite,
  canView,
  canFavorite,
  showEnableToggle = false,
  showEditDelete = false,
  showAccessIndicator = false,
  showAIFeatures = false,
  showCloudExecution = false,
  cloudMachineStatus = 'stopped',
  onSelect,
  onToggleEnable,
  onEdit,
  onDelete,
  onToggleFavorite,
  onToggleCloudExecution
}: SignalCardEnhancedProps) {
  const [expanded, setExpanded] = useState(false);

  // Get activity state
  const activityState = activityTracker.getActivityState(signal.id);
  
  // Get metrics
  const metrics = signal.mode === 'demo' 
    ? signal.metrics?.demoMetrics 
    : signal.metrics?.liveMetrics;

  // Mock trigger history (in real app, this would come from signal data)
  // Ensure lastSignalAt is a Date object
  const lastSignalDate = signal.metrics?.lastSignalAt 
    ? (signal.metrics.lastSignalAt instanceof Date 
        ? signal.metrics.lastSignalAt 
        : new Date(signal.metrics.lastSignalAt))
    : null;
    
  const mockTriggers: TriggerRecord[] = lastSignalDate ? [
    { 
      symbol: 'BTCUSDT', 
      timestamp: lastSignalDate.getTime(), 
      price: 67234.50, 
      changePercent: 2.4 
    }
  ] : [];

  const formatPnL = (value: number) => {
    const sign = value >= 0 ? '+' : '';
    const color = value >= 0 ? 'text-green-500' : 'text-red-500';
    return <span className={color}>{sign}{value.toFixed(2)}%</span>;
  };

  const formatTime = (date: Date | undefined) => {
    if (!date) return 'Never';
    const now = Date.now();
    const diff = now - date.getTime();
    
    if (diff < 60 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
  };

  return (
    <div
      className={`
        signal-card
        ${expanded ? 'expanded' : ''}
        ${isSelected ? 'selected' : ''}
        ${!canView ? 'disabled' : ''}
      `}
      data-expanded={expanded}
      data-variant="signal"
      data-activity={activityState}
      data-selected={isSelected}
      onClick={() => {
        if (canView && onSelect) {
          onSelect();
        }
      }}
    >
      {/* Card Header */}
      <div className="signal-card__header">
        <div className="flex items-center gap-2 flex-1">
          <ActivityIndicator 
            signalId={signal.id}
            size="medium"
            animate={true}
          />
          
          {showEnableToggle && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleEnable?.();
              }}
              className={`p-1 rounded transition-colors ${
                signal.enabled
                  ? 'text-green-500 hover:bg-green-500/20'
                  : 'text-gray-500 hover:bg-gray-500/20'
              }`}
              title={signal.enabled ? 'Disable signal' : 'Enable signal'}
            >
              <Power className="h-4 w-4" />
            </button>
          )}

          {/* Cloud Execution Toggle - Only for custom traders */}
          {showCloudExecution && !signal.isBuiltIn && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCloudExecution?.();
              }}
              disabled={cloudMachineStatus !== 'running'}
              className={`p-1 rounded transition-colors ${
                signal.cloud_config?.enabledInCloud
                  ? 'text-blue-500 hover:bg-blue-500/20'
                  : 'text-gray-500 hover:bg-gray-500/20'
              } ${cloudMachineStatus !== 'running' ? 'opacity-50 cursor-not-allowed' : ''}`}
              title={
                cloudMachineStatus !== 'running'
                  ? 'Start your cloud machine to enable'
                  : signal.cloud_config?.enabledInCloud
                  ? 'Deployed to cloud'
                  : 'Deploy to cloud'
              }
            >
              {signal.cloud_config?.enabledInCloud ? (
                <Cloud className="h-4 w-4" />
              ) : (
                <CloudOff className="h-4 w-4" />
              )}
            </button>
          )}

          <h4 className="signal-card__title">
            {signal.name || 'Unnamed Signal'}
          </h4>

          {/* Cloud Deployment Status Badge */}
          {showCloudExecution && !signal.isBuiltIn && signal.cloud_config?.enabledInCloud && cloudMachineStatus === 'running' && (
            <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded flex items-center gap-1">
              <Cloud className="h-3 w-3" />
              Cloud
            </span>
          )}

          {showAccessIndicator && <SignalAccessIndicator signal={signal} />}
        </div>

        <div className="signal-card__actions">
          {canFavorite && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.();
              }}
              className="text-gray-400 hover:text-yellow-400 transition-colors"
            >
              {isFavorite ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
            </button>
          )}
          
          {showEditDelete && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.();
                }}
                className="text-gray-400 hover:text-gray-200 transition-colors"
              >
                <Edit2 className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.();
                }}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-1 rounded hover:bg-white/5 transition-colors"
          >
            <ChevronDown 
              className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Card Metrics */}
      <div className="signal-card__metrics">
        {showAIFeatures && metrics ? (
          <>
            <div className="signal-card__metric">
              <span className="signal-card__metric-label">Win:</span>
              <span className="signal-card__metric-value">{metrics.wins}%</span>
            </div>
            <div className="signal-card__metric">
              <span className="signal-card__metric-label">P&L:</span>
              <span className="signal-card__metric-value">
                {formatPnL(metrics.pnlPercent)}
              </span>
            </div>
            <div className="signal-card__metric">
              <span className="signal-card__metric-label">Pos:</span>
              <span className="signal-card__metric-value">
                {signal.metrics?.activePositions || 0}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="signal-card__metric">
              <span className="signal-card__metric-label">Signals:</span>
              <span className="signal-card__metric-value">
                {signal.metrics?.totalSignals || 0}
              </span>
            </div>
            <div className="signal-card__metric">
              <span className="signal-card__metric-label">Interval:</span>
              <span className="signal-card__metric-value">
                {signal.filter?.refreshInterval || '15m'}
              </span>
            </div>
            <div className="signal-card__metric">
              <span className="signal-card__metric-label">Last:</span>
              <span className="signal-card__metric-value">
                {formatTime(lastSignalDate || undefined)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Expandable Content */}
      {expanded && canView && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          {/* Description */}
          <p className="text-sm text-gray-400 mb-3">
            {signal.description || 'No description available'}
          </p>

          {/* Filter Conditions */}
          {!signal.isBuiltIn && signal.filter?.description && signal.filter.description.length > 0 && (
            <div className="mb-3">
              <h5 className="text-xs font-medium text-gray-500 mb-2">Conditions:</h5>
              <div className="space-y-1">
                {signal.filter.description.slice(0, 3).map((desc, i) => (
                  <div key={i} className="flex items-start gap-1 text-xs text-gray-400">
                    <span className="text-lime-500 mt-0.5">•</span>
                    <span>{desc}</span>
                  </div>
                ))}
                {signal.filter.description.length > 3 && (
                  <div className="text-xs text-gray-500 ml-3">
                    +{signal.filter.description.length - 3} more conditions
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Trigger History */}
          {mockTriggers.length > 0 && (
            <TriggerHistory 
              triggers={mockTriggers}
              maxItems={3}
              showViewAll={false}
            />
          )}

          {/* AI Features for Elite */}
          {showAIFeatures && signal.strategy?.modelTier && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">AI Model:</span>
                <span className="text-cyan-400 uppercase">{signal.strategy.modelTier}</span>
              </div>
              {signal.strategy.aiAnalysisLimit && (
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-gray-500">Analysis Depth:</span>
                  <span className="text-gray-400">{signal.strategy.aiAnalysisLimit} bars</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default SignalCardEnhanced;