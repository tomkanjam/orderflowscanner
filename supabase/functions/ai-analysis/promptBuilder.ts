/**
 * PromptBuilder - Constructs prompts for Gemini analysis
 * Includes market data, technical indicators, and structured output schema
 */

import { AnalysisRequest, Kline, CalculatedIndicators } from "./types.ts";

export class PromptBuilder {
  /**
   * Build complete prompt for Gemini analysis
   *
   * @param request - Analysis request with market data and strategy
   * @returns Complete prompt string ready for Gemini API
   */
  buildAnalysisPrompt(request: AnalysisRequest): string {
    const {
      symbol,
      price,
      klines,
      strategy,
      calculatedIndicators
    } = request;

    return `You are an expert cryptocurrency trading analyst. Analyze this trading signal and provide a structured decision.

## TRADING CONTEXT
Symbol: ${symbol}
Current Price: $${price}
Strategy Description: ${strategy}

## MARKET DATA
${this.formatKlines(klines)}

## TECHNICAL INDICATORS
${this.formatIndicators(calculatedIndicators)}

## YOUR TASK
Analyze this setup and provide a structured trading decision. Consider:
1. Does this match the strategy description?
2. Are technical indicators confirming or diverging?
3. What are the key support/resistance levels?
4. What is the risk/reward ratio?
5. What could invalidate this setup?

## OUTPUT FORMAT
Respond with valid JSON matching this exact structure:
{
  "decision": "enter_trade" | "bad_setup" | "wait",
  "confidence": 0-100,
  "reasoning": "Multi-line explanation of your analysis. Be specific about what you see in the data.",
  "tradePlan": {
    "setup": "When and why to enter this trade",
    "execution": "How to manage the position (entry, scaling, targets)",
    "invalidation": "What price action or conditions would invalidate this setup",
    "riskReward": 2.5
  },
  "technicalContext": {
    "trend": "bullish" | "bearish" | "neutral",
    "momentum": "strong" | "weak" | "neutral",
    "volatility": "high" | "medium" | "low",
    "keyObservations": ["observation1", "observation2", ...]
  }
}

## DECISION CRITERIA
- "enter_trade": High-confidence setup matching strategy with favorable R:R (>2:1)
- "wait": Interesting setup but needs confirmation or better entry
- "bad_setup": Does not match strategy or has poor R:R

Provide your analysis now:`;
  }

  /**
   * Format klines data into readable table
   */
  private formatKlines(klines: Kline[]): string {
    if (!klines || klines.length === 0) {
      return "No historical kline data available.";
    }

    // Show last 20 klines for context (most recent data)
    const recentKlines = klines.slice(-20);

    const lines = [
      "Recent Price Action (Last 20 candles):",
      "Time                Open      High      Low       Close     Volume",
      "─".repeat(80)
    ];

    for (const kline of recentKlines) {
      const [openTime, open, high, low, close, volume] = kline;
      const timestamp = new Date(openTime).toISOString().slice(0, 16).replace('T', ' ');
      const o = parseFloat(open).toFixed(2).padStart(9);
      const h = parseFloat(high).toFixed(2).padStart(9);
      const l = parseFloat(low).toFixed(2).padStart(9);
      const c = parseFloat(close).toFixed(2).padStart(9);
      const v = parseFloat(volume).toFixed(0).padStart(10);

      lines.push(`${timestamp}  ${o}  ${h}  ${l}  ${c}  ${v}`);
    }

    // Add summary statistics
    const closes = recentKlines.map(k => parseFloat(k[4]));
    const high20 = Math.max(...recentKlines.map(k => parseFloat(k[2])));
    const low20 = Math.min(...recentKlines.map(k => parseFloat(k[3])));
    const avgVolume = recentKlines.reduce((sum, k) => sum + parseFloat(k[5]), 0) / recentKlines.length;

    lines.push("");
    lines.push(`Summary (Last 20 candles):`);
    lines.push(`  High: $${high20.toFixed(2)}`);
    lines.push(`  Low: $${low20.toFixed(2)}`);
    lines.push(`  Range: ${((high20 - low20) / low20 * 100).toFixed(2)}%`);
    lines.push(`  Avg Volume: ${avgVolume.toFixed(0)}`);

    return lines.join('\n');
  }

