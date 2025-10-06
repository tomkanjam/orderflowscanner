/**
 * TierCard Component
 *
 * Displays a single pricing tier with features, pricing, and CTA button.
 * Used within TierSelectionModal to show available subscription tiers.
 */

import React from 'react';
import { TierCardProps } from '../../constants/tiers';

export const TierCard: React.FC<TierCardProps> = ({
  config,
  isCurrentTier,
  onClick
}) => {
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

    if (config.ctaAction === 'auth' || config.ctaAction === 'upgrade') {
      return `${baseClasses} btn-primary`;
    }

    return `${baseClasses} btn-secondary`;
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
      if (!config.isLocked) {
        onClick();
      }
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

      {/* CTA Button */}
      <button
        className={getCtaClasses()}
        onClick={onClick}
        disabled={config.isLocked}
        aria-label={`${config.ctaText} for ${config.displayName} tier`}
      >
        {config.ctaText}
      </button>
    </div>
  );
};
