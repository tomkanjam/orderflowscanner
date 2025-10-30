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

/**
 * Filter traders based on user's tier access for VISIBILITY only.
 * Users can see their own custom traders regardless of tier.
 *
 * Rules:
 * - Users can always VIEW their own custom signals (userId matches)
 * - Built-in signals require tier >= signal.accessTier
 * - Invalid inputs return empty array (fail-secure)
 *
 * @param traders - Array of traders to filter
 * @param userTier - User's subscription tier (or 'anonymous' or null)
 * @param userId - User's ID (or null for anonymous)
 * @returns Filtered array of visible traders
 */
export function filterTradersByTierAccess(
  traders: Trader[],
  userTier: SubscriptionTier | 'anonymous' | null,
  userId: string | null
): Trader[] {
  // Validate inputs - fail secure
  if (!traders || !Array.isArray(traders)) {
    console.warn('[tierAccess] Invalid traders array, returning empty array');
    return [];
  }

  // Normalize tier
  const normalizedTier = userTier || 'anonymous';

  // Filter traders
  const filtered = traders.filter(trader => {
    // Validate trader object
    if (!trader || typeof trader !== 'object') {
      console.warn('[tierAccess] Invalid trader object, skipping:', trader);
      return false;
    }

    // Rule 1: Users can always VIEW their own custom signals (but not necessarily enable them)
    // Custom signals are identified by having a userId
    if (trader.userId && trader.userId === userId) {
      return true;
    }

    // Rule 2: Built-in signals require tier access
    // Built-in signals have isBuiltIn = true or no userId
    const requiredTier = trader.accessTier || 'free';
    const hasAccess = canAccessFeature(normalizedTier, requiredTier);

    if (!hasAccess) {
      console.log(
        `[tierAccess] Filtered out trader "${trader.name}" (requires ${requiredTier}, user has ${normalizedTier})`
      );
    }

    return hasAccess;
  });

  console.log(
    `[tierAccess] Filtered ${traders.length} traders → ${filtered.length} visible (tier: ${normalizedTier}, userId: ${userId || 'null'})`
  );

  return filtered;
}

/**
 * Check if user can ENABLE/RUN a specific trader based on their tier.
 * This is stricter than visibility - enforces quota limits for custom traders.
 *
 * Tier Limits:
 * - Anonymous: Cannot enable any traders
 * - Free: Cannot enable any custom traders (0 quota)
 * - Pro: Can enable up to 10 custom traders
 * - Elite: Can enable unlimited custom traders
 *
 * @param trader - The trader to check
 * @param userTier - User's subscription tier (or 'anonymous' or null)
 * @param userId - User's ID (or null for anonymous)
 * @param currentEnabledCount - How many custom traders the user currently has enabled
 * @returns Object with canEnable boolean and optional reason string
 */
export function canEnableTrader(
  trader: Trader,
  userTier: SubscriptionTier | 'anonymous' | null,
  userId: string | null,
  currentEnabledCount: number = 0
): { canEnable: boolean; reason?: string } {
  const tier = userTier || 'anonymous';

  // Built-in traders: only need tier access
  if (trader.isBuiltIn) {
    const hasAccess = canAccessFeature(tier, trader.accessTier);
    return {
      canEnable: hasAccess,
      reason: hasAccess ? undefined : `Requires ${trader.accessTier} tier or higher`
    };
  }

  // Custom traders: check ownership and quota
  if (trader.userId !== userId) {
    return {
      canEnable: false,
      reason: 'You can only enable your own custom traders'
    };
  }

  // Check tier quota for custom traders
  const tierLimits = {
    anonymous: 0,
    free: 0,
    pro: 10,
    elite: Infinity
  };

  const maxTraders = tierLimits[tier];

  // If trader is already enabled, don't count it in the limit check
  const effectiveEnabledCount = trader.enabled ? currentEnabledCount - 1 : currentEnabledCount;

  if (effectiveEnabledCount >= maxTraders) {
    if (maxTraders === 0) {
      return {
        canEnable: false,
        reason: `${tier === 'anonymous' ? 'Sign in and upgrade' : 'Upgrade'} to Pro to enable custom traders`
      };
    } else {
      return {
        canEnable: false,
        reason: `You've reached the limit of ${maxTraders} custom traders for ${tier} tier. Upgrade to Elite for unlimited.`
      };
    }
  }

  return { canEnable: true };
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
    anonymous: 'var(--nt-text-muted)',
    free: 'var(--nt-text-secondary)',
    pro: 'var(--nt-accent-lime)',
    elite: 'var(--nt-warning)'
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