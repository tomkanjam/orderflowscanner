/**
 * State Synchronizer - Batch writes to Supabase
 * Handles efficient state synchronization between Fly machine and database
 */

import { EventEmitter } from 'events';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  IStateSynchronizer,
  CloudMetricsRecord,
  CloudEventRecord,
  CloudEventType
} from '../types';

interface PendingSignal {
  trader_id: string;
  symbol: string;
  price: number;
  matched_conditions: string[];
  status: string;
  source: 'cloud'; // Always 'cloud' for Fly machine signals
  machine_id: string; // Reference to cloud_machines table (UUID from cloud_machines.id)
  created_at: string;
}

interface PendingMetrics {
  machine_id: string;
  cpu_usage_vcpus: number;
  memory_used_mb: number;
  memory_total_mb: number;
  active_signals: number;
  analysis_queue_depth: number;
  websocket_latency_ms: number;
  filter_execution_time_ms: number;
  ai_analysis_time_ms: number;
  signals_created_count: number;
  analyses_completed_count: number;
  errors_count: number;
}

interface PendingEvent {
  machine_id: string;
  user_id: string;
  event_type: CloudEventType;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
}

export class StateSynchronizer extends EventEmitter implements IStateSynchronizer {
  private supabase: SupabaseClient;
  private userId: string = '';
  private machineId: string = '';

  private signalQueue: PendingSignal[] = [];
  private metricsQueue: PendingMetrics[] = [];
  private eventQueue: PendingEvent[] = [];

  private config = {
    batchInterval: 10000, // 10 seconds
    maxBatchSize: 100,
    maxQueueSize: 1000
  };

  private batchInterval: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  // Counters for metrics
  private metricsCounters = {
    signalsCreated: 0,
    analysesCompleted: 0,
    errors: 0
  };

  constructor() {
    super();

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async initialize(userId: string, machineId: string): Promise<void> {
    this.userId = userId;

    console.log(`[StateSynchronizer] Initializing for user ${userId}, machine ${machineId}`);

    // Look up the machine UUID from cloud_machines table
    const { data, error } = await this.supabase
      .from('cloud_machines')
      .select('id')
      .eq('machine_id', machineId)
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw new Error(`Failed to find cloud machine with machine_id ${machineId}: ${error?.message || 'Not found'}`);
    }

    this.machineId = data.id; // Use the UUID, not the Fly machine ID
    console.log(`[StateSynchronizer] Resolved machine UUID: ${this.machineId}`);

    // Start batch write interval
    this.startBatchInterval();

    console.log(`[StateSynchronizer] Initialized (batch interval: ${this.config.batchInterval}ms)`);
  }

