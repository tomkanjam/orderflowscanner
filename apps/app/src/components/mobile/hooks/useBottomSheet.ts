import { useState, useCallback, useRef, useEffect } from 'react';

export type BottomSheetState = 'hidden' | 'peek' | 'expanded' | 'fullscreen';

interface BottomSheetOptions {
  initialState?: BottomSheetState;
  peekHeight?: number; // Height in pixels for peek state
  expandedHeightPercent?: number; // Height as percentage of screen for expanded state
  onStateChange?: (state: BottomSheetState) => void;
  snapThreshold?: number; // Distance threshold for snapping to next state (default: 50px)
}

interface BottomSheetControls {
  state: BottomSheetState;
  height: number;
  setState: (state: BottomSheetState) => void;
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  backdropOpacity: number;
}

/**
 * Hook for managing bottom sheet state and interactions
 */
export function useBottomSheet(options: BottomSheetOptions = {}): BottomSheetControls {
  const {
    initialState = 'hidden',
    peekHeight = 200,
    expandedHeightPercent = 75,
    onStateChange,
    snapThreshold = 50,
  } = options;

  const [state, setState] = useState<BottomSheetState>(initialState);
  const [height, setHeight] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);

  const touchStartY = useRef<number>(0);
  const initialHeight = useRef<number>(0);
  const screenHeight = useRef<number>(window.innerHeight);

  // Update screen height on resize
  useEffect(() => {
    const handleResize = () => {
      screenHeight.current = window.innerHeight;
      // Recalculate height for current state
      setHeight(getHeightForState(state));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [state]);

  // Calculate height based on state
  const getHeightForState = useCallback(
    (targetState: BottomSheetState): number => {
      switch (targetState) {
        case 'hidden':
          return 0;
        case 'peek':
          return peekHeight;
        case 'expanded':
          return (screenHeight.current * expandedHeightPercent) / 100;
        case 'fullscreen':
          return screenHeight.current;
        default:
          return 0;
      }
    },
    [peekHeight, expandedHeightPercent]
  );

  // Update height when state changes
  useEffect(() => {
    setHeight(getHeightForState(state));
    onStateChange?.(state);
  }, [state, getHeightForState, onStateChange]);

  // Calculate backdrop opacity based on height
  const backdropOpacity = Math.min(height / screenHeight.current, 0.8);

  // Determine next state based on drag direction and current state
  const getNextState = useCallback(
    (dragDelta: number, currentState: BottomSheetState): BottomSheetState => {
      const isSwipeUp = dragDelta < -snapThreshold;
      const isSwipeDown = dragDelta > snapThreshold;

      if (!isSwipeUp && !isSwipeDown) {
        // Small movement, stay in current state
        return currentState;
      }

      // State transitions based on drag direction
      if (isSwipeUp) {
        // Swiping up (expanding)
        switch (currentState) {
          case 'hidden':
            return 'peek';
          case 'peek':
            return 'expanded';
          case 'expanded':
            return 'fullscreen';
          case 'fullscreen':
            return 'fullscreen';
          default:
            return currentState;
        }
      } else {
        // Swiping down (collapsing)
        switch (currentState) {
          case 'fullscreen':
            return 'expanded';
          case 'expanded':
            return 'peek';
          case 'peek':
            return 'hidden';
          case 'hidden':
            return 'hidden';
          default:
            return currentState;
        }
      }
    },
    [snapThreshold]
  );

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    initialHeight.current = height;
    setIsDragging(true);
  }, [height]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;

      const currentY = e.touches[0].clientY;
      const deltaY = touchStartY.current - currentY; // Positive = swipe up, negative = swipe down

      // Calculate new height with drag
      let newHeight = initialHeight.current + deltaY;

      // Clamp to valid range
      newHeight = Math.max(0, Math.min(newHeight, screenHeight.current));

      setHeight(newHeight);
    },
    [isDragging]
  );

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;

    const dragDelta = height - initialHeight.current;
    const nextState = getNextState(dragDelta, state);

    setState(nextState);
    setIsDragging(false);
  }, [isDragging, height, state, getNextState]);

  return {
    state,
    height,
    setState,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    backdropOpacity,
  };
}
