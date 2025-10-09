/**
 * Sparkline Utility Functions
 *
 * Helper functions for sparkline visualization and health status calculation
 */

import { HealthStatus, SparklineStats, HealthConfig } from '../types/sparkline.types';

/**
 * Generate SVG path string from data array
 *
 * @param data - Array of numeric values
 * @param width - Width of the sparkline
 * @param height - Height of the sparkline
 * @returns SVG path string (e.g., "M 0,12 L 16,6 L 32,0")
 */
export function generateSparklinePath(
  data: number[],
  width: number,
  height: number
): string {
  if (data.length === 0) return '';

  // Use Math.max with 1 to prevent division by zero
  const max = Math.max(...data, 1);

  // Generate points, normalizing to height
  const points = data.map((value, index) => {
    const x = (index / Math.max(data.length - 1, 1)) * width;
    const y = height - (value / max) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return `M ${points.join(' L ')}`;
}

/**
 * Calculate health status based on update frequency
 *
 * Thresholds:
 * - healthy: >50 updates/s (expected for 100+ symbols with ticker + kline)
 * - moderate: 10-50 updates/s (partial data flow)
 * - poor: <10 updates/s (very limited data)
 * - disconnected: 0 updates/s
 *
 * @param frequency - Updates per second
 * @returns Health status
 */
export function calculateHealthStatus(frequency: number): HealthStatus {
  if (frequency === 0) return 'disconnected';
  if (frequency > 50) return 'healthy';
  if (frequency > 10) return 'moderate';
  return 'poor';
}

/**
 * Get health configuration (colors, labels) for a given status
 *
 * @param status - Health status
 * @returns Health configuration object
 */
export function getHealthConfig(status: HealthStatus): HealthConfig {
  const configs: Record<HealthStatus, HealthConfig> = {
    healthy: {
      status: 'healthy',
      color: 'rgb(34, 197, 94)', // green-500
      textColor: 'text-green-500',
      label: 'Healthy'
    },
    moderate: {
      status: 'moderate',
      color: 'rgb(234, 179, 8)', // yellow-500
      textColor: 'text-yellow-500',
      label: 'Moderate'
    },
    poor: {
      status: 'poor',
      color: 'rgb(239, 68, 68)', // red-500
      textColor: 'text-red-500',
      label: 'Poor'
    },
    disconnected: {
      status: 'disconnected',
      color: 'rgb(156, 163, 175)', // gray-400
      textColor: 'text-gray-400',
      label: 'Disconnected'
    }
  };

  return configs[status];
}

/**
 * Calculate statistical summary of sparkline data
 *
 * @param data - Array of numeric values
 * @returns Statistical summary
 */
export function calculateSparklineStats(data: number[]): SparklineStats {
  if (data.length === 0) {
    return {
      current: 0,
      average: 0,
      min: 0,
      max: 0,
      timestamp: Date.now()
    };
  }

  const current = data[data.length - 1];
  const sum = data.reduce((acc, val) => acc + val, 0);
  const average = sum / data.length;
  const min = Math.min(...data);
  const max = Math.max(...data);

  return {
    current,
    average: Number(average.toFixed(1)),
    min,
    max,
    timestamp: Date.now()
  };
}

/**
 * Format frequency value for display
 *
 * @param frequency - Numeric frequency value
 * @returns Formatted string (e.g., "42/s")
 */
export function formatFrequency(frequency: number): string {
  return `${frequency}/s`;
}
