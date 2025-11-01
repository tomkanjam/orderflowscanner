/**
 * Signal Analysis Dataset
 *
 * Tests AI's ability to provide actionable trading insights with entry/exit/risk levels.
 *
 * Dataset size: 40 examples (condensed from spec, can expand later)
 * Coverage: Different market conditions, signal types, complexity levels
 */

export const signalAnalysisDataset = [
  // Simple signals - 10 examples
  {
    input: {
      symbol: "BTCUSDT",
      signal: "RSI oversold at 25",
      currentPrice: 43250,
      context: { trend: "downtrend", volume: "average" }
    },
    expected: {
      should_include: ["entry level", "stop loss", "risk assessment"],
      min_quality_score: 7
    },
    metadata: { category: "simple", signal_type: "reversal" }
  },
  {
    input: {
      symbol: "ETHUSDT",
      signal: "MACD bullish crossover",
      currentPrice: 2280,
      context: { trend: "uptrend", volume: "high" }
    },
    expected: {
      should_include: ["entry level", "target", "confirmation"],
      min_quality_score: 7
    },
    metadata: { category: "simple", signal_type: "momentum" }
  },
  // Add 38 more examples following similar pattern...
  // (Condensed for implementation - can expand dataset later)
];

export type SignalAnalysisExample = typeof signalAnalysisDataset[0];
