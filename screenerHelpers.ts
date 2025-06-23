
import { Kline, VolumeNode, HVNOptions } from './types';

/**
 * Calculates the Simple Moving Average (MA).
 * @param klines - Array of kline data.
 * @param period - The period for the MA.
 * @returns The MA value, or null if klines are insufficient.
 */
export function calculateMA(klines: Kline[], period: number): number | null {
  if (!klines || klines.length < period) return null;
  const relevantKlines = klines.slice(-period);
  const closePrices = relevantKlines.map(k => parseFloat(k[4]));
  if (closePrices.some(isNaN) || period <= 0) return null;
  const sum = closePrices.reduce((acc, val) => acc + val, 0);
  return sum / period;
}

/**
 * Calculates Simple Moving Average (SMA) series for kline close prices.
 * @param klines - Array of kline data.
 * @param period - The period for the SMA.
 * @returns An array of SMA values (number | null)[], same length as klines.
 */
export function calculateMASeries(klines: Kline[], period: number): (number | null)[] {
  if (!klines || period <= 0) return new Array(klines?.length || 0).fill(null);
  
  const results: (number | null)[] = new Array(klines.length).fill(null);
  const closePrices = klines.map(k => parseFloat(k[4]));

  if (klines.length < period) return results;

  for (let i = period - 1; i < klines.length; i++) {
    let sum = 0;
    let validPoints = 0;
    for (let j = 0; j < period; j++) {
      const price = closePrices[i - j];
      if (isNaN(price)) {
        sum = NaN; // Propagate NaN if any price in period is NaN
        break;
      }
      sum += price;
      validPoints++;
    }
    if (validPoints === period && !isNaN(sum)) {
      results[i] = sum / period;
    } else {
      results[i] = null; // Not enough points or NaN encountered
    }
  }
  return results;
}

/**
 * Calculates Simple Moving Average (SMA) for an array of numeric values.
 * @param values - Array of numeric values.
 * @param period - The period for the SMA.
 * @returns The SMA value, or 0 if insufficient data.
 */
export function calculateSMA(values: number[], period: number): number {
  if (!values || values.length < period || period <= 0) return 0;
  
  const sum = values.slice(-period).reduce((acc, val) => acc + val, 0);
  return sum / period;
}

/**
 * Calculates the average volume.
 * @param klines - Array of kline data.
 * @param period - The period for the average volume.
 * @returns The average volume, or null if klines are insufficient.
 */
export function calculateAvgVolume(klines: Kline[], period: number): number | null {
  if (!klines || klines.length < period) return null;
  const relevantKlines = klines.slice(-period);
  const volumes = relevantKlines.map(k => parseFloat(k[5]));
  if (volumes.some(isNaN) || period <= 0) return null;
  const sum = volumes.reduce((acc, val) => acc + val, 0);
  return period > 0 ? sum / period : null;
}

/**
 * Calculates RSI values for the provided klines.
 * @param klines - Array of kline data.
 * @param period - The period for RSI calculation (default 14).
 * @returns An array of RSI values, with \`null\` for initial entries where RSI is not yet calculable.
 *          The length of the returned array is the same as \`klines\`.
 *          Returns \`null\` (the value, not an array) if data is insufficient for any RSI calculation (e.g. klines.length < period + 1) or a critical error occurs.
 */
export function calculateRSI(klines: Kline[], period: number = 14): (number | null)[] | null {
    if (!klines || period <= 0 || klines.length < period + 1 ) return null; 
    
    const closePrices = klines.map(k => parseFloat(k[4]));
    if (closePrices.some(isNaN)) return null; 

    const rsiValues: (number | null)[] = new Array(klines.length).fill(null);

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
        const change = closePrices[i] - closePrices[i - 1];
        if (isNaN(change)) return null; 
        if (change > 0) {
            gains += change;
        } else {
            losses -= change; 
        }
    }

    if (period === 0) return null; 
    let avgGain = gains / period;
    let avgLoss = losses / period;

    if (avgLoss === 0) {
        rsiValues[period] = avgGain > 0 ? 100 : (rsiValues.length > 0 ? 50 : null);
    } else {
        const rs = avgGain / avgLoss;
        rsiValues[period] = 100 - (100 / (1 + rs));
    }
    
    for (let i = period + 1; i < closePrices.length; i++) {
        const change = closePrices[i] - closePrices[i - 1];
        if (isNaN(change)) return null; 
        
        let currentGain = 0;
        let currentLoss = 0;
        if (change > 0) {
            currentGain = change;
        } else {
            currentLoss = -change; 
        }
        
        avgGain = (avgGain * (period - 1) + currentGain) / period;
        avgLoss = (avgLoss * (period - 1) + currentLoss) / period;
        
        if (avgLoss === 0) {
            rsiValues[i] = avgGain > 0 ? 100 : 50;
        } else {
            const rs = avgGain / avgLoss;
            rsiValues[i] = 100 - (100 / (1 + rs));
        }
    }
    return rsiValues;
}

/**
 * Gets the latest RSI value.
 * @param klines - Array of kline data.
 * @param period - The period for RSI calculation (default 14).
 * @returns The latest RSI value, or null if not calculable.
 */
export function getLatestRSI(klines: Kline[], period: number = 14): number | null {
  const rsiArray = calculateRSI(klines, period);
  if (!rsiArray || rsiArray.length === 0) return null;
  
  for (let i = rsiArray.length - 1; i >= 0; i--) {
    if (rsiArray[i] !== null) {
      return rsiArray[i];
    }
  }
  return null; 
}

