/**
 * CreateSignalButton Component
 *
 * Prominent button that opens the tier selection modal.
 * Displays at the top of the sidebar for all users (anonymous and authenticated).
 *
 * Design: Primary color button with Plus icon following Supabase style guide
 */

import React from 'react';
import { Plus } from 'lucide-react';
import { CreateSignalButtonProps } from '../../constants/tiers';

export const CreateSignalButton: React.FC<CreateSignalButtonProps> = ({
  onClick,
  className = ''
}) => {
  return (
    <button
      className={`w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-medium ${className}`}
      onClick={onClick}
      aria-label="Create custom signal with AI"
    >
      <Plus className="h-5 w-5" />
      <span>Create</span>
    </button>
  );
};
