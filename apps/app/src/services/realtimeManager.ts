/**
 * RealtimeManager - Manages Supabase Realtime subscriptions for market data
 * Features:
 * - Channel subscription management
 * - Automatic reconnection logic
 * - Connection state tracking
 * - Cleanup on unmount
 */

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { KlineUpdate } from '../services/klineDataService';
import { errorMonitor, ErrorCategory } from '../utils/errorMonitor';

export interface RealtimeConfig {
  supabaseUrl: string;
  supabaseKey: string;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export interface RealtimeState {
  connected: boolean;
  reconnectAttempts: number;
  activeChannels: Map<string, RealtimeChannel>;
  lastError?: Error;
  disconnectedAt?: number;
  reconnectedAt?: number;
}

export type ConnectionStateCallback = (state: RealtimeState) => void;
export type UpdateCallback = (update: KlineUpdate) => void;

export class RealtimeManager {
  private supabase: SupabaseClient;
  private state: RealtimeState;
  private channels: Map<string, RealtimeChannel>;
  private callbacks: Map<string, Set<UpdateCallback>>;
  private stateCallbacks: Set<ConnectionStateCallback>;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private config: Required<RealtimeConfig>;
  private isShuttingDown = false;
  private missedUpdatesCache: Map<string, KlineUpdate[]>;

  constructor(config: RealtimeConfig) {
    this.config = {
      ...config,
      reconnectDelay: config.reconnectDelay ?? 5000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10
    };

    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);

    this.state = {
      connected: false,
      reconnectAttempts: 0,
      activeChannels: new Map()
    };

    this.channels = new Map();
    this.callbacks = new Map();
    this.stateCallbacks = new Set();
    this.missedUpdatesCache = new Map();

    console.log('[RealtimeManager] Initialized');
  }

  /**
   * Subscribe to a market data channel
   */
  subscribe(
    symbol: string,
    interval: string,
    callback: UpdateCallback
  ): () => void {
    const channelKey = `market:klines:${symbol}:${interval}`;

    // Add callback to the set for this channel
    if (!this.callbacks.has(channelKey)) {
      this.callbacks.set(channelKey, new Set());
    }
    this.callbacks.get(channelKey)!.add(callback);

    // Create channel if it doesn't exist
    if (!this.channels.has(channelKey)) {
      this.createChannel(channelKey);
    }

    // Return unsubscribe function
    return () => {
      const callbacks = this.callbacks.get(channelKey);
      if (callbacks) {
        callbacks.delete(callback);

        // If no more callbacks, close the channel
        if (callbacks.size === 0) {
          this.closeChannel(channelKey);
        }
      }
    };
  }

  /**
   * Subscribe to multiple symbols at once
   */
  subscribeMultiple(
    subscriptions: Array<{ symbol: string; interval: string; callback: UpdateCallback }>
  ): () => void {
    const unsubscribeFunctions = subscriptions.map(sub =>
      this.subscribe(sub.symbol, sub.interval, sub.callback)
    );

    return () => {
      unsubscribeFunctions.forEach(unsub => unsub());
    };
  }