/**
 * Generic function to detect regular bullish or bearish divergences between two series.
 * @param series1 - Typically price series (e.g., close prices). Array of numbers or nulls.
 * @param series2 - Typically indicator series. Array of numbers or nulls, same length as series1.
 * @param lookbackCandles - Number of recent candles to analyze for divergence (default 30).
 * @param minPeakValleySeparation - Minimum number of candles separating two peaks or two valleys (default 5).
 * @returns 'bullish_regular', 'bearish_regular', or null.
 */
export function detectGenericDivergence(
    series1: (number | null)[], 
    series2: (number | null)[], 
    lookbackCandles: number = 30,
    minPeakValleySeparation: number = 5
): 'bullish_regular' | 'bearish_regular' | null {

    if (!series1 || !series2 || series1.length !== series2.length || series1.length < Math.max(lookbackCandles, minPeakValleySeparation * 2 + 2)) {
        return null;
    }

    const actualLookback = Math.min(lookbackCandles, series1.length);
    const s1 = series1.slice(-actualLookback);
    const s2 = series2.slice(-actualLookback);
    const currentLength = s1.length;

    if (currentLength < minPeakValleySeparation + 2) { // Need at least two potential extremes + separation
        return null;
    }
    
    interface ExtremePoint {
        index: number; 
        s1Value: number;
        s2Value: number;
    }

    const valleys: ExtremePoint[] = [];
    const peaks: ExtremePoint[] = [];

    // Identify peaks and valleys
    for (let i = 1; i < currentLength - 1; i++) {
        const prevS1 = s1[i-1];
        const currS1 = s1[i];
        const nextS1 = s1[i+1];
        const currS2 = s2[i];

        if (currS1 === null || prevS1 === null || nextS1 === null || currS2 === null) continue;

        if (currS1 < prevS1 && currS1 < nextS1) {
            valleys.push({ index: i, s1Value: currS1, s2Value: currS2 });
        }
        if (currS1 > prevS1 && currS1 > nextS1) {
            peaks.push({ index: i, s1Value: currS1, s2Value: currS2 });
        }
    }
    
    // Sort by index descending to check most recent divergences first
    valleys.sort((a,b) => b.index - a.index); 
    peaks.sort((a,b) => b.index - a.index);   

    // Check for bullish divergence (lower lows in price, higher lows in indicator)
    for (let i = 0; i < valleys.length; i++) {
        for (let j = i + 1; j < valleys.length; j++) {
            const v2 = valleys[i]; // More recent valley
            const v1 = valleys[j]; // Older valley

            if (v2.index - v1.index >= minPeakValleySeparation) {
                // Regular Bullish: Price LL, Indicator HL
                if (v2.s1Value < v1.s1Value && v2.s2Value > v1.s2Value) {
                    return 'bullish_regular';
                }
            }
        }
    }

    // Check for bearish divergence (higher highs in price, lower highs in indicator)
    for (let i = 0; i < peaks.length; i++) {
        for (let j = i + 1; j < peaks.length; j++) {
            const p2 = peaks[i]; // More recent peak
            const p1 = peaks[j]; // Older peak

            if (p2.index - p1.index >= minPeakValleySeparation) {
                 // Regular Bearish: Price HH, Indicator LH
                if (p2.s1Value > p1.s1Value && p2.s2Value < p1.s2Value) {
                    return 'bearish_regular';
                }
            }
        }
    }
    return null;
}


/**
 * Detects regular bullish or bearish RSI divergences.
 * This function is a convenience wrapper around detectGenericDivergence.
 * @param klines - Array of kline data.
 * @param rsiPeriod - Period for RSI calculation (default 14).
 * @param lookbackCandles - Number of recent candles to analyze for divergence (default 30).
 * @param minPeakValleySeparation - Minimum number of candles separating two peaks or two valleys (default 5).
 * @returns 'bullish_regular', 'bearish_regular', or null.
 */
export function detectRSIDivergence(
    klines: Kline[],
    rsiPeriod: number = 14,
    lookbackCandles: number = 30,
    minPeakValleySeparation: number = 5
): 'bullish_regular' | 'bearish_regular' | null {

    if (!klines || klines.length < Math.max(rsiPeriod + 1, lookbackCandles, minPeakValleySeparation * 2 + 2)) {
        return null;
    }

    const closePrices = klines.map(k => {
        const price = parseFloat(k[4]);
        return isNaN(price) ? null : price;
    });
    
    const rsiValues = calculateRSI(klines, rsiPeriod); 

    if (!rsiValues || closePrices.some((p, idx) => p === null && idx >= Math.max(0, klines.length - lookbackCandles)) ) { 
        return null;
    }
    
    const nonNullRsiValues = rsiValues as (number | null)[];
    return detectGenericDivergence(closePrices, nonNullRsiValues, lookbackCandles, minPeakValleySeparation);
}

/**
 * Internal helper to calculate EMA series from an array of values.
 * @param values - Array of numbers or nulls.
 * @param period - The period for the EMA.
 * @returns An array of EMA values, same length as input, padded with nulls.
 */
