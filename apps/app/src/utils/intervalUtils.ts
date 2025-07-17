import { KlineInterval } from '../../types';

/**
 * Convert KlineInterval to milliseconds for timer intervals
 */
export function klineIntervalToMs(interval: KlineInterval): number {
  const intervalMap: Record<KlineInterval, number> = {
    [KlineInterval.ONE_MINUTE]: 60 * 1000,           // 1 minute
    [KlineInterval.FIVE_MINUTES]: 5 * 60 * 1000,     // 5 minutes
    [KlineInterval.FIFTEEN_MINUTES]: 15 * 60 * 1000, // 15 minutes
    [KlineInterval.ONE_HOUR]: 60 * 60 * 1000,        // 1 hour
    [KlineInterval.FOUR_HOURS]: 4 * 60 * 60 * 1000,  // 4 hours
    [KlineInterval.ONE_DAY]: 24 * 60 * 60 * 1000,    // 24 hours
  };

  return intervalMap[interval] || 60 * 1000; // Default to 1 minute
}

/**
 * Get a readable string representation of an interval
 */
export function formatInterval(interval: KlineInterval): string {
  const labels: Record<KlineInterval, string> = {
    [KlineInterval.ONE_MINUTE]: '1 minute',
    [KlineInterval.FIVE_MINUTES]: '5 minutes',
    [KlineInterval.FIFTEEN_MINUTES]: '15 minutes',
    [KlineInterval.ONE_HOUR]: '1 hour',
    [KlineInterval.FOUR_HOURS]: '4 hours',
    [KlineInterval.ONE_DAY]: '1 day',
  };

  return labels[interval] || interval;
}

/**
 * Check if enough time has passed for the next refresh based on interval
 */
export function shouldRefreshTrader(
  lastRun: number | undefined,
  interval: KlineInterval
): boolean {
  if (!lastRun) return true; // Never run before
  
  const now = Date.now();
  const intervalMs = klineIntervalToMs(interval);
  return now - lastRun >= intervalMs;
}