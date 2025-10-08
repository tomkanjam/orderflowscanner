import React, { useState } from 'react';
import { Power, Cloud, CloudOff, MoreVertical, Radio, Sparkles, ChevronDown } from 'lucide-react';

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
  const [cloudEnabled, setCloudEnabled] = useState(signal.cloudEnabled || false);

  const activityColor = signal.signalCount > 10 ? 'bg-primary' :
                       signal.signalCount > 0 ? 'bg-primary-400' :
                       'bg-base-400';

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
        {/* Activity dot */}
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${activityColor}`}
          title="Activity indicator"
        />

        {/* Type icon */}
        <div className="flex-shrink-0 text-muted-foreground">
          {signal.isBuiltIn ? (
            <Radio className="w-4 h-4" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
        </div>

        {/* Name */}
        <span className="flex-1 truncate text-sm font-medium text-foreground min-w-0">
          {signal.name}
        </span>

        {/* Running toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEnabled(!enabled);
          }}
          className="w-5 h-5 flex-shrink-0 transition-colors hover:scale-110"
          title={enabled ? 'Disable' : 'Enable'}
        >
          <Power className={`w-4 h-4 ${enabled ? 'text-primary' : 'text-base-400'}`} />
        </button>

        {/* Cloud toggle */}
        {!signal.isBuiltIn && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCloudEnabled(!cloudEnabled);
            }}
            className="w-5 h-5 flex-shrink-0 transition-colors hover:scale-110"
            title={cloudEnabled ? 'Deployed to cloud' : 'Deploy to cloud'}
          >
            {cloudEnabled ? (
              <Cloud className="w-4 h-4 text-blue-400" />
            ) : (
              <CloudOff className="w-4 h-4 text-base-400" />
            )}
          </button>
        )}

        {/* Expand indicator */}
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />

        {/* Menu */}
        <button
          onClick={(e) => e.stopPropagation()}
          className="w-5 h-5 flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
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

          {/* Recent Triggers */}
          {signal.recentTriggers && signal.recentTriggers.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-foreground mb-2">
                Recent Triggers:
              </h5>
              <div className="space-y-1">
                {signal.recentTriggers.map((trigger, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs font-mono"
                  >
                    <span className="text-foreground">{trigger.symbol}</span>
                    <span className="text-muted-foreground">{trigger.time}</span>
                    <span className="text-muted-foreground">{trigger.price}</span>
                    <span className={trigger.change.startsWith('+') ? 'text-green-500' : 'text-red-500'}>
                      {trigger.change}
                    </span>
                  </div>
                ))}
              </div>
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