function _calculateEMASeriesFromValues(values: (number | null)[], period: number): (number | null)[] {
  if (period <= 0 || !values) {
    return new Array(values?.length || 0).fill(null);
  }
  const emaArray: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return emaArray;

  const k = 2 / (period + 1);
  let currentSmaSum = 0;
  let validSmaPoints = 0;
  
  // Try to calculate initial SMA
  for (let i = 0; i < period; i++) {
    if (values[i] !== null && !isNaN(values[i]!)) {
      currentSmaSum += values[i]!;
      validSmaPoints++;
    } else {
      // If any of the first 'period' values are null/NaN, we can't start SMA here
      // Try to find the first valid starting point for SMA
      let firstValidStart = -1;
      for (let j = 0; j <= values.length - period; j++) {
          let tempSum = 0;
          let tempValidPoints = 0;
          let possibleStart = true;
          for (let l = 0; l < period; l++) {
              if (values[j+l] !== null && !isNaN(values[j+l]!)) {
                  tempSum += values[j+l]!;
                  tempValidPoints++;
              } else {
                  possibleStart = false;
                  break;
              }
          }
          if (possibleStart && tempValidPoints === period) {
              firstValidStart = j;
              emaArray[firstValidStart + period - 1] = tempSum / period;
              currentSmaSum = tempSum; // not really used after this path
              break;
          }
      }
      if (firstValidStart === -1) return emaArray; // Cannot find a valid start

      // Calculate subsequent EMAs from the new starting point
      for (let i = firstValidStart + period; i < values.length; i++) {
        const currentValue = values[i];
        const prevEma = emaArray[i - 1];
        if (currentValue !== null && !isNaN(currentValue) && prevEma !== null) {
          emaArray[i] = currentValue * k + prevEma * (1 - k);
        } else {
          emaArray[i] = null; // Propagate null
        }
      }
      return emaArray;
    }
  }

  // If initial SMA calculation was successful
  if (validSmaPoints === period) {
      emaArray[period - 1] = currentSmaSum / period;
  } else { // Should not happen if logic above is correct, but as a fallback
      return emaArray;
  }
  
  // Calculate subsequent EMAs
  for (let i = period; i < values.length; i++) {
      const currentValue = values[i];
      const prevEma = emaArray[i - 1];
      if (currentValue !== null && !isNaN(currentValue) && prevEma !== null) {
        emaArray[i] = currentValue * k + prevEma * (1 - k);
      } else {
        emaArray[i] = null; // Propagate null
      }
  }
  return emaArray;
}

/**
 * Calculates Exponential Moving Average (EMA) series for kline close prices.
 * @param klines - Array of kline data.
 * @param period - The period for the EMA.
 * @returns An array of EMA values (number | null)[], same length as klines.
 */
export function calculateEMASeries(klines: Kline[], period: number): (number | null)[] {
  if (!klines) return [];
  const closePrices = klines.map(k => {
      const price = parseFloat(k[4]);
      return isNaN(price) ? null : price;
  });
  return _calculateEMASeriesFromValues(closePrices, period);
}

/**
 * Gets the latest Exponential Moving Average (EMA) for kline close prices.
 * @param klines - Array of kline data.
 * @param period - The period for the EMA.
 * @returns The latest EMA value (number | null).
 */
export function getLatestEMA(klines: Kline[], period: number): number | null {
  const emaSeries = calculateEMASeries(klines, period);
  if (!emaSeries || emaSeries.length === 0) return null;
  for (let i = emaSeries.length - 1; i >= 0; i--) {
    if (emaSeries[i] !== null) return emaSeries[i];
  }
  return null;
}

/**
 * Calculates Exponential Moving Average (EMA) for an array of numeric values.
 * @param values - Array of numeric values.
 * @param period - The period for the EMA.
 * @returns The EMA value, or 0 if insufficient data.
 */
export function calculateEMA(values: number[], period: number): number {
  if (!values || values.length < period || period <= 0) return 0;
  
  const k = 2 / (period + 1);
  let ema = values[0];
  
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  
  return ema;
}

/**
 * Calculates MACD Line, Signal Line, and Histogram.
 * @param klines - Array of kline data.
 * @param shortPeriod - Period for the short EMA (default 12).
 * @param longPeriod - Period for the long EMA (default 26).
 * @param signalPeriod - Period for the signal line EMA (default 9).
 * @returns Object with macdLine, signalLine, histogram arrays (number | null)[].
 */
export function calculateMACDValues(
    klines: Kline[], 
    shortPeriod: number = 12, 
    longPeriod: number = 26, 
    signalPeriod: number = 9
): { macdLine: (number | null)[]; signalLine: (number | null)[]; histogram: (number | null)[] } {
    const len = klines?.length || 0;
    const defaultReturn = { 
        macdLine: new Array(len).fill(null), 
        signalLine: new Array(len).fill(null), 
        histogram: new Array(len).fill(null) 
    };

    if (!klines || klines.length < Math.max(longPeriod, shortPeriod, signalPeriod) ) { // Basic check
        return defaultReturn;
    }

    const emaShort = calculateEMASeries(klines, shortPeriod);
    const emaLong = calculateEMASeries(klines, longPeriod);

    if (!emaShort || !emaLong) return defaultReturn;


    const macdLine: (number | null)[] = new Array(klines.length).fill(null);
    for (let i = 0; i < klines.length; i++) {
        if (emaShort[i] !== null && emaLong[i] !== null) {
            macdLine[i] = emaShort[i]! - emaLong[i]!;
        }
    }

    const signalLine = _calculateEMASeriesFromValues(macdLine, signalPeriod);
    const histogram: (number | null)[] = new Array(klines.length).fill(null);

    for (let i = 0; i < klines.length; i++) {
        if (macdLine[i] !== null && signalLine[i] !== null) {
            histogram[i] = macdLine[i]! - signalLine[i]!;
        }
    }

    return { macdLine, signalLine, histogram };
}

