import React from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { AccessTier } from '../types/subscription.types';
import { Lock } from 'lucide-react';

interface TierGateProps {
  minTier: AccessTier;
  fallback?: React.ReactNode;
  showLock?: boolean;
  children: React.ReactNode;
}

export function TierGate({ 
  minTier, 
  fallback, 
  showLock = true,
  children 
}: TierGateProps) {
  const { canAccessTier } = useSubscription();

  if (!canAccessTier(minTier)) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (showLock) {
      return (
        <div className="flex items-center justify-center p-4 text-[var(--tm-text-muted)]">
          <Lock className="w-4 h-4 mr-2" />
          <span className="text-sm">
            {minTier === 'free' && 'Sign in to access'}
            {minTier === 'pro' && 'Upgrade to Pro'}
            {/* Elite tier is secret - don't show upgrade prompt */}
            {minTier === 'elite' && 'Feature not available'}
          </span>
        </div>
      );
    }

    return null;
  }

  return <>{children}</>;
}