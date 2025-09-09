/**
 * Lightweight event emitter for kline updates
 * Allows components to subscribe to specific symbol/interval updates
 * without requiring full React state updates
 */

import { KlineInterval } from '../../types';

export interface KlineUpdateEvent {
  symbol: string;
  interval: KlineInterval;
  timestamp: number;
}

type KlineEventListener = (event: KlineUpdateEvent) => void;

class KlineEventEmitter {
  private listeners = new Map<string, Set<KlineEventListener>>();
  private globalListeners = new Set<KlineEventListener>();

  /**
   * Create a subscription key for a specific symbol/interval
   */
  private getKey(symbol: string, interval: KlineInterval): string {
    return `${symbol}:${interval}`;
  }

  /**
   * Subscribe to updates for a specific symbol/interval
   */
  subscribe(
    symbol: string,
    interval: KlineInterval,
    listener: KlineEventListener
  ): () => void {
    const key = this.getKey(symbol, interval);
    
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    this.listeners.get(key)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(key)?.delete(listener);
      if (this.listeners.get(key)?.size === 0) {
        this.listeners.delete(key);
      }
    };
  }

  /**
   * Subscribe to all kline updates
   */
  subscribeAll(listener: KlineEventListener): () => void {
    this.globalListeners.add(listener);
    
    return () => {
      this.globalListeners.delete(listener);
    };
  }

  /**
   * Emit an update event
   */
  emit(symbol: string, interval: KlineInterval): void {
    const event: KlineUpdateEvent = {
      symbol,
      interval,
      timestamp: Date.now()
    };

    // Notify specific listeners
    const key = this.getKey(symbol, interval);
    const specificListeners = this.listeners.get(key);
    
    if (specificListeners) {
      specificListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error('[KlineEventEmitter] Error in listener:', error);
        }
      });
    }

    // Notify global listeners
    this.globalListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[KlineEventEmitter] Error in global listener:', error);
      }
    });
  }

  /**
   * Get statistics about active subscriptions
   */
  getStats(): {
    specificSubscriptions: number;
    globalSubscriptions: number;
    totalListeners: number;
  } {
    let totalListeners = this.globalListeners.size;
    
    this.listeners.forEach(set => {
      totalListeners += set.size;
    });

    return {
      specificSubscriptions: this.listeners.size,
      globalSubscriptions: this.globalListeners.size,
      totalListeners
    };
  }

  /**
   * Clear all subscriptions (useful for cleanup)
   */
  clear(): void {
    this.listeners.clear();
    this.globalListeners.clear();
  }
}

// Export singleton instance
export const klineEventEmitter = new KlineEventEmitter();