/**
 * Gets the latest MACD, Signal, and Histogram values.
 * @param klines - Array of kline data.
 * @param shortPeriod - Period for the short EMA (default 12).
 * @param longPeriod - Period for the long EMA (default 26).
 * @param signalPeriod - Period for the signal line EMA (default 9).
 * @returns Object with latest macd, signal, histogram values (number | null).
 */
export function getLatestMACD(
    klines: Kline[], 
    shortPeriod: number = 12, 
    longPeriod: number = 26, 
    signalPeriod: number = 9
): { macd: number | null; signal: number | null; histogram: number | null } {
    const { macdLine, signalLine, histogram } = calculateMACDValues(klines, shortPeriod, longPeriod, signalPeriod);
    
    let latestMacd: number | null = null;
    let latestSignal: number | null = null;
    let latestHistogram: number | null = null;

    if (macdLine.length > 0) {
      for (let i = macdLine.length - 1; i >= 0; i--) {
        if (macdLine[i] !== null) { latestMacd = macdLine[i]; break; }
      }
    }
    if (signalLine.length > 0) {
      for (let i = signalLine.length - 1; i >= 0; i--) {
        if (signalLine[i] !== null) { latestSignal = signalLine[i]; break; }
      }
    }
    if (histogram.length > 0) {
      for (let i = histogram.length - 1; i >= 0; i--) {
        if (histogram[i] !== null) { latestHistogram = histogram[i]; break; }
      }
    }
    return { macd: latestMacd, signal: latestSignal, histogram: latestHistogram };
}

/**
 * Calculates MACD for an array of close prices.
 * @param closes - Array of close prices.
 * @param shortPeriod - Period for the short EMA (default 12).
 * @param longPeriod - Period for the long EMA (default 26).
 * @param signalPeriod - Period for the signal line EMA (default 9).
 * @returns Object with MACD, signal, and histogram values.
 */
export function calculateMACD(
    closes: number[], 
    shortPeriod: number = 12, 
    longPeriod: number = 26, 
    signalPeriod: number = 9
): { MACD: number; signal: number; histogram: number } {
    if (!closes || closes.length < longPeriod) {
        return { MACD: 0, signal: 0, histogram: 0 };
    }
    
    const emaShort = calculateEMA(closes, shortPeriod);
    const emaLong = calculateEMA(closes, longPeriod);
    const macdValue = emaShort - emaLong;
    
    // Calculate signal line (EMA of MACD values)
    // For simplicity, we'll use the last few MACD values
    const macdValues: number[] = [];
    for (let i = longPeriod - 1; i < closes.length; i++) {
        const shortEMA = calculateEMA(closes.slice(0, i + 1), shortPeriod);
        const longEMA = calculateEMA(closes.slice(0, i + 1), longPeriod);
        macdValues.push(shortEMA - longEMA);
    }
    
    const signalValue = calculateEMA(macdValues, signalPeriod);
    const histogramValue = macdValue - signalValue;
    
    return { MACD: macdValue, signal: signalValue, histogram: histogramValue };
}

/**
 * Calculates Average Directional Index (ADX).
 * @param klines - Array of kline data.
 * @param period - Period for ADX calculation (default 14).
 * @returns The ADX value.
 */
export function calculateADX(klines: Kline[], period: number = 14): number {
    if (!klines || klines.length < period * 2) return 0;
    
    // Simplified ADX calculation
    // In reality, ADX requires True Range, +DI, -DI calculations
    // For now, we'll use a simplified volatility-based approach
    
    const changes: number[] = [];
    for (let i = 1; i < klines.length; i++) {
        const currentHigh = parseFloat(klines[i][2]);
        const currentLow = parseFloat(klines[i][3]);
        const prevClose = parseFloat(klines[i-1][4]);
        
        const range = Math.max(
            currentHigh - currentLow,
            Math.abs(currentHigh - prevClose),
            Math.abs(currentLow - prevClose)
        );
        
        changes.push(range);
    }
    
    // Calculate average true range
    const atr = calculateSMA(changes.slice(-period), period);
    
    // Normalize to 0-100 scale (simplified)
    const avgPrice = klines.slice(-period).reduce((sum, k) => sum + parseFloat(k[4]), 0) / period;
    const adx = (atr / avgPrice) * 100 * 10; // Scale factor
    
    return Math.min(100, Math.max(0, adx));
}

/**
 * Calculates Stochastic Oscillator (%K and %D).
 * @param klines - Array of kline data.
 * @param kPeriod - Period for %K calculation (default 14).
 * @param dPeriod - Period for %D calculation (default 3).
 * @param smooth - Smoothing period (default 3).
 * @returns Object with k and d values.
 */
export function calculateStochastic(
    klines: Kline[], 
    kPeriod: number = 14, 
    dPeriod: number = 3,
    smooth: number = 3
): { k: number; d: number } {
    if (!klines || klines.length < kPeriod) {
        return { k: 0, d: 0 };
    }
    
    // Calculate %K
    const recentKlines = klines.slice(-kPeriod);
    const highs = recentKlines.map(k => parseFloat(k[2]));
    const lows = recentKlines.map(k => parseFloat(k[3]));
    const currentClose = parseFloat(klines[klines.length - 1][4]);
    
    const highestHigh = Math.max(...highs);
    const lowestLow = Math.min(...lows);
    
    const kValue = highestHigh > lowestLow 
        ? ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100 
        : 50;
    
    // For simplified %D, we'll use a simple average of recent %K values
    // In reality, this would require historical %K values
    const dValue = kValue * 0.9; // Simplified smoothing
    
    return { k: kValue, d: dValue };
}

