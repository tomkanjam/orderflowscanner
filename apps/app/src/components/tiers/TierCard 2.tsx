/**
 * TierCard Component
 *
 * Displays a single pricing tier with features, pricing, and CTA button.
 * Used within TierSelectionModal to show available subscription tiers.
 */

import React, { useState } from 'react';
import { TierCardProps } from '../../constants/tiers';
import { joinWaitlist } from '../../api/waitlist';
import { useAuth } from '../../hooks/useAuth';
import { useSubscription } from '../../contexts/SubscriptionContext';

export const TierCard: React.FC<TierCardProps> = ({
  config,
  isCurrentTier,
  isIncludedInPlan = false,
  onClick
}) => {
  const { user } = useAuth();
  const { profile } = useSubscription();
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string>('');
  const [lastSubmitTime, setLastSubmitTime] = useState<number>(0);
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

    // Determine email source: profile email if logged in, else form input
    const emailToSubmit = user ? profile?.email : waitlistEmail;

    if (!emailToSubmit?.trim()) {
      setWaitlistError('Please enter your email');
      return;
    }

    // Client-side rate limiting (5 second throttle)
    const now = Date.now();
    if (now - lastSubmitTime < 5000) {
      setWaitlistError('Please wait a moment before trying again');
      return;
    }
    setLastSubmitTime(now);

    setIsSubmitting(true);
    setWaitlistError('');

    try {
      const result = await joinWaitlist(emailToSubmit);

      if (result.success) {
        setWaitlistSuccess(true);
        setWaitlistEmail('');
      } else {
        setWaitlistError(result.message);
      }

    } catch (error) {
      console.error('Failed to join waitlist:', error);
      setWaitlistError('Something went wrong. Please try again.');
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
              {/* Only show email input for anonymous users */}
              {!user && (
                <input
                  type="email"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="waitlist-input"
                  required
                  disabled={isSubmitting}
                />
              )}

              {/* Show current email for logged-in users */}
              {user && profile?.email && (
                <div className="waitlist-email-display">
                  <span className="email-icon">✉️</span>
                  <span className="email-text">{profile.email}</span>
                </div>
              )}

              {/* Error message */}
              {waitlistError && (
                <div className="waitlist-error">
                  {waitlistError}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                className={`tier-cta btn-primary ${isSubmitting ? 'btn-loading' : ''}`}
                disabled={isSubmitting || (!user && !waitlistEmail.trim())}
              >
                {isSubmitting ? (
                  <>
                    <span className="loading-spinner"></span>
                    <span>Joining...</span>
                  </>
                ) : (
                  'Join Waitlist'
                )}
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
