/**
 * FallbackManager - Handles graceful degradation and fallback strategies
 * Features:
 * - Direct Binance API fallback when Edge Functions fail
 * - Cached data fallback for offline scenarios
 * - Progressive degradation of features
 * - User notification system
 */

import { Kline, KlineInterval, Ticker } from '../../types';
import { API_BASE_URL } from '../../constants';
import { errorMonitor, ErrorCategory } from './errorMonitor';

export enum FallbackMode {
  NORMAL = 'normal',
  EDGE_FUNCTION_FALLBACK = 'edge_function_fallback',
  DIRECT_API = 'direct_api',
  CACHED_ONLY = 'cached_only',
  OFFLINE = 'offline'
}

export interface FallbackState {
  mode: FallbackMode;
  reason: string;
  timestamp: number;
  affectedFeatures: string[];
  estimatedRecovery?: number;
}

interface FallbackStrategy {
  condition: () => boolean;
  mode: FallbackMode;
  execute: () => Promise<void>;
  recover: () => Promise<void>;
}

export class FallbackManager {
  private currentMode: FallbackMode = FallbackMode.NORMAL;
  private strategies: Map<FallbackMode, FallbackStrategy>;
  private stateCallbacks: Set<(state: FallbackState) => void>;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private failureCount: Map<string, number>;
  private lastDirectApiFetch: number = 0;
  private directApiRateLimit = 1000; // 1 second between direct API calls

  constructor() {
    this.strategies = new Map();
    this.stateCallbacks = new Set();
    this.failureCount = new Map();

    this.initializeStrategies();
  }

  /**
   * Initialize fallback strategies
   */
  private initializeStrategies(): void {
    // Edge Function fallback to direct API
    this.strategies.set(FallbackMode.DIRECT_API, {
      condition: () => {
        const edgeFailures = this.failureCount.get('edge_function') || 0;
        return edgeFailures > 3;
      },
      mode: FallbackMode.DIRECT_API,
      execute: async () => {
        console.log('[FallbackManager] Switching to direct Binance API');
        this.notifyStateChange({
          mode: FallbackMode.DIRECT_API,
          reason: 'Edge functions unavailable, using direct API',
          timestamp: Date.now(),
          affectedFeatures: ['Real-time updates may be delayed'],
          estimatedRecovery: Date.now() + 5 * 60 * 1000 // 5 minutes
        });
      },
      recover: async () => {
        console.log('[FallbackManager] Attempting to restore Edge Function connection');
        this.failureCount.set('edge_function', 0);
      }
    });

    // Cached only mode for severe failures
    this.strategies.set(FallbackMode.CACHED_ONLY, {
      condition: () => {
        const networkFailures = this.failureCount.get('network') || 0;
        return networkFailures > 10;
      },
      mode: FallbackMode.CACHED_ONLY,
      execute: async () => {
        console.log('[FallbackManager] Switching to cached data only');
        this.notifyStateChange({
          mode: FallbackMode.CACHED_ONLY,
          reason: 'Network issues detected, using cached data',
          timestamp: Date.now(),
          affectedFeatures: ['Live data unavailable', 'Trading disabled'],
          estimatedRecovery: Date.now() + 2 * 60 * 1000 // 2 minutes
        });
      },
      recover: async () => {
        console.log('[FallbackManager] Attempting network recovery');
        this.failureCount.set('network', 0);
      }
    });

    // Offline mode
    this.strategies.set(FallbackMode.OFFLINE, {
      condition: () => !navigator.onLine,
      mode: FallbackMode.OFFLINE,
      execute: async () => {
        console.log('[FallbackManager] Entering offline mode');
        this.notifyStateChange({
          mode: FallbackMode.OFFLINE,
          reason: 'No internet connection',
          timestamp: Date.now(),
          affectedFeatures: ['All features requiring internet']
        });
      },
      recover: async () => {
        console.log('[FallbackManager] Connection restored');
      }
    });
  }

  /**
   * Track failure for a service
   */
  trackFailure(service: string): void {
    const count = (this.failureCount.get(service) || 0) + 1;
    this.failureCount.set(service, count);

    console.log(`[FallbackManager] ${service} failure count: ${count}`);

    // Check if we need to switch modes
    this.evaluateFallbackStrategies();
  }

  /**
   * Evaluate and switch fallback strategies if needed
   */
  private evaluateFallbackStrategies(): void {
    for (const [mode, strategy] of this.strategies) {
      if (strategy.condition() && this.currentMode !== mode) {
        this.switchMode(mode, strategy);
        break;
      }
    }
  }

  /**
   * Switch to a fallback mode
   */
  private async switchMode(mode: FallbackMode, strategy: FallbackStrategy): Promise<void> {
    const previousMode = this.currentMode;
    this.currentMode = mode;

    try {
      await strategy.execute();

      // Schedule recovery attempt
      this.scheduleRecovery(strategy);

      // Track mode switch
      errorMonitor.trackError(
        ErrorCategory.UNKNOWN,
        `Switched to fallback mode: ${mode}`,
        undefined,
        { previousMode, newMode: mode }
      );
    } catch (error) {
      console.error('[FallbackManager] Failed to switch mode:', error);
      this.currentMode = previousMode;
    }
  }

