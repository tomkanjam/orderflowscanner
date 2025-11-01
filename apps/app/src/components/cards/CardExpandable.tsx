import React, { useRef, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface CardExpandableProps {
  /** Whether the card is expanded */
  expanded: boolean;
  /** Callback when expand/collapse is toggled */
  onToggle?: () => void;
  /** Children to render when expanded */
  children: React.ReactNode;
  /** Maximum height when expanded (default based on variant) */
  maxHeight?: number;
  /** Card variant for height calculation */
  variant?: 'signal' | 'trader';
  /** Whether the card is currently animating */
  isAnimating?: boolean;
  /** Custom className for the container */
  className?: string;
  /** Whether to show the expand icon */
  showIcon?: boolean;
  /** Custom expand icon */
  icon?: React.ReactNode;
}

/**
 * CardExpandable Component
 * Manages smooth expand/collapse animations for card content
 * Heights: 280px for signals, 328px for traders (per design spec)
 */
export const CardExpandable: React.FC<CardExpandableProps> = ({
  expanded,
  onToggle,
  children,
  maxHeight,
  variant = 'signal',
  isAnimating = false,
  className = '',
  showIcon = true,
  icon,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Default heights from design spec
  const defaultMaxHeight = variant === 'trader' ? 328 : 280;
  const finalMaxHeight = maxHeight ?? defaultMaxHeight;

  // Calculate content height on mount and when children change
  useEffect(() => {
    if (contentRef.current) {
      const height = contentRef.current.scrollHeight;
      setContentHeight(height);
      setIsOverflowing(height > 0);
    }
  }, [children]);

  // Determine the actual height to use
  const expandedHeight = Math.min(contentHeight, finalMaxHeight);

  return (
    <>
      {/* Expand/Collapse Icon */}
      {showIcon && onToggle && (
        <button
          onClick={onToggle}
          className="absolute top-4 right-4 p-1 rounded hover:bg-muted/50 transition-colors"
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {icon || (
            <ChevronDown
              className={`
                w-4 h-4 text-muted-foreground transition-transform duration-200
                ${expanded ? 'rotate-180' : ''}
              `}
            />
          )}
        </button>
      )}

      {/* Expandable Content Container */}
      <div
        className={`
          overflow-hidden
          transition-all duration-200 ease-out
          ${isAnimating ? 'pointer-events-none' : ''}
          ${className}
        `}
        style={{
          maxHeight: expanded ? `${expandedHeight}px` : '0px',
          opacity: expanded ? 1 : 0,
        }}
        data-expanded={expanded}
        data-variant={variant}
      >
        <div 
          ref={contentRef}
          className="pt-3"
        >
          {children}
        </div>
      </div>
    </>
  );
};

// Export a memoized version to prevent unnecessary re-renders
export default React.memo(CardExpandable);