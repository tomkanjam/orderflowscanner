import { v4 as uuidv4 } from 'uuid';
import {
  Trader,
  ITraderManager,
  TraderMetrics,
  PerformanceMetrics
} from '../abstractions/trader.interfaces';
import { supabase } from '../config/supabase';
import { traderPreferences } from './traderPreferences';

export class TraderManager implements ITraderManager {
  private traders: Map<string, Trader> = new Map();
  private subscribers: Set<(traders: Trader[]) => void> = new Set();
  private deleteSubscribers: Set<(traderId: string) => void> = new Set();
  private initialized = false;
  private pendingNotification: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor() {
    this.initialize();
    this.startCleanupScheduler();
  }

  private async initialize() {
    if (!supabase) {
      console.warn('Supabase not configured. TraderManager will operate in local mode only.');
      this.initialized = true;
      return;
    }

    try {
      // Load traders from Supabase
      const { data, error } = await supabase
        .from('traders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load traders:', error);
        return;
      }

      if (data) {
        console.log('[TraderManager] Loading', data.length, 'traders from Supabase');
        data.forEach(trader => {
          const deserialized = this.deserializeTrader(trader);
          console.log(`[TraderManager] Loaded trader ${deserialized.name}:`, {
            enabled: deserialized.enabled,
            hasFilter: !!deserialized.filter,
            hasFilterCode: !!deserialized.filter?.code,
            filterCodeLength: deserialized.filter?.code?.length || 0
          });
          this.traders.set(trader.id, deserialized);
        });
      }

      this.initialized = true;
      this.notifySubscribers();
    } catch (error) {
      console.error('Failed to initialize TraderManager:', error);
    }
  }

  /**
   * Start periodic cleanup scheduler
   */
  private startCleanupScheduler() {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      if (!this.isShuttingDown) {
        this.performCleanup();
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Perform periodic cleanup
   */
  private performCleanup() {
    // Clean up disabled traders that haven't been used in 24 hours
    const now = Date.now();
    const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
    
    const staleTradersCount = Array.from(this.traders.values())
      .filter(trader => 
        !trader.enabled && 
        trader.metrics && 
        (now - new Date(trader.metrics.lastAnalysis || 0).getTime()) > staleThreshold
      ).length;
    
    if (staleTradersCount > 0) {
      console.log(`[TraderManager] Found ${staleTradersCount} stale disabled traders (cleanup deferred to maintain stability)`);
    }
    
    // Report memory stats
    console.log('[TraderManager] Memory stats:', {
      traders: this.traders.size,
      subscribers: this.subscribers.size,
      deleteSubscribers: this.deleteSubscribers.size
    });
  }

  /**
   * Clean up all resources
   */
  public dispose() {
    console.log('[TraderManager] Disposing...');
    this.isShuttingDown = true;
    
    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Clear pending notification
    if (this.pendingNotification) {
      clearTimeout(this.pendingNotification);
      this.pendingNotification = null;
    }
    
    // Clear all collections
    this.traders.clear();
    this.subscribers.clear();
    this.deleteSubscribers.clear();
    
    console.log('[TraderManager] Disposed');
  }

  async createTrader(
    trader: Omit<Trader, 'id' | 'metrics' | 'createdAt' | 'updatedAt'>
  ): Promise<Trader> {
    const id = uuidv4();
    const now = new Date();
    
    const newTrader: Trader = {
      ...trader,
      id,
      metrics: this.createEmptyMetrics(),
      createdAt: now,
      updatedAt: now,
    };

    // [VALIDATION] Defense-in-depth: Prevent contradictory ownership state
    // Built-in signals MUST NOT have userId (system-owned)
    if (newTrader.isBuiltIn && newTrader.userId) {
      console.warn(
        `[traderManager] Auto-fixing: Built-in trader "${newTrader.name}" had userId set. Clearing userId.`,
        { traderId: newTrader.id, userId: newTrader.userId }
      );
      newTrader.userId = undefined;
      newTrader.ownershipType = 'system';
    }

    try {
      if (supabase) {
        const { error } = await supabase
          .from('traders')
          .insert([this.serializeTrader(newTrader)]);

        if (error) throw error;
      }

      this.traders.set(id, newTrader);
      this.notifySubscribers();

      return newTrader;
    } catch (error) {
      console.error('Failed to create trader:', error);
      throw new Error('Failed to create trader');
    }
  }

  async getTrader(id: string): Promise<Trader | null> {
    return this.traders.get(id) || null;
  }

  async getTraders(filter?: { enabled?: boolean; mode?: 'demo' | 'live' }): Promise<Trader[]> {
    let traders = Array.from(this.traders.values());

    if (filter) {
      if (filter.enabled !== undefined) {
        traders = traders.filter(t => t.enabled === filter.enabled);
      }
      if (filter.mode) {
        traders = traders.filter(t => t.mode === filter.mode);
      }
    }

    return traders;
  }

  async updateTrader(id: string, updates: Partial<Trader>): Promise<Trader> {
    const trader = this.traders.get(id);
    if (!trader) {
      throw new Error(`Trader ${id} not found`);
    }

    const updatedTrader: Trader = {
      ...trader,
      ...updates,
      id, // Ensure ID cannot be changed
      updatedAt: new Date(),
    };

    // [VALIDATION] Defense-in-depth: Prevent contradictory ownership state
    // Built-in signals MUST NOT have userId (system-owned)
    if (updatedTrader.isBuiltIn && updatedTrader.userId) {
      console.warn(
        `[traderManager] Auto-fixing: Built-in trader "${updatedTrader.name}" had userId set. Clearing userId.`,
        { traderId: updatedTrader.id, userId: updatedTrader.userId }
      );
      updatedTrader.userId = undefined;
      updatedTrader.ownershipType = 'system';
    }

    try {
      if (supabase) {
        const { error } = await supabase
          .from('traders')
          .update(this.serializeTrader(updatedTrader))
          .eq('id', id);

        if (error) throw error;
      }

      this.traders.set(id, updatedTrader);
      this.notifySubscribers();

      return updatedTrader;
    } catch (error) {
      console.error('Failed to update trader:', error);
      throw new Error('Failed to update trader');
    }
  }

  async deleteTrader(id: string): Promise<void> {
    try {
      if (supabase) {
        // Use .select() to verify deletion actually happened
        // RLS policies can silently block deletes, returning empty data array
        const { data, error } = await supabase
          .from('traders')
          .delete()
          .eq('id', id)
          .select();

        if (error) throw error;

        // Check if any rows were actually deleted
        // If data is empty, either RLS blocked it or record doesn't exist
        if (!data || data.length === 0) {
          throw new Error('You do not have permission to delete this trader');
        }
      }

      this.traders.delete(id);
      this.notifyDeleteSubscribers(id); // Notify deletion listeners first
      this.notifySubscribers();
    } catch (error) {
      console.error('Failed to delete trader:', error);
      // Re-throw with user-friendly message if available
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to delete trader');
    }
  }

  /**
   * Execute trader immediately using cached data
   * This generates initial signals right after trader creation
   */
  async executeTraderImmediate(id: string): Promise<{
    traderId: string;
    timestamp: string;
    totalSymbols: number;
    matchCount: number;
    executionTimeMs: number;
  }> {
    try {
      if (!supabase) {
        throw new Error('Supabase client not initialized');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('User not authenticated');
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/execute-trader-immediate`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ traderId: id }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute trader');
      }

      const result = await response.json();
      console.log(`[traderManager] Immediate execution completed: ${result.matchCount} signals generated`);

      return result;
    } catch (error) {
      console.error('Failed to execute trader immediately:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to execute trader');
    }
  }

  async enableTrader(
    id: string,
    options?: {
      userTier?: string | null;
      userId?: string | null;
      skipTierCheck?: boolean;
    }
  ): Promise<void> {
    const trader = this.traders.get(id);
    if (!trader) {
      throw new Error(`Trader ${id} not found`);
    }

    // [TIER ENFORCEMENT] Check if user can enable this trader
    if (!options?.skipTierCheck && trader.ownershipType === 'user') {
      const { canEnableTrader } = await import('../utils/tierAccess');

      // Count currently enabled custom traders for this user
      const enabledCount = Array.from(this.traders.values()).filter(
        t => t.userId === options?.userId && t.enabled && t.ownershipType === 'user'
      ).length;

      const { canEnable, reason } = canEnableTrader(
        trader,
        options?.userTier as any,
        options?.userId || null,
        enabledCount
      );

      if (!canEnable) {
        throw new Error(reason || 'Cannot enable trader due to tier restrictions');
      }
    }

    await this.updateTrader(id, { enabled: true });
  }

  async disableTrader(id: string): Promise<void> {
    await this.updateTrader(id, { enabled: false });
  }

  async updateCloudConfig(id: string, cloudConfigUpdates: Partial<import('../abstractions/trader.interfaces').CloudConfig>): Promise<void> {
    const trader = this.traders.get(id);
    if (!trader) {
      throw new Error(`Trader ${id} not found`);
    }

    const updatedCloudConfig = {
      enabledInCloud: false,
      notifyOnSignal: true,
      notifyOnAnalysis: true,
      ...trader.cloud_config,
      ...cloudConfigUpdates,
    };

    await this.updateTrader(id, {
      cloud_config: updatedCloudConfig,
    });
  }

  async updateMetrics(id: string, metrics: Partial<TraderMetrics>): Promise<void> {
    const trader = this.traders.get(id);
    if (!trader) return;

    await this.updateTrader(id, {
      metrics: {
        ...trader.metrics,
        ...metrics,
      },
    });
  }

  async resetMetrics(id: string, mode?: 'demo' | 'live' | 'all'): Promise<void> {
    const trader = this.traders.get(id);
    if (!trader) return;

    let updatedMetrics = { ...trader.metrics };

    if (mode === 'demo' || mode === 'all') {
      updatedMetrics.demoMetrics = this.createEmptyPerformanceMetrics();
    }

    if (mode === 'live' || mode === 'all') {
      updatedMetrics.liveMetrics = this.createEmptyPerformanceMetrics();
    }

    if (mode === 'all' || !mode) {
      updatedMetrics = this.createEmptyMetrics();
    }

    await this.updateTrader(id, { metrics: updatedMetrics });
  }

  subscribe(callback: (traders: Trader[]) => void): () => void {
    this.subscribers.add(callback);
    
    // Immediately call with current traders if initialized
    if (this.initialized) {
      callback(this.getTradersList());
    }

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(callback);
    };
  }

  // Subscribe to deletion events
  subscribeToDeletes(callback: (traderId: string) => void): () => void {
    this.deleteSubscribers.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.deleteSubscribers.delete(callback);
    };
  }

  // Helper methods
  private notifySubscribers() {
    // Clear any pending notification
    if (this.pendingNotification) {
      clearTimeout(this.pendingNotification);
    }
    
    // Debounce notifications by 50ms to batch rapid updates
    this.pendingNotification = setTimeout(() => {
      console.log('[TraderManager] Notifying subscribers (debounced)');
      const traders = this.getTradersList();
      this.subscribers.forEach(callback => callback(traders));
      this.pendingNotification = null;
    }, 50);
  }

  private notifyDeleteSubscribers(traderId: string) {
    this.deleteSubscribers.forEach(callback => callback(traderId));
  }

  private getTradersList(): Trader[] {
    return Array.from(this.traders.values());
  }

  private createEmptyMetrics(): TraderMetrics {
    return {
      totalSignals: 0,
      activePositions: 0,
      closedPositions: 0,
      totalPnL: 0,
      totalPnLPercent: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      demoMetrics: this.createEmptyPerformanceMetrics(),
      liveMetrics: this.createEmptyPerformanceMetrics(),
    };
  }

  private createEmptyPerformanceMetrics(): PerformanceMetrics {
    return {
      trades: 0,
      wins: 0,
      losses: 0,
      pnl: 0,
      pnlPercent: 0,
      avgWin: 0,
      avgLoss: 0,
      maxDrawdown: 0,
    };
  }

  private serializeTrader(trader: Trader): any {
    return {
      id: trader.id,
      name: trader.name,
      description: trader.description,
      enabled: trader.enabled,
      mode: trader.mode,
      exchange_config: trader.exchangeConfig || null,
      filter: trader.filter,  // PostgreSQL JSONB handles serialization
      strategy: trader.strategy,  // PostgreSQL JSONB handles serialization
      metrics: trader.metrics,  // PostgreSQL JSONB handles serialization
      created_at: trader.createdAt.toISOString(),
      updated_at: trader.updatedAt.toISOString(),
      // Subscription fields
      user_id: trader.userId,
      ownership_type: trader.ownershipType,
      access_tier: trader.accessTier,
      is_built_in: trader.isBuiltIn,
      default_enabled: trader.default_enabled,
      category: trader.category,
      difficulty: trader.difficulty,
      admin_notes: trader.adminNotes,
      // Language field for Go/JavaScript execution routing
      language: trader.filter?.language || 'javascript',
      // Automation toggles
      auto_analyze_signals: trader.auto_analyze_signals,
      auto_execute_trades: trader.auto_execute_trades,
    };
  }

  private deserializeTrader(data: any): Trader {
    try {
      const filter = typeof data.filter === 'string' ? JSON.parse(data.filter) : data.filter;
      const strategy = typeof data.strategy === 'string' ? JSON.parse(data.strategy) : data.strategy;
      const metrics = typeof data.metrics === 'string' ? JSON.parse(data.metrics) : data.metrics;

      // Debug logging for custom signal access
      const determinedAccessTier = data.user_id ? 'anonymous' : (data.access_tier || 'free');
      console.log(`[DEBUG] Deserializing trader:`, {
        name: data.name,
        user_id: data.user_id,
        is_built_in: data.is_built_in,
        access_tier: data.access_tier,
        determinedAccessTier,
        ownership_type: data.ownership_type
      });

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        enabled: data.enabled,
        mode: data.mode,
        exchangeConfig: data.exchange_config ? JSON.parse(data.exchange_config) : undefined,
        filter: filter,
        strategy: strategy,
        metrics: metrics,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        // Subscription fields
        userId: data.user_id,
        ownershipType: data.ownership_type || 'user',
        accessTier: data.access_tier || 'free',
        isBuiltIn: data.is_built_in || false,
        default_enabled: data.default_enabled,
        category: data.category,
        difficulty: data.difficulty,
        adminNotes: data.admin_notes,
        // Automation toggles
        auto_analyze_signals: data.auto_analyze_signals,
        auto_execute_trades: data.auto_execute_trades,
      };
    } catch (error) {
      console.error('[TraderManager] Error deserializing trader', data.name, error);
      throw error;
    }
  }

  // Public method to get enabled traders for screener
  async getEnabledTraders(): Promise<Trader[]> {
    return this.getTraders({ enabled: true });
  }

  // Method to update trader signal count
  async incrementSignalCount(traderId: string): Promise<void> {
    const trader = this.traders.get(traderId);
    if (!trader) return;

    const currentMetrics = trader.mode === 'demo'
      ? trader.metrics.demoMetrics!
      : trader.metrics.liveMetrics!;

    await this.updateMetrics(traderId, {
      totalSignals: trader.metrics.totalSignals + 1,
      lastSignalAt: new Date(),
    });
  }

  /**
   * Get the effective enabled state for a trader
   * For built-in traders: checks admin gate, user preference, then default_enabled
   * For custom traders: returns trader.enabled directly
   */
  getEffectiveEnabled(trader: Trader, userId?: string): boolean {
    // Admin gate: if admin disabled, always return false
    if (!trader.enabled) {
      return false;
    }

    // Custom traders: use database enabled field directly
    if (!trader.isBuiltIn) {
      return trader.enabled;
    }

    // Built-in traders: check user preference, fallback to default_enabled
    const userPref = traderPreferences.getTraderEnabled(trader.id, userId);
    return userPref ?? trader.default_enabled ?? false;
  }

  /**
   * Toggle user preference for a trader
   * For built-in traders: updates localStorage
   * For custom traders: updates database enabled field with tier validation
   */
  async toggleUserPreference(
    traderId: string,
    userId?: string,
    userTier?: string | null
  ): Promise<void> {
    const trader = this.traders.get(traderId);
    if (!trader) {
      throw new Error(`Trader ${traderId} not found`);
    }

    if (!trader.isBuiltIn) {
      // Custom traders: toggle database field with tier validation
      if (trader.enabled) {
        await this.disableTrader(traderId);
      } else {
        await this.enableTrader(traderId, {
          userTier,
          userId: userId || null,
          skipTierCheck: false
        });
      }
      return;
    }

    // Built-in traders: toggle localStorage preference
    const currentPref = traderPreferences.getTraderEnabled(traderId, userId);
    const currentEffective = currentPref ?? trader.default_enabled ?? false;

    traderPreferences.setTraderEnabled(traderId, !currentEffective, userId);

    // Notify subscribers to trigger UI update
    this.notifySubscribers();
  }

  /**
   * Get all traders with their effective enabled state
   */
  getEffectiveTraders(userId?: string): Trader[] {
    return Array.from(this.traders.values()).map(trader => ({
      ...trader,
      enabled: this.getEffectiveEnabled(trader, userId)
    }));
  }
}

// Create singleton instance
export const traderManager = new TraderManager();