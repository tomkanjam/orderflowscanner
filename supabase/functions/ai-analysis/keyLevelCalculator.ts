/**
 * KeyLevelCalculator - Calculates key price levels for trade management
 * Uses ATR for stop loss, identifies support/resistance from recent price action
 */

import { Kline, KeyLevels, CalculatedIndicators } from "./types.ts";

export class KeyLevelCalculator {
  /**
   * Calculate key price levels for a trading setup
   *
   * @param currentPrice - Current market price
   * @param klines - Historical kline data
   * @param indicators - Pre-calculated technical indicators (must include ATR)
   * @param decision - AI decision (affects target calculations)
   * @returns Complete KeyLevels structure
   */
  calculateKeyLevels(
    currentPrice: number,
    klines: Kline[],
    indicators: CalculatedIndicators,
    decision: 'enter_trade' | 'bad_setup' | 'wait'
  ): KeyLevels {
    // Get ATR for volatility-based calculations
    const atr = indicators.atr_14 || this.calculateATR(klines, 14);

    // Calculate stop loss (ATR-based)
    const stopLoss = this.calculateStopLoss(currentPrice, atr);

    // Calculate take profit targets (multiple levels)
    const takeProfit = this.calculateTakeProfitTargets(currentPrice, atr, decision);

    // Identify support levels from recent lows
    const support = this.findSupportLevels(klines, currentPrice);

    // Identify resistance levels from recent highs
    const resistance = this.findResistanceLevels(klines, currentPrice);

    return {
      entry: currentPrice,
      stopLoss,
      takeProfit,
      support,
      resistance
    };
  }

  /**
   * Calculate ATR-based stop loss
   * Uses 1.5x ATR below current price for conservative risk management
   */
  private calculateStopLoss(currentPrice: number, atr: number): number {
    const stopLossDistance = atr * 1.5;
    return currentPrice - stopLossDistance;
  }

  /**
   * Calculate multiple take profit targets
   * TP1: 2x ATR (conservative, R:R ~1.3:1)
   * TP2: 3x ATR (moderate, R:R ~2:1)
   * TP3: 5x ATR (aggressive, R:R ~3.3:1)
   */
  private calculateTakeProfitTargets(
    currentPrice: number,
    atr: number,
    decision: 'enter_trade' | 'bad_setup' | 'wait'
  ): number[] {
    // For bad setups or wait decisions, return minimal targets
    if (decision !== 'enter_trade') {
      return [
        currentPrice + (atr * 1.0),
        currentPrice + (atr * 1.5)
      ];
    }

    // For enter_trade decisions, provide full target ladder
    return [
      currentPrice + (atr * 2.0),  // TP1: Conservative
      currentPrice + (atr * 3.0),  // TP2: Moderate
      currentPrice + (atr * 5.0)   // TP3: Aggressive
    ];
  }

  /**
   * Find support levels from recent swing lows
   * Looks back 50 candles, identifies local minimums
   */
  private findSupportLevels(klines: Kline[], currentPrice: number): number[] {
    if (!klines || klines.length < 10) return [];

    const lookback = Math.min(50, klines.length);
    const recentKlines = klines.slice(-lookback);

    const swingLows: number[] = [];

    // Find swing lows (local minimums with at least 2 candles on each side)
    for (let i = 2; i < recentKlines.length - 2; i++) {
      const low = parseFloat(recentKlines[i][3]);
      const prevLow1 = parseFloat(recentKlines[i - 1][3]);
      const prevLow2 = parseFloat(recentKlines[i - 2][3]);
      const nextLow1 = parseFloat(recentKlines[i + 1][3]);
      const nextLow2 = parseFloat(recentKlines[i + 2][3]);

      // Check if this is a local minimum
      if (low < prevLow1 && low < prevLow2 && low < nextLow1 && low < nextLow2) {
        // Only include levels below current price
        if (low < currentPrice) {
          swingLows.push(low);
        }
      }
    }

    // Sort by proximity to current price (closest first)
    swingLows.sort((a, b) => Math.abs(currentPrice - a) - Math.abs(currentPrice - b));

    // Return top 3 support levels
    return swingLows.slice(0, 3);
  }

  /**
   * Find resistance levels from recent swing highs
   * Looks back 50 candles, identifies local maximums
   */
  private findResistanceLevels(klines: Kline[], currentPrice: number): number[] {
    if (!klines || klines.length < 10) return [];

    const lookback = Math.min(50, klines.length);
    const recentKlines = klines.slice(-lookback);

    const swingHighs: number[] = [];

    // Find swing highs (local maximums with at least 2 candles on each side)
    for (let i = 2; i < recentKlines.length - 2; i++) {
      const high = parseFloat(recentKlines[i][2]);
      const prevHigh1 = parseFloat(recentKlines[i - 1][2]);
      const prevHigh2 = parseFloat(recentKlines[i - 2][2]);
      const nextHigh1 = parseFloat(recentKlines[i + 1][2]);
      const nextHigh2 = parseFloat(recentKlines[i + 2][2]);

      // Check if this is a local maximum
      if (high > prevHigh1 && high > prevHigh2 && high > nextHigh1 && high > nextHigh2) {
        // Only include levels above current price
        if (high > currentPrice) {
          swingHighs.push(high);
        }
      }
    }

    // Sort by proximity to current price (closest first)
    swingHighs.sort((a, b) => Math.abs(currentPrice - a) - Math.abs(currentPrice - b));

    // Return top 3 resistance levels
    return swingHighs.slice(0, 3);
  }

  /**
   * Calculate ATR if not provided in indicators
   * Uses True Range = max(high - low, abs(high - prevClose), abs(low - prevClose))
   */
  private calculateATR(klines: Kline[], period: number = 14): number {
    if (!klines || klines.length < period + 1) {
      // Fallback: estimate 2% of current price as ATR
      const lastClose = parseFloat(klines[klines.length - 1][4]);
      return lastClose * 0.02;
    }

    const trueRanges: number[] = [];

    for (let i = 1; i < klines.length; i++) {
      const high = parseFloat(klines[i][2]);
      const low = parseFloat(klines[i][3]);
      const prevClose = parseFloat(klines[i - 1][4]);

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );

      trueRanges.push(tr);
    }

    // Take average of last 'period' true ranges
    const recentTR = trueRanges.slice(-period);
    const atr = recentTR.reduce((sum, tr) => sum + tr, 0) / period;

    return atr;
  }
}