/**
 * Gets the highest high price over a given period.
 * @param klines - Array of kline data.
 * @param period - Number of recent klines to consider.
 * @returns The highest high price (number | null).
 */
export function getHighestHigh(klines: Kline[], period: number): number | null {
    if (!klines || klines.length < period || period <= 0) return null;
    const relevantKlines = klines.slice(-period);
    let highestHigh: number | null = null;
    for (const kline of relevantKlines) {
        const high = parseFloat(kline[2]); // High price
        if (!isNaN(high)) {
            if (highestHigh === null || high > highestHigh) {
                highestHigh = high;
            }
        } else {
            return null; // If any kline data is invalid, result is unreliable
        }
    }
    return highestHigh;
}

/**
 * Gets the lowest low price over a given period.
 * @param klines - Array of kline data.
 * @param period - Number of recent klines to consider.
 * @returns The lowest low price (number | null).
 */
export function getLowestLow(klines: Kline[], period: number): number | null {
    if (!klines || klines.length < period || period <= 0) return null;
    const relevantKlines = klines.slice(-period);
    let lowestLow: number | null = null;
    for (const kline of relevantKlines) {
        const low = parseFloat(kline[3]); // Low price
        if (!isNaN(low)) {
            if (lowestLow === null || low < lowestLow) {
                lowestLow = low;
            }
        } else {
            return null; // If any kline data is invalid, result is unreliable
        }
    }
    return lowestLow;
}

/**
 * Detects Bullish or Bearish Engulfing candlestick patterns.
 * Compares candle at klines[length-2] with klines[length-3],
 * assuming klines[length-1] might be an open/live candle.
 * @param klines - Array of kline data. Must have at least 3 elements.
 * @returns 'bullish', 'bearish', or null.
 */
export function detectEngulfingPattern(klines: Kline[]): 'bullish' | 'bearish' | null {
    if (!klines || klines.length < 3) return null;

    const currentIdx = klines.length - 2; // Potential engulfing candle
    const prevIdx = klines.length - 3;   // Potentially engulfed candle

    const curO = parseFloat(klines[currentIdx][1]);
    const curC = parseFloat(klines[currentIdx][4]);
    const prevO = parseFloat(klines[prevIdx][1]);
    const prevC = parseFloat(klines[prevIdx][4]);

    if ([curO, curC, prevO, prevC].some(isNaN)) return null;

    const currentIsBullish = curC > curO;
    const currentIsBearish = curC < curO;
    const prevIsBullish = prevC > prevO;
    const prevIsBearish = prevC < prevO;

    // Bullish Engulfing
    if (prevIsBearish && currentIsBullish) {
        if (curO < prevC && curC > prevO) { // Current body engulfs previous body
            return 'bullish';
        }
    }

    // Bearish Engulfing
    if (prevIsBullish && currentIsBearish) {
        if (curO > prevC && curC < prevO) { // Current body engulfs previous body
            return 'bearish';
        }
    }
    
    return null;
}

/**
 * Calculates Positive Volume Index (PVI) series.
 * PVI is adjusted based on today's percentage price change if today's volume > yesterday's volume.
 * Otherwise, PVI remains unchanged.
 * @param klines - Array of kline data.
 * @param initialPVI - The initial PVI value (default 1000).
 * @returns An array of PVI values (number | null)[], same length as klines.
 */
export function calculatePVISeries(klines: Kline[], initialPVI: number = 1000): (number | null)[] {
  if (!klines) return [];
  if (klines.length === 0) return [];

  const pviSeries: (number | null)[] = new Array(klines.length).fill(null);
  
  if (klines.length > 0) {
    pviSeries[0] = initialPVI;
  }

  for (let i = 1; i < klines.length; i++) {
    const prevPVI = pviSeries[i - 1];
    if (prevPVI === null) {
      pviSeries[i] = null; // Cannot calculate if previous PVI is null
      continue;
    }

    const currentClose = parseFloat(klines[i][4]);
    const prevClose = parseFloat(klines[i-1][4]);
    const currentVolume = parseFloat(klines[i][5]);
    const prevVolume = parseFloat(klines[i-1][5]);

    if (isNaN(currentClose) || isNaN(prevClose) || isNaN(currentVolume) || isNaN(prevVolume)) {
      pviSeries[i] = null;
      continue;
    }

    if (currentVolume > prevVolume) {
      if (prevClose === 0) { // Avoid division by zero
        pviSeries[i] = null;
        continue;
      }
      const priceChangePercent = (currentClose - prevClose) / prevClose;
      pviSeries[i] = prevPVI + (priceChangePercent * prevPVI);
      if(isNaN(pviSeries[i]!)) pviSeries[i] = null; // check for NaN result from calculation
    } else {
      pviSeries[i] = prevPVI;
    }
  }
  return pviSeries;
}

/**
 * Gets the latest Positive Volume Index (PVI).
 * @param klines - Array of kline data.
 * @param initialPVI - The initial PVI value (default 1000).
 * @returns The latest PVI value (number | null).
 */
export function getLatestPVI(klines: Kline[], initialPVI: number = 1000): number | null {
  const pviSeries = calculatePVISeries(klines, initialPVI);
  if (!pviSeries || pviSeries.length === 0) return null;
  for (let i = pviSeries.length - 1; i >= 0; i--) {
    if (pviSeries[i] !== null) return pviSeries[i];
  }
  return null;
}

// Cache for HVN calculations
const hvnCache = new Map<string, { nodes: VolumeNode[], timestamp: number }>();
const HVN_CACHE_DURATION = 60000; // 1 minute cache

