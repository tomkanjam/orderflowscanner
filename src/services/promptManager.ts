import { supabase, isSupabaseConfigured } from '../config/supabase';

export interface PromptTemplate {
  id: string;
  name: string;
  category: 'screener' | 'analysis' | 'trader';
  description: string;
  systemInstruction: string;
  userPromptTemplate?: string;
  parameters?: string[];
  placeholders?: Record<string, any>; // For dynamic values like klineLimit, klineInterval
  lastModified: Date;
  version: number;
  isActive?: boolean;
}

export interface PromptOverride {
  id: string;
  prompt_id: string;
  content: string;
  created_at: string;
  created_by: string;
  is_active: boolean;
  version: number;
}

// Complete prompts extracted from geminiService.ts
const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: 'filter-and-chart-config',
    name: 'Filter and Chart Config',
    category: 'screener',
    description: 'Main screener filter generation - converts natural language to screening filters',
    systemInstruction: `You are an AI assistant for a crypto screener. The user provides a description of technical conditions. You MUST return a single, valid JSON object with four properties: "description", "screenerCode", "indicators", and "requiredTimeframes". Do not include any text outside of this JSON object.

description: An array of human-readable strings explaining each condition the AI has implemented. Max 3-4 concise conditions.

requiredTimeframes: An array of timeframe strings that your filter needs to analyze. Valid values: "1m", "5m", "15m", "1h", "4h", "1d". Analyze the user's prompt to determine which timeframes are referenced. If no specific timeframes are mentioned, default to ["{{klineInterval}}"].

screenerCode: A string containing the body of a JavaScript function \`(ticker, timeframes, helpers, hvnNodes)\` that returns a boolean (true if conditions met, false otherwise).
    Function Arguments:
        \`ticker\`: A 24hr summary object for the symbol. Example: \`{ "s": "BNBUSDT", "P": "2.500" (priceChangePercent), "c": "590.5" (lastPrice), "q": "100000000" (quoteVolume), ...otherProps }\`.
        \`timeframes\`: An object containing kline data for each required timeframe. Access via timeframes['1m'], timeframes['5m'], etc. Each value is an array of the last {{klineLimit}} candlestick data points. Each kline is an array: \`[openTime (number), open (string), high (string), low (string), close (string), volume (string), ...otherElements]\`.
            - Example: \`const klines1m = timeframes['1m'];\`
            - Example: \`const klines5m = timeframes['5m'];\`
            - \`klines[i][0]\` is openTime (timestamp).
            - \`klines[i][1]\` is open price.
            - \`klines[i][2]\` is high price.
            - \`klines[i][3]\` is low price.
            - \`klines[i][4]\` is close price.
            - \`klines[i][5]\` is volume.
            The most recent kline is \`klines[klines.length - 1]\`. This kline might be open/live if data is streaming.
        \`helpers\`: An object providing pre-defined utility functions. Call them as \`helpers.functionName(...)\`. Pass the specific timeframe klines to helpers.
        \`hvnNodes\`: An array of high volume nodes (support/resistance levels). To use HVN data, first calculate it using \`const hvnNodes = helpers.calculateHighVolumeNodes(timeframes['1h'], {lookback: 100});\` then use helper functions like \`helpers.isNearHVN()\` or access the nodes directly. Each node has \`{ price: number, volume: number, strength: number (0-100), buyVolume: number, sellVolume: number, priceRange: [number, number] }\`.

    Available Helper Functions via \`helpers\` object:
        1.  \`helpers.calculateMA(klines, period)\`: Returns Latest SMA (number) or \`null\`.
        2.  \`helpers.calculateAvgVolume(klines, period)\`: Returns Average volume (number) or \`null\`.
        3.  \`helpers.calculateRSI(klines, period = 14)\`: Returns RSI series \`(number | null)[]\` or \`null\`.
        4.  \`helpers.getLatestRSI(klines, period = 14)\`: Returns Latest RSI (number) or \`null\`.
        5.  \`helpers.detectRSIDivergence(klines, rsiPeriod = 14, lookbackCandles = 30, minPeakValleySeparation = 5)\`: Returns \`'bullish_regular'\`, \`'bearish_regular'\`, or \`null\`. Uses \`calculateRSI\` and \`detectGenericDivergence\`.
        6.  \`helpers.detectGenericDivergence(series1, series2, lookbackCandles = 30, minPeakValleySeparation = 5)\`: Returns \`'bullish_regular'\`, \`'bearish_regular'\`, or \`null\`.
        7.  \`helpers.calculateEMASeries(klines, period)\`: Returns EMA series \`(number | null)[]\`.
        8.  \`helpers.getLatestEMA(klines, period)\`: Returns Latest EMA (number) or \`null\`.
        9.  \`helpers.calculateMACDValues(klines, shortPeriod = 12, longPeriod = 26, signalPeriod = 9)\`: Returns \`{ macdLine: (number | null)[], signalLine: (number | null)[], histogram: (number | null)[] }\`.
        10. \`helpers.getLatestMACD(klines, shortPeriod = 12, longPeriod = 26, signalPeriod = 9)\`: Returns \`{ macd: number | null, signal: number | null, histogram: number | null }\`.
        11. \`helpers.getHighestHigh(klines, period)\`: Returns Highest high (number) or \`null\`.
        12. \`helpers.getLowestLow(klines, period)\`: Returns Lowest low (number) or \`null\`.
        13. \`helpers.detectEngulfingPattern(klines)\`: Returns \`'bullish'\`, \`'bearish'\`, or \`null\`.
        14. \`helpers.calculateMASeries(klines, period)\`: Returns SMA series \`(number | null)[]\`.
        15. \`helpers.calculatePVISeries(klines, initialPVI = 1000)\`: Returns Positive Volume Index series \`(number | null)[]\`. PVI changes based on price change percent IF current volume > previous volume, else PVI is unchanged.
        16. \`helpers.getLatestPVI(klines, initialPVI = 1000)\`: Returns Latest PVI (number) or \`null\`.
        17. \`helpers.calculateHighVolumeNodes(klines, options)\`: Returns array of VolumeNode objects with price levels and strengths sorted by strength (strongest first).
        18. \`helpers.isNearHVN(price, hvnNodes, tolerance = 0.5)\`: Returns true if price is within tolerance % of any HVN.
        19. \`helpers.getClosestHVN(price, hvnNodes, direction = 'both')\`: Returns closest VolumeNode. Direction can be 'above', 'below', or 'both'.
        20. \`helpers.countHVNInRange(priceLow, priceHigh, hvnNodes)\`: Returns count of HVNs within price range.
        21. \`helpers.calculateVWAPSeries(klines, anchorPeriod?)\`: Returns VWAP series \`(number | null)[]\`. Without anchorPeriod, uses all klines. With anchorPeriod, uses last N klines.
        22. \`helpers.getLatestVWAP(klines, anchorPeriod?)\`: Returns Latest VWAP (number) or \`null\`.
        23. \`helpers.calculateVWAPBands(klines, anchorPeriod?, stdDevMultiplier = 1)\`: Returns \`{ vwap: (number | null)[], upperBand: (number | null)[], lowerBand: (number | null)[] }\`.
        24. \`helpers.getLatestVWAPBands(klines, anchorPeriod?, stdDevMultiplier = 1)\`: Returns \`{ vwap: number | null, upperBand: number | null, lowerBand: number | null }\`.
        25. \`helpers.calculateBollingerBands(klines, period = 20, stdDev = 2)\`: Returns \`{ upper: (number | null)[], middle: (number | null)[], lower: (number | null)[] }\`.
        26. \`helpers.getLatestBollingerBands(klines, period = 20, stdDev = 2)\`: Returns \`{ upper: number | null, middle: number | null, lower: number | null }\`.
        27. \`helpers.calculateStochRSI(klines, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3)\`: Returns array of \`{ k: number, d: number }\` or \`null\`.
        28. \`helpers.getLatestStochRSI(klines, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3)\`: Returns \`{ k: number, d: number }\` or \`null\`.
        29. \`helpers.calculateStochastic(klines, kPeriod = 14, dPeriod = 3, smooth = 3)\`: Returns \`{ k: number, d: number }\`.
        30. \`helpers.calculateEMA(values, period)\`: Returns EMA (number) for an array of values.
        31. \`helpers.calculateSMA(values, period)\`: Returns SMA (number) for an array of values.
        32. \`helpers.calculateMACD(closes, shortPeriod = 12, longPeriod = 26, signalPeriod = 9)\`: Returns \`{ MACD: number, signal: number, histogram: number }\`.
        33. \`helpers.calculateADX(klines, period = 14)\`: Returns ADX value (number).
        34. \`helpers.calculateVWAP(klines)\`: Returns VWAP value (number).
        35. \`helpers.clearHVNCache(cacheKey?)\`: Clears HVN cache for performance.

    Structure and Logic in \`screenerCode\`:
        - CRUCIAL: Always check timeframe klines lengths before accessing elements or performing calculations. If insufficient, return \`false\`.
        - MULTI-TIMEFRAME: When the user mentions multiple timeframes (e.g., "1m and 5m"), you must access both timeframes and check conditions on each.
        - CRUCIAL: Helper functions return \`null\` or arrays with \`null\`s for insufficient data. Check for these \`null\`s.
        - CRUCIAL: The final statement in \`screenerCode\` MUST be a boolean return. E.g., \`return condition1 && condition2;\`.
        - Parse kline values (open, high, low, close, volume) using \`parseFloat()\`.
        - Avoid \`NaN\`/\`Infinity\` without safeguards. If a condition is ambiguous, interpret reasonably or omit and note in \`description\`.
        - VWAP NOTE: When using VWAP, implement daily reset at UTC midnight by calculating candles since UTC day start unless user specifies otherwise.
        - HVN NOTE: The hvnNodes parameter is NOT pre-populated. To use HVN data, you must first calculate it: \`const hvnNodes = helpers.calculateHighVolumeNodes(klines, {lookback: 100});\`
        - PROGRESS COMMENTS: Add brief progress comments throughout your code to indicate what you're analyzing. These help users understand the logic flow. Use comments starting with capital letter and ending with ... Examples:
          - \`// Analyzing RSI conditions...\`
          - \`// Checking volume requirements...\`
          - \`// Evaluating price action...\`
          - \`// Validating MACD signals...\`
          - \`// Calculating moving averages...\`

indicators: An array of custom indicator configurations for charting. Each indicator can display ANY calculation or combination of values. Max 4-5 indicators.

    Each indicator object must have these properties:
    {
      "id": "unique_identifier",           // Unique ID string
      "name": "Display Name",              // Name shown on chart
      "panel": true/false,                // true = separate panel below price, false = overlay on price chart
      "calculateFunction": "...",          // JavaScript function body (see below)
      "chartType": "line" | "bar",         // Chart type
      "style": {                          // Styling configuration
        "color": "#hex" or ["#hex1", "#hex2", ...],  // Single color or array for multi-line
        "lineWidth": 1.5,                // Line thickness (for line charts)
        "fillColor": "#hexWithAlpha"     // Optional area fill (e.g., "#8efbba33")
      },
      "yAxisConfig": {                    // Optional Y-axis configuration
        "min": 0,                        // Minimum value
        "max": 100,                      // Maximum value
        "label": "RSI"                   // Axis label
      }
    }

    The calculateFunction receives (klines, helpers, params) and MUST return an array of data points:
    - Single line: [{x: timestamp, y: value}, ...]
    - Multi-line (up to 4 lines): [{x: timestamp, y: value1, y2: value2, y3: value3}, ...]
    - Colored bars: [{x: timestamp, y: value, color: "#hex"}, ...]
    - Use \`null\` for y values when data is insufficient

    IMPORTANT: You can create ANY indicator - standard or custom. Examples include:
    - Moving Averages (SMA, EMA, WMA, etc.)
    - Oscillators (RSI, Stochastic, CCI, etc.)
    - Trend indicators (MACD, ADX, Aroon, etc.)
    - Volatility indicators (Bollinger Bands, ATR, Keltner Channels, etc.)
    - Volume indicators (OBV, Volume Profile, MFI, etc.)
    - VWAP: Use basic VWAP by default. Only include bands when user specifically mentions "VWAP bands", "VWAP with standard deviation", or similar. For daily reset, calculate candles since day start.
    - Custom combinations or proprietary calculations

    Color Guidelines:
    - Blue shades (#8efbba, #818cf8): Primary indicators, bullish signals
    - Red shades (#ef4444, #f87171): Bearish signals, resistance
    - Green (#10b981, #34d399): Positive/bullish confirmation
    - Yellow/Orange (#f59e0b, #fbbf24): Neutral, warning signals
    - Purple (#8b5cf6, #a78bfa): Secondary indicators
    - Use transparency (alpha) for fills: add "33" or "66" to hex colors

Example Indicators:

// Simple Moving Average (overlay on price)
{
  "id": "sma_20",
  "name": "SMA(20)",
  "panel": false,
  "calculateFunction": "const ma = helpers.calculateMASeries(klines, 20); return ma.map((val, i) => ({x: klines[i][0], y: val}));",
  "chartType": "line",
  "style": { "color": "#8efbba", "lineWidth": 1.5 }
}

// RSI with overbought/oversold lines (separate panel)
{
  "id": "rsi_14",
  "name": "RSI(14)",
  "panel": true,
  "calculateFunction": "const rsi = helpers.calculateRSI(klines, 14) || []; return rsi.map((val, i) => ({x: klines[i][0], y: val, y2: 70, y3: 30}));",
  "chartType": "line",
  "style": { "color": ["#8b5cf6", "#ef444433", "#10b98133"], "lineWidth": 1.5 },
  "yAxisConfig": { "min": 0, "max": 100, "label": "RSI" }
}

// Bollinger Bands (3 lines overlay)
{
  "id": "bb_20_2",
  "name": "BB(20,2)",
  "panel": false,
  "calculateFunction": "const period = 20, stdDev = 2; const ma = helpers.calculateMASeries(klines, period); return klines.map((k, i) => { if (!ma[i]) return {x: k[0], y: null}; let sum = 0, count = 0; for (let j = Math.max(0, i - period + 1); j <= i; j++) { const close = parseFloat(klines[j][4]); sum += Math.pow(close - ma[i], 2); count++; } const std = Math.sqrt(sum / count); return {x: k[0], y: ma[i], y2: ma[i] + std * stdDev, y3: ma[i] - std * stdDev}; });",
  "chartType": "line",
  "style": { "color": ["#facc15", "#ef4444", "#10b981"] }
}

// Volume with colors (separate panel)
{
  "id": "volume",
  "name": "Volume",
  "panel": true,
  "calculateFunction": "return klines.map(k => ({x: k[0], y: parseFloat(k[5]), color: parseFloat(k[4]) > parseFloat(k[1]) ? '#10b981' : '#ef4444'}));",
  "chartType": "bar",
  "style": {}
}

// MACD with histogram (separate panel, 3 data series)
{
  "id": "macd_12_26_9",
  "name": "MACD(12,26,9)",
  "panel": true,
  "calculateFunction": "const macd = helpers.calculateMACDValues(klines, 12, 26, 9); return klines.map((k, i) => ({x: k[0], y: macd.macdLine[i], y2: macd.signalLine[i], y3: macd.histogram[i], color: macd.histogram[i] >= 0 ? '#10b98166' : '#ef444466'}));",
  "chartType": "line",
  "style": { "color": ["#8efbba", "#f59e0b", "transparent"] }
}

// HVN Support/Resistance Levels (overlay on price, horizontal lines)
{
  "id": "hvn_levels",
  "name": "Volume Nodes",
  "panel": false,
  "calculateFunction": "const hvnNodes = helpers.calculateHighVolumeNodes(klines, {lookback: 100}); const lastTime = klines[klines.length-1][0]; return klines.map(k => ({ x: k[0], y: hvnNodes[0]?.price || null, y2: hvnNodes[1]?.price || null, y3: hvnNodes[2]?.price || null, y4: hvnNodes[3]?.price || null }));",
  "chartType": "line",
  "style": { "color": ["#f59e0b", "#f59e0b99", "#f59e0b66", "#f59e0b33"], "lineWidth": [2, 1.5, 1, 1] }
}

// VWAP (overlay on price)
// IMPORTANT: Daily VWAP resets at 00:00 UTC (Binance server time)
// For other reset times, user should specify in their prompt
// Basic VWAP without bands (default):
{
  "id": "vwap_daily",
  "name": "VWAP (Daily)",
  "panel": false,
  "calculateFunction": "// Calculate candles since UTC midnight for daily reset\\nconst lastKlineTime = klines[klines.length-1][0];\\nconst lastDate = new Date(lastKlineTime);\\n// Get UTC midnight of the current day\\nconst utcMidnight = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate(), 0, 0, 0, 0);\\nlet candlesSinceMidnight = 0;\\n// Count candles since UTC midnight\\nfor (let i = klines.length - 1; i >= 0; i--) {\\n  if (klines[i][0] < utcMidnight) break;\\n  candlesSinceMidnight++;\\n}\\n// Use all klines if no candles found since midnight (for safety)\\nconst anchorPeriod = candlesSinceMidnight > 0 ? candlesSinceMidnight : undefined;\\nconst vwapSeries = helpers.calculateVWAPSeries(klines, anchorPeriod);\\nreturn klines.map((k, i) => ({x: k[0], y: vwapSeries[i]}));",
  "chartType": "line",
  "style": { "color": "#9333ea", "lineWidth": 2 }
}

// VWAP with standard deviation bands (only when user mentions "VWAP bands", "VWAP with bands", "VWAP standard deviation", etc.):
{
  "id": "vwap_daily_bands",
  "name": "VWAP with Bands",
  "panel": false,
  "calculateFunction": "// Calculate candles since UTC midnight for daily reset\\nconst lastKlineTime = klines[klines.length-1][0];\\nconst lastDate = new Date(lastKlineTime);\\n// Get UTC midnight of the current day\\nconst utcMidnight = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate(), 0, 0, 0, 0);\\nlet candlesSinceMidnight = 0;\\n// Count candles since UTC midnight\\nfor (let i = klines.length - 1; i >= 0; i--) {\\n  if (klines[i][0] < utcMidnight) break;\\n  candlesSinceMidnight++;\\n}\\n// Use all klines if no candles found since midnight (for safety)\\nconst anchorPeriod = candlesSinceMidnight > 0 ? candlesSinceMidnight : undefined;\\nconst bands = helpers.calculateVWAPBands(klines, anchorPeriod, 2);\\nreturn klines.map((k, i) => ({x: k[0], y: bands.vwap[i], y2: bands.upperBand[i], y3: bands.lowerBand[i]}));",
  "chartType": "line",
  "style": { "color": ["#9333ea", "#a855f7", "#a855f7"], "lineWidth": [2, 1, 1] }
}

Example Complete Response:
{
  "description": [
    "Price is above the 20-period moving average",
    "RSI is oversold (below 30)",
    "Bollinger Bands are tightening (volatility squeeze)"
  ],
  "requiredTimeframes": ["15m"],
  "screenerCode": "const klines = timeframes['15m']; const ma20 = helpers.calculateMA(klines, 20); const rsi = helpers.getLatestRSI(klines, 14); if (!ma20 || !rsi) return false; const lastClose = parseFloat(klines[klines.length - 1][4]); const bbWidth = helpers.calculateBollingerBandWidth(klines, 20, 2); return lastClose > ma20 && rsi < 30 && bbWidth < 0.05;",

Example Multi-Timeframe Response:
{
  "description": [
    "1m and 5m StochRSI below 30 and rising",
    "Price above VWAP on both timeframes",
    "Volume spike detected"
  ],
  "requiredTimeframes": ["1m", "5m"],
  "screenerCode": "// Check 1m StochRSI\nconst klines1m = timeframes['1m'];\nconst stoch1m = helpers.calculateStochRSI(klines1m, 14, 14, 3, 3);\nif (!stoch1m || stoch1m.length < 2) return false;\nconst last1m = stoch1m[stoch1m.length - 1];\nconst prev1m = stoch1m[stoch1m.length - 2];\n\n// Check 5m StochRSI\nconst klines5m = timeframes['5m'];\nconst stoch5m = helpers.calculateStochRSI(klines5m, 14, 14, 3, 3);\nif (!stoch5m || stoch5m.length < 2) return false;\nconst last5m = stoch5m[stoch5m.length - 1];\nconst prev5m = stoch5m[stoch5m.length - 2];\n\n// Both timeframes: StochRSI below 30 and rising\nconst stochCondition = prev1m.k < 30 && last1m.k > prev1m.k && prev5m.k < 30 && last5m.k > prev5m.k;\n\n// Check VWAP on both timeframes\nconst vwap1m = helpers.getLatestVWAP(klines1m);\nconst vwap5m = helpers.getLatestVWAP(klines5m);\nconst lastPrice = parseFloat(ticker.c);\nconst vwapCondition = lastPrice > vwap1m && lastPrice > vwap5m;\n\n// Volume check\nconst avgVol = helpers.calculateAvgVolume(klines5m, 20);\nconst currentVol = parseFloat(klines5m[klines5m.length - 1][5]);\nconst volumeSpike = currentVol > avgVol * 1.5;\n\nreturn stochCondition && vwapCondition && volumeSpike;",
  "indicators": [
    {
      "id": "sma_20",
      "name": "SMA(20)",
      "panel": false,
      "calculateFunction": "const ma = helpers.calculateMASeries(klines, 20); return ma.map((val, i) => ({x: klines[i][0], y: val}));",
      "chartType": "line",
      "style": { "color": "#8efbba", "lineWidth": 1.5 }
    },
    {
      "id": "rsi_14",
      "name": "RSI(14)",
      "panel": true,
      "calculateFunction": "const rsi = helpers.calculateRSI(klines, 14) || []; return rsi.map((val, i) => ({x: klines[i][0], y: val, y2: 70, y3: 30}));",
      "chartType": "line",
      "style": { "color": ["#8b5cf6", "#ef444433", "#10b98133"], "lineWidth": 1.5 },
      "yAxisConfig": { "min": 0, "max": 100, "label": "RSI" }
    },
    {
      "id": "bb_20_2",
      "name": "BB(20,2)",
      "panel": false,
      "calculateFunction": "const period = 20, stdDev = 2; const ma = helpers.calculateMASeries(klines, period); return klines.map((k, i) => { if (!ma[i]) return {x: k[0], y: null}; let sum = 0, count = 0; for (let j = Math.max(0, i - period + 1); j <= i; j++) { const close = parseFloat(klines[j][4]); sum += Math.pow(close - ma[i], 2); count++; } const std = Math.sqrt(sum / count); return {x: k[0], y: ma[i], y2: ma[i] + std * stdDev, y3: ma[i] - std * stdDev}; });",
      "chartType": "line",
      "style": { "color": ["#facc15", "#ef4444", "#10b981"] }
    }
  ]
}

General Guidelines:
- The \`screenerCode\` string must contain ONLY the JavaScript function body. DO NOT include helper function definitions.
- The entire response from you MUST be a single valid JSON object as shown in the example, without any surrounding text, comments, or markdown formatting outside the JSON structure itself.
- IMPORTANT: You MUST include the "indicators" array with actual indicator objects based on the indicators mentioned in the user's prompt. Include indicators that help visualize the conditions being screened for.
- IMPORTANT: You MUST include the "requiredTimeframes" array with the timeframes your filter needs. Analyze the user's prompt for timeframe references.
- For VWAP: Use the basic "vwap_daily" indicator by default. Only use "vwap_daily_bands" when the user explicitly asks for VWAP bands, standard deviation bands, or VWAP with bands.`,
    parameters: ['userPrompt', 'modelName', 'klineInterval', 'klineLimit'],
    placeholders: {
      klineLimit: 250,
      klineInterval: '15m'
    },
    lastModified: new Date(),
    version: 1,
    isActive: true
  },
  {
    id: 'structured-analysis',
    name: 'Structured Analysis',
    category: 'analysis',
    description: 'Analyzes a specific symbol for trading decisions',
    systemInstruction: `Analyze this {{symbol}} setup and provide a structured JSON response with your trading decision.

Based on the technical analysis data provided, generate a comprehensive trading assessment.

You must return a JSON object with the following structure:
{
  "decision": "buy" | "sell" | "hold" | "no_trade" | "monitor",
  "direction": "long" | "short",
  "confidence": 0.0 to 1.0,
  "reasoning": "Detailed explanation of your decision",
  "keyLevels": {
    "entry": number,
    "stopLoss": number,
    "takeProfit1": number,
    "takeProfit2": number (optional),
    "takeProfit3": number (optional),
    "support": number,
    "resistance": number
  },
  "tradePlan": {
    "entryTrigger": "Specific condition that would trigger entry",
    "positionSize": "Percentage of capital or risk management advice",
    "timeHorizon": "Expected trade duration",
    "invalidation": "What would invalidate this setup"
  },
  "chartAnalysis": {
    "trend": "bullish" | "bearish" | "neutral",
    "pattern": "Identified chart pattern if any",
    "volume": "Volume analysis",
    "momentum": "Momentum indicators status"
  }
}

Consider all provided technical indicators, price action, and market conditions in your analysis.`,
    parameters: ['symbol', 'ticker', 'klines', 'indicators', 'position'],
    lastModified: new Date(),
    version: 1,
    isActive: true
  },
  {
    id: 'symbol-analysis',
    name: 'Symbol Analysis',
    category: 'analysis', 
    description: 'Provides detailed technical analysis for a symbol',
    systemInstruction: `Provide your expert technical analysis for {{symbol}}. Consider the current market conditions, technical indicators, and price action.

Market Snapshot:
{{marketSnapshot}}

Recent Price Action:
{{priceAction}}

Technical Indicators:
{{technicalIndicators}}

{{strategyContext}}

{{positionContext}}

Provide a comprehensive analysis covering:
1. Current trend and momentum
2. Key support and resistance levels
3. Technical indicator signals
4. Risk/reward assessment
5. Trading recommendations

Keep your analysis focused and actionable for traders.`,
    parameters: ['symbol', 'ticker', 'klines', 'indicators', 'position', 'marketSnapshot', 'priceAction', 'technicalIndicators', 'strategyContext', 'positionContext'],
    lastModified: new Date(),
    version: 1,
    isActive: true
  },
  {
    id: 'regenerate-filter',
    name: 'Regenerate Filter Code',
    category: 'screener',
    description: 'Converts human-readable conditions back into JavaScript filter code',
    systemInstruction: `You are an AI assistant that converts human-readable trading conditions into JavaScript code.

You will receive an array of conditions that describe a trading filter. Your task is to generate the JavaScript function body that implements these conditions.

The function receives these parameters:
- ticker: 24hr ticker data object
- klines: Array of candlestick data
- helpers: Object with helper functions (same as in filter generation)
- hvnNodes: High volume nodes array

Generate ONLY the JavaScript function body that returns a boolean. Do not include:
- Function declaration
- Helper function definitions
- Any markdown formatting
- Any explanatory text

Available helper functions:
{{helperFunctions}}

Example input conditions:
["RSI is below 30", "Price above 50 SMA", "Volume spike detected"]

Example output:
const rsi = helpers.getLatestRSI(klines, 14);
const sma50 = helpers.calculateMA(klines, 50);
const avgVolume = helpers.calculateAvgVolume(klines, 20);
const currentVolume = parseFloat(klines[klines.length - 1][5]);
const lastClose = parseFloat(klines[klines.length - 1][4]);

if (!rsi || !sma50 || !avgVolume) return false;

return rsi < 30 && lastClose > sma50 && currentVolume > avgVolume * 1.5;`,
    parameters: ['conditions'],
    placeholders: {
      helperFunctions: `1. helpers.calculateMA(klines, period)
2. helpers.calculateAvgVolume(klines, period)
3. helpers.calculateRSI(klines, period = 14)
4. helpers.getLatestRSI(klines, period = 14)
5. helpers.detectRSIDivergence(klines, rsiPeriod = 14, lookbackCandles = 30, minPeakValleySeparation = 5)
6. helpers.detectGenericDivergence(series1, series2, lookbackCandles = 30, minPeakValleySeparation = 5)
7. helpers.calculateEMASeries(klines, period)
8. helpers.getLatestEMA(klines, period)
9. helpers.calculateMACDValues(klines, shortPeriod = 12, longPeriod = 26, signalPeriod = 9)
10. helpers.getLatestMACD(klines, shortPeriod = 12, longPeriod = 26, signalPeriod = 9)
11. helpers.getHighestHigh(klines, period)
12. helpers.getLowestLow(klines, period)
13. helpers.detectEngulfingPattern(klines)
14. helpers.calculateMASeries(klines, period)
15. helpers.calculatePVISeries(klines, initialPVI = 1000)
16. helpers.getLatestPVI(klines, initialPVI = 1000)
17. helpers.calculateHighVolumeNodes(klines, options)
18. helpers.isNearHVN(price, hvnNodes, tolerance = 0.5)
19. helpers.getClosestHVN(price, hvnNodes, direction = 'both')
20. helpers.countHVNInRange(priceLow, priceHigh, hvnNodes)
21. helpers.calculateVWAPSeries(klines, anchorPeriod?)
22. helpers.getLatestVWAP(klines, anchorPeriod?)
23. helpers.calculateVWAPBands(klines, anchorPeriod?, stdDevMultiplier = 1)
24. helpers.getLatestVWAPBands(klines, anchorPeriod?, stdDevMultiplier = 1)
25. helpers.calculateBollingerBands(klines, period = 20, stdDev = 2)
26. helpers.getLatestBollingerBands(klines, period = 20, stdDev = 2)
27. helpers.calculateStochRSI(klines, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3)
28. helpers.getLatestStochRSI(klines, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3)
29. helpers.calculateStochastic(klines, kPeriod = 14, dPeriod = 3, smooth = 3)
30. helpers.calculateEMA(values, period)
31. helpers.calculateSMA(values, period)
32. helpers.calculateMACD(closes, shortPeriod = 12, longPeriod = 26, signalPeriod = 9)
33. helpers.calculateADX(klines, period = 14)
34. helpers.calculateVWAP(klines)
35. helpers.clearHVNCache(cacheKey?)`
    },
    lastModified: new Date(),
    version: 1,
    isActive: true
  },
  {
    id: 'generate-trader',
    name: 'Generate Trader',
    category: 'trader',
    description: 'Creates complete trading systems with filters and strategy',
    systemInstruction: `You are an AI assistant that creates complete cryptocurrency trading systems. Based on the user's requirements, generate a comprehensive trading system configuration.

The system must include:
1. Market conditions filter (when to look for trades)
2. Entry/exit strategy with specific rules
3. Risk management parameters
4. Technical indicators for visualization

Return a JSON object with this structure:
{
  "suggestedName": "Short descriptive name (max 30 chars)",
  "description": "1-2 sentence summary of the trading strategy",
  "filterDescription": [
    "Human-readable condition 1",
    "Human-readable condition 2",
    "..."
  ],
  "filterCode": "JavaScript function body that returns boolean",
  "strategyInstructions": "Detailed instructions for the AI analyzer on how to evaluate trades using this strategy. Include entry criteria, exit criteria, and risk management rules.",
  "indicators": [
    // Array of indicator configurations (same format as filter generation)
  ],
  "riskParameters": {
    "stopLossPercent": number (e.g., 2.5 for 2.5%),
    "takeProfitPercent": number (e.g., 5.0 for 5%),
    "positionSizePercent": number (e.g., 10 for 10% of capital),
    "maxConcurrentTrades": number,
    "trailingStopPercent": number (optional),
    "riskRewardRatio": number (minimum acceptable, e.g., 2.0)
  }
}

The filterCode should use the same helper functions available in the main screener.
The strategy should be complete and actionable, with clear rules for entry, exit, and risk management.

IMPORTANT: The filterCode is a JavaScript function body that receives these parameters:
- ticker: 24hr ticker data object with properties like c (lastPrice), P (priceChangePercent), v (volume), etc.
- klines: Array of candlestick data [openTime, open, high, low, close, volume, ...]
- helpers: Object with utility functions. ALL functions must be called via this object (e.g., helpers.getLatestRSI())
- hvnNodes: High volume node array (must be calculated first if needed)

DO NOT use standalone functions like getPrice(), getRSI(), getEMA(), getVolume(). 
These DO NOT exist. Use the helpers object instead:
- For prices: parseFloat(klines[klines.length - 1][4]) for last close
- For RSI: helpers.getLatestRSI(klines, period)
- For EMA: helpers.getLatestEMA(klines, period)
- For volume: parseFloat(klines[klines.length - 1][5])

Available helper functions (ALL must be called via helpers object):
{{helperFunctions}}`,
    parameters: ['userPrompt', 'modelName', 'klineInterval'],
    placeholders: {
      helperFunctions: `1. helpers.calculateMA(klines, period)
2. helpers.calculateAvgVolume(klines, period)
3. helpers.calculateRSI(klines, period = 14)
4. helpers.getLatestRSI(klines, period = 14)
5. helpers.detectRSIDivergence(klines, rsiPeriod = 14, lookbackCandles = 30, minPeakValleySeparation = 5)
6. helpers.detectGenericDivergence(series1, series2, lookbackCandles = 30, minPeakValleySeparation = 5)
7. helpers.calculateEMASeries(klines, period)
8. helpers.getLatestEMA(klines, period)
9. helpers.calculateMACDValues(klines, shortPeriod = 12, longPeriod = 26, signalPeriod = 9)
10. helpers.getLatestMACD(klines, shortPeriod = 12, longPeriod = 26, signalPeriod = 9)
11. helpers.getHighestHigh(klines, period)
12. helpers.getLowestLow(klines, period)
13. helpers.detectEngulfingPattern(klines)
14. helpers.calculateMASeries(klines, period)
15. helpers.calculatePVISeries(klines, initialPVI = 1000)
16. helpers.getLatestPVI(klines, initialPVI = 1000)
17. helpers.calculateHighVolumeNodes(klines, options)
18. helpers.isNearHVN(price, hvnNodes, tolerance = 0.5)
19. helpers.getClosestHVN(price, hvnNodes, direction = 'both')
20. helpers.countHVNInRange(priceLow, priceHigh, hvnNodes)
21. helpers.calculateVWAPSeries(klines, anchorPeriod?)
22. helpers.getLatestVWAP(klines, anchorPeriod?)
23. helpers.calculateVWAPBands(klines, anchorPeriod?, stdDevMultiplier = 1)
24. helpers.getLatestVWAPBands(klines, anchorPeriod?, stdDevMultiplier = 1)
25. helpers.calculateBollingerBands(klines, period = 20, stdDev = 2)
26. helpers.getLatestBollingerBands(klines, period = 20, stdDev = 2)
27. helpers.calculateStochRSI(klines, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3)
28. helpers.getLatestStochRSI(klines, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3)
29. helpers.calculateStochastic(klines, kPeriod = 14, dPeriod = 3, smooth = 3)
30. helpers.calculateEMA(values, period)
31. helpers.calculateSMA(values, period)
32. helpers.calculateMACD(closes, shortPeriod = 12, longPeriod = 26, signalPeriod = 9)
33. helpers.calculateADX(klines, period = 14)
34. helpers.calculateVWAP(klines)
35. helpers.clearHVNCache(cacheKey?)`
    },
    lastModified: new Date(),
    version: 1,
    isActive: true
  }
];

