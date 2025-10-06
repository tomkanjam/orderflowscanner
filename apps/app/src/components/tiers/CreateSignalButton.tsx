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
        {/* AI Sparkle icon - similar to Google's AI sparkle */}
        <path
          d="M12 1L13.5 6.5L19 8L13.5 9.5L12 15L10.5 9.5L5 8L10.5 6.5L12 1Z"
          fill="currentColor"
        />
        <path
          d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z"
          fill="currentColor"
        />
      </svg>
      <span>Create Signal with AI</span>
    </button>
  );
};
