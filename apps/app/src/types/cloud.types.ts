/**
 * Cloud Execution Type Definitions
 * Matches database schema from migration 011
 */

/**
 * Cloud machine record from cloud_machines table
 */
export interface CloudMachine {
  id: string; // UUID
  user_id: string; // UUID
  machine_id: string; // e.g., "vyx-63eea370"
  region: 'sin' | 'iad' | 'fra'; // Singapore, Ashburn, Frankfurt
  status: 'provisioning' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
  cpus: number; // 1-8
  memory_mb: number;

  // Connection info
  websocket_url: string | null;
  health_check_url: string | null;

  // Lifecycle timestamps
  provisioned_at: string | null; // ISO timestamp
  started_at: string | null;
  stopped_at: string | null;
  last_health_check: string | null;

  // Error tracking
  error_message: string | null;
  error_count: number;

  // Metadata
  fly_app_name: string | null;
  fly_machine_version: string | null;
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * Cloud signal record from cloud_signals table
 */
export interface CloudSignal {
  id: string; // UUID
  machine_id: string; // UUID, references cloud_machines
  trader_id: string; // UUID, references traders
  symbol: string; // e.g., "BTCUSDT"
  action: 'entry' | 'exit' | 'hold';
  confidence: number; // 0-1
  price: number | null;
  volume: number | null;
  signal_time: string; // ISO timestamp

  // Analysis status
  analysis_completed: boolean;
  analysis_time: string | null; // ISO timestamp
  analysis_result: any | null; // JSONB

  // Metadata
  created_at: string; // ISO timestamp
}

/**
 * Cloud metrics record from cloud_metrics table
 */
export interface CloudMetrics {
  id: string; // UUID
  machine_id: string; // UUID, references cloud_machines

  // Resource metrics
  cpu_usage_vcpus: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;

  // Performance metrics
  active_signals: number;
  analysis_queue_depth: number;
  websocket_latency_ms: number | null;
  filter_execution_time_ms: number | null;
  ai_analysis_time_ms: number | null;

  // Throughput metrics
  signals_created_count: number;
  analyses_completed_count: number;
  errors_count: number;

  // Timestamp
  recorded_at: string; // ISO timestamp
}

/**
 * Unified signal interface combining local and cloud signals
 */
export interface UnifiedSignal {
  id: string;
  traderId: string;
  symbol: string;
  action: 'entry' | 'exit' | 'hold';
  confidence: number;
  price?: number;
  volume?: number;
  timestamp: Date;
  source: CloudExecutionSource;
  machineId?: string; // Only for cloud signals
  analysisCompleted?: boolean; // Only for cloud signals
  analysisResult?: any; // Only for cloud signals
}

/**
 * Source of signal execution
 */
export type CloudExecutionSource = 'local' | 'cloud';

/**
 * Machine status for display
 */
export type MachineStatus = 'stopped' | 'provisioning' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * Region options for machine deployment
 */
export type MachineRegion = 'sin' | 'iad' | 'fra';

/**
 * Machine region display names
 */
export const REGION_NAMES: Record<MachineRegion, string> = {
  sin: 'Singapore',
  iad: 'US East (Virginia)',
  fra: 'Europe (Frankfurt)'
};

/**
 * Status display colors
 */
export const STATUS_COLORS: Record<MachineStatus, string> = {
  running: 'success',
  provisioning: 'info',
  starting: 'info',
  stopping: 'warning',
  stopped: 'default',
  error: 'error'
};
