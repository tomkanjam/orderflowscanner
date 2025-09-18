import { useEffect, useRef, useCallback } from 'react';
import { ResourceTracker } from '../memory/ResourceTracker';

/**
 * Custom hook for automatically tracking and cleaning up resources
 * Ensures all intervals, listeners, and other resources are properly managed
 */

interface TrackedResource {
  id: string;
  cleanup: () => void;
}

/**
 * Hook for tracking intervals with automatic cleanup
 */
export function useTrackedInterval(
  callback: () => void,
  delay: number | null,
  owner?: string
): void {
  const savedCallback = useRef(callback);
  const resourceId = useRef<string | null>(null);
  const tracker = ResourceTracker.getInstance();

  // Update callback ref when it changes
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    if (delay !== null && delay > 0) {
      const intervalId = setInterval(() => {
        savedCallback.current();
      }, delay);

      // Register with ResourceTracker
      resourceId.current = tracker.registerInterval(
        intervalId,
        owner || 'React Component',
        `Interval with ${delay}ms delay`
      );

      // Cleanup function
      return () => {
        if (resourceId.current) {
          tracker.unregister(resourceId.current);
          resourceId.current = null;
        }
        clearInterval(intervalId);
      };
    }
  }, [delay, owner, tracker]);
}

/**
 * Hook for tracking event listeners with automatic cleanup
 */
export function useTrackedEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  element: Window | Document | HTMLElement = window,
  options?: boolean | AddEventListenerOptions,
  owner?: string
): void {
  const savedHandler = useRef(handler);
  const resourceId = useRef<string | null>(null);
  const tracker = ResourceTracker.getInstance();

  // Update handler ref when it changes
  useEffect(() => {
    savedHandler.current = handler;
  }, [handler]);

  useEffect(() => {
    // Create event listener that calls the saved handler
    const eventListener = (event: Event) => {
      savedHandler.current(event as WindowEventMap[K]);
    };

    // Add event listener
    element.addEventListener(eventName as string, eventListener, options);

    // Register with ResourceTracker
    resourceId.current = tracker.registerListener(
      element,
      eventName as string,
      eventListener,
      owner || 'React Component'
    );

    // Cleanup function
    return () => {
      if (resourceId.current) {
        tracker.unregister(resourceId.current);
        resourceId.current = null;
      }
      element.removeEventListener(eventName as string, eventListener, options);
    };
  }, [eventName, element, options, owner, tracker]);
}

/**
 * Hook for tracking timeouts with automatic cleanup
 */
export function useTrackedTimeout(
  callback: () => void,
  delay: number | null,
  owner?: string
): void {
  const savedCallback = useRef(callback);
  const resourceId = useRef<string | null>(null);
  const tracker = ResourceTracker.getInstance();

  // Update callback ref when it changes
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay !== null && delay >= 0) {
      const timeoutId = setTimeout(() => {
        savedCallback.current();
        // Auto-unregister after execution
        if (resourceId.current) {
          tracker.unregister(resourceId.current);
          resourceId.current = null;
        }
      }, delay);

      // Register with ResourceTracker
      resourceId.current = tracker.registerTimeout(
        timeoutId,
        owner || 'React Component',
        `Timeout with ${delay}ms delay`
      );

      // Cleanup function
      return () => {
        if (resourceId.current) {
          tracker.unregister(resourceId.current);
          resourceId.current = null;
        }
        clearTimeout(timeoutId);
      };
    }
  }, [delay, owner, tracker]);
}

/**
 * Hook for manually tracking any resource
 */
export function useTrackedResource(
  setupResource: () => (() => void) | void,
  deps: React.DependencyList = [],
  owner?: string
): void {
  const resourceId = useRef<string | null>(null);
  const tracker = ResourceTracker.getInstance();

  useEffect(() => {
    const cleanup = setupResource();

    if (cleanup) {
      // Register the cleanup function with ResourceTracker
      resourceId.current = tracker.registerGeneric(
        cleanup,
        owner || 'React Component',
        'Custom resource'
      );
    }

    // Cleanup function
    return () => {
      if (resourceId.current) {
        tracker.unregister(resourceId.current);
        resourceId.current = null;
      }
      if (cleanup) {
        cleanup();
      }
    };
  }, deps);
}

/**
 * Hook to get current resource stats
 */
export function useResourceStats() {
  const tracker = ResourceTracker.getInstance();
  
  const getStats = useCallback(() => {
    return tracker.getStats();
  }, [tracker]);

  return getStats;
}