  /**
   * Subscribe to connection state changes
   */
  onStateChange(callback: ConnectionStateCallback): () => void {
    this.stateCallbacks.add(callback);

    // Immediately call with current state
    callback(this.state);

    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  /**
   * Get current connection state
   */
  getState(): RealtimeState {
    return { ...this.state };
  }

  /**
   * Manually trigger reconnection
   */
  reconnect(): void {
    console.log('[RealtimeManager] Manual reconnection requested');
    this.handleReconnect();
  }

  /**
   * Cleanup all subscriptions and close connection
   */
  async cleanup(): Promise<void> {
    console.log('[RealtimeManager] Cleaning up...');
    this.isShuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Close all channels
    for (const [key, channel] of this.channels) {
      await this.supabase.removeChannel(channel);
      console.log(`[RealtimeManager] Closed channel: ${key}`);
    }

    this.channels.clear();
    this.callbacks.clear();
    this.stateCallbacks.clear();

    this.updateState({
      connected: false,
      activeChannels: new Map()
    });

    console.log('[RealtimeManager] Cleanup complete');
  }

  // Private methods

  private createChannel(channelKey: string): void {
    console.log(`[RealtimeManager] Creating channel: ${channelKey}`);

    const channel = this.supabase
      .channel(channelKey)
      .on('broadcast', { event: 'kline_update' }, (payload) => {
        this.handleUpdate(channelKey, payload.payload as KlineUpdate);
      })
      .subscribe((status) => {
        console.log(`[RealtimeManager] Channel ${channelKey} status:`, status);

        if (status === 'SUBSCRIBED') {
          this.state.activeChannels.set(channelKey, channel);
          this.updateState({
            connected: true,
            reconnectAttempts: 0,
            reconnectedAt: Date.now()
          });

          // Process any missed updates
          this.processMissedUpdates(channelKey);
        } else if (status === 'CHANNEL_ERROR') {
          this.handleChannelError(channelKey);
        } else if (status === 'CLOSED') {
          this.state.activeChannels.delete(channelKey);
          if (this.state.activeChannels.size === 0) {
            this.updateState({
              connected: false,
              disconnectedAt: Date.now()
            });
          }
        }
      });

    this.channels.set(channelKey, channel);
  }

  private async closeChannel(channelKey: string): Promise<void> {
    const channel = this.channels.get(channelKey);
    if (channel) {
      await this.supabase.removeChannel(channel);
      this.channels.delete(channelKey);
      this.callbacks.delete(channelKey);
      this.state.activeChannels.delete(channelKey);

      console.log(`[RealtimeManager] Channel closed: ${channelKey}`);

      if (this.state.activeChannels.size === 0) {
        this.updateState({ connected: false });
      }
    }
  }

  private handleUpdate(channelKey: string, update: KlineUpdate): void {
    // Cache update if disconnected
    if (!this.state.connected) {
      if (!this.missedUpdatesCache.has(channelKey)) {
        this.missedUpdatesCache.set(channelKey, []);
      }
      const cache = this.missedUpdatesCache.get(channelKey)!;
      cache.push(update);

      // Limit cache size to prevent memory issues
      if (cache.length > 100) {
        cache.shift();
      }
      return;
    }

    const callbacks = this.callbacks.get(channelKey);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(update);
        } catch (error) {
          console.error(`[RealtimeManager] Error in update callback:`, error);
          errorMonitor.trackError(
            ErrorCategory.REALTIME,
            'Error in update callback',
            error instanceof Error ? error : new Error(String(error)),
            { channelKey }
          );
        }
      });
    }
  }

  private processMissedUpdates(channelKey: string): void {
    const missedUpdates = this.missedUpdatesCache.get(channelKey);
    if (missedUpdates && missedUpdates.length > 0) {
      console.log(`[RealtimeManager] Processing ${missedUpdates.length} missed updates for ${channelKey}`);

      const callbacks = this.callbacks.get(channelKey);
      if (callbacks) {
        missedUpdates.forEach(update => {
          callbacks.forEach(cb => {
            try {
              cb(update);
            } catch (error) {
              console.error(`[RealtimeManager] Error processing missed update:`, error);
              errorMonitor.trackError(
                ErrorCategory.REALTIME,
                'Error processing missed update',
                error instanceof Error ? error : new Error(String(error)),
                { channelKey }
              );
            }
          });
        });
      }

      // Clear the cache
      this.missedUpdatesCache.delete(channelKey);
    }
  }

  private handleChannelError(channelKey: string): void {
    const error = new Error(`Channel error: ${channelKey}`);
    console.error(`[RealtimeManager] Channel error: ${channelKey}`);

    // Track error in monitor
    errorMonitor.trackRealtimeError(channelKey, 'Channel error occurred', error);

    this.updateState({
      lastError: error
    });

    // Try to reconnect the channel
    if (!this.isShuttingDown) {
      setTimeout(() => {
        const callbacks = this.callbacks.get(channelKey);
        if (callbacks && callbacks.size > 0) {
          this.closeChannel(channelKey).then(() => {
            this.createChannel(channelKey);
          });
        }
      }, this.config.reconnectDelay);
    }
  }

  private handleReconnect(): void {
    if (this.isShuttingDown) return;

    if (this.state.reconnectAttempts >= this.config.maxReconnectAttempts) {
      const error = new Error('Max reconnection attempts reached');
      console.error('[RealtimeManager] Max reconnection attempts reached');

      // Track critical error
      errorMonitor.trackRealtimeError('connection', 'Max reconnection attempts reached', error);

      this.updateState({
        lastError: error
      });
      return;
    }

    this.updateState({
      reconnectAttempts: this.state.reconnectAttempts + 1
    });

    const delay = Math.min(
      this.config.reconnectDelay * Math.pow(2, this.state.reconnectAttempts),
      30000 // Max 30 seconds
    );

    console.log(`[RealtimeManager] Reconnecting in ${delay}ms (attempt ${this.state.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      // Recreate all active channels
      for (const [channelKey, callbacks] of this.callbacks) {
        if (callbacks.size > 0 && !this.channels.has(channelKey)) {
          this.createChannel(channelKey);
        }
      }
    }, delay);
  }

  private updateState(updates: Partial<RealtimeState>): void {
    this.state = { ...this.state, ...updates };

    // Notify all state listeners
    this.stateCallbacks.forEach(cb => {
      try {
        cb(this.state);
      } catch (error) {
        console.error('[RealtimeManager] Error in state callback:', error);
      }
    });
  }
}

// Singleton instance
let realtimeManagerInstance: RealtimeManager | null = null;

export function initializeRealtimeManager(config: RealtimeConfig): RealtimeManager {
  if (!realtimeManagerInstance) {
    realtimeManagerInstance = new RealtimeManager(config);
  }
  return realtimeManagerInstance;
}

export function getRealtimeManager(): RealtimeManager | null {
  return realtimeManagerInstance;
}