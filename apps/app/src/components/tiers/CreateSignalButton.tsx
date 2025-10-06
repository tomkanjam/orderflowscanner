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
        {/* Large star */}
        <path
          d="M12 2L14.5 7.5L20 8.5L16 12.5L17 18L12 15L7 18L8 12.5L4 8.5L9.5 7.5L12 2Z"
          fill="currentColor"
        />
        {/* Small star top right */}
        <circle cx="19" cy="5" r="1.5" fill="currentColor" />
        {/* Small star bottom left */}
        <circle cx="5" cy="19" r="1" fill="currentColor" />
        {/* Tiny star top left */}
        <circle cx="6" cy="6" r="0.8" fill="currentColor" />
      </svg>
      <span>Create Signal with AI</span>
    </button>
  );
};
