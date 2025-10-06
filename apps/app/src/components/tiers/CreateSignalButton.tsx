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
          d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"
          fill="currentColor"
        />
      </svg>
      <span>Create Signal with AI</span>
    </button>
  );
};
