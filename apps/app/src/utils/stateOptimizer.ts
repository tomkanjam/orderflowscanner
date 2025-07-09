/**
 * State optimization utilities to reduce memory usage and re-renders
 */

import { useRef, useCallback, useState, useEffect } from 'react';

/**
 * Batch multiple state updates to reduce re-renders
 */
export class BatchedUpdater<T> {
  private updates: T[] = [];
  private timeoutId: NodeJS.Timeout | null = null;
  private isProcessing = false;
  
  constructor(
    private processor: (updates: T[]) => void,
    private batchDelay: number = 16 // ~1 frame at 60fps
  ) {}
  
  add(update: T) {
    this.updates.push(update);
    
    if (!this.timeoutId && !this.isProcessing) {
      this.timeoutId = setTimeout(() => this.flush(), this.batchDelay);
    }
  }
  
  flush() {
    if (this.isProcessing || this.updates.length === 0) return;
    
    this.isProcessing = true;
    const updates = this.updates;
    this.updates = [];
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    try {
      this.processor(updates);
    } finally {
      this.isProcessing = false;
    }
  }
  
  clear() {
    this.updates = [];
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}

/**
 * Hook for optimized Map state management
 */
export function useOptimizedMap<K, V>(
  initialValue: Map<K, V> = new Map(),
  options?: {
    maxSize?: number;
    pruneStrategy?: 'lru' | 'fifo';
    batchUpdates?: boolean;
    batchDelay?: number;
  }
) {
  const [map, setMapState] = useState<Map<K, V>>(initialValue);
  const mapRef = useRef<Map<K, V>>(initialValue);
  const accessOrder = useRef<K[]>([]);
  const batchedUpdater = useRef<BatchedUpdater<{ key: K; value: V | undefined }>>();
  
  // Initialize batched updater if enabled
  useEffect(() => {
    if (options?.batchUpdates) {
      batchedUpdater.current = new BatchedUpdater(
        (updates) => {
          setMapState(prevMap => {
            const newMap = new Map(prevMap);
            updates.forEach(({ key, value }) => {
              if (value === undefined) {
                newMap.delete(key);
              } else {
                newMap.set(key, value);
              }
            });
            mapRef.current = newMap;
            return newMap;
          });
        },
        options.batchDelay
      );
    }
    
    return () => {
      batchedUpdater.current?.clear();
    };
  }, [options?.batchUpdates, options?.batchDelay]);
  
  // Prune map if it exceeds max size
  const pruneIfNeeded = useCallback((map: Map<K, V>) => {
    if (!options?.maxSize || map.size <= options.maxSize) return map;
    
    const pruned = new Map<K, V>();
    const strategy = options.pruneStrategy || 'lru';
    
    if (strategy === 'lru') {
      // Keep most recently accessed items
      const keysToKeep = accessOrder.current.slice(-options.maxSize);
      keysToKeep.forEach(key => {
        const value = map.get(key);
        if (value !== undefined) {
          pruned.set(key, value);
        }
      });
    } else {
      // FIFO: Keep newest items
      const entries = Array.from(map.entries());
      entries.slice(-options.maxSize).forEach(([key, value]) => {
        pruned.set(key, value);
      });
    }
    
    // Update access order
    accessOrder.current = Array.from(pruned.keys());
    
    return pruned;
  }, [options?.maxSize, options?.pruneStrategy]);
  
  // Set a single value
  const set = useCallback((key: K, value: V) => {
    if (options?.batchUpdates && batchedUpdater.current) {
      batchedUpdater.current.add({ key, value });
    } else {
      setMapState(prevMap => {
        const newMap = new Map(prevMap);
        newMap.set(key, value);
        
        // Track access order
        const index = accessOrder.current.indexOf(key);
        if (index !== -1) {
          accessOrder.current.splice(index, 1);
        }
        accessOrder.current.push(key);
        
        const pruned = pruneIfNeeded(newMap);
        mapRef.current = pruned;
        return pruned;
      });
    }
  }, [options?.batchUpdates, pruneIfNeeded]);
  
  // Set multiple values at once
  const setMany = useCallback((entries: [K, V][]) => {
    setMapState(prevMap => {
      const newMap = new Map(prevMap);
      entries.forEach(([key, value]) => {
        newMap.set(key, value);
        
        // Track access order
        const index = accessOrder.current.indexOf(key);
        if (index !== -1) {
          accessOrder.current.splice(index, 1);
        }
        accessOrder.current.push(key);
      });
      
      const pruned = pruneIfNeeded(newMap);
      mapRef.current = pruned;
      return pruned;
    });
  }, [pruneIfNeeded]);
  
  // Update a value
  const update = useCallback((key: K, updater: (value: V | undefined) => V) => {
    if (options?.batchUpdates && batchedUpdater.current) {
      const currentValue = mapRef.current.get(key);
      const newValue = updater(currentValue);
      batchedUpdater.current.add({ key, value: newValue });
    } else {
      setMapState(prevMap => {
        const newMap = new Map(prevMap);
        const currentValue = newMap.get(key);
        const newValue = updater(currentValue);
        newMap.set(key, newValue);
        
        // Track access order
        const index = accessOrder.current.indexOf(key);
        if (index !== -1) {
          accessOrder.current.splice(index, 1);
        }
        accessOrder.current.push(key);
        
        const pruned = pruneIfNeeded(newMap);
        mapRef.current = pruned;
        return pruned;
      });
    }
  }, [options?.batchUpdates, pruneIfNeeded]);
  
  // Delete a value
  const deleteKey = useCallback((key: K) => {
    if (options?.batchUpdates && batchedUpdater.current) {
      batchedUpdater.current.add({ key, value: undefined });
    } else {
      setMapState(prevMap => {
        const newMap = new Map(prevMap);
        newMap.delete(key);
        
        // Remove from access order
        const index = accessOrder.current.indexOf(key);
        if (index !== -1) {
          accessOrder.current.splice(index, 1);
        }
        
        mapRef.current = newMap;
        return newMap;
      });
    }
  }, [options?.batchUpdates]);
  
  // Clear the map
  const clear = useCallback(() => {
    setMapState(() => {
      const newMap = new Map<K, V>();
      mapRef.current = newMap;
      accessOrder.current = [];
      return newMap;
    });
  }, []);
  
  // Get a value (tracks access for LRU)
  const get = useCallback((key: K): V | undefined => {
    if (options?.pruneStrategy === 'lru') {
      const index = accessOrder.current.indexOf(key);
      if (index !== -1) {
        accessOrder.current.splice(index, 1);
        accessOrder.current.push(key);
      }
    }
    return map.get(key);
  }, [map, options?.pruneStrategy]);
  
  // Force flush batched updates
  const flush = useCallback(() => {
    batchedUpdater.current?.flush();
  }, []);
  
  return {
    map,
    set,
    setMany,
    update,
    delete: deleteKey,
    clear,
    get,
    flush,
    size: map.size
  };
}

/**
 * Hook for throttled state updates
 */
export function useThrottledState<T>(
  initialValue: T,
  delay: number = 100
) {
  const [value, setValue] = useState<T>(initialValue);
  const [throttledValue, setThrottledValue] = useState<T>(initialValue);
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setThrottledValue(value);
    }, delay);
    
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, delay]);
  
  return [throttledValue, setValue] as const;
}

