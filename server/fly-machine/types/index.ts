/**
 * Type definitions for Fly.io Machine Cloud Execution
 * Based on: issues/2025-09-30-fly-machine-elite-trader-execution.md
 */

import { Trader, TraderMetrics } from '../shared/abstractions/trader.interfaces';
import { Ticker, Kline } from '../shared/types/types';

// ============================================================================
// Fly Machine Configuration
// ============================================================================

export interface FlyMachineConfig {
  machineId: string;
  userId: string;
  region: 'sin' | 'iad' | 'fra'; // Singapore, Ashburn, Frankfurt
  cpus: number; // 1-8 vCPUs
  memory: number; // MB (256 * cpus)
  status: 'provisioning' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  websocketUrl?: string;
  healthCheckUrl?: string;
  version: string;
}

// ============================================================================
// Cloud Trader (Extended Trader with Cloud Config)
// ============================================================================

export interface CloudTrader extends Omit<Trader, 'displayConfig'> {
  version: number; // Increments on each update for sync
  cloudConfig: {
    enabledInCloud: boolean;
    preferredRegion?: 'sin' | 'iad' | 'fra';
    cpuPriority?: 'low' | 'normal' | 'high';
    notifyOnSignal: boolean;
    notifyOnAnalysis: boolean;
  };
}

// ============================================================================
// Market Data
// ============================================================================

export interface MarketData {
  tickers: Map<string, Ticker>;
  klines: Map<string, Map<string, Kline[]>>; // symbol -> interval -> klines
  symbols: string[];
  timestamp: number;
}

// ============================================================================
// Signal Queue
// ============================================================================

export interface SignalQueueItem {
  id: string;
  traderId: string;
  symbol: string;
  price: number;
  matchedConditions: string[];
  createdAt: Date;
  priority: 'low' | 'normal' | 'high';
}

export interface SignalQueue {
  items: SignalQueueItem[];
  maxSize: number;
  addSignal(item: SignalQueueItem): void;
  getNext(): SignalQueueItem | null;
  getCount(): number;
  clear(): void;
}

// ============================================================================
// Analysis Queue
// ============================================================================

export interface AnalysisQueueItem {
  id: string;
  signalId: string;
  traderId: string;
  symbol: string;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
  retryCount: number;
}

export interface AnalysisQueue {
  items: AnalysisQueueItem[];
  maxSize: number;
  maxConcurrent: number;
  addAnalysis(item: AnalysisQueueItem): void;
  getNext(): AnalysisQueueItem | null;
  getCount(): number;
  clear(): void;
}

// ============================================================================
// Worker Pool Configuration
// ============================================================================

export interface WorkerPoolConfig {
  minWorkers: number;
  maxWorkers: number;
  taskTimeout: number; // milliseconds
  maxQueueSize: number;
}

export interface WorkerTask {
  id: string;
  type: 'filter' | 'analysis';
  traderId: string;
  payload: any;
  priority: 'low' | 'normal' | 'high';
  createdAt: Date;
}

export interface WorkerResult {
  taskId: string;
  traderId: string;
  success: boolean;
  data?: any;
  error?: string;
  duration: number; // milliseconds
}

// ============================================================================
// Scaling Policy
// ============================================================================

export interface ScalingPolicy {
  minCpus: number;
  maxCpus: number;
  scaleUpThreshold: number; // queue depth
  scaleDownThreshold: number; // queue depth
  cooldownPeriod: number; // seconds
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'no_change';
  targetCpus: number;
  reason: string;
  currentLoad: {
    signalQueueDepth: number;
    analysisQueueDepth: number;
    activeWorkers: number;
  };
}

// ============================================================================
// Database Records (matching Supabase schema)
// ============================================================================

export interface CloudMachineRecord {
  id: string;
  user_id: string;
  machine_id: string;
  region: string;
  status: string;
  cpus: number;
  memory_mb: number;
  websocket_url?: string;
  health_check_url?: string;
  provisioned_at?: Date;
  started_at?: Date;
  stopped_at?: Date;
  last_health_check?: Date;
  error_message?: string;
  error_count: number;
  fly_app_name?: string;
  fly_machine_version?: string;
  created_at: Date;
  updated_at: Date;
}

export interface CloudMetricsRecord {
  id: string;
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
  recorded_at: Date;
  recorded_date: Date;
}