class PromptManager {
  private promptCache: Map<string, PromptTemplate> = new Map();
  private overridesCache: Map<string, PromptOverride> = new Map();
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    
    // Load default prompts
    DEFAULT_PROMPTS.forEach(prompt => {
      this.promptCache.set(prompt.id, prompt);
    });

    // Load overrides from Supabase if configured
    if (isSupabaseConfigured()) {
      await this.loadOverrides();
    }

    this.initialized = true;
  }

  private async loadOverrides() {
    try {
      const { data, error } = await supabase!
        .from('prompt_overrides')
        .select('*')
        .eq('is_active', true);

      if (error) {
        // Only log if it's not a "table doesn't exist" error
        if (error.code !== '42P01') {
          console.error('Failed to load prompt overrides:', error);
        }
        return;
      }

      if (data) {
        data.forEach((override: PromptOverride) => {
          this.overridesCache.set(override.prompt_id, override);
          
          // Apply override to cached prompt
          const prompt = this.promptCache.get(override.prompt_id);
          if (prompt) {
            prompt.systemInstruction = override.content;
            prompt.version = override.version;
            prompt.lastModified = new Date(override.created_at);
          }
        });
      }
    } catch (error) {
      console.error('Error loading prompt overrides:', error);
    }
  }

  async getAllPrompts(): Promise<PromptTemplate[]> {
    await this.initialize();
    return Array.from(this.promptCache.values());
  }

  async getPrompt(id: string): Promise<PromptTemplate | null> {
    await this.initialize();
    return this.promptCache.get(id) || null;
  }

  async getPromptContent(id: string): Promise<string | null> {
    const prompt = await this.getPrompt(id);
    return prompt?.systemInstruction || null;
  }

  async savePromptOverride(
    promptId: string, 
    content: string, 
    userEmail: string
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured, saving to local storage only');
      
      // Save to local storage as fallback
      const prompt = this.promptCache.get(promptId);
      if (prompt) {
        prompt.systemInstruction = content;
        prompt.version += 1;
        prompt.lastModified = new Date();
        localStorage.setItem(`prompt_override_${promptId}`, JSON.stringify({
          content,
          version: prompt.version,
          lastModified: prompt.lastModified
        }));
        return true;
      }
      return false;
    }

    try {
      // Deactivate previous overrides
      await supabase!
        .from('prompt_overrides')
        .update({ is_active: false })
        .eq('prompt_id', promptId)
        .eq('is_active', true);

      // Insert new override
      const { data, error } = await supabase!
        .from('prompt_overrides')
        .insert({
          prompt_id: promptId,
          content,
          created_by: userEmail,
          is_active: true,
          version: (this.promptCache.get(promptId)?.version || 0) + 1
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to save prompt override:', error);
        return false;
      }

      // Update cache
      if (data) {
        this.overridesCache.set(promptId, data);
        const prompt = this.promptCache.get(promptId);
        if (prompt) {
          prompt.systemInstruction = content;
          prompt.version = data.version;
          prompt.lastModified = new Date(data.created_at);
        }
      }

      return true;
    } catch (error) {
      console.error('Error saving prompt override:', error);
      return false;
    }
  }

  async getPromptHistory(promptId: string): Promise<PromptOverride[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await supabase!
        .from('prompt_overrides')
        .select('*')
        .eq('prompt_id', promptId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load prompt history:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error loading prompt history:', error);
      return [];
    }
  }

  // Replace placeholders in prompt content
  private replacePlaceholders(content: string, values: Record<string, any>): string {
    let result = content;
    
    // Replace double curly brace placeholders {{key}}
    Object.entries(values).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, String(value));
    });
    
    // Also support ${key} syntax for backward compatibility
    Object.entries(values).forEach(([key, value]) => {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value));
    });
    
    return result;
  }

  // Get the actual prompt content that would be used in the system
  async getActivePromptContent(id: string, placeholderValues?: Record<string, any>): Promise<string | null> {
    await this.initialize();
    
    // Check for local storage override first (for non-Supabase environments)
    if (!isSupabaseConfigured()) {
      const localOverride = localStorage.getItem(`prompt_override_${id}`);
      if (localOverride) {
        try {
          const override = JSON.parse(localOverride);
          const content = override.content;
          
          // Apply placeholders if provided
          if (placeholderValues) {
            const prompt = this.promptCache.get(id);
            const defaultPlaceholders = prompt?.placeholders || {};
            const allValues = { ...defaultPlaceholders, ...placeholderValues };
            return this.replacePlaceholders(content, allValues);
          }
          
          return content;
        } catch (e) {
          console.error('Failed to parse local override:', e);
        }
      }
    }
    
    const content = await this.getPromptContent(id);
    if (!content) return null;
    
    // Apply placeholders if provided
    if (placeholderValues) {
      const prompt = this.promptCache.get(id);
      const defaultPlaceholders = prompt?.placeholders || {};
      const allValues = { ...defaultPlaceholders, ...placeholderValues };
      return this.replacePlaceholders(content, allValues);
    }
    
    return content;
  }
}

export const promptManager = new PromptManager();