import { v4 as uuidv4 } from 'uuid';
import { 
  Trader, 
  ITraderManager, 
  TraderMetrics, 
  PerformanceMetrics 
} from '../abstractions/trader.interfaces';
import { supabase } from '../config/supabase';

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
        const { error } = await supabase
          .from('traders')
          .delete()
          .eq('id', id);

        if (error) throw error;
      }

      this.traders.delete(id);
      this.notifyDeleteSubscribers(id); // Notify deletion listeners first
      this.notifySubscribers();
    } catch (error) {
      console.error('Failed to delete trader:', error);
      throw new Error('Failed to delete trader');
    }
  }

  async enableTrader(id: string): Promise<void> {
    await this.updateTrader(id, { enabled: true });
  }

  async disableTrader(id: string): Promise<void> {
    await this.updateTrader(id, { enabled: false });
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
      category: trader.category,
      difficulty: trader.difficulty,
      admin_notes: trader.adminNotes,
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
        // Custom signals should be accessible to their creators regardless of tier
        // Check user_id to identify custom signals (user-created vs system/built-in)
        accessTier: data.user_id ? 'anonymous' : (data.access_tier || 'free'),
        isBuiltIn: data.is_built_in || false,
        category: data.category,
        difficulty: data.difficulty,
        adminNotes: data.admin_notes,
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
}

// Create singleton instance
export const traderManager = new TraderManager();