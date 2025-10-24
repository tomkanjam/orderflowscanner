import React from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { Power, Cloud, CloudOff, MoreVertical, Activity, Bot, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { activityTracker } from '../services/activityTracker';

interface ExpandableSignalCardProps {
  signal: Trader;
  isExpanded?: boolean;
  isSelected?: boolean;
  isFavorite?: boolean;
  showCloudStatus?: boolean;
  cloudMachineStatus?: 'stopped' | 'provisioning' | 'starting' | 'running' | 'stopping' | 'error';
  canEdit?: boolean;
  canDelete?: boolean;
  onToggleExpand?: () => void;
  onSelect?: () => void;
  onToggleEnable?: () => void;
  onToggleCloud?: () => void;
  onToggleFavorite?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ExpandableSignalCard({
  signal,
  isExpanded = false,
  isSelected = false,
  isFavorite = false,
  showCloudStatus = false,
  cloudMachineStatus = 'stopped',
  canEdit = false,
  canDelete = false,
  onToggleExpand,
  onSelect,
  onToggleEnable,
  onToggleCloud,
  onToggleFavorite,
  onEdit,
  onDelete,
}: ExpandableSignalCardProps) {
  // Get activity state
  const activityState = activityTracker.getActivityState(signal.id);

  // Format last trigger time
  const formatLastTrigger = (date: Date | string | number | undefined): string => {
    if (!date) return 'Never';

    let timestamp: number;
    if (typeof date === 'number') {
      timestamp = date;
    } else if (typeof date === 'string') {
      timestamp = new Date(date).getTime();
    } else if (date instanceof Date) {
      timestamp = date.getTime();
    } else {
      return 'Never';
    }

    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
  };

  const lastTrigger = formatLastTrigger(signal.metrics?.lastSignalAt);

  // Name color based on running state
  const getNameColor = () => {
    return signal.enabled ? 'text-primary' : 'text-foreground';
  };

  // Status badge color and text (only show special states)
  const getStatusBadge = () => {
    if (!signal.enabled) return null; // Don't show status when not running

    if (signal.isBuiltIn) {
      // Signals: only show "Triggered" state
      if (activityState === 'triggered') return { text: 'Triggered', color: 'text-green-500' };
      return null; // Don't show "Running"
    } else {
      // Traders: show "Watching" and "In trade" states only
      if (activityState === 'triggered') return { text: 'In trade', color: 'text-green-500' };
      if (activityState === 'high' || activityState === 'recent') return { text: 'Watching', color: 'text-cyan-500' };
      return null; // Don't show "Running"
    }
  };

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={onToggleExpand}
      className={`
        border border-border rounded-lg overflow-hidden
        transition-all duration-200 ease-out
        hover:border-primary/50
        ${isExpanded ? 'bg-accent/30' : 'bg-card'}
        ${isSelected ? 'ring-2 ring-primary' : ''}
      `}
    >
      {/* Header - CollapsibleTrigger */}
      <CollapsibleTrigger asChild>
        <div
          className="flex items-center gap-2 px-3 h-10 cursor-pointer w-full"
          onClick={(e) => {
            onSelect?.();
          }}
        >
        {/* Type icon - no color */}
        <div className="flex-shrink-0 text-muted-foreground">
          {signal.isBuiltIn ? (
            <Activity className="w-4 h-4" title="Signal" />
          ) : (
            <Bot className="w-4 h-4" title="AI Trader" />
          )}
        </div>

        {/* Name - colored when running */}
        <span className={`flex-1 truncate text-sm font-medium min-w-0 ${getNameColor()}`}>
          {signal.name}
        </span>

        {/* Status badge - only for special states */}
        {getStatusBadge() && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${getStatusBadge()!.color} ${
            getStatusBadge()!.color === 'text-cyan-500'
              ? 'bg-cyan-500/10 border border-cyan-500/20'
              : 'bg-green-500/10 border border-green-500/20'
          }`}>
            {getStatusBadge()!.text}
          </span>
        )}

        {/* Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="w-5 h-5 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Open menu"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {/* Info section */}
            <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border">
              <div className="flex items-center gap-2">
                {signal.isBuiltIn ? (
                  <>
                    <Activity className="w-3 h-3" />
                    <span>Signal</span>
                  </>
                ) : (
                  <>
                    <Bot className="w-3 h-3" />
                    <span>AI Trader</span>
                  </>
                )}
              </div>
              <div className="mt-1">Last: {lastTrigger}</div>
              <div>Signals: {signal.metrics?.totalSignals || 0}</div>
            </div>

            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleEnable?.(); }}>
              <Power className="w-3 h-3 mr-2" />
              {signal.enabled ? 'Disable' : 'Enable'}
            </DropdownMenuItem>
            {showCloudStatus && !signal.isBuiltIn && (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onToggleCloud?.(); }}
                disabled={cloudMachineStatus !== 'running'}
              >
                {signal.cloud_config?.enabledInCloud ? (
                  <><Cloud className="w-3 h-3 mr-2" />Disable Cloud</>
                ) : (
                  <><CloudOff className="w-3 h-3 mr-2" />Enable Cloud</>
                )}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(); }}>
              {isFavorite ? (
                <>
                  <span className="mr-2">☆</span>
                  Unfavorite
                </>
              ) : (
                <>
                  <span className="mr-2">⭐</span>
                  Favorite
                </>
              )}
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit?.(); }}>
                <span className="mr-2">✏️</span>
                Edit
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                className="text-destructive focus:text-destructive"
              >
                <span className="mr-2">🗑️</span>
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </CollapsibleTrigger>

      {/* Expanded Content */}
      <CollapsibleContent className="overflow-y-auto overflow-x-hidden max-h-96">
        <div className="px-4 pb-4 pt-2 space-y-3">
          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {signal.description || 'No description available'}
          </p>

          {/* Conditions */}
          {signal.filter?.description && signal.filter.description.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-foreground mb-2">Conditions:</h5>
              <ul className="space-y-1">
                {signal.filter.description.map((condition, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{condition}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Strategy Info (Elite tier) */}
          {!signal.isBuiltIn && signal.strategy && (
            <div className="pt-2 border-t border-border">
              <h5 className="text-xs font-semibold text-foreground mb-2">AI Configuration:</h5>
              <div className="space-y-1 text-xs text-muted-foreground">
                {signal.strategy.modelTier && (
                  <div>Model: <span className="text-primary uppercase">{signal.strategy.modelTier}</span></div>
                )}
                {signal.strategy.aiAnalysisLimit && (
                  <div>Analysis Depth: {signal.strategy.aiAnalysisLimit} bars</div>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Last: {lastTrigger}</span>
            <span>Signals: {signal.metrics?.totalSignals || 0}</span>
            {signal.category && <span className="uppercase tracking-wider">{signal.category}</span>}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
