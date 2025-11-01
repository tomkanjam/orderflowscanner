import { useRef, useCallback, RefObject } from 'react';

interface TouchPoint {
  x: number;
  y: number;
  timestamp: number;
}

interface SwipeGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // Minimum distance in pixels to trigger swipe
  velocityThreshold?: number; // Minimum velocity (px/ms) to trigger swipe
}

interface LongPressOptions {
  onLongPress: (x: number, y: number) => void;
  delay?: number; // Delay in ms before triggering long press (default: 500ms)
  moveThreshold?: number; // Max movement in pixels before canceling (default: 10px)
}

/**
 * Hook for handling swipe gestures on mobile
 * @param options - Swipe gesture configuration
 * @returns Ref to attach to the element
 */
export function useSwipeGesture<T extends HTMLElement>(
  options: SwipeGestureOptions
): RefObject<T> {
  const ref = useRef<T>(null);
  const touchStart = useRef<TouchPoint | null>(null);

  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
    velocityThreshold = 0.3,
  } = options;

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      timestamp: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!touchStart.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStart.current.x;
      const deltaY = touch.clientY - touchStart.current.y;
      const deltaTime = Date.now() - touchStart.current.timestamp;

      const velocityX = Math.abs(deltaX) / deltaTime;
      const velocityY = Math.abs(deltaY) / deltaTime;

      // Determine primary direction
      const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);

      if (isHorizontal) {
        // Horizontal swipe
        if (Math.abs(deltaX) > threshold && velocityX > velocityThreshold) {
          if (deltaX > 0) {
            onSwipeRight?.();
          } else {
            onSwipeLeft?.();
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(deltaY) > threshold && velocityY > velocityThreshold) {
          if (deltaY > 0) {
            onSwipeDown?.();
          } else {
            onSwipeUp?.();
          }
        }
      }

      touchStart.current = null;
    },
    [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold, velocityThreshold]
  );

  // Attach event listeners
  if (ref.current) {
    ref.current.addEventListener('touchstart', handleTouchStart, { passive: true });
    ref.current.addEventListener('touchend', handleTouchEnd, { passive: true });
  }

  return ref;
}

/**
 * Hook for handling long press gestures on mobile
 * @param options - Long press configuration
 * @returns Object with touch event handlers
 */
export function useLongPress(options: LongPressOptions) {
  const { onLongPress, delay = 500, moveThreshold = 10 } = options;

  const touchStart = useRef<TouchPoint | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        timestamp: Date.now(),
      };

      // Set timer for long press
      longPressTimer.current = setTimeout(() => {
        if (touchStart.current) {
          onLongPress(touchStart.current.x, touchStart.current.y);
        }
      }, delay);
    },
    [onLongPress, delay]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStart.current) return;

      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStart.current.x);
      const deltaY = Math.abs(touch.clientY - touchStart.current.y);

      // Cancel long press if moved too much
      if (deltaX > moveThreshold || deltaY > moveThreshold) {
        if (longPressTimer.current) {
          clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        touchStart.current = null;
      }
    },
    [moveThreshold]
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStart.current = null;
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}

/**
 * Hook for handling pinch-to-zoom gestures
 * @param onPinch - Callback with scale factor
 * @returns Touch event handlers
 */
export function usePinchZoom(onPinch: (scale: number) => void) {
  const initialDistance = useRef<number | null>(null);
  const lastScale = useRef<number>(1);

  const getDistance = (touch1: React.Touch, touch2: React.Touch): number => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      initialDistance.current = getDistance(e.touches[0], e.touches[1]);
      lastScale.current = 1;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && initialDistance.current !== null) {
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scale = currentDistance / initialDistance.current;

        // Only trigger if scale changed significantly (reduces jitter)
        if (Math.abs(scale - lastScale.current) > 0.01) {
          onPinch(scale);
          lastScale.current = scale;
        }
      }
    },
    [onPinch]
  );

  const handleTouchEnd = useCallback(() => {
    initialDistance.current = null;
    lastScale.current = 1;
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
