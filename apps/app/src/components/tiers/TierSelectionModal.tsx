/**
 * TierSelectionModal Component
 *
 * Modal dialog that displays all available pricing tiers and handles
 * user tier selection/upgrade flows.
 *
 * Flow:
 * - Anonymous users see all 4 tiers with Guest as current
 * - Free tier users see all 4 tiers with Starter as current
 * - Pro/Elite users see their current tier highlighted
 */

import React, { useEffect } from 'react';
import { TierSelectionModalProps, TIER_CONFIGS, TIER_MAPPING, SUBSCRIPTION_TO_TIER } from '../../constants/tiers';
import { TierCard } from './TierCard';
import { useSubscription } from '../../contexts/SubscriptionContext';

export const TierSelectionModal: React.FC<TierSelectionModalProps> = ({
  isOpen,
  onClose,
  onAuthRequired,
  onUpgradeRequired
}) => {
  const { currentTier, profile, subscription, loading } = useSubscription();

  // Get current tier ID for comparison
  const currentTierId = SUBSCRIPTION_TO_TIER[currentTier];

  // Debug logging when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log('=== TierSelectionModal Debug ===');
      console.log('currentTier:', currentTier);
      console.log('currentTierId:', currentTierId);
      console.log('subscription:', subscription);
      console.log('profile:', profile);
      console.log('loading:', loading);
      console.log('SUBSCRIPTION_TO_TIER mapping:', SUBSCRIPTION_TO_TIER);
      console.log('================================');
    }
  }, [isOpen, currentTier, currentTierId, subscription, profile, loading]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Handle tier action based on CTA
  const handleTierAction = (tierId: string, action: string) => {
    console.log(`[TierSelectionModal] Tier action: ${action} for tier: ${tierId}`);

    switch (action) {
      case 'close':
        // Guest tier - just close modal
        onClose();
        break;

      case 'auth':
        // Starter tier - trigger authentication flow
        onAuthRequired();
        onClose();
        break;

      case 'upgrade':
        // Lite tier - trigger upgrade flow
        onUpgradeRequired(tierId);
        onClose();
        break;

      case 'waitlist':
        // Pro tier - handle waitlist signup
        console.log('[TierSelectionModal] Waitlist feature not implemented yet');
        // TODO: Implement waitlist signup
        break;

      default:
        console.error(`[TierSelectionModal] Unknown action: ${action}`);
    }
  };

  // Handle click outside modal to close
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay active"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tier-modal-title"
    >
      <div className="modal-container">
        {/* Modal Header */}
        <div className="modal-header">
          <div>
            <h2 id="tier-modal-title" className="modal-title">
              Choose Your Plan
            </h2>
            <p className="modal-subtitle">
              Start creating custom signals with AI
            </p>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close tier selection modal"
          >
            ×
          </button>
        </div>

        {/* Modal Content - Tier Cards */}
        <div className="modal-content">
          {TIER_CONFIGS.map((tierConfig) => (
            <TierCard
              key={tierConfig.id}
              config={tierConfig}
              isCurrentTier={tierConfig.id === currentTierId}
              onClick={() => handleTierAction(tierConfig.id, tierConfig.ctaAction)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
