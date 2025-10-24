/**
 * Kline Helper Functions
 * Utilities for working with Binance kline (candlestick) data
 */

import { Kline, KlineInterval } from '../shared/types/types';

/**
 * Interval duration in milliseconds
 * Matches KlineInterval enum from shared/types/types.ts
 */
const INTERVAL_DURATIONS: Record<KlineInterval, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

/**
 * Calculate expected kline count between two timestamps
 * @param startTime Start timestamp in milliseconds
 * @param endTime End timestamp in milliseconds
 * @param interval Kline interval
 * @returns Expected number of klines
 */
export function calculateExpectedKlineCount(
  startTime: number,
  endTime: number,
  interval: KlineInterval
): number {
  const duration = endTime - startTime;
  const intervalMs = INTERVAL_DURATIONS[interval];
  return Math.floor(duration / intervalMs);
}

/**
 * Get the open time for a kline at a specific timestamp
 * Aligns timestamp to interval boundary
 * @param timestamp Timestamp in milliseconds
 * @param interval Kline interval
 * @returns Aligned open time in milliseconds
 */
export function getKlineOpenTime(timestamp: number, interval: KlineInterval): number {
  const intervalMs = INTERVAL_DURATIONS[interval];
  return Math.floor(timestamp / intervalMs) * intervalMs;
}

/**
 * Merge historical and real-time klines, removing duplicates
 * Prioritizes real-time data for overlapping timestamps
 * @param historical Array of historical klines
 * @param realtime Array of real-time klines
 * @returns Merged and deduplicated array of klines
 */
export function mergeKlines(historical: Kline[], realtime: Kline[]): Kline[] {
  // Create a map of open times from real-time data (these take priority)
  const realtimeMap = new Map<number, Kline>();
  for (const kline of realtime) {
    const openTime = parseInt(kline[0].toString());
    realtimeMap.set(openTime, kline);
  }

  // Filter historical data to exclude duplicates
  const uniqueHistorical = historical.filter(kline => {
    const openTime = parseInt(kline[0].toString());
    return !realtimeMap.has(openTime);
  });

  // Combine and sort by open time
  const merged = [...uniqueHistorical, ...realtime];
  merged.sort((a, b) => {
    const aTime = parseInt(a[0].toString());
    const bTime = parseInt(b[0].toString());
    return aTime - bTime;
  });

  return merged;
}

/**
 * Detect gaps in kline data
 * @param klines Array of klines
 * @param interval Kline interval
 * @returns Array of gap periods [startTime, endTime]
 */
export function detectGaps(
  klines: Kline[],
  interval: KlineInterval
): Array<[number, number]> {
  if (klines.length < 2) return [];

  const gaps: Array<[number, number]> = [];
  const intervalMs = INTERVAL_DURATIONS[interval];

  for (let i = 1; i < klines.length; i++) {
    const prevCloseTime = parseInt(klines[i - 1][6].toString());
    const currentOpenTime = parseInt(klines[i][0].toString());
    const expectedNextOpen = prevCloseTime + 1;

    // Gap detected if current open time is more than one interval away
    if (currentOpenTime > expectedNextOpen + intervalMs) {
      gaps.push([expectedNextOpen, currentOpenTime - 1]);
    }
  }

  return gaps;
}

/**
 * Validate kline data structure
 * @param kline Kline to validate
 * @returns true if valid, false otherwise
 */
export function isValidKline(kline: any): kline is Kline {
  if (!Array.isArray(kline) || kline.length !== 12) {
    return false;
  }

  // Validate numeric fields
  const openTime = parseInt(kline[0]?.toString());
  const closeTime = parseInt(kline[6]?.toString());

  if (isNaN(openTime) || isNaN(closeTime)) {
    return false;
  }

  // Validate OHLC values
  const open = parseFloat(kline[1]);
  const high = parseFloat(kline[2]);
  const low = parseFloat(kline[3]);
  const close = parseFloat(kline[4]);

  if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
    return false;
  }

  // Validate high/low logic
  if (high < low || high < open || high < close || low > open || low > close) {
    return false;
  }

  return true;
}

/**
 * Get kline interval duration in milliseconds
 * @param interval Kline interval
 * @returns Duration in milliseconds
 */
export function getIntervalDuration(interval: KlineInterval): number {
  return INTERVAL_DURATIONS[interval];
}

/**
 * Format interval for display
 * @param interval Kline interval
 * @returns Human-readable interval string
 */
export function formatInterval(interval: KlineInterval): string {
  const map: Record<KlineInterval, string> = {
    '1m': '1 minute',
    '5m': '5 minutes',
    '15m': '15 minutes',
    '1h': '1 hour',
    '4h': '4 hours',
    '1d': '1 day',
  };
  return map[interval] || interval;
}

/**
 * Calculate start time for historical fetch
 * @param interval Primary interval
 * @param limit Number of klines to fetch
 * @returns Start timestamp in milliseconds
 */
export function calculateStartTime(interval: KlineInterval, limit: number): number {
  const intervalMs = INTERVAL_DURATIONS[interval];
  const now = Date.now();
  return now - (limit * intervalMs);
}