/**
 * Efficiently update nested Map structures
 */
export function updateNestedMap<K1, K2, V>(
  map: Map<K1, Map<K2, V>>,
  key1: K1,
  key2: K2,
  value: V
): Map<K1, Map<K2, V>> {
  const newMap = new Map(map);
  const innerMap = newMap.get(key1);
  
  if (innerMap) {
    const newInnerMap = new Map(innerMap);
    newInnerMap.set(key2, value);
    newMap.set(key1, newInnerMap);
  } else {
    newMap.set(key1, new Map([[key2, value]]));
  }
  
  return newMap;
}

/**
 * Prune old entries from a Map based on age
 */
export function pruneMapByAge<K, V extends { timestamp: number }>(
  map: Map<K, V>,
  maxAgeMs: number
): Map<K, V> {
  const now = Date.now();
  const pruned = new Map<K, V>();
  
  map.forEach((value, key) => {
    if (now - value.timestamp < maxAgeMs) {
      pruned.set(key, value);
    }
  });
  
  return pruned;
}

/**
 * Create a size-limited Map that automatically removes oldest entries
 */
export class LimitedMap<K, V> extends Map<K, V> {
  constructor(private maxSize: number) {
    super();
  }
  
  set(key: K, value: V): this {
    // If at capacity and key doesn't exist, remove oldest
    if (this.size >= this.maxSize && !this.has(key)) {
      const firstKey = this.keys().next().value;
      this.delete(firstKey);
    }
    
    // If key exists, delete and re-add to move to end
    if (this.has(key)) {
      this.delete(key);
    }
    
    super.set(key, value);
    return this;
  }
}