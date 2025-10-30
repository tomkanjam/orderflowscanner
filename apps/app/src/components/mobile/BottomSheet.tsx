import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { useBottomSheet, BottomSheetState } from './hooks/useBottomSheet';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  initialState?: BottomSheetState;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  children,
  title,
  initialState = 'peek',
}) => {
  const {
    state,
    height,
    setState,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    backdropOpacity,
  } = useBottomSheet({
    initialState: isOpen ? initialState : 'hidden',
    peekHeight: 200,
    expandedHeightPercent: 75,
    onStateChange: (newState) => {
      if (newState === 'hidden') {
        onClose();
      }
    },
  });

  // Update state when isOpen changes
  useEffect(() => {
    if (isOpen && state === 'hidden') {
      setState(initialState);
    } else if (!isOpen && state !== 'hidden') {
      setState('hidden');
    }
  }, [isOpen, state, setState, initialState]);

  // Prevent body scroll when open
  useEffect(() => {
    if (state !== 'hidden') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [state]);

  if (state === 'hidden') return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black z-40 transition-opacity duration-300"
        style={{ opacity: backdropOpacity }}
        onClick={() => setState('hidden')}
      />

      {/* Bottom Sheet */}
      <div
        className="bottom-sheet fixed left-0 right-0 bottom-0 bg-background rounded-t-2xl shadow-2xl z-50 transition-transform duration-300 ease-out"
        style={{ height: `${height}px` }}
      >
        {/* Drag Handle */}
        <div
          className="pt-3 pb-2 cursor-grab active:cursor-grabbing"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="bottom-sheet-handle bg-muted-foreground/30 hover:bg-muted-foreground/50 transition-colors" />
        </div>

        {/* Header */}
        {title && (
          <div className="px-4 py-2 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button
              onClick={() => setState('hidden')}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className="bottom-sheet-content px-4 py-3">
          {children}
        </div>

        {/* Quick Actions (when in peek state) */}
        {state === 'peek' && (
          <div className="absolute bottom-4 right-4">
            <button
              onClick={() => setState('expanded')}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium shadow-lg"
            >
              View Details
            </button>
          </div>
        )}
      </div>
    </>
  );
};
