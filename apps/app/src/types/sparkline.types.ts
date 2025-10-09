/**
 * Sparkline Component Types
 *
 * Types for the mini line chart visualization of WebSocket update frequency
 */

/**
 * Health status based on update frequency thresholds
 */
export type HealthStatus = 'healthy' | 'moderate' | 'poor' | 'disconnected';

/**
 * Props for the Sparkline component
 */
export interface SparklineProps {
  /** Array of numeric data points to visualize */
  data: number[];
  /** Width of the sparkline in pixels (default: 32) */
  width?: number;
  /** Height of the sparkline in pixels (default: 12) */
  height?: number;
  /** Stroke color for the line */
  color: string;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Statistical summary of sparkline data
 */
export interface SparklineStats {
  /** Current (most recent) value */
  current: number;
  /** Average of all values */
  average: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Timestamp of calculation */
  timestamp: number;
}

/**
 * Props for the UpdateFrequencyMetric component
 */
export interface UpdateFrequencyMetricProps {
  /** Current update frequency (updates per second) */
  frequency: number;
  /** Historical data for sparkline (30-second window) */
  history: number[];
  /** Optional CSS classes */
  className?: string;
}

/**
 * Health status configuration
 */
export interface HealthConfig {
  status: HealthStatus;
  color: string;
  textColor: string;
  label: string;
}