  private startBatchInterval(): void {
    this.batchInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.flush();
      }
    }, this.config.batchInterval);
  }

  queueSignal(signal: any): void {
    if (this.signalQueue.length >= this.config.maxQueueSize) {
      console.warn('[StateSynchronizer] Signal queue full, dropping oldest signal');
      this.signalQueue.shift();
    }

    const queuedSignal = {
      trader_id: signal.trader_id,
      symbol: signal.symbol,
      price: signal.price,
      matched_conditions: signal.matched_conditions || [],
      status: signal.status || 'new',
      source: 'cloud' as const, // Always 'cloud' for Fly machine
      machine_id: this.machineId, // Reference to cloud_machines.id (UUID)
      created_at: signal.created_at || new Date().toISOString()
    };

    this.signalQueue.push(queuedSignal);
    this.metricsCounters.signalsCreated++;

    console.log(`[StateSynchronizer] Queued signal: ${queuedSignal.symbol} (queue size: ${this.signalQueue.length})`);

    // Flush immediately if batch size reached
    if (this.signalQueue.length >= this.config.maxBatchSize) {
      console.log(`[StateSynchronizer] Batch size reached (${this.signalQueue.length}), flushing immediately`);
      this.flush().catch(err =>
        console.error('[StateSynchronizer] Auto-flush failed:', err)
      );
    }
  }

  queueMetrics(metrics: Partial<CloudMetricsRecord>): void {
    const fullMetrics: PendingMetrics = {
      machine_id: this.machineId,
      cpu_usage_vcpus: metrics.cpu_usage_vcpus || 0,
      memory_used_mb: metrics.memory_used_mb || 0,
      memory_total_mb: metrics.memory_total_mb || 0,
      active_signals: metrics.active_signals || 0,
      analysis_queue_depth: metrics.analysis_queue_depth || 0,
      websocket_latency_ms: metrics.websocket_latency_ms || 0,
      filter_execution_time_ms: metrics.filter_execution_time_ms || 0,
      ai_analysis_time_ms: metrics.ai_analysis_time_ms || 0,
      signals_created_count: this.metricsCounters.signalsCreated,
      analyses_completed_count: this.metricsCounters.analysesCompleted,
      errors_count: this.metricsCounters.errors
    };

    this.metricsQueue.push(fullMetrics);

    // Keep only last metrics (we don't need to buffer many)
    if (this.metricsQueue.length > 10) {
      this.metricsQueue.shift();
    }
  }

  queueEvent(
    eventType: CloudEventType,
    severity: 'info' | 'warning' | 'error',
    message: string,
    details?: Record<string, any>
  ): void {
    this.eventQueue.push({
      machine_id: this.machineId,
      user_id: this.userId,
      event_type: eventType,
      severity,
      message,
      details
    });

    if (severity === 'error') {
      this.metricsCounters.errors++;
    }

    // Keep event queue bounded
    if (this.eventQueue.length > 100) {
      this.eventQueue.shift();
    }
  }

  incrementAnalysisCount(): void {
    this.metricsCounters.analysesCompleted++;
  }

  /**
   * Queue analysis result for potential future batch operations
   * NOTE: Currently analyses are written directly by ConcurrentAnalyzer
   * This method exists for future optimizations if needed
   */
  queueAnalysis(analysisId: string, signalId: string): void {
    // Analysis already written to database by ConcurrentAnalyzer
    // Just increment counter for metrics tracking
    this.metricsCounters.analysesCompleted++;

    console.log(`[StateSynchronizer] Analysis ${analysisId} completed for signal ${signalId}`);
  }

  async flush(): Promise<void> {
    if (this.signalQueue.length === 0 && this.metricsQueue.length === 0 && this.eventQueue.length === 0) {
      return; // Nothing to flush
    }

    console.log(`[StateSynchronizer] Flushing queues: ${this.signalQueue.length} signals, ${this.metricsQueue.length} metrics, ${this.eventQueue.length} events`);

    const signalsToWrite = this.signalQueue.splice(0, this.config.maxBatchSize);
    const metricsToWrite = this.metricsQueue.splice(0, 1); // Only write latest metrics
    const eventsToWrite = this.eventQueue.splice(0, 50); // Max 50 events per batch

    const promises: Array<Promise<void>> = [];

    // Write signals
    if (signalsToWrite.length > 0) {
      console.log(`[StateSynchronizer] Writing ${signalsToWrite.length} signals to database...`);
      console.log(`[StateSynchronizer]   Sample signal:`, JSON.stringify(signalsToWrite[0], null, 2));

      const promise = (async () => {
        const { data, error } = await this.supabase
          .from('signals')
          .insert(signalsToWrite)
          .select();

        if (error) {
          console.error('[StateSynchronizer] ❌ Failed to write signals:', error);
          console.error('[StateSynchronizer]   Error details:', JSON.stringify(error, null, 2));
          // Re-queue on failure
          this.signalQueue.unshift(...signalsToWrite);
        } else {
          console.log(`[StateSynchronizer] ✅ Successfully wrote ${signalsToWrite.length} signals to database`);
          if (data && data.length > 0) {
            console.log(`[StateSynchronizer]   Sample written signal ID:`, data[0].id);
          }
        }
      })();
      promises.push(promise);
    }

    // Write metrics
    if (metricsToWrite.length > 0) {
      const promise = (async () => {
        const { error } = await this.supabase
          .from('cloud_metrics')
          .insert(metricsToWrite);

        if (error) {
          console.error('[StateSynchronizer] Failed to write metrics:', error);
        }
      })();
      promises.push(promise);
    }

    // Write events
    if (eventsToWrite.length > 0) {
      const promise = (async () => {
        const { error } = await this.supabase
          .from('cloud_events')
          .insert(eventsToWrite);

        if (error) {
          console.error('[StateSynchronizer] Failed to write events:', error);
        }
      })();
      promises.push(promise);
    }

    await Promise.all(promises);
  }

  async updateMachineStatus(status: string): Promise<void> {
    const { error } = await this.supabase
      .from('cloud_machines')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', this.machineId);

    if (error) {
      console.error('[StateSynchronizer] Failed to update machine status:', error);
    } else {
      console.log(`[StateSynchronizer] Updated machine status to: ${status}`);
    }
  }

  async updateHeartbeat(): Promise<void> {
    const { error } = await this.supabase
      .from('cloud_machines')
      .update({
        last_health_check: new Date().toISOString()
      })
      .eq('id', this.machineId);

    if (error) {
      console.error('[StateSynchronizer] Failed to update heartbeat:', error);
    }
  }

  async loadTraders(): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('traders')
      .select('*')
      .eq('user_id', this.userId)
      .eq('enabled', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[StateSynchronizer] Failed to load traders:', error);
      return [];
    }

    console.log(`[StateSynchronizer] Loaded ${data?.length || 0} traders`);

    // Parse JSON fields if they're returned as strings
    const traders = (data || []).map(trader => {
      const parsed = { ...trader };

      // Parse filter if it's a string
      if (typeof parsed.filter === 'string') {
        try {
          parsed.filter = JSON.parse(parsed.filter);
        } catch (e) {
          console.error(`[StateSynchronizer] Failed to parse filter for trader ${trader.id}:`, e);
        }
      }

      // Parse strategy if it's a string
      if (typeof parsed.strategy === 'string') {
        try {
          parsed.strategy = JSON.parse(parsed.strategy);
        } catch (e) {
          console.error(`[StateSynchronizer] Failed to parse strategy for trader ${trader.id}:`, e);
        }
      }

      // Parse metrics if it's a string
      if (typeof parsed.metrics === 'string') {
        try {
          parsed.metrics = JSON.parse(parsed.metrics);
        } catch (e) {
          console.error(`[StateSynchronizer] Failed to parse metrics for trader ${trader.id}:`, e);
        }
      }

      // Parse cloud_config if it's a string
      if (typeof parsed.cloud_config === 'string') {
        try {
          parsed.cloud_config = JSON.parse(parsed.cloud_config);
        } catch (e) {
          console.error(`[StateSynchronizer] Failed to parse cloud_config for trader ${trader.id}:`, e);
        }
      }

      // Parse exchange_config if it's a string
      if (typeof parsed.exchange_config === 'string') {
        try {
          parsed.exchange_config = JSON.parse(parsed.exchange_config);
        } catch (e) {
          console.error(`[StateSynchronizer] Failed to parse exchange_config for trader ${trader.id}:`, e);
        }
      }

      return parsed;
    });

    console.log(`[StateSynchronizer] Parsed ${traders.length} traders with JSON fields`);
    return traders;
  }

  async shutdown(): Promise<void> {
    console.log('[StateSynchronizer] Shutting down...');
    this.isShuttingDown = true;

    // Stop batch interval
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }

    // Final flush
    await this.flush();

    // Update machine status
    await this.updateMachineStatus('stopped');

    console.log('[StateSynchronizer] Shutdown complete');
  }

  getStats() {
    return {
      signalQueueDepth: this.signalQueue.length,
      metricsQueueDepth: this.metricsQueue.length,
      eventQueueDepth: this.eventQueue.length,
      counters: { ...this.metricsCounters }
    };
  }
}
