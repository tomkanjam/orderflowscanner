import { createClient } from '@supabase/supabase-js';
import { RealtimeChannel } from '@supabase/supabase-js';
import { klineDataService, KlineRequest, KlineResponse } from './klineDataService';
import { KlineInterval } from '../../types';

// Initialize Supabase client - using import.meta.env for Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Only initialize if we have the required env vars
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface ServerTrader {
  id: string;
  name: string;
  filter: {
    code: string;
    indicators?: any[];
    requiredTimeframes: string[];
  };
  tier: string;
  user_id?: string;
  enabled: boolean;
  execution_interval: string;
}

export interface TraderSignal {
  id: string;
  trader_id: string;
  symbols: string[];
  timestamp: string;
  metadata?: any;
}

export interface ExecutionResult {
  traderId: string;
  timestamp: string;
  totalSymbols: number;
  matches: string[];
  results: Array<{
    symbol: string;
    matched: boolean;
    error?: string;
  }>;
}

class ServerExecutionService {
  private signalChannel: RealtimeChannel | null = null;
  private signalCallbacks = new Map<string, (signal: TraderSignal) => void>();

  /**
   * Initialize Realtime subscription for signal updates
   */
  async initializeRealtime(): Promise<void> {
    if (!supabase) {
      console.warn('[ServerExecutionService] Supabase not initialized - skipping realtime setup');
      return;
    }

    // Clean up existing subscription
    if (this.signalChannel) {
      await this.signalChannel.unsubscribe();
    }

    // Create new subscription - listen to database INSERT events instead of broadcasts
    this.signalChannel = supabase.channel('signals')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signals'
        },
        (payload) => {
          console.log('[ServerExecutionService] New signal from database:', payload);
          const signal: TraderSignal = {
            id: payload.new.id,
            trader_id: payload.new.trader_id,
            symbols: [payload.new.symbol], // Go backend saves one symbol per signal
            timestamp: payload.new.created_at || payload.new.timestamp,
            metadata: payload.new
          };

          // Notify all registered callbacks for this trader
          const callback = this.signalCallbacks.get(signal.trader_id);
          if (callback) {
            callback(signal);
          }
        }
      )
      .subscribe();
  }

  /**
   * Register a callback for signal updates from a specific trader
   */
  onTraderSignal(traderId: string, callback: (signal: TraderSignal) => void): () => void {
    this.signalCallbacks.set(traderId, callback);

    // Return cleanup function
    return () => {
      this.signalCallbacks.delete(traderId);
    };
  }

  /**
   * Save a trader to the database
   */
  async saveTrader(trader: Omit<ServerTrader, 'id'>): Promise<ServerTrader> {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }
    const { data, error } = await supabase
      .from('traders')
      .insert(trader)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save trader: ${error.message}`);
    }

    return data;
  }

  /**
   * Update an existing trader
   */
  async updateTrader(id: string, updates: Partial<ServerTrader>): Promise<ServerTrader> {
    if (!supabase) {
      throw new Error('Supabase not initialized');
    }
    const { data, error } = await supabase
      .from('traders')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update trader: ${error.message}`);
    }

    return data;
  }

  /**
   * Get all traders for the current user
   */
  async getUserTraders(): Promise<ServerTrader[]> {
    if (!supabase) {
      console.warn('Supabase not initialized');
      return [];
    }
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return [];
    }

    const { data, error } = await supabase
      .from('traders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch traders: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Delete a trader
   */
  async deleteTrader(id: string): Promise<void> {
    const { error } = await supabase
      .from('traders')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete trader: ${error.message}`);
    }
  }

  /**
   * Get recent signals for a trader
   */
  async getTraderSignals(traderId: string, limit: number = 10): Promise<TraderSignal[]> {
    if (!supabase) {
      console.warn('[ServerExecutionService] Supabase not initialized');
      return [];
    }

    const { data, error } = await supabase
      .from('trader_signals')
      .select('*')
      .eq('trader_id', traderId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch signals: ${error.message}`);
    }

    return data || [];
  }

  /**
   * Fetch recent signals from the database (all traders)
   * This is used on app initialization to load existing signals
   */
  async fetchRecentSignals(limit: number = 100): Promise<TraderSignal[]> {
    if (!supabase) {
      console.warn('[ServerExecutionService] Supabase not initialized - skipping signal fetch');
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[ServerExecutionService] Failed to fetch signals:', error);
        return [];
      }

      // Convert database signals to TraderSignal format
      const signals: TraderSignal[] = (data || []).map((signal: any) => ({
        id: signal.id,
        trader_id: signal.trader_id,
        symbols: [signal.symbol], // Database stores one symbol per signal
        timestamp: signal.created_at || signal.timestamp,
        metadata: signal
      }));

      console.log(`[ServerExecutionService] Fetched ${signals.length} recent signals from database`);
      return signals;
    } catch (error) {
      console.error('[ServerExecutionService] Error fetching signals:', error);
      return [];
    }
  }

  /**
   * Manually trigger trader execution (for testing)
   * In production, this is handled by the scheduled Edge Function
   */
  async triggerTraderExecution(traderId: string, symbols: string[]): Promise<ExecutionResult> {
    const response = await fetch(`${supabaseUrl}/functions/v1/execute-trader`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({
        traderId,
        symbols
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Execution failed: ${error}`);
    }

    return response.json();
  }

  /**
   * Toggle trader enabled state
   */
  async toggleTraderEnabled(id: string, enabled: boolean): Promise<void> {
    await this.updateTrader(id, { enabled });
  }

  /**
   * Fetch klines data using the klineDataService
   */
  async fetchKlines(symbol: string, timeframe: KlineInterval, limit: number = 100): Promise<KlineResponse> {
    const request: KlineRequest = {
      symbol,
      timeframe,
      limit
    };

    try {
      const response = await klineDataService.fetchKlines(request);

      // Log cache statistics periodically
      const stats = klineDataService.getStats();
      if (stats.hits + stats.misses > 0 && (stats.hits + stats.misses) % 100 === 0) {
        const hitRate = ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1);
        console.log(`[ServerExecutionService] Cache stats - Hit rate: ${hitRate}%, Size: ${stats.size}/${100}, Memory: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)}MB`);
      }

      return response;
    } catch (error) {
      console.error(`[ServerExecutionService] Failed to fetch klines for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Fetch klines for multiple symbols in batch
   */
  async fetchMultipleKlines(
    symbols: string[],
    timeframe: KlineInterval,
    limit: number = 100
  ): Promise<Map<string, KlineResponse>> {
    const requests: KlineRequest[] = symbols.map(symbol => ({
      symbol,
      timeframe,
      limit
    }));

    try {
      const results = await klineDataService.fetchMultipleKlines(requests);
      return results;
    } catch (error) {
      console.error('[ServerExecutionService] Batch fetch failed:', error);
      throw error;
    }
  }

  /**
   * Prefetch related symbols in background
   */
  async prefetchRelatedSymbols(
    baseSymbol: string,
    relatedSymbols: string[],
    timeframe: KlineInterval
  ): Promise<void> {
    // Filter out symbols that are too different
    const symbolsToFetch = relatedSymbols.filter(symbol => {
      // Only prefetch USDT pairs similar to base
      return symbol.endsWith('USDT') && symbol !== baseSymbol;
    }).slice(0, 5); // Limit to 5 related symbols

    if (symbolsToFetch.length > 0) {
      console.log(`[ServerExecutionService] Prefetching ${symbolsToFetch.length} related symbols for ${baseSymbol}`);
      await klineDataService.prefetchRelatedSymbols(baseSymbol, symbolsToFetch, timeframe);
    }
  }

  /**
   * Check connection health
   */
  async checkHealth(): Promise<{
    redis: boolean;
    supabase: boolean;
    latency: number;
  }> {
    const startTime = Date.now();
    let redisHealthy = false;
    let supabaseHealthy = false;

    // Check Redis via edge function
    try {
      const response = await this.fetchKlines('BTCUSDT', '5m' as KlineInterval, 1);
      redisHealthy = response.klines.length > 0 || response.error === undefined;
    } catch {
      redisHealthy = false;
    }

    // Check Supabase
    try {
      if (supabase) {
        const { error } = await supabase.from('traders').select('id').limit(1);
        supabaseHealthy = !error;
      }
    } catch {
      supabaseHealthy = false;
    }

    return {
      redis: redisHealthy,
      supabase: supabaseHealthy,
      latency: Date.now() - startTime
    };
  }

  /**
   * Clear cache for specific symbol
   */
  clearSymbolCache(symbol: string): void {
    klineDataService.invalidateSymbol(symbol);
    console.log(`[ServerExecutionService] Cache cleared for ${symbol}`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return klineDataService.getStats();
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.signalChannel) {
      await this.signalChannel.unsubscribe();
      this.signalChannel = null;
    }
    this.signalCallbacks.clear();

    // Clear cache on cleanup
    klineDataService.clearCache();
  }
}

export const serverExecutionService = new ServerExecutionService();