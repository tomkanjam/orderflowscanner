/**
 * CreateSignalButton Component
 *
 * Prominent gradient button that opens the tier selection modal.
 * Displays at the top of the sidebar for all users (anonymous and authenticated).
 *
 * Design: Green/lime gradient with sparkle icon (✨)
 * Note: Uses green gradient per user feedback (NOT purple)
 */

import React from 'react';
import { CreateSignalButtonProps } from '../../constants/tiers';

export const CreateSignalButton: React.FC<CreateSignalButtonProps> = ({
  onClick,
  className = ''
}) => {
  return (
    <button
      className={`create-signal-btn ${className}`}
      onClick={onClick}
      aria-label="Create custom signal with AI"
    >
      <span className="btn-icon" aria-hidden="true">
        ✨
      </span>
      <span>Create Signal with AI</span>
    </button>
  );
};