export interface CloudCostRecord {
  id: string;
  user_id: string;
  machine_id?: string;
  vcpu_hours: number;
  cost_per_vcpu_hour: number;
  total_cost_usd: number;
  period_start: Date;
  period_end: Date;
  region?: string;
  created_at: Date;
}

export interface CloudEventRecord {
  id: string;
  machine_id: string;
  user_id: string;
  event_type: CloudEventType;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, any>;
  created_at: Date;
}

export type CloudEventType =
  | 'machine_provisioned'
  | 'machine_started'
  | 'machine_stopped'
  | 'machine_scaled'
  | 'machine_error'
  | 'config_synced'
  | 'trader_added'
  | 'trader_removed'
  | 'trader_updated'
  | 'signal_created'
  | 'analysis_completed'
  | 'websocket_connected'
  | 'websocket_disconnected'
  | 'health_check_failed';

// ============================================================================
// WebSocket Messages (Machine ↔ Browser)
// ============================================================================

export type MachineToBrowserMessage =
  | {
      type: 'status_update';
      data: {
        status: FlyMachineConfig['status'];
        cpus: number;
        uptime: number;
      };
    }
  | {
      type: 'metrics_update';
      data: {
        activeSignals: number;
        queueDepth: number;
        cpuUsage: number;
        memoryUsage: number;
      };
    }
  | {
      type: 'signal_created';
      data: {
        signalId: string;
        traderId: string;
        symbol: string;
        price: number;
      };
    }
  | {
      type: 'analysis_completed';
      data: {
        signalId: string;
        decision: string;
        confidence: number;
      };
    }
  | {
      type: 'error';
      data: {
        message: string;
        code?: string;
      };
    };

export type BrowserToMachineMessage =
  | {
      type: 'config_update';
      data: {
        traders: CloudTrader[];
        version: number;
      };
    }
  | {
      type: 'pause_execution';
      data: {};
    }
  | {
      type: 'resume_execution';
      data: {};
    }
  | {
      type: 'force_sync';
      data: {};
    };

// ============================================================================
// Trader Result (from Worker)
// ============================================================================

export interface TraderResult {
  traderId: string;
  traderName: string;
  enabled: boolean;
  matches: {
    symbol: string;
    price: number;
    matchedConditions: string[];
    timestamp: number;
  }[];
  error?: string;
  executionTime: number; // milliseconds
}

// ============================================================================
// Service Interfaces
// ============================================================================

export interface IBinanceWebSocketClient {
  connect(symbols: string[]): Promise<void>;
  disconnect(): Promise<void>;
  getTickers(): Map<string, Ticker>;
  getKlines(symbol: string, interval: string): Kline[];
  on(event: 'ticker' | 'kline', callback: (data: any) => void): void;
  getConnectionStatus(): 'connected' | 'disconnected' | 'reconnecting';
}

export interface IParallelScreener {
  initialize(numWorkers: number): Promise<void>;
  executeFilters(traders: CloudTrader[], marketData: MarketData): Promise<Map<string, TraderResult>>;
  scaleWorkerPool(targetWorkers: number): Promise<void>;
  shutdown(): Promise<void>;
}

export interface IConcurrentAnalyzer {
  initialize(): Promise<void>;
  analyzeSignal(signalId: string, traderId: string, symbol: string): Promise<any>;
  getQueueDepth(): number;
  shutdown(): Promise<void>;
}

export interface IStateSynchronizer {
  initialize(userId: string, machineId: string): Promise<void>;
  queueSignal(signal: any): void;
  queueMetrics(metrics: Partial<CloudMetricsRecord>): void;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface IDynamicScaler {
  initialize(config: FlyMachineConfig, policy: ScalingPolicy): Promise<void>;
  evaluateScaling(): Promise<ScalingDecision>;
  executeScaling(decision: ScalingDecision): Promise<void>;
  shutdown(): Promise<void>;
}

export interface IHealthMonitor {
  start(): Promise<void>;
  stop(): Promise<void>;
  getHealth(): HealthStatus;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastCheck: Date;
  components: {
    binance: boolean;
    database: boolean;
    workers: boolean;
  };
  metrics: {
    cpuUsage: number;
    memoryUsage: number;
    activeSignals: number;
    queueDepth: number;
  };
}
