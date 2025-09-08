import React from 'react';
import { activityTracker } from '../../services/activityTracker';

export interface ActivityIndicatorProps {
  /** Timestamp of last activity */
  lastActivity?: number;
  /** Whether the signal was just triggered */
  triggered?: boolean;
  /** Whether there's an active position (Elite tier) */
  isActive?: boolean;
  /** Signal/Trader ID for activity tracking */
  signalId?: string;
  /** Custom className for styling */
  className?: string;
  /** Size of the indicator dot */
  size?: 'small' | 'medium' | 'large';
  /** Whether to show pulse animation */
  animate?: boolean;
}

/**
 * Activity Indicator Component
 * Displays a colored dot indicating the activity state of a signal/trader
 * Following the design spec: 8x8px default size
 */
export const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({
  lastActivity,
  triggered,
  isActive,
  signalId,
  className = '',
  size = 'medium',
  animate = true,
}) => {
  // Get activity state from tracker if signalId provided
  const activityState = signalId 
    ? activityTracker.getActivityState(signalId)
    : getActivityStateFromProps();

  function getActivityStateFromProps(): 'triggered' | 'recent' | 'active' | 'idle' {
    if (triggered) return 'triggered';
    if (isActive) return 'active';
    if (lastActivity) {
      const timeSince = Date.now() - lastActivity;
      if (timeSince < 60 * 1000) return 'triggered'; // < 1 minute
      if (timeSince < 5 * 60 * 1000) return 'recent'; // < 5 minutes
    }
    return 'idle';
  }

  // Determine size classes
  const sizeClasses = {
    small: 'w-1.5 h-1.5', // 6x6px
    medium: 'w-2 h-2',     // 8x8px (design spec)
    large: 'w-3 h-3',      // 12x12px
  };

  // Determine color and animation based on state
  const stateClasses = {
    triggered: 'bg-lime-500', // #C6FF00 approximation in Tailwind
    recent: 'bg-yellow-500',  // Warning color
    active: 'bg-green-500',   // Success color
    idle: 'bg-gray-500',      // Muted color
  };

  // Add pulse animation for certain states
  const shouldPulse = animate && (activityState === 'triggered' || activityState === 'active');

  return (
    <div
      className={`
        signal-card__status-dot
        ${sizeClasses[size]}
        ${stateClasses[activityState]}
        ${shouldPulse ? 'signal-card__status-dot--' + activityState : ''}
        rounded-full
        ${className}
      `}
      aria-label={`Activity: ${activityState}`}
      data-activity={activityState}
    />
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(ActivityIndicator);