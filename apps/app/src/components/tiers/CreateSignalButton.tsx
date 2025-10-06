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
      <svg
        className="btn-icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
          fill="currentColor"
        />
      </svg>
      <span>Create Signal with AI</span>
    </button>
  );
};
