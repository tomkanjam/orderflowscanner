import React from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { SubscriptionTier } from '../types/subscription.types';
import { Sparkles, Zap, Crown } from 'lucide-react';

interface UpgradePromptProps {
  feature: string;
  requiredTier: SubscriptionTier;
  compact?: boolean;
  className?: string;
}

export function UpgradePrompt({ 
  feature, 
  requiredTier, 
  compact = false,
  className = '' 
}: UpgradePromptProps) {
  const { currentTier } = useSubscription();

  // Don't show if user already has access
  if (currentTier !== 'anonymous' && 
      ['free', 'pro', 'elite'].indexOf(currentTier) >= 
      ['free', 'pro', 'elite'].indexOf(requiredTier)) {
    return null;
  }

  const getTierIcon = (tier: SubscriptionTier) => {
    switch (tier) {
      case SubscriptionTier.FREE:
        return <Sparkles className="w-4 h-4" />;
      case SubscriptionTier.PRO:
        return <Zap className="w-4 h-4" />;
      case SubscriptionTier.ELITE:
        return <Crown className="w-4 h-4" />;
    }
  };

  const getTierBenefits = (tier: SubscriptionTier) => {
    switch (tier) {
      case SubscriptionTier.FREE:
        return [
          '30+ built-in signals',
          'Signal history',
          'Favorite signals'
        ];
      case SubscriptionTier.PRO:
        return [
          'Create 10 custom signals',
          'Email notifications',
          'All Free features'
        ];
      case SubscriptionTier.ELITE:
        return [
          'Unlimited custom signals',
          'AI signal analysis',
          'Automated trading',
          'Priority support'
        ];
    }
  };

  if (compact) {
    return (
      <button className={`inline-flex items-center gap-2 px-3 py-1 text-sm rounded-lg
        bg-[var(--tm-bg-tertiary)] text-[var(--tm-accent)] 
        hover:bg-[var(--tm-accent)] hover:text-[var(--tm-text-inverse)]
        transition-colors ${className}`}
      >
        {getTierIcon(requiredTier)}
        <span>Upgrade to {requiredTier}</span>
      </button>
    );
  }

  return (
    <div className={`p-6 rounded-lg bg-gradient-to-br from-[var(--tm-bg-secondary)] to-[var(--tm-bg-tertiary)]
      border border-[var(--tm-border-light)] ${className}`}
    >
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-[var(--tm-accent)]/10 text-[var(--tm-accent)]">
          {getTierIcon(requiredTier)}
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-[var(--tm-text-primary)] mb-2">
            {currentTier === 'anonymous' ? 'Sign in' : 'Upgrade'} to access {feature}
          </h3>
          <p className="text-sm text-[var(--tm-text-secondary)] mb-4">
            {requiredTier} tier includes:
          </p>
          <ul className="space-y-2 mb-4">
            {getTierBenefits(requiredTier).map((benefit, index) => (
              <li key={index} className="flex items-center gap-2 text-sm text-[var(--tm-text-secondary)]">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--tm-accent)]" />
                {benefit}
              </li>
            ))}
          </ul>
          <button className="tm-btn tm-btn-primary">
            {currentTier === 'anonymous' ? 'Sign In' : `Upgrade to ${requiredTier}`}
          </button>
        </div>
      </div>
    </div>
  );
}