/**
 * Calculates High Volume Nodes (HVN) from kline data.
 * Identifies volume peaks that have lower volume above and below them.
 * @param klines - Array of kline data.
 * @param options - HVN calculation options.
 * @returns Array of VolumeNode objects representing high volume peaks.
 */
export function calculateHighVolumeNodes(klines: Kline[], options: HVNOptions = {}): VolumeNode[] {
  const {
    bins = 30,
    threshold = 70,
    lookback = 250,
    minStrength = 50,
    peakTolerance = 0.05,
    cacheKey
  } = options;

  // Check cache if key provided
  if (cacheKey) {
    const cached = hvnCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HVN_CACHE_DURATION) {
      return cached.nodes;
    }
  }

  if (!klines || klines.length === 0) return [];

  // Use only the most recent 'lookback' candles
  const relevantKlines = klines.slice(-lookback);
  if (relevantKlines.length === 0) return [];

  // Find price range
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  
  for (const kline of relevantKlines) {
    const low = parseFloat(kline[3]);
    const high = parseFloat(kline[2]);
    if (!isNaN(low) && low < minPrice) minPrice = low;
    if (!isNaN(high) && high > maxPrice) maxPrice = high;
  }

  if (minPrice === Infinity || maxPrice === -Infinity || minPrice >= maxPrice) {
    return [];
  }

  // Create price bins
  const binSize = (maxPrice - minPrice) / bins;
  const volumeByBin = new Array(bins).fill(0);
  const buyVolumeByBin = new Array(bins).fill(0);
  
  // Aggregate volume into bins
  for (const kline of relevantKlines) {
    const open = parseFloat(kline[1]);
    const high = parseFloat(kline[2]);
    const low = parseFloat(kline[3]);
    const close = parseFloat(kline[4]);
    const volume = parseFloat(kline[5]);
    const buyVolume = parseFloat(kline[9]); // taker buy volume
    
    if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
      continue;
    }
    
    // Distribute volume across the candle's price range
    const candleMin = Math.min(open, close, low);
    const candleMax = Math.max(open, close, high);
    
    const startBin = Math.floor((candleMin - minPrice) / binSize);
    const endBin = Math.floor((candleMax - minPrice) / binSize);
    
    // Distribute volume proportionally across bins
    const binsSpanned = Math.max(1, endBin - startBin + 1);
    const volumePerBin = volume / binsSpanned;
    const buyVolumePerBin = isNaN(buyVolume) ? 0 : buyVolume / binsSpanned;
    
    for (let i = Math.max(0, startBin); i <= Math.min(bins - 1, endBin); i++) {
      volumeByBin[i] += volumePerBin;
      buyVolumeByBin[i] += buyVolumePerBin;
    }
  }

  // Calculate volume statistics
  const sortedVolumes = [...volumeByBin].sort((a, b) => a - b);
  const thresholdIndex = Math.floor((threshold / 100) * sortedVolumes.length);
  const volumeThreshold = sortedVolumes[thresholdIndex] || 0;
  const maxVolume = Math.max(...volumeByBin);

  // Create volume nodes - only include peaks
  const nodes: VolumeNode[] = [];
  
  for (let i = 0; i < bins; i++) {
    const volume = volumeByBin[i];
    if (volume >= volumeThreshold && volume > 0) {
      // Check if this is a peak (higher than neighbors)
      const prevVolume = i > 0 ? volumeByBin[i - 1] : 0;
      const nextVolume = i < bins - 1 ? volumeByBin[i + 1] : 0;
      
      // Require this bin to have higher volume than both neighbors
      // Use configured tolerance to avoid missing peaks due to minor variations
      const isPeak = volume > prevVolume * (1 + peakTolerance) && volume > nextVolume * (1 + peakTolerance);
      
      if (isPeak) {
        const binMin = minPrice + (i * binSize);
        const binMax = binMin + binSize;
        const binCenter = (binMin + binMax) / 2;
        
        const strength = maxVolume > 0 ? (volume / maxVolume) * 100 : 0;
        
        if (strength >= minStrength) {
          const buyVol = buyVolumeByBin[i];
          const sellVol = volume - buyVol;
          
          nodes.push({
            price: binCenter,
            volume: volume,
            buyVolume: buyVol,
            sellVolume: sellVol,
            strength: strength,
            priceRange: [binMin, binMax]
          });
        }
      }
    }
  }

  // Sort by strength (strongest first)
  nodes.sort((a, b) => b.strength - a.strength);

  // Cache the result if key provided
  if (cacheKey) {
    hvnCache.set(cacheKey, { nodes, timestamp: Date.now() });
  }

  return nodes;
}

/**
 * Checks if a price is near a High Volume Node.
 * @param price - The price to check.
 * @param hvnNodes - Array of volume nodes.
 * @param tolerance - Percentage tolerance for "near" (default 0.5%).
 * @returns True if price is near an HVN.
 */
export function isNearHVN(price: number, hvnNodes: VolumeNode[], tolerance: number = 0.5): boolean {
  if (!hvnNodes || hvnNodes.length === 0 || isNaN(price)) return false;
  
  const toleranceAmount = price * (tolerance / 100);
  
  return hvnNodes.some(node => {
    const distance = Math.abs(price - node.price);
    return distance <= toleranceAmount;
  });
}

/**
 * Gets the closest High Volume Node to a price.
 * @param price - The price to check.
 * @param hvnNodes - Array of volume nodes.
 * @param direction - Direction to search ('above', 'below', or 'both').
 * @returns The closest VolumeNode or null if none found.
 */
