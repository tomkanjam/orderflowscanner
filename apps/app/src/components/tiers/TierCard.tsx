/**
 * TierCard Component
 *
 * Displays a single pricing tier with features, pricing, and CTA button.
 * Used within TierSelectionModal to show available subscription tiers.
 */

import React, { useState } from 'react';
import { TierCardProps } from '../../constants/tiers';

export const TierCard: React.FC<TierCardProps> = ({
  config,
  isCurrentTier,
  isIncludedInPlan = false,
  onClick
}) => {
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  // Determine card styling classes based on configuration
  const getCardClasses = (): string => {
    const baseClasses = 'or-card tier-card';

    if (config.isLocked) {
      return `${baseClasses} tier-locked`;
    }

    if (config.highlighted && config.badge === 'recommended') {
      return `${baseClasses} tier-recommended`;
    }

    if (config.highlighted && config.badge === 'popular') {
      return `${baseClasses} tier-highlighted`;
    }

    return baseClasses;
  };

  // Determine badge styling
  const getBadgeClasses = (badgeType?: string): string => {
    if (!badgeType) return '';

    const baseClasses = 'tier-badge';

    switch (badgeType) {
      case 'current':
        return `${baseClasses} badge-current`;
      case 'popular':
        return `${baseClasses} badge-popular`;
      case 'recommended':
        return `${baseClasses} badge-recommended`;
      case 'locked':
        return `${baseClasses} badge-locked`;
      default:
        return baseClasses;
    }
  };

  // Determine CTA button styling
  const getCtaClasses = (): string => {
    const baseClasses = 'tier-cta';

    // If this is the current tier or included in plan, use a disabled style
    if (isCurrentTier || isIncludedInPlan) {
      return `${baseClasses} btn-current`;
    }

    if (config.ctaAction === 'auth' || config.ctaAction === 'upgrade') {
      return `${baseClasses} btn-primary`;
    }

    return `${baseClasses} btn-secondary`;
  };

  // Determine CTA button text
  const getCtaText = (): string => {
    if (isCurrentTier) {
      return 'Current Plan';
    }
    if (isIncludedInPlan) {
      return 'Included in Your Plan';
    }
    return config.ctaText;
  };

  // Format price display
  const formatPrice = (): JSX.Element => {
    if (config.price === 'free') {
      return <div className="tier-price">Free</div>;
    }

    if (config.price === 'coming-soon') {
      return <div className="tier-price">Coming Soon</div>;
    }

    return (
      <div className="tier-price">
        ${config.price}
        <span className="price-period">/month</span>
      </div>
    );
  };

  // Handle keyboard interaction
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!config.isLocked && config.ctaAction !== 'waitlist') {
        onClick();
      }
    }
  };

  // Handle waitlist form submission
  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!waitlistEmail.trim()) return;

    setIsSubmitting(true);

    try {
      // TODO: Implement actual waitlist API call here
      // For now, just simulate success
      await new Promise(resolve => setTimeout(resolve, 500));

      setWaitlistSuccess(true);
      setWaitlistEmail('');
    } catch (error) {
      console.error('Failed to join waitlist:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={getCardClasses()}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="article"
      aria-label={`${config.displayName} tier`}
    >
      {/* Tier Header */}
      <div className="tier-header">
        <div className="tier-name-row">
          <h3 className="tier-name">{config.displayName}</h3>

          {/* Show current badge if this is user's tier */}
          {isCurrentTier && (
            <span className={getBadgeClasses('current')}>
              CURRENT
            </span>
          )}

          {/* Show tier badge (popular, recommended, locked) */}
          {config.badge && !isCurrentTier && (
            <span className={getBadgeClasses(config.badge)}>
              {config.badge.toUpperCase()}
            </span>
          )}
        </div>

        {formatPrice()}
      </div>

      {/* Tier Description */}
      <p className="tier-description">{config.description}</p>

      {/* Features List */}
      <ul className="tier-features">
        {config.features.map((feature, index) => {
          // Check if this is a subtitle (like "Everything in X, plus:")
          const isSubtitle = feature.includes('Everything in');

          // Check if feature has special emoji (✨ for AI features)
          const hasSpecialEmoji = feature.includes('✨');

          return (
            <li
              key={index}
              className={isSubtitle ? 'feature-subtitle' : ''}
            >
              {!isSubtitle && (
                <span className={hasSpecialEmoji ? 'check highlight' : 'check'}>
                  {hasSpecialEmoji ? '✨' : '✓'}
                </span>
              )}
              <span dangerouslySetInnerHTML={{ __html: feature.replace('✨ ', '') }} />
            </li>
          );
        })}
      </ul>

      {/* CTA Section - Waitlist form for Pro tier, button for others */}
      {config.ctaAction === 'waitlist' && !isCurrentTier && !isIncludedInPlan ? (
        <form onSubmit={handleWaitlistSubmit} className="waitlist-form">
          {waitlistSuccess ? (
            <div className="waitlist-success">
              <span className="success-icon">✓</span>
              <p>You're on the waitlist!</p>
            </div>
          ) : (
            <>
              <input
                type="email"
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="Enter your email"
                className="waitlist-input"
                required
                disabled={isSubmitting}
              />
              <button
                type="submit"
                className="tier-cta btn-primary"
                disabled={isSubmitting || !waitlistEmail.trim()}
              >
                {isSubmitting ? 'Joining...' : 'Join Waitlist'}
              </button>
            </>
          )}
        </form>
      ) : (
        <button
          className={getCtaClasses()}
          onClick={onClick}
          disabled={config.isLocked || isCurrentTier || isIncludedInPlan}
          aria-label={`${getCtaText()} for ${config.displayName} tier`}
        >
          {getCtaText()}
        </button>
      )}
    </div>
  );
};
