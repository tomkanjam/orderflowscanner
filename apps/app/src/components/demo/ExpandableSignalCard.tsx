import React, { useState } from 'react';
import { Power, Cloud, CloudOff, MoreVertical, Radio, Sparkles, ChevronDown, Bell, Bot, Activity } from 'lucide-react';

export interface DemoSignal {
  id: string;
  name: string;
  description: string;
  category: string;
  isBuiltIn: boolean;
  enabled: boolean;
  cloudEnabled?: boolean;
  lastTrigger?: string;
  signalCount: number;
  conditions?: string[];
  recentTriggers?: Array<{
    symbol: string;
    time: string;
    price: string;
    change: string;
  }>;
}

interface ExpandableSignalCardProps {
  signal: DemoSignal;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export function ExpandableSignalCard({
  signal,
  isExpanded = false,
  onToggleExpand,
}: ExpandableSignalCardProps) {
  const [enabled, setEnabled] = useState(signal.enabled);

  // Name color based on running state
  const getNameColor = () => {
    return enabled ? 'text-primary' : 'text-foreground';
  };

  // Status badge color and text (only show special states)
  const getStatusBadge = () => {
    if (!enabled) return null; // Don't show status when not running

    if (signal.isBuiltIn) {
      // Signals: only show "Triggered" state
      if (signal.signalCount > 15) return { text: 'Triggered', color: 'text-green-500' };
      return null; // Don't show "Running"
    } else {
      // Traders: show "Watching" and "In trade" states only
      if (signal.signalCount > 20) return { text: 'In trade', color: 'text-green-500' };
      if (signal.signalCount > 10) return { text: 'Watching', color: 'text-cyan-500' };
      return null; // Don't show "Running"
    }
  };

  return (
    <div
      className={`
        border border-border rounded-lg overflow-hidden
        transition-all duration-200 ease-out
        hover:border-primary/50
        ${isExpanded ? 'bg-accent/30' : 'bg-card'}
      `}
    >
      {/* Collapsed Header */}
      <div
        className="flex items-center gap-2 px-3 h-10 cursor-pointer"
        onClick={onToggleExpand}
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
      </div>

      {/* Expanded Content */}
      <div
        className={`
          transition-all duration-200 ease-out
          ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
          overflow-hidden
        `}
      >
        <div className="px-4 pb-4 pt-2 space-y-3">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Status</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEnabled(!enabled);
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors"
            >
              <Power className={`w-4 h-4 ${enabled ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-sm">{enabled ? 'Running' : 'Stopped'}</span>
            </button>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed">
            {signal.description}
          </p>

          {/* Conditions */}
          {signal.conditions && signal.conditions.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-foreground mb-2">
                Conditions:
              </h5>
              <ul className="space-y-1">
                {signal.conditions.map((condition, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{condition}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Metadata */}
          <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>Last: {signal.lastTrigger || 'Never'}</span>
            <span>Signals: {signal.signalCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
