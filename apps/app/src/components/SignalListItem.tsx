import React from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { Power, Cloud, CloudOff, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { activityTracker } from '../services/activityTracker';

interface SignalListItemProps {
  signal: Trader;
  isSelected: boolean;
  isFavorite: boolean;
  showCloudStatus?: boolean;
  cloudMachineStatus?: 'stopped' | 'provisioning' | 'starting' | 'running' | 'stopping' | 'error';
  canEdit?: boolean;
  canDelete?: boolean;
  onSelect?: () => void;
  onToggleEnable?: () => void;
  onToggleCloud?: () => void;
  onToggleFavorite?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Ultra-dense single-line list item for traders/signals
 * Height: 40px | Width: Flexible (min 280px, optimal 360px)
 */
export function SignalListItem({
  signal,
  isSelected,
  isFavorite,
  showCloudStatus = false,
  cloudMachineStatus = 'stopped',
  canEdit = false,
  canDelete = false,
  onSelect,
  onToggleEnable,
  onToggleCloud,
  onToggleFavorite,
  onEdit,
  onDelete,
}: SignalListItemProps) {
  // Get activity state
  const activityState = activityTracker.getActivityState(signal.id);

  // Format last trigger time
  const formatLastTrigger = (date: Date | undefined): string => {
    if (!date) return 'Never';
    const now = Date.now();
    const diff = now - date.getTime();

    if (diff < 60 * 1000) return 'Just now';
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
  };

  const lastTrigger = formatLastTrigger(signal.metrics?.lastSignalAt);

  // Activity dot color
  const getDotColor = () => {
    switch (activityState) {
      case 'triggered':
        return 'bg-primary';
      case 'high':
      case 'recent':
        return 'bg-primary-400';
      case 'idle':
        return 'bg-base-400';
      default:
        return 'bg-base-400';
    }
  };

  // Should dot animate?
  const shouldAnimate = activityState === 'triggered';

  return (
    <div
      className={`
        flex items-center gap-2 px-4 h-10
        cursor-pointer transition-all duration-150
        border-l-2 border-transparent
        ${isSelected ? 'bg-accent border-l-primary' : ''}
        ${!isSelected ? 'hover:bg-accent hover:border-l-primary' : ''}
      `}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-label={`${signal.name}, ${signal.isBuiltIn ? 'Signal' : 'Trader'}, ${signal.enabled ? 'Running' : 'Stopped'}`}
    >
      {/* Activity dot */}
      <div
        className={`
          w-2 h-2 rounded-full flex-shrink-0 transition-colors
          ${getDotColor()}
          ${shouldAnimate ? 'animate-pulse' : ''}
        `}
        title={`Activity: ${activityState}`}
      />

      {/* Name - takes available space */}
      <span
        className="flex-1 truncate text-sm font-medium text-foreground min-w-0"
        title={signal.name}
      >
        {signal.name}
      </span>

      {/* Type badge */}
      <span className="px-2 py-0.5 text-xs font-medium rounded bg-muted text-muted-foreground uppercase flex-shrink-0">
        {signal.isBuiltIn ? 'Signal' : 'Trader'}
      </span>

      {/* Running toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleEnable?.();
        }}
        className="w-5 h-5 flex-shrink-0 transition-colors hover:scale-110"
        title={signal.enabled ? 'Disable' : 'Enable'}
        aria-label={signal.enabled ? 'Disable signal' : 'Enable signal'}
      >
        <Power
          className={`w-4 h-4 ${signal.enabled ? 'text-primary' : 'text-base-400'}`}
        />
      </button>

      {/* Cloud toggle (Elite only, custom traders only) */}
      {showCloudStatus && !signal.isBuiltIn && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCloud?.();
          }}
          disabled={cloudMachineStatus !== 'running'}
          className="w-5 h-5 flex-shrink-0 transition-colors hover:scale-110 disabled:opacity-30 disabled:cursor-not-allowed"
          title={
            cloudMachineStatus !== 'running'
              ? 'Start cloud machine to enable'
              : signal.cloud_config?.enabledInCloud
              ? 'Deployed to cloud'
              : 'Deploy to cloud'
          }
          aria-label={signal.cloud_config?.enabledInCloud ? 'Deployed to cloud' : 'Not deployed'}
        >
          {signal.cloud_config?.enabledInCloud ? (
            <Cloud className="w-4 h-4 text-blue-400" />
          ) : (
            <CloudOff className="w-4 h-4 text-base-400" />
          )}
        </button>
      )}

      {/* Last trigger - hidden on mobile */}
      <span className="text-xs text-muted-foreground flex-shrink-0 hidden md:block w-14 text-right">
        {lastTrigger}
      </span>

      {/* Signal count - hidden on tablet and mobile */}
      <span className="text-xs font-mono text-muted-foreground flex-shrink-0 hidden lg:block w-8 text-right">
        ({signal.metrics?.totalSignals || 0})
      </span>

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
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.();
            }}
          >
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
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit?.();
              }}
            >
              <span className="mr-2">✏️</span>
              Edit
            </DropdownMenuItem>
          )}
          {canDelete && (
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.();
              }}
              className="text-destructive focus:text-destructive"
            >
              <span className="mr-2">🗑️</span>
              Delete
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.();
            }}
          >
            <span className="mr-2">📊</span>
            View Details
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
