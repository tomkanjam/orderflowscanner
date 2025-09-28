import { createClient } from '@supabase/supabase-js';
import { RealtimeChannel } from '@supabase/supabase-js';

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

    // Create new subscription
    this.signalChannel = supabase.channel('signals')
      .on('broadcast', { event: 'new-signal' }, (payload) => {
        const signal = payload.payload as TraderSignal;

        // Notify all registered callbacks for this trader
        const callback = this.signalCallbacks.get(signal.trader_id);
        if (callback) {
          callback(signal);
        }
      })
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
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.signalChannel) {
      await this.signalChannel.unsubscribe();
      this.signalChannel = null;
    }
    this.signalCallbacks.clear();
  }
}

export const serverExecutionService = new ServerExecutionService();