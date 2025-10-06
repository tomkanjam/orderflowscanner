/**
 * Tier Selection Modal - Static Configuration
 *
 * This file contains all tier definitions and related types for the
 * tier selection modal. The configuration drives the pricing cards
 * and user upgrade flows.
 */

import { SubscriptionTier } from '../types/subscription.types';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Tier configuration for pricing cards
 */
export interface TierConfig {
  /** Unique identifier for the tier */
  id: 'guest' | 'starter' | 'lite' | 'pro';

  /** Internal name */
  name: string;

  /** Display name shown in UI */
  displayName: string;

  /** Price (number for paid tiers, 'free' for free tiers, 'coming-soon' for unreleased) */
  price: number | 'free' | 'coming-soon';

  /** Formatted price display string */
  priceDisplay: string;

  /** Optional badge to show on the tier card */
  badge?: 'current' | 'popular' | 'recommended' | 'locked';

  /** List of features included in this tier */
  features: string[];

  /** Call-to-action button text */
  ctaText: string;

  /** Action to take when CTA is clicked */
  ctaAction: 'close' | 'auth' | 'upgrade' | 'waitlist';

  /** Brief description of the tier */
  description: string;

  /** Whether this tier should be visually highlighted */
  highlighted?: boolean;

  /** Whether this tier is locked/unavailable */
  isLocked?: boolean;
}

/**
 * Props for TierSelectionModal component
 */
export interface TierSelectionModalProps {
  /** Whether the modal is open */
  isOpen: boolean;

  /** Callback when modal should close */
  onClose: () => void;

  /** Callback when authentication is required (Starter tier) */
  onAuthRequired: () => void;

  /** Callback when upgrade is required (Lite tier) */
  onUpgradeRequired: (tierId: string) => void;
}

/**
 * Props for TierCard component
 */
export interface TierCardProps {
  /** Tier configuration */
  config: TierConfig;

  /** Whether this is the user's current tier */
  isCurrentTier: boolean;

  /** Callback when card CTA is clicked */
  onClick: () => void;
}

/**
 * Props for CreateSignalButton component
 */
export interface CreateSignalButtonProps {
  /** Callback when button is clicked */
  onClick: () => void;

  /** Optional additional CSS classes */
  className?: string;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Valid tier actions for validation
 */
export const VALID_ACTIONS = ['close', 'auth', 'upgrade', 'waitlist'] as const;

/**
 * Map tier IDs to SubscriptionTier enum values
 * Note: 'Lite' in the UI maps to 'pro' in the database
 */
export const TIER_MAPPING: Record<string, SubscriptionTier | 'anonymous'> = {
  guest: 'anonymous',
  starter: 'free',
  lite: 'pro',  // UI shows 'Lite' but DB uses 'pro'
  pro: 'elite'  // UI shows 'Pro' but DB uses 'elite' (coming soon)
};

/**
 * Reverse mapping: SubscriptionTier to tier ID
 */
export const SUBSCRIPTION_TO_TIER: Record<SubscriptionTier | 'anonymous', string> = {
  anonymous: 'guest',
  free: 'starter',
  pro: 'lite',
  elite: 'pro'
};

// ============================================================================
// Tier Configurations
// ============================================================================

/**
 * Complete tier configuration array
 * Order matters - displayed in this order in the modal
 */
export const TIER_CONFIGS: TierConfig[] = [
  // Guest Tier - Anonymous users
  {
    id: 'guest',
    name: 'Guest',
    displayName: 'GUEST',
    price: 'free',
    priceDisplay: 'Free',
    features: [
      'View all built-in signals',
      'Real-time price charts',
      'Basic market data',
      'Live signal triggers (view only)'
    ],
    ctaText: 'Continue as Guest',
    ctaAction: 'close',
    description: 'Browse signals without signing in'
  },

  // Starter Tier - Free with auth
  {
    id: 'starter',
    name: 'Starter',
    displayName: 'STARTER',
    price: 'free',
    priceDisplay: 'Free',
    badge: 'popular',
    features: [
      'Everything in Guest, plus:',
      'Sound notifications for signals',
      'Signal watchlist/favorites',
      'Signal trigger history',
      'Persistent preferences'
    ],
    ctaText: 'Sign In to Get Started',
    ctaAction: 'auth',
    description: 'Sign in with email to unlock notifications and history',
    highlighted: true
  },

  // Lite Tier - $39/month (AI signal creation)
  {
    id: 'lite',
    name: 'Lite',
    displayName: 'LITE',
    price: 39,
    priceDisplay: '$39/month',
    badge: 'recommended',
    features: [
      'Everything in Starter, plus:',
      '✨ Create custom signals with AI',
      'Up to 10 custom signals',
      'No coding required',
      'Natural language trading strategies',
      'Save and edit custom signals'
    ],
    ctaText: 'Upgrade to Lite',
    ctaAction: 'upgrade',
    description: 'Unlock AI-powered signal creation',
    highlighted: true
  },

  // Pro Tier - Coming soon (full AI trading)
  {
    id: 'pro',
    name: 'Pro',
    displayName: 'PRO',
    price: 'coming-soon',
    priceDisplay: 'Coming Soon',
    badge: 'locked',
    isLocked: true,
    features: [
      'Everything in Lite, plus:',
      '🤖 Fully autonomous AI trading',
      '☁️ Persistent signals (run 24/7)',
      '📧 Email/SMS/Telegram/Discord',
      '♾️ Unlimited custom signals',
      '📊 Advanced analytics'
    ],
    ctaText: 'Join Waitlist',
    ctaAction: 'waitlist',
    description: 'Full AI trading automation (in development)'
  }
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get tier config by ID
 */
export function getTierConfig(tierId: string): TierConfig | undefined {
  return TIER_CONFIGS.find(tier => tier.id === tierId);
}

/**
 * Get tier config by subscription tier
 */
export function getTierConfigBySubscription(
  subscriptionTier: SubscriptionTier | 'anonymous'
): TierConfig | undefined {
  const tierId = SUBSCRIPTION_TO_TIER[subscriptionTier];
  return getTierConfig(tierId);
}

/**
 * Validate tier action
 */
export function isValidTierAction(action: string): action is typeof VALID_ACTIONS[number] {
  return VALID_ACTIONS.includes(action as any);
}
