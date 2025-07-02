import { KlineInterval } from '../../types';

export interface KlineCloseEvent {
  symbol: string;
  interval: KlineInterval;
  kline: number[]; // OHLCV array
  timestamp: Date;
}

export type KlineCloseListener = (event: KlineCloseEvent) => void | Promise<void>;

class KlineEventBus {
  private listeners = new Map<string, Set<KlineCloseListener>>();
  private static instance: KlineEventBus;

  private constructor() {}

  static getInstance(): KlineEventBus {
    if (!KlineEventBus.instance) {
      KlineEventBus.instance = new KlineEventBus();
    }
    return KlineEventBus.instance;
  }

  /**
   * Emit a kline close event
   */
  async emit(symbol: string, interval: KlineInterval, kline: number[]) {
    const key = `${symbol}:${interval}`;
    const listeners = this.listeners.get(key);
    
    if (!listeners || listeners.size === 0) {
      return;
    }

    const event: KlineCloseEvent = {
      symbol,
      interval,
      kline,
      timestamp: new Date()
    };

    // Execute all listeners in parallel
    const promises = Array.from(listeners).map(listener => 
      Promise.resolve(listener(event)).catch(error => {
        console.error('Kline event listener error:', error);
      })
    );
    
    await Promise.all(promises);
  }

  /**
   * Subscribe to kline close events for a specific symbol and interval
   */
  subscribe(symbol: string, interval: KlineInterval, callback: KlineCloseListener): () => void {
    const key = `${symbol}:${interval}`;
    
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    
    this.listeners.get(key)!.add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(key);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.listeners.delete(key);
        }
      }
    };
  }

  /**
   * Subscribe to all kline close events for a specific interval
   */
  subscribeToInterval(interval: KlineInterval, callback: KlineCloseListener): () => void {
    const wrappedCallback = (event: KlineCloseEvent) => {
      if (event.interval === interval) {
        callback(event);
      }
    };
    
    // Store the wrapped callback so we can unsubscribe later
    const subscriptions = new Set<() => void>();
    
    // Subscribe to all existing symbols
    for (const key of this.listeners.keys()) {
      if (key.endsWith(`:${interval}`)) {
        const [symbol] = key.split(':');
        const unsub = this.subscribe(symbol, interval, wrappedCallback);
        subscriptions.add(unsub);
      }
    }
    
    // Return a function that unsubscribes from all
    return () => {
      subscriptions.forEach(unsub => unsub());
    };
  }

  /**
   * Get all active subscriptions (for debugging)
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.listeners.keys());
  }

  /**
   * Clear all subscriptions
   */
  clear() {
    this.listeners.clear();
  }
}

export const klineEventBus = KlineEventBus.getInstance();