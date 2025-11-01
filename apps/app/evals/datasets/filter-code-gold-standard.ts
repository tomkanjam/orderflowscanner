/**
 * Filter Code Generation Dataset
 *
 * Tests the ability to generate valid, correct Go filter code from conditions.
 * Includes tests for helper functions, custom implementations, and edge cases.
 *
 * Dataset size: 30 examples
 * Coverage: Common indicators, custom implementations, multi-timeframe, edge cases
 */

export const filterCodeDataset = [
  // === Helper function usage (10 examples) ===
  {
    input: {
      conditions: ["RSI below 30"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.GetLatestRSI", "rsi", "*rsi < 30"],
      must_not_include: ["for i :="],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "helper", indicator: "RSI", complexity: "simple" }
  },
  {
    input: {
      conditions: ["Price above 50 EMA"],
      klineInterval: "1h"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.CalculateEMA", "ema", "*ema"],
      must_not_include: [],
      requiredTimeframes: ["1h"]
    },
    metadata: { category: "helper", indicator: "EMA", complexity: "simple" }
  },
  {
    input: {
      conditions: ["MACD histogram positive"],
      klineInterval: "4h"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.GetLatestMACD", "macd.Histogram", "> 0"],
      must_not_include: [],
      requiredTimeframes: ["4h"]
    },
    metadata: { category: "helper", indicator: "MACD", complexity: "simple" }
  },
  {
    input: {
      conditions: ["Price touches lower Bollinger Band"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.GetLatestBollingerBands", "bb.Lower", "lastClose"],
      must_not_include: [],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "helper", indicator: "Bollinger Bands", complexity: "simple" }
  },
  {
    input: {
      conditions: ["Volume spike 2x average"],
      klineInterval: "5m"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.CalculateAvgVolume", "currentVol", "*avgVol * 2"],
      must_not_include: [],
      requiredTimeframes: ["5m"]
    },
    metadata: { category: "helper", indicator: "Volume", complexity: "simple" }
  },
  {
    input: {
      conditions: ["Price above VWAP"],
      klineInterval: "1h"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.CalculateVWAP", "vwap", "lastClose > vwap"],
      must_not_include: ["nil"],
      requiredTimeframes: ["1h"]
    },
    metadata: { category: "helper", indicator: "VWAP", complexity: "simple" }
  },
  {
    input: {
      conditions: ["Regular Stochastic %K below 20"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.CalculateStochastic", "stoch.K", "< 20"],
      must_not_include: ["rsiValues"],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "helper", indicator: "Stochastic", complexity: "simple" }
  },
  {
    input: {
      conditions: ["Bullish engulfing pattern detected"],
      klineInterval: "1h"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.DetectEngulfingPattern", "== \"bullish\""],
      must_not_include: [],
      requiredTimeframes: ["1h"]
    },
    metadata: { category: "helper", indicator: "Pattern", complexity: "simple" }
  },
  {
    input: {
      conditions: ["Price at 50-period high"],
      klineInterval: "4h"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.GetHighestHigh", "*highestHigh"],
      must_not_include: [],
      requiredTimeframes: ["4h"]
    },
    metadata: { category: "helper", indicator: "High/Low", complexity: "simple" }
  },
  {
    input: {
      conditions: ["RSI < 30", "Price > 200 EMA", "Volume > 1.5x average"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.GetLatestRSI", "indicators.CalculateEMA", "indicators.CalculateAvgVolume"],
      must_not_include: [],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "helper_multiple", indicator: "Mixed", complexity: "medium" }
  },

  // === Custom implementations (10 examples) ===
  {
    input: {
      conditions: ["Stochastic RSI K line below 40"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["rsiValues := make([]float64", "stochRSI := make([]float64", "for i :=", "highestRSI", "lowestRSI"],
      must_not_include: ["indicators.CalculateStochastic"],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "custom", indicator: "StochRSI", complexity: "advanced" }
  },
  {
    input: {
      conditions: ["ADX above 25"],
      klineInterval: "1h"
    },
    expected: {
      must_compile: true,
      must_include: ["plusDM := make([]float64", "minusDM := make([]float64", "tr := make([]float64", "diPlus", "diMinus"],
      must_not_include: ["indicators."],
      requiredTimeframes: ["1h"]
    },
    metadata: { category: "custom", indicator: "ADX", complexity: "advanced" }
  },
  {
    input: {
      conditions: ["Bullish RSI divergence detected"],
      klineInterval: "4h"
    },
    expected: {
      must_compile: true,
      must_include: ["priceLows", "rsiLows", "priceLowerLow", "rsiHigherLow"],
      must_not_include: [],
      requiredTimeframes: ["4h"]
    },
    metadata: { category: "custom", indicator: "RSI Divergence", complexity: "advanced" }
  },
  {
    input: {
      conditions: ["Ichimoku cloud bullish"],
      klineInterval: "1h"
    },
    expected: {
      must_compile: true,
      must_include: ["tenkan", "kijun", "senkouA", "senkouB"],
      must_not_include: ["indicators."],
      requiredTimeframes: ["1h"]
    },
    metadata: { category: "custom", indicator: "Ichimoku", complexity: "advanced" }
  },
  {
    input: {
      conditions: ["Williams %R below -80"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["for i :=", "highestHigh", "lowestLow", "williamsR"],
      must_not_include: ["indicators."],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "custom", indicator: "Williams %R", complexity: "advanced" }
  },
  {
    input: {
      conditions: ["Aroon up crosses above Aroon down"],
      klineInterval: "1h"
    },
    expected: {
      must_compile: true,
      must_include: ["aroonUp", "aroonDown", "for i :="],
      must_not_include: ["indicators."],
      requiredTimeframes: ["1h"]
    },
    metadata: { category: "custom", indicator: "Aroon", complexity: "advanced" }
  },
  {
    input: {
      conditions: ["ATR above 2x average"],
      klineInterval: "4h"
    },
    expected: {
      must_compile: true,
      must_include: ["tr := make([]float64", "math.Abs", "avgTR"],
      must_not_include: ["indicators."],
      requiredTimeframes: ["4h"]
    },
    metadata: { category: "custom", indicator: "ATR", complexity: "advanced" }
  },
  {
    input: {
      conditions: ["CCI above 100"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["tp := (klines[i].High + klines[i].Low + klines[i].Close) / 3", "cci"],
      must_not_include: ["indicators."],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "custom", indicator: "CCI", complexity: "advanced" }
  },
  {
    input: {
      conditions: ["Parabolic SAR flips bullish"],
      klineInterval: "1h"
    },
    expected: {
      must_compile: true,
      must_include: ["sar", "af := 0.02", "for i :="],
      must_not_include: ["indicators."],
      requiredTimeframes: ["1h"]
    },
    metadata: { category: "custom", indicator: "SAR", complexity: "advanced" }
  },
  {
    input: {
      conditions: ["VWAP bands breakout"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["vwap", "stdDev", "upperBand", "lowerBand"],
      must_not_include: [],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "custom", indicator: "VWAP Bands", complexity: "advanced" }
  },

  // === Multi-timeframe (5 examples) ===
  {
    input: {
      conditions: ["1m RSI < 30 and 5m RSI > 40"],
      klineInterval: "1m"
    },
    expected: {
      must_compile: true,
      must_include: ["data.Klines[\"1m\"]", "data.Klines[\"5m\"]", "rsi1m", "rsi5m"],
      must_not_include: [],
      requiredTimeframes: ["1m", "5m"]
    },
    metadata: { category: "multi-timeframe", indicator: "RSI", complexity: "medium" }
  },
  {
    input: {
      conditions: ["15m price above 50 EMA and 1h price above 200 EMA"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["data.Klines[\"15m\"]", "data.Klines[\"1h\"]", "ema50", "ema200"],
      must_not_include: [],
      requiredTimeframes: ["15m", "1h"]
    },
    metadata: { category: "multi-timeframe", indicator: "EMA", complexity: "medium" }
  },
  {
    input: {
      conditions: ["1h MACD bullish and 4h trend up"],
      klineInterval: "1h"
    },
    expected: {
      must_compile: true,
      must_include: ["data.Klines[\"1h\"]", "data.Klines[\"4h\"]", "macd"],
      must_not_include: [],
      requiredTimeframes: ["1h", "4h"]
    },
    metadata: { category: "multi-timeframe", indicator: "MACD", complexity: "medium" }
  },
  {
    input: {
      conditions: ["5m volume spike and 15m uptrend"],
      klineInterval: "5m"
    },
    expected: {
      must_compile: true,
      must_include: ["data.Klines[\"5m\"]", "data.Klines[\"15m\"]", "volume"],
      must_not_include: [],
      requiredTimeframes: ["5m", "15m"]
    },
    metadata: { category: "multi-timeframe", indicator: "Volume", complexity: "medium" }
  },
  {
    input: {
      conditions: ["1m, 5m, and 15m all RSI oversold"],
      klineInterval: "1m"
    },
    expected: {
      must_compile: true,
      must_include: ["data.Klines[\"1m\"]", "data.Klines[\"5m\"]", "data.Klines[\"15m\"]", "rsi"],
      must_not_include: [],
      requiredTimeframes: ["1m", "5m", "15m"]
    },
    metadata: { category: "multi-timeframe", indicator: "RSI", complexity: "complex" }
  },

  // === Edge cases (5 examples) ===
  {
    input: {
      conditions: ["Price increasing"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["lastClose", "prevClose", ">"],
      must_not_include: [],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "edge", indicator: "None", complexity: "trivial" }
  },
  {
    input: {
      conditions: ["Volume above average"],
      klineInterval: "1h"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.CalculateAvgVolume", "currentVol"],
      must_not_include: [],
      requiredTimeframes: ["1h"]
    },
    metadata: { category: "edge", indicator: "Volume", complexity: "simple" }
  },
  {
    input: {
      conditions: ["Price in consolidation range"],
      klineInterval: "4h"
    },
    expected: {
      must_compile: true,
      must_include: ["for i :=", "highestHigh", "lowestLow"],
      must_not_include: [],
      requiredTimeframes: ["4h"]
    },
    metadata: { category: "edge", indicator: "Range", complexity: "medium" }
  },
  {
    input: {
      conditions: ["Always true"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["return true"],
      must_not_include: [],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "edge", indicator: "None", complexity: "trivial" }
  },
  {
    input: {
      conditions: ["RSI > 70 AND (MACD bearish OR volume declining) AND price < 200 MA"],
      klineInterval: "15m"
    },
    expected: {
      must_compile: true,
      must_include: ["indicators.GetLatestRSI", "indicators.GetLatestMACD", "indicators.CalculateMA", "&&", "||"],
      must_not_include: [],
      requiredTimeframes: ["15m"]
    },
    metadata: { category: "edge", indicator: "Mixed", complexity: "complex" }
  }
];

export type FilterCodeExample = typeof filterCodeDataset[0];
