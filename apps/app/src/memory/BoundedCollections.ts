/**
 * BoundedCollections - Memory-efficient data structures with automatic eviction
 * Implements LRU (Least Recently Used) eviction policy
 */

import { CollectionMetadata } from './types';

export type EvictionPolicy = 'FIFO' | 'LRU' | 'LFU';

/**
 * BoundedMap - Map with automatic size limiting and eviction
 */
export class BoundedMap<K, V> {
  private data: Map<K, V> = new Map();
  private metadata: Map<K, CollectionMetadata> = new Map();
  private accessOrder: K[] = [];
  private maxSize: number;
  private evictionPolicy: EvictionPolicy;

  constructor(maxSize: number, evictionPolicy: EvictionPolicy = 'LRU') {
    if (maxSize <= 0) {
      throw new Error('BoundedMap maxSize must be greater than 0');
    }
    this.maxSize = maxSize;
    this.evictionPolicy = evictionPolicy;
  }

  /**
   * Set a value with automatic eviction if at capacity
   */
  set(key: K, value: V): void {
    const now = Date.now();
    
    // Update existing entry
    if (this.data.has(key)) {
      this.data.set(key, value);
      const meta = this.metadata.get(key)!;
      meta.lastAccessed = now;
      meta.accessCount++;
      
      if (this.evictionPolicy === 'LRU') {
        // Move to end of access order
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
          this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
      }
      
      return;
    }

    // Check if we need to evict
    if (this.data.size >= this.maxSize) {
      this.evictOne();
    }

    // Add new entry
    this.data.set(key, value);
    this.metadata.set(key, {
      createdAt: now,
      lastAccessed: now,
      accessCount: 1
    });
    this.accessOrder.push(key);
  }

  /**
   * Get a value with access tracking
   */
  get(key: K): V | undefined {
    const value = this.data.get(key);
    
    if (value !== undefined) {
      const meta = this.metadata.get(key)!;
      meta.lastAccessed = Date.now();
      meta.accessCount++;
      
      if (this.evictionPolicy === 'LRU') {
        // Move to end of access order
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
          this.accessOrder.splice(index, 1);
          this.accessOrder.push(key);
        }
      }
    }
    
    return value;
  }

  /**
   * Check if key exists
   */
  has(key: K): boolean {
    return this.data.has(key);
  }

  /**
   * Delete a specific key
   */
  delete(key: K): boolean {
    const deleted = this.data.delete(key);
    if (deleted) {
      this.metadata.delete(key);
      const index = this.accessOrder.indexOf(key);
      if (index > -1) {
        this.accessOrder.splice(index, 1);
      }
    }
    return deleted;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.data.clear();
    this.metadata.clear();
    this.accessOrder = [];
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.data.size;
  }

  /**
   * Evict one entry based on policy
   */
  private evictOne(): void {
    let keyToEvict: K | undefined;
    
    switch (this.evictionPolicy) {
      case 'FIFO':
        // Evict first (oldest) entry
        keyToEvict = this.accessOrder[0];
        break;
        
      case 'LRU':
        // Evict least recently accessed
        keyToEvict = this.accessOrder[0];
        break;
        
      case 'LFU':
        // Evict least frequently used
        let minCount = Infinity;
        this.metadata.forEach((meta, key) => {
          if (meta.accessCount < minCount) {
            minCount = meta.accessCount;
            keyToEvict = key;
          }
        });
        break;
    }
    
    if (keyToEvict !== undefined) {
      this.delete(keyToEvict);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[BoundedMap] Evicted key:`, keyToEvict);
      }
    }
  }

  /**
   * Evict multiple entries
   */
  evict(count: number): void {
    const toEvict = Math.min(count, this.data.size);
    for (let i = 0; i < toEvict; i++) {
      this.evictOne();
    }
  }

  /**
   * Clear entries older than specified age
   */
  clearOlderThan(ageMs: number): number {
    const now = Date.now();
    const keysToDelete: K[] = [];
    
    this.metadata.forEach((meta, key) => {
      if (now - meta.createdAt > ageMs) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }

  /**
   * Get all keys
   */
  keys(): IterableIterator<K> {
    return this.data.keys();
  }

  /**
   * Get all values
   */
  values(): IterableIterator<V> {
    return this.data.values();
  }

  /**
   * Get all entries
   */
  entries(): IterableIterator<[K, V]> {
    return this.data.entries();
  }

  /**
   * ForEach iteration
   */
  forEach(callback: (value: V, key: K, map: Map<K, V>) => void): void {
    this.data.forEach(callback);
  }

  /**
   * Get statistics about the collection
   */
  getStats(): {
    size: number;
    maxSize: number;
    utilization: number;
    oldestAge: number;
    newestAge: number;
    averageAccessCount: number;
  } {
    const now = Date.now();
    let oldestAge = 0;
    let newestAge = Infinity;
    let totalAccessCount = 0;
    
    this.metadata.forEach(meta => {
      const age = now - meta.createdAt;
      oldestAge = Math.max(oldestAge, age);
      newestAge = Math.min(newestAge, age);
      totalAccessCount += meta.accessCount;
    });
    
    return {
      size: this.data.size,
      maxSize: this.maxSize,
      utilization: this.data.size / this.maxSize,
      oldestAge: oldestAge,
      newestAge: newestAge === Infinity ? 0 : newestAge,
      averageAccessCount: this.data.size > 0 ? totalAccessCount / this.data.size : 0
    };
  }
}

/**
 * BoundedSet - Set with automatic size limiting
 */
export class BoundedSet<T> {
  private map: BoundedMap<T, boolean>;

  constructor(maxSize: number, evictionPolicy: EvictionPolicy = 'LRU') {
    this.map = new BoundedMap(maxSize, evictionPolicy);
  }

  add(value: T): this {
    this.map.set(value, true);
    return this;
  }

  has(value: T): boolean {
    return this.map.has(value);
  }

  delete(value: T): boolean {
    return this.map.delete(value);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  forEach(callback: (value: T, value2: T, set: Set<T>) => void): void {
    this.map.forEach((_, key) => {
      callback(key, key, new Set());
    });
  }

  values(): IterableIterator<T> {
    return this.map.keys();
  }

  keys(): IterableIterator<T> {
    return this.map.keys();
  }

  entries(): IterableIterator<[T, T]> {
    const entries: [T, T][] = [];
    this.map.forEach((_, key) => {
      entries.push([key, key]);
    });
    return entries[Symbol.iterator]();
  }

  clearOlderThan(ageMs: number): number {
    return this.map.clearOlderThan(ageMs);
  }

  getStats() {
    return this.map.getStats();
  }
}

/**
 * Create a bounded version of an existing Map
 */
export function createBoundedMap<K, V>(
  existingMap: Map<K, V> | undefined,
  maxSize: number,
  evictionPolicy: EvictionPolicy = 'LRU'
): BoundedMap<K, V> {
  const bounded = new BoundedMap<K, V>(maxSize, evictionPolicy);
  
  if (existingMap) {
    // Add entries from existing map (newest first to preserve most recent)
    const entries = Array.from(existingMap.entries());
    const startIndex = Math.max(0, entries.length - maxSize);
    
    for (let i = startIndex; i < entries.length; i++) {
      const [key, value] = entries[i];
      bounded.set(key, value);
    }
  }
  
  return bounded;
}