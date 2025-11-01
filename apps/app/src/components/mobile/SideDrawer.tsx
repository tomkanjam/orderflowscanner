import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useSwipeGesture } from './hooks/useGestures';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const SideDrawer: React.FC<SideDrawerProps> = ({
  isOpen,
  onClose,
  children
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Setup swipe-to-close gesture
  const swipeRef = useSwipeGesture<HTMLDivElement>({
    onSwipeLeft: onClose,
    threshold: 100
  });

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="fixed top-0 left-0 bottom-0 w-[85vw] max-w-[360px] bg-background z-50 shadow-2xl animate-slide-in-left"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition-colors z-10"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Drawer Content */}
        <div className="h-full overflow-y-auto">
          {children}
        </div>
      </div>
    </>
  );
};