  /**
   * Format calculated indicators into readable list
   */
  private formatIndicators(indicators: CalculatedIndicators): string {
    const lines: string[] = [];

    // Moving Averages
    if (indicators.sma_20 !== undefined || indicators.sma_50 !== undefined || indicators.sma_200 !== undefined) {
      lines.push("Moving Averages:");
      if (indicators.sma_20 !== undefined) lines.push(`  SMA(20): $${indicators.sma_20.toFixed(2)}`);
      if (indicators.sma_50 !== undefined) lines.push(`  SMA(50): $${indicators.sma_50.toFixed(2)}`);
      if (indicators.sma_200 !== undefined) lines.push(`  SMA(200): $${indicators.sma_200.toFixed(2)}`);
      if (indicators.ema_12 !== undefined) lines.push(`  EMA(12): $${indicators.ema_12.toFixed(2)}`);
      if (indicators.ema_26 !== undefined) lines.push(`  EMA(26): $${indicators.ema_26.toFixed(2)}`);
      lines.push("");
    }

    // Oscillators
    if (indicators.rsi_14 !== undefined) {
      lines.push("Oscillators:");
      lines.push(`  RSI(14): ${indicators.rsi_14.toFixed(2)}`);
    }

    if (indicators.macd) {
      if (!lines.some(l => l === "Oscillators:")) lines.push("Oscillators:");
      lines.push(`  MACD: ${indicators.macd.macd.toFixed(4)}`);
      lines.push(`  Signal: ${indicators.macd.signal.toFixed(4)}`);
      lines.push(`  Histogram: ${indicators.macd.histogram.toFixed(4)}`);
    }

    if (indicators.stoch) {
      if (!lines.some(l => l === "Oscillators:")) lines.push("Oscillators:");
      lines.push(`  Stochastic %K: ${indicators.stoch.k.toFixed(2)}`);
      lines.push(`  Stochastic %D: ${indicators.stoch.d.toFixed(2)}`);
    }

    if (lines.some(l => l === "Oscillators:")) {
      lines.push("");
    }

    // Volatility
    if (indicators.bb) {
      lines.push("Bollinger Bands:");
      lines.push(`  Upper: $${indicators.bb.upper.toFixed(2)}`);
      lines.push(`  Middle: $${indicators.bb.middle.toFixed(2)}`);
      lines.push(`  Lower: $${indicators.bb.lower.toFixed(2)}`);
      lines.push("");
    }

    if (indicators.atr_14 !== undefined) {
      lines.push(`ATR(14): $${indicators.atr_14.toFixed(2)}`);
      lines.push("");
    }

    // Volume
    if (indicators.obv !== undefined || indicators.vwap !== undefined) {
      lines.push("Volume Indicators:");
      if (indicators.obv !== undefined) lines.push(`  OBV: ${indicators.obv.toFixed(0)}`);
      if (indicators.vwap !== undefined) lines.push(`  VWAP: $${indicators.vwap.toFixed(2)}`);
      lines.push("");
    }

    // Custom indicators (trader-specific)
    const customKeys = Object.keys(indicators).filter(key =>
      !['sma_20', 'sma_50', 'sma_200', 'ema_12', 'ema_26', 'rsi_14', 'macd', 'bb', 'atr_14', 'obv', 'vwap', 'stoch'].includes(key)
    );

    if (customKeys.length > 0) {
      lines.push("Custom Indicators:");
      for (const key of customKeys) {
        const value = indicators[key];
        if (typeof value === 'number') {
          lines.push(`  ${key}: ${value.toFixed(4)}`);
        } else if (typeof value === 'object' && value !== null) {
          lines.push(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
      lines.push("");
    }

    return lines.length > 0 ? lines.join('\n') : "No technical indicators provided.";
  }
}