export function getClosestHVN(
  price: number, 
  hvnNodes: VolumeNode[], 
  direction: 'above' | 'below' | 'both' = 'both'
): VolumeNode | null {
  if (!hvnNodes || hvnNodes.length === 0 || isNaN(price)) return null;
  
  let closestNode: VolumeNode | null = null;
  let closestDistance = Infinity;
  
  for (const node of hvnNodes) {
    const distance = node.price - price;
    const absDistance = Math.abs(distance);
    
    // Check direction constraints
    if (direction === 'above' && distance < 0) continue;
    if (direction === 'below' && distance > 0) continue;
    
    if (absDistance < closestDistance) {
      closestDistance = absDistance;
      closestNode = node;
    }
  }
  
  return closestNode;
}

/**
 * Counts the number of HVNs within a price range.
 * @param priceLow - Lower bound of the range.
 * @param priceHigh - Upper bound of the range.
 * @param hvnNodes - Array of volume nodes.
 * @returns Number of HVNs in the range.
 */
export function countHVNInRange(priceLow: number, priceHigh: number, hvnNodes: VolumeNode[]): number {
  if (!hvnNodes || hvnNodes.length === 0 || isNaN(priceLow) || isNaN(priceHigh)) return 0;
  
  return hvnNodes.filter(node => 
    node.price >= priceLow && node.price <= priceHigh
  ).length;
}

/**
 * Clears the HVN cache for a specific key or all keys.
 * @param cacheKey - Optional specific cache key to clear.
 */
export function clearHVNCache(cacheKey?: string): void {
  if (cacheKey) {
    hvnCache.delete(cacheKey);
  } else {
    hvnCache.clear();
  }
}

/**
 * Calculates Bollinger Bands (upper, middle, lower) for kline data.
 * @param klines - Array of kline data.
 * @param period - The period for the moving average (default 20).
 * @param stdDev - Number of standard deviations for bands (default 2).
 * @returns Object with upper, middle, lower band arrays (number | null)[].
 */
export function calculateBollingerBands(
  klines: Kline[], 
  period: number = 20, 
  stdDev: number = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const len = klines?.length || 0;
  const defaultReturn = {
    upper: new Array(len).fill(null),
    middle: new Array(len).fill(null),
    lower: new Array(len).fill(null)
  };

  if (!klines || klines.length < period || period <= 0) {
    return defaultReturn;
  }

  const closePrices = klines.map(k => {
    const price = parseFloat(k[4]);
    return isNaN(price) ? null : price;
  });

  // Calculate moving average (middle band)
  const middle = calculateMASeries(klines, period);
  const upper: (number | null)[] = new Array(klines.length).fill(null);
  const lower: (number | null)[] = new Array(klines.length).fill(null);

  // Calculate standard deviation and bands
  for (let i = period - 1; i < klines.length; i++) {
    if (middle[i] === null) continue;

    // Calculate standard deviation for the period
    let sum = 0;
    let validPoints = 0;
    let hasInvalid = false;

    for (let j = 0; j < period; j++) {
      const price = closePrices[i - j];
      if (price === null || isNaN(price)) {
        hasInvalid = true;
        break;
      }
      sum += Math.pow(price - middle[i]!, 2);
      validPoints++;
    }

    if (hasInvalid || validPoints !== period) {
      upper[i] = null;
      lower[i] = null;
      continue;
    }

    const standardDeviation = Math.sqrt(sum / period);
    upper[i] = middle[i]! + (stdDev * standardDeviation);
    lower[i] = middle[i]! - (stdDev * standardDeviation);
  }

  return { upper, middle, lower };
}

/**
 * Gets the latest Bollinger Bands values.
 * @param klines - Array of kline data.
 * @param period - The period for the moving average (default 20).
 * @param stdDev - Number of standard deviations for bands (default 2).
 * @returns Object with latest upper, middle, lower values (number | null).
 */
export function getLatestBollingerBands(
  klines: Kline[], 
  period: number = 20, 
  stdDev: number = 2
): { upper: number | null; middle: number | null; lower: number | null } {
  const bands = calculateBollingerBands(klines, period, stdDev);
  
  let latestUpper: number | null = null;
  let latestMiddle: number | null = null;
  let latestLower: number | null = null;

  if (bands.upper.length > 0) {
    for (let i = bands.upper.length - 1; i >= 0; i--) {
      if (bands.upper[i] !== null && bands.middle[i] !== null && bands.lower[i] !== null) {
        latestUpper = bands.upper[i];
        latestMiddle = bands.middle[i];
        latestLower = bands.lower[i];
        break;
      }
    }
  }

  return { upper: latestUpper, middle: latestMiddle, lower: latestLower };
}

/**
 * Calculates the current Volume Weighted Average Price (VWAP).
 * VWAP = Σ(Price × Volume) / Σ(Volume)
 * @param klines - Array of kline data.
 * @returns The current VWAP value.
 */
export function calculateVWAP(klines: Kline[]): number {
  if (!klines || klines.length === 0) return 0;
  
  let cumulativeTPV = 0;
  let cumulativeVolume = 0;
  
  for (const kline of klines) {
    const high = parseFloat(kline[2]);
    const low = parseFloat(kline[3]);
    const close = parseFloat(kline[4]);
    const volume = parseFloat(kline[5]);
    
    const typicalPrice = (high + low + close) / 3;
    cumulativeTPV += typicalPrice * volume;
    cumulativeVolume += volume;
  }
  
  return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : 0;
}

