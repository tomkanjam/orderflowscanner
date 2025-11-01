/**
 * Trader Metadata Extraction Dataset
 *
 * Tests the ability to extract trading conditions, direction, and indicators
 * from natural language descriptions.
 *
 * Dataset size: 50 examples
 * Coverage: Common indicators, complex conditions, edge cases
 */

export const traderMetadataDataset = [
  // === RSI-based strategies (10 examples) ===
  {
    input: "Buy when RSI crosses above 30",
    expected: {
      conditions: ["RSI crosses above 30"],
      direction: "bullish",
      indicators: ["RSI"],
      timeframe: null
    },
    metadata: { category: "simple", indicator_type: "oscillator" }
  },
  {
    input: "Sell when RSI is overbought above 70",
    expected: {
      conditions: ["RSI above 70"],
      direction: "bearish",
      indicators: ["RSI"],
      timeframe: null
    },
    metadata: { category: "simple", indicator_type: "oscillator" }
  },
  {
    input: "Enter long when RSI < 30 and price above 200 MA",
    expected: {
      conditions: ["RSI below 30", "Price above 200-period MA"],
      direction: "bullish",
      indicators: ["RSI", "SMA"],
      timeframe: null
    },
    metadata: { category: "multiple", indicator_type: "mixed" }
  },
  {
    input: "Short when RSI divergence detected and MACD bearish",
    expected: {
      conditions: ["RSI divergence", "MACD bearish"],
      direction: "bearish",
      indicators: ["RSI", "MACD"],
      timeframe: null
    },
    metadata: { category: "advanced", indicator_type: "pattern" }
  },
  {
    input: "Buy on 15m when RSI oversold and 1h RSI turning up",
    expected: {
      conditions: ["RSI oversold on 15m", "RSI turning up on 1h"],
      direction: "bullish",
      indicators: ["RSI"],
      timeframe: "15m"
    },
    metadata: { category: "multi-timeframe", indicator_type: "oscillator" }
  },
  {
    input: "Trade when Stochastic RSI K line crosses above 20",
    expected: {
      conditions: ["Stochastic RSI K crosses above 20"],
      direction: "bullish",
      indicators: ["Stochastic RSI"],
      timeframe: null
    },
    metadata: { category: "advanced", indicator_type: "custom" }
  },
  {
    input: "Exit long when RSI reaches 80 or price drops 5%",
    expected: {
      conditions: ["RSI reaches 80", "Price drops 5%"],
      direction: "exit",
      indicators: ["RSI"],
      timeframe: null
    },
    metadata: { category: "exit", indicator_type: "mixed" }
  },
  {
    input: "Buy when RSI crosses 50 from below with increasing volume",
    expected: {
      conditions: ["RSI crosses above 50", "Volume increasing"],
      direction: "bullish",
      indicators: ["RSI", "Volume"],
      timeframe: null
    },
    metadata: { category: "multiple", indicator_type: "momentum" }
  },
  {
    input: "Scalp when 1m RSI < 20 and 5m RSI > 30",
    expected: {
      conditions: ["RSI below 20 on 1m", "RSI above 30 on 5m"],
      direction: "bullish",
      indicators: ["RSI"],
      timeframe: "1m"
    },
    metadata: { category: "multi-timeframe", indicator_type: "oscillator" }
  },
  {
    input: "Enter when RSI forms bullish divergence with price making lower lows",
    expected: {
      conditions: ["RSI bullish divergence", "Price making lower lows"],
      direction: "bullish",
      indicators: ["RSI"],
      timeframe: null
    },
    metadata: { category: "advanced", indicator_type: "divergence" }
  },

  // === Moving Average strategies (10 examples) ===
  {
    input: "Buy when price crosses above 50 EMA",
    expected: {
      conditions: ["Price crosses above 50-period EMA"],
      direction: "bullish",
      indicators: ["EMA"],
      timeframe: null
    },
    metadata: { category: "simple", indicator_type: "trend" }
  },
  {
    input: "Sell when 50 MA crosses below 200 MA (death cross)",
    expected: {
      conditions: ["50 MA crosses below 200 MA"],
      direction: "bearish",
      indicators: ["SMA"],
      timeframe: null
    },
    metadata: { category: "crossover", indicator_type: "trend" }
  },
  {
    input: "Long when price above all three EMAs: 20, 50, 200",
    expected: {
      conditions: ["Price above 20 EMA", "Price above 50 EMA", "Price above 200 EMA"],
      direction: "bullish",
      indicators: ["EMA"],
      timeframe: null
    },
    metadata: { category: "multiple", indicator_type: "trend" }
  },
  {
    input: "Trade when 9 EMA crosses 21 EMA with volume confirmation",
    expected: {
      conditions: ["9 EMA crosses 21 EMA", "Volume confirmation"],
      direction: "bullish",
      indicators: ["EMA", "Volume"],
      timeframe: null
    },
    metadata: { category: "crossover", indicator_type: "momentum" }
  },
  {
    input: "Buy when price bounces off 200 MA support",
    expected: {
      conditions: ["Price bounces off 200 MA"],
      direction: "bullish",
      indicators: ["SMA"],
      timeframe: null
    },
    metadata: { category: "support", indicator_type: "trend" }
  },
  {
    input: "Enter long when golden cross forms on daily chart",
    expected: {
      conditions: ["50 MA crosses above 200 MA"],
      direction: "bullish",
      indicators: ["SMA"],
      timeframe: "1d"
    },
    metadata: { category: "crossover", indicator_type: "trend" }
  },
  {
    input: "Short when price rejects 100 MA resistance",
    expected: {
      conditions: ["Price rejects 100 MA"],
      direction: "bearish",
      indicators: ["SMA"],
      timeframe: null
    },
    metadata: { category: "resistance", indicator_type: "trend" }
  },
  {
    input: "Buy when VWAP crosses above price and volume spikes",
    expected: {
      conditions: ["VWAP crosses above price", "Volume spike"],
      direction: "bullish",
      indicators: ["VWAP", "Volume"],
      timeframe: null
    },
    metadata: { category: "multiple", indicator_type: "volume" }
  },
  {
    input: "Trade when 1h price above 50 EMA and 4h above 200 EMA",
    expected: {
      conditions: ["Price above 50 EMA on 1h", "Price above 200 EMA on 4h"],
      direction: "bullish",
      indicators: ["EMA"],
      timeframe: "1h"
    },
    metadata: { category: "multi-timeframe", indicator_type: "trend" }
  },
  {
    input: "Enter when all EMAs aligned bullishly (8, 13, 21, 55)",
    expected: {
      conditions: ["8 EMA > 13 EMA", "13 EMA > 21 EMA", "21 EMA > 55 EMA"],
      direction: "bullish",
      indicators: ["EMA"],
      timeframe: null
    },
    metadata: { category: "multiple", indicator_type: "trend" }
  },

  // === MACD strategies (5 examples) ===
  {
    input: "Buy when MACD crosses above signal line",
    expected: {
      conditions: ["MACD crosses above signal line"],
      direction: "bullish",
      indicators: ["MACD"],
      timeframe: null
    },
    metadata: { category: "simple", indicator_type: "momentum" }
  },
  {
    input: "Sell when MACD histogram turns red",
    expected: {
      conditions: ["MACD histogram negative"],
      direction: "bearish",
      indicators: ["MACD"],
      timeframe: null
    },
    metadata: { category: "simple", indicator_type: "momentum" }
  },
  {
    input: "Long when MACD bullish and RSI not overbought",
    expected: {
      conditions: ["MACD bullish", "RSI below 70"],
      direction: "bullish",
      indicators: ["MACD", "RSI"],
      timeframe: null
    },
    metadata: { category: "multiple", indicator_type: "momentum" }
  },
  {
    input: "Enter when MACD zero-line crossover with volume surge",
    expected: {
      conditions: ["MACD crosses zero line", "Volume surge"],
      direction: "bullish",
      indicators: ["MACD", "Volume"],
      timeframe: null
    },
    metadata: { category: "multiple", indicator_type: "momentum" }
  },
  {
    input: "Short when MACD bearish divergence forms",
    expected: {
      conditions: ["MACD bearish divergence"],
      direction: "bearish",
      indicators: ["MACD"],
      timeframe: null
    },
    metadata: { category: "advanced", indicator_type: "divergence" }
  },

  // === Bollinger Bands strategies (5 examples) ===
  {
    input: "Buy when price touches lower Bollinger Band",
    expected: {
      conditions: ["Price touches lower Bollinger Band"],
      direction: "bullish",
      indicators: ["Bollinger Bands"],
      timeframe: null
    },
    metadata: { category: "simple", indicator_type: "volatility" }
  },
  {
    input: "Sell when price exceeds upper Bollinger Band",
    expected: {
      conditions: ["Price above upper Bollinger Band"],
      direction: "bearish",
      indicators: ["Bollinger Bands"],
      timeframe: null
    },
    metadata: { category: "simple", indicator_type: "volatility" }
  },
  {
    input: "Trade when Bollinger Band squeeze occurs",
    expected: {
      conditions: ["Bollinger Band squeeze"],
      direction: "neutral",
      indicators: ["Bollinger Bands"],
      timeframe: null
    },
    metadata: { category: "pattern", indicator_type: "volatility" }
  },
  {
    input: "Buy when price bounces off lower BB and RSI confirms",
    expected: {
      conditions: ["Price bounces off lower Bollinger Band", "RSI confirms"],
      direction: "bullish",
      indicators: ["Bollinger Bands", "RSI"],
      timeframe: null
    },
    metadata: { category: "multiple", indicator_type: "reversal" }
  },
  {
    input: "Enter when BB width expanding after squeeze",
    expected: {
      conditions: ["Bollinger Band width expanding", "After squeeze"],
      direction: "breakout",
      indicators: ["Bollinger Bands"],
      timeframe: null
    },
    metadata: { category: "pattern", indicator_type: "volatility" }
  },

  // === Volume strategies (5 examples) ===
  {
    input: "Buy when volume spike 2x average",
    expected: {
      conditions: ["Volume above 2x average"],
      direction: "bullish",
      indicators: ["Volume"],
      timeframe: null
    },
    metadata: { category: "simple", indicator_type: "volume" }
  },
  {
    input: "Enter when volume surge with price breakout",
    expected: {
      conditions: ["Volume surge", "Price breakout"],
      direction: "bullish",
      indicators: ["Volume"],
      timeframe: null
    },
    metadata: { category: "breakout", indicator_type: "volume" }
  },
  {
    input: "Trade when OBV rises while price consolidates",
    expected: {
      conditions: ["OBV rising", "Price consolidating"],
      direction: "bullish",
      indicators: ["OBV"],
      timeframe: null
    },
    metadata: { category: "divergence", indicator_type: "volume" }
  },
  {
    input: "Buy when volume profile shows HVN at current price",
    expected: {
      conditions: ["Volume profile HVN at current price"],
      direction: "support",
      indicators: ["Volume Profile"],
      timeframe: null
    },
    metadata: { category: "advanced", indicator_type: "volume" }
  },
  {
    input: "Enter when volume decreasing during pullback",
    expected: {
      conditions: ["Volume decreasing", "During pullback"],
      direction: "continuation",
      indicators: ["Volume"],
      timeframe: null
    },
    metadata: { category: "pattern", indicator_type: "volume" }
  },

  // === Advanced/Custom strategies (10 examples) ===
  {
    input: "Long when ADX above 25 indicating strong trend",
    expected: {
      conditions: ["ADX above 25"],
      direction: "trend",
      indicators: ["ADX"],
      timeframe: null
    },
    metadata: { category: "advanced", indicator_type: "trend_strength" }
  },
  {
    input: "Buy when Ichimoku cloud is bullish",
    expected: {
      conditions: ["Ichimoku cloud bullish"],
      direction: "bullish",
      indicators: ["Ichimoku"],
      timeframe: null
    },
    metadata: { category: "advanced", indicator_type: "trend" }
  },
  {
    input: "Enter when Williams %R below -80 oversold",
    expected: {
      conditions: ["Williams %R below -80"],
      direction: "bullish",
      indicators: ["Williams %R"],
      timeframe: null
    },
    metadata: { category: "advanced", indicator_type: "oscillator" }
  },
  {
    input: "Trade when Aroon up crosses above Aroon down",
    expected: {
      conditions: ["Aroon up crosses above Aroon down"],
      direction: "bullish",
      indicators: ["Aroon"],
      timeframe: null
    },
    metadata: { category: "advanced", indicator_type: "trend" }
  },
  {
    input: "Buy when bullish engulfing pattern forms with volume",
    expected: {
      conditions: ["Bullish engulfing pattern", "Volume confirmation"],
      direction: "bullish",
      indicators: ["Candlestick Pattern", "Volume"],
      timeframe: null
    },
    metadata: { category: "pattern", indicator_type: "reversal" }
  },
  {
    input: "Enter when three white soldiers pattern appears",
    expected: {
      conditions: ["Three white soldiers pattern"],
      direction: "bullish",
      indicators: ["Candlestick Pattern"],
      timeframe: null
    },
    metadata: { category: "pattern", indicator_type: "reversal" }
  },
  {
    input: "Long when Fibonacci 61.8% retracement holds",
    expected: {
      conditions: ["Price holds at Fibonacci 61.8%"],
      direction: "bullish",
      indicators: ["Fibonacci"],
      timeframe: null
    },
    metadata: { category: "support", indicator_type: "retracement" }
  },
  {
    input: "Buy when pivot point bounce with RSI oversold",
    expected: {
      conditions: ["Price bounces off pivot point", "RSI oversold"],
      direction: "bullish",
      indicators: ["Pivot Points", "RSI"],
      timeframe: null
    },
    metadata: { category: "support", indicator_type: "mixed" }
  },
  {
    input: "Trade when ATR expanding above 2x average",
    expected: {
      conditions: ["ATR above 2x average"],
      direction: "volatility",
      indicators: ["ATR"],
      timeframe: null
    },
    metadata: { category: "volatility", indicator_type: "range" }
  },
  {
    input: "Enter when price breaks out of consolidation range with volume",
    expected: {
      conditions: ["Price breakout", "Volume confirmation", "After consolidation"],
      direction: "breakout",
      indicators: ["Volume"],
      timeframe: null
    },
    metadata: { category: "breakout", indicator_type: "pattern" }
  },

  // === Edge cases (5 examples) ===
  {
    input: "Buy BTC when it goes up",
    expected: {
      conditions: ["Price increasing"],
      direction: "bullish",
      indicators: [],
      timeframe: null
    },
    metadata: { category: "vague", indicator_type: "none" }
  },
  {
    input: "Trade when the moon is full and market is green",
    expected: {
      conditions: ["Market positive"],
      direction: "bullish",
      indicators: [],
      timeframe: null
    },
    metadata: { category: "vague", indicator_type: "none" }
  },
  {
    input: "Enter long position when everything looks good",
    expected: {
      conditions: ["Market conditions favorable"],
      direction: "bullish",
      indicators: [],
      timeframe: null
    },
    metadata: { category: "vague", indicator_type: "none" }
  },
  {
    input: "Buy ETH when price is low and sell when high",
    expected: {
      conditions: ["Price low"],
      direction: "bullish",
      indicators: [],
      timeframe: null
    },
    metadata: { category: "simple", indicator_type: "none" }
  },
  {
    input: "Short when RSI > 70 AND (MACD bearish OR volume declining) AND price < 200 MA",
    expected: {
      conditions: [
        "RSI above 70",
        "MACD bearish OR volume declining",
        "Price below 200 MA"
      ],
      direction: "bearish",
      indicators: ["RSI", "MACD", "Volume", "SMA"],
      timeframe: null
    },
    metadata: { category: "complex", indicator_type: "mixed" }
  }
];

export type TraderMetadataExample = typeof traderMetadataDataset[0];
