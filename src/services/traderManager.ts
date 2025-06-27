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
  private initialized = false;

  constructor() {
    this.initialize();
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
        data.forEach(trader => {
          this.traders.set(trader.id, this.deserializeTrader(trader));
        });
      }

      this.initialized = true;
      this.notifySubscribers();
    } catch (error) {
      console.error('Failed to initialize TraderManager:', error);
    }
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

  // Helper methods
  private notifySubscribers() {
    const traders = this.getTradersList();
    this.subscribers.forEach(callback => callback(traders));
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
      exchange_config: trader.exchangeConfig ? JSON.stringify(trader.exchangeConfig) : null,
      filter: JSON.stringify(trader.filter),
      strategy: JSON.stringify(trader.strategy),
      metrics: JSON.stringify(trader.metrics),
      created_at: trader.createdAt.toISOString(),
      updated_at: trader.updatedAt.toISOString(),
    };
  }

  private deserializeTrader(data: any): Trader {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      enabled: data.enabled,
      mode: data.mode,
      exchangeConfig: data.exchange_config ? JSON.parse(data.exchange_config) : undefined,
      filter: JSON.parse(data.filter),
      strategy: JSON.parse(data.strategy),
      metrics: JSON.parse(data.metrics),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
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