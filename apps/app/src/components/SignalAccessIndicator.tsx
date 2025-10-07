import React from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { useSubscription } from '../contexts/SubscriptionContext';
import { getSignalAccess, getTierDisplayName, getTierBadgeClass } from '../utils/tierAccess';
import { Lock, Sparkles, Zap, Crown } from 'lucide-react';

interface SignalAccessIndicatorProps {
  signal: Trader;
  showLock?: boolean;
  className?: string;
}

export function SignalAccessIndicator({ 
  signal, 
  showLock = true,
  className = '' 
}: SignalAccessIndicatorProps) {
  const { currentTier } = useSubscription();
  const access = getSignalAccess(signal, currentTier);

  if (!signal.isBuiltIn) {
    return null; // Don't show indicator for user-created signals
  }

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'free':
        return <Sparkles className="w-3 h-3" />;
      case 'pro':
        return <Zap className="w-3 h-3" />;
      case 'elite':
        return <Crown className="w-3 h-3" />;
      default:
        return null;
    }
  };

  const tierClass = getTierBadgeClass(signal.accessTier);
  const isLocked = !access.canView;

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {isLocked && showLock && (
        <Lock className="w-3 h-3 text-[var(--nt-text-muted)]" />
      )}
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${tierClass}`}>
        {getTierIcon(signal.accessTier)}
        {getTierDisplayName(signal.accessTier)}
      </span>
    </div>
  );
}