  /**
   * Schedule recovery attempt
   */
  private scheduleRecovery(strategy: FallbackStrategy): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    const recoveryDelay = 30 * 1000; // 30 seconds

    this.recoveryTimer = setTimeout(async () => {
      try {
        await strategy.recover();

        // Test if we can return to normal
        if (await this.testNormalMode()) {
          this.currentMode = FallbackMode.NORMAL;
          this.notifyStateChange({
            mode: FallbackMode.NORMAL,
            reason: 'Services restored',
            timestamp: Date.now(),
            affectedFeatures: []
          });
        } else {
          // Retry recovery
          this.scheduleRecovery(strategy);
        }
      } catch (error) {
        console.error('[FallbackManager] Recovery failed:', error);
        this.scheduleRecovery(strategy);
      }
    }, recoveryDelay);
  }

  /**
   * Fallback kline fetcher using direct Binance API
   */
  async fetchKlinesFallback(
    symbol: string,
    interval: KlineInterval,
    limit: number = 100
  ): Promise<Kline[]> {
    // Rate limit direct API calls
    const now = Date.now();
    const timeSinceLastFetch = now - this.lastDirectApiFetch;
    if (timeSinceLastFetch < this.directApiRateLimit) {
      await new Promise(resolve =>
        setTimeout(resolve, this.directApiRateLimit - timeSinceLastFetch)
      );
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const klines = await response.json();
      this.lastDirectApiFetch = Date.now();

      console.log(`[FallbackManager] Direct API fetch successful for ${symbol}`);
      return klines;
    } catch (error) {
      console.error(`[FallbackManager] Direct API fetch failed for ${symbol}:`, error);
      this.trackFailure('direct_api');
      throw error;
    }
  }

  /**
   * Fallback ticker fetcher
   */
  async fetchTickersFallback(): Promise<Map<string, Ticker>> {
    try {
      const response = await fetch(`${API_BASE_URL}/ticker/24hr`);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const tickers = await response.json();
      const tickerMap = new Map<string, Ticker>();

      tickers
        .filter((t: any) => t.symbol.endsWith('USDT'))
        .forEach((t: any) => {
          tickerMap.set(t.symbol, {
            s: t.symbol,
            P: t.priceChangePercent,
            c: t.lastPrice,
            q: t.quoteVolume,
            ...t
          });
        });

      console.log('[FallbackManager] Direct ticker fetch successful');
      return tickerMap;
    } catch (error) {
      console.error('[FallbackManager] Direct ticker fetch failed:', error);
      this.trackFailure('direct_api');
      throw error;
    }
  }

  /**
   * Test if normal mode is available
   */
  private async testNormalMode(): Promise<boolean> {
    try {
      // Test Supabase REST API availability with ping endpoint
      const testUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/ping`;
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
          'Content-Type': 'application/json'
        }
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get current fallback state
   */
  getState(): FallbackState {
    return {
      mode: this.currentMode,
      reason: this.currentMode === FallbackMode.NORMAL ? 'All systems operational' : 'Degraded mode',
      timestamp: Date.now(),
      affectedFeatures: this.getAffectedFeatures()
    };
  }

  /**
   * Get affected features for current mode
   */
  private getAffectedFeatures(): string[] {
    switch (this.currentMode) {
      case FallbackMode.DIRECT_API:
        return ['Real-time updates may be delayed'];
      case FallbackMode.CACHED_ONLY:
        return ['Live data unavailable', 'Trading disabled'];
      case FallbackMode.OFFLINE:
        return ['All online features'];
      default:
        return [];
    }
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: FallbackState) => void): () => void {
    this.stateCallbacks.add(callback);
    callback(this.getState());
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Notify state change
   */
  private notifyStateChange(state: FallbackState): void {
    this.stateCallbacks.forEach(cb => {
      try {
        cb(state);
      } catch (error) {
        console.error('[FallbackManager] Callback error:', error);
      }
    });
  }

  /**
   * Check if feature is available in current mode
   */
  isFeatureAvailable(feature: string): boolean {
    switch (this.currentMode) {
      case FallbackMode.NORMAL:
      case FallbackMode.DIRECT_API:
        return true;
      case FallbackMode.CACHED_ONLY:
        return !['trading', 'live_data', 'notifications'].includes(feature);
      case FallbackMode.OFFLINE:
        return false;
      default:
        return false;
    }
  }

  /**
   * Force recovery attempt
   */
  async forceRecovery(): Promise<void> {
    console.log('[FallbackManager] Forcing recovery attempt');
    this.failureCount.clear();

    if (await this.testNormalMode()) {
      this.currentMode = FallbackMode.NORMAL;
      this.notifyStateChange({
        mode: FallbackMode.NORMAL,
        reason: 'Manual recovery successful',
        timestamp: Date.now(),
        affectedFeatures: []
      });
    }
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    this.stateCallbacks.clear();
    console.log('[FallbackManager] Cleaned up');
  }
}

// Singleton instance
export const fallbackManager = new FallbackManager();