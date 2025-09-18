import { useState, useCallback, useRef, useEffect } from 'react';
import { BoundedMap, BoundedSet } from '../memory/BoundedCollections';
import { EvictionPolicy } from '../memory/BoundedCollections';

/**
 * Custom hook for managing bounded state collections
 * Automatically limits collection size and handles memory-aware updates
 */

interface BoundedStateOptions {
  maxSize: number;
  evictionPolicy?: EvictionPolicy;
  cleanupInterval?: number; // milliseconds
  maxAge?: number; // milliseconds for age-based cleanup
}

/**
 * Hook for bounded Map state with automatic eviction
 */
export function useBoundedMap<K, V>(
  initialData?: Map<K, V> | null,
  options: BoundedStateOptions = { maxSize: 1000 }
): [
  BoundedMap<K, V>,
  {
    set: (key: K, value: V) => void;
    delete: (key: K) => void;
    clear: () => void;
    getStats: () => { size: number; evictions: number };
  }
] {
  const [map] = useState(() => new BoundedMap<K, V>(
    options.maxSize,
    options.evictionPolicy || 'LRU'
  ));

  // Initialize with data if provided
  useEffect(() => {
    if (initialData) {
      initialData.forEach((value, key) => {
        map.set(key, value);
      });
    }
  }, []);

  // Setup cleanup interval if specified
  useEffect(() => {
    if (options.cleanupInterval && options.maxAge) {
      const interval = setInterval(() => {
        const cleanedCount = map.clearOlderThan(options.maxAge!);
        if (cleanedCount > 0) {
          console.log(`[useBoundedMap] Cleaned ${cleanedCount} old entries`);
        }
      }, options.cleanupInterval);

      return () => clearInterval(interval);
    }
  }, [map, options.cleanupInterval, options.maxAge]);

  const set = useCallback((key: K, value: V) => {
    map.set(key, value);
  }, [map]);

  const deleteKey = useCallback((key: K) => {
    map.delete(key);
  }, [map]);

  const clear = useCallback(() => {
    map.clear();
  }, [map]);

  const getStats = useCallback(() => {
    return {
      size: map.size,
      evictions: map.getEvictionCount()
    };
  }, [map]);

  return [map, { set, delete: deleteKey, clear, getStats }];
}

/**
 * Hook for bounded Set state with automatic eviction
 */
export function useBoundedSet<T>(
  initialData?: Set<T> | null,
  options: BoundedStateOptions = { maxSize: 1000 }
): [
  BoundedSet<T>,
  {
    add: (value: T) => void;
    delete: (value: T) => void;
    clear: () => void;
    getStats: () => { size: number; evictions: number };
  }
] {
  const [set] = useState(() => new BoundedSet<T>(
    options.maxSize,
    options.evictionPolicy || 'FIFO'
  ));

  // Initialize with data if provided
  useEffect(() => {
    if (initialData) {
      initialData.forEach(value => {
        set.add(value);
      });
    }
  }, []);

  // Setup cleanup interval if specified
  useEffect(() => {
    if (options.cleanupInterval && options.maxAge) {
      const interval = setInterval(() => {
        const cleanedCount = set.clearOlderThan(options.maxAge!);
        if (cleanedCount > 0) {
          console.log(`[useBoundedSet] Cleaned ${cleanedCount} old entries`);
        }
      }, options.cleanupInterval);

      return () => clearInterval(interval);
    }
  }, [set, options.cleanupInterval, options.maxAge]);

  const add = useCallback((value: T) => {
    set.add(value);
  }, [set]);

  const deleteValue = useCallback((value: T) => {
    set.delete(value);
  }, [set]);

  const clear = useCallback(() => {
    set.clear();
  }, [set]);

  const getStats = useCallback(() => {
    return {
      size: set.size,
      evictions: set.getEvictionCount()
    };
  }, [set]);

  return [set, { add, delete: deleteValue, clear, getStats }];
}

/**
 * Hook for memory-aware state updates
 * Delays or batches updates when memory pressure is high
 */
export function useMemoryAwareState<T>(
  initialState: T,
  memoryThresholdMb: number = 400
): [T, (newState: T | ((prev: T) => T)) => void, { isPending: boolean; memoryUsage: number }] {
  const [state, setState] = useState<T>(initialState);
  const [isPending, setIsPending] = useState(false);
  const pendingUpdate = useRef<T | ((prev: T) => T) | null>(null);
  const updateTimer = useRef<NodeJS.Timeout | null>(null);

  // Monitor memory usage
  const getMemoryUsage = useCallback(() => {
    if (performance && 'memory' in performance) {
      return Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024);
    }
    return 0;
  }, []);

  const [memoryUsage, setMemoryUsage] = useState(getMemoryUsage());

  // Update memory usage periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setMemoryUsage(getMemoryUsage());
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [getMemoryUsage]);

  const setStateWithMemoryCheck = useCallback((newState: T | ((prev: T) => T)) => {
    const currentMemory = getMemoryUsage();
    
    if (currentMemory > memoryThresholdMb) {
      // High memory pressure - defer update
      console.log(`[useMemoryAwareState] High memory (${currentMemory}MB), deferring update`);
      
      pendingUpdate.current = newState;
      setIsPending(true);
      
      // Clear any existing timer
      if (updateTimer.current) {
        clearTimeout(updateTimer.current);
      }
      
      // Schedule update for when memory pressure reduces
      updateTimer.current = setTimeout(() => {
        const deferredMemory = getMemoryUsage();
        if (deferredMemory < memoryThresholdMb && pendingUpdate.current !== null) {
          setState(pendingUpdate.current);
          pendingUpdate.current = null;
          setIsPending(false);
        } else {
          // Force update if still waiting after delay
          if (pendingUpdate.current !== null) {
            setState(pendingUpdate.current);
            pendingUpdate.current = null;
            setIsPending(false);
          }
        }
      }, 2000); // Wait 2 seconds
    } else {
      // Normal memory - update immediately
      setState(newState);
      pendingUpdate.current = null;
      setIsPending(false);
    }
  }, [memoryThresholdMb, getMemoryUsage]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (updateTimer.current) {
        clearTimeout(updateTimer.current);
      }
    };
  }, []);

  return [state, setStateWithMemoryCheck, { isPending, memoryUsage }];
}

/**
 * Hook for throttled state updates
 * Limits update frequency to prevent excessive re-renders
 */
export function useThrottledState<T>(
  initialState: T,
  throttleMs: number = 100
): [T, (newState: T) => void, T] {
  const [state, setState] = useState<T>(initialState);
  const [pendingState, setPendingState] = useState<T>(initialState);
  const lastUpdate = useRef<number>(0);
  const timer = useRef<NodeJS.Timeout | null>(null);

  const setThrottledState = useCallback((newState: T) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdate.current;
    
    setPendingState(newState);
    
    if (timeSinceLastUpdate >= throttleMs) {
      // Update immediately
      setState(newState);
      lastUpdate.current = now;
      
      // Clear any pending timer
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    } else {
      // Schedule update
      if (!timer.current) {
        const delay = throttleMs - timeSinceLastUpdate;
        timer.current = setTimeout(() => {
          setState(pendingState);
          lastUpdate.current = Date.now();
          timer.current = null;
        }, delay);
      }
    }
  }, [throttleMs, pendingState]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  return [state, setThrottledState, pendingState];
}