/**
 * Calculates Volume Weighted Average Price (VWAP) series.
 * VWAP = Σ(Price × Volume) / Σ(Volume)
 * @param klines - Array of kline data.
 * @param anchorPeriod - Number of klines to use for VWAP calculation (default uses all klines).
 * @returns An array of VWAP values (number | null)[], same length as klines.
 */
export function calculateVWAPSeries(klines: Kline[], anchorPeriod?: number): (number | null)[] {
  if (!klines || klines.length === 0) return [];

  const vwapSeries: (number | null)[] = new Array(klines.length).fill(null);
  
  // Determine starting point based on anchor period
  const startIndex = anchorPeriod && anchorPeriod < klines.length 
    ? klines.length - anchorPeriod 
    : 0;

  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  for (let i = startIndex; i < klines.length; i++) {
    const high = parseFloat(klines[i][2]);
    const low = parseFloat(klines[i][3]);
    const close = parseFloat(klines[i][4]);
    const volume = parseFloat(klines[i][5]);

    if (isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
      vwapSeries[i] = null;
      continue;
    }

    // Typical price (HLC/3)
    const typicalPrice = (high + low + close) / 3;
    
    cumulativePriceVolume += typicalPrice * volume;
    cumulativeVolume += volume;

    if (cumulativeVolume > 0) {
      vwapSeries[i] = cumulativePriceVolume / cumulativeVolume;
    } else {
      vwapSeries[i] = null;
    }
  }

  return vwapSeries;
}

/**
 * Gets the latest VWAP value.
 * @param klines - Array of kline data.
 * @param anchorPeriod - Number of klines to use for VWAP calculation (default uses all klines).
 * @returns The latest VWAP value (number | null).
 */
export function getLatestVWAP(klines: Kline[], anchorPeriod?: number): number | null {
  const vwapSeries = calculateVWAPSeries(klines, anchorPeriod);
  if (!vwapSeries || vwapSeries.length === 0) return null;
  
  for (let i = vwapSeries.length - 1; i >= 0; i--) {
    if (vwapSeries[i] !== null) return vwapSeries[i];
  }
  return null;
}

/**
 * Calculates VWAP with standard deviation bands.
 * @param klines - Array of kline data.
 * @param anchorPeriod - Number of klines to use for VWAP calculation.
 * @param stdDevMultiplier - Multiplier for standard deviation bands (default 1).
 * @returns Object with vwap, upperBand, lowerBand arrays (number | null)[].
 */
export function calculateVWAPBands(
  klines: Kline[], 
  anchorPeriod?: number,
  stdDevMultiplier: number = 1
): { vwap: (number | null)[]; upperBand: (number | null)[]; lowerBand: (number | null)[] } {
  const len = klines?.length || 0;
  const defaultReturn = {
    vwap: new Array(len).fill(null),
    upperBand: new Array(len).fill(null),
    lowerBand: new Array(len).fill(null)
  };

  if (!klines || klines.length === 0) return defaultReturn;

  const vwap = calculateVWAPSeries(klines, anchorPeriod);
  const upperBand: (number | null)[] = new Array(klines.length).fill(null);
  const lowerBand: (number | null)[] = new Array(klines.length).fill(null);

  // Determine starting point
  const startIndex = anchorPeriod && anchorPeriod < klines.length 
    ? klines.length - anchorPeriod 
    : 0;

  // Calculate standard deviation at each point
  for (let i = startIndex; i < klines.length; i++) {
    if (vwap[i] === null) continue;

    let sumSquaredDiff = 0;
    let validPoints = 0;

    // Calculate variance from VWAP
    for (let j = startIndex; j <= i; j++) {
      const high = parseFloat(klines[j][2]);
      const low = parseFloat(klines[j][3]);
      const close = parseFloat(klines[j][4]);
      
      if (isNaN(high) || isNaN(low) || isNaN(close) || vwap[i] === null) continue;
      
      const typicalPrice = (high + low + close) / 3;
      sumSquaredDiff += Math.pow(typicalPrice - vwap[i]!, 2);
      validPoints++;
    }

    if (validPoints > 0) {
      const variance = sumSquaredDiff / validPoints;
      const stdDev = Math.sqrt(variance);
      upperBand[i] = vwap[i]! + (stdDev * stdDevMultiplier);
      lowerBand[i] = vwap[i]! - (stdDev * stdDevMultiplier);
    }
  }

  return { vwap, upperBand, lowerBand };
}

/**
 * Gets the latest VWAP with bands values.
 * @param klines - Array of kline data.
 * @param anchorPeriod - Number of klines to use for VWAP calculation.
 * @param stdDevMultiplier - Multiplier for standard deviation bands (default 1).
 * @returns Object with latest vwap, upperBand, lowerBand values (number | null).
 */
export function getLatestVWAPBands(
  klines: Kline[], 
  anchorPeriod?: number,
  stdDevMultiplier: number = 1
): { vwap: number | null; upperBand: number | null; lowerBand: number | null } {
  const bands = calculateVWAPBands(klines, anchorPeriod, stdDevMultiplier);
  
  let latestVwap: number | null = null;
  let latestUpper: number | null = null;
  let latestLower: number | null = null;

  if (bands.vwap.length > 0) {
    for (let i = bands.vwap.length - 1; i >= 0; i--) {
      if (bands.vwap[i] !== null) {
        latestVwap = bands.vwap[i];
        latestUpper = bands.upperBand[i];
        latestLower = bands.lowerBand[i];
        break;
      }
    }
  }

  return { vwap: latestVwap, upperBand: latestUpper, lowerBand: latestLower };
}
