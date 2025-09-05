import { Trader } from '../abstractions/trader.interfaces';
import { AccessTier, SubscriptionTier } from '../types/subscription.types';

export const TIER_HIERARCHY = ['anonymous', 'free', 'pro', 'elite'] as const;

export function canAccessFeature(
  userTier: SubscriptionTier | 'anonymous' | null,
  requiredTier: AccessTier
): boolean {
  const tier = userTier || 'anonymous';
  const userLevel = TIER_HIERARCHY.indexOf(tier);
  const requiredLevel = TIER_HIERARCHY.indexOf(requiredTier);
  return userLevel >= requiredLevel;
}

export interface SignalAccess {
  canView: boolean;
  canViewDetails: boolean;
  canFavorite: boolean;
  canAnalyze: boolean;
  canTrade: boolean;
  canMonitor: boolean;
}

export function getSignalAccess(
  signal: Trader,
  userTier: SubscriptionTier | 'anonymous' | null
): SignalAccess {
  const tier = userTier || 'anonymous';
  const canView = canAccessFeature(tier, signal.accessTier);
  
  return {
    canView,
    canViewDetails: canView && tier !== 'anonymous',
    canFavorite: canView && tier !== 'anonymous',
    canAnalyze: canView && tier === 'elite',
    canTrade: canView && tier === 'elite',
    canMonitor: canView && tier === 'elite'
  };
}

export function getTierDisplayName(tier: SubscriptionTier | 'anonymous'): string {
  const displayNames = {
    anonymous: 'Guest',
    free: 'Free',
    pro: 'Pro',
    elite: 'Elite'
  };
  return displayNames[tier];
}

export function getTierColor(tier: SubscriptionTier | 'anonymous'): string {
  const colors = {
    anonymous: 'var(--tm-text-muted)',
    free: 'var(--tm-text-secondary)',
    pro: 'var(--tm-accent)',
    elite: 'var(--tm-warning)'
  };
  return colors[tier];
}

export function getTierBadgeClass(tier: SubscriptionTier | 'anonymous'): string {
  const classes = {
    anonymous: 'bg-gray-100 text-gray-600',
    free: 'bg-blue-100 text-blue-600',
    pro: 'bg-purple-100 text-purple-600',
    elite: 'bg-yellow-100 text-yellow-600'
  };
  return classes[tier];
}

export interface TierLimit {
  feature: string;
  limit: number | 'unlimited';
  used: number;
}

export function getTierLimits(
  tier: SubscriptionTier | 'anonymous',
  customSignalsCount: number = 0
): TierLimit[] {
  const limits: TierLimit[] = [];

  switch (tier) {
    case 'anonymous':
      limits.push({ feature: 'Built-in Signals', limit: 10, used: 0 });
      break;
    case 'free':
      limits.push({ feature: 'Built-in Signals', limit: 30, used: 0 });
      break;
    case 'pro':
      limits.push({ feature: 'Built-in Signals', limit: 'unlimited', used: 0 });
      limits.push({ feature: 'Custom Signals', limit: 10, used: customSignalsCount });
      break;
    case 'elite':
      limits.push({ feature: 'Built-in Signals', limit: 'unlimited', used: 0 });
      limits.push({ feature: 'Custom Signals', limit: 'unlimited', used: customSignalsCount });
      // AI features are hidden for now - Elite tier is secret
      break;
  }

  return limits;
}