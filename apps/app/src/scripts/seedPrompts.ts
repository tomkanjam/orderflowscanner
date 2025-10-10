// Script to seed prompts into the database
// Run with: npx tsx seedPrompts.ts

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Shared filter code instructions
const FILTER_CODE_INSTRUCTIONS = `
screenerCode: A string containing the body of a Go function that evaluates market data and returns a boolean (true if conditions met, false otherwise).
    The function signature is: \`func evaluate(data *types.MarketData) bool\`

    Available Data Structure:
        \`data.Ticker\`: 24hr ticker summary. Access fields like \`data.Ticker.LastPrice\`, \`data.Ticker.PriceChangePercent\`, \`data.Ticker.QuoteVolume\`.
        \`data.Klines\`: Map of timeframe to kline arrays. Access via \`data.Klines["1m"]\`, \`data.Klines["5m"]\`, etc.
            - Example: \`klines5m := data.Klines["5m"]\`
            - Example: \`klines1h := data.Klines["1h"]\`
            - Each kline is a struct with fields: OpenTime, Open, High, Low, Close, Volume
            - Access: \`klines[i].Close\`, \`klines[i].Volume\`, etc.
            - Most recent kline: \`klines[len(klines)-1]\`
            - CRITICAL: Always check length before accessing: \`if len(klines) < period { return false }\`

    Available Indicator Functions from \`indicators\` package:
        1.  \`indicators.CalculateMA(klines, period)\`: Returns Latest SMA (*float64) or nil.
        2.  \`indicators.CalculateAvgVolume(klines, period)\`: Returns Average volume (*float64) or nil.
        3.  \`indicators.CalculateRSISeries(klines, period)\`: Returns RSI series ([]float64).
        4.  \`indicators.GetLatestRSI(klines, period)\`: Returns Latest RSI (*float64) or nil.
        5.  \`indicators.CalculateEMASeries(klines, period)\`: Returns EMA series ([]float64).
        6.  \`indicators.GetLatestEMA(klines, period)\`: Returns Latest EMA (*float64) or nil.
        7.  \`indicators.CalculateMACDValues(klines, shortPeriod, longPeriod, signalPeriod)\`: Returns MACD struct with MACD, Signal, Histogram fields (all *float64).
        8.  \`indicators.GetLatestMACD(klines, shortPeriod, longPeriod, signalPeriod)\`: Returns Latest MACD values (*MACDResult) or nil.
        9.  \`indicators.GetHighestHigh(klines, period)\`: Returns Highest high (*float64) or nil.
        10. \`indicators.GetLowestLow(klines, period)\`: Returns Lowest low (*float64) or nil.
        11. \`indicators.DetectEngulfingPattern(klines)\`: Returns "bullish", "bearish", or "" (empty string for none).
        12. \`indicators.CalculateMASeries(klines, period)\`: Returns SMA series ([]float64).
        13. \`indicators.CalculateVWAPSeries(klines)\`: Returns VWAP series ([]float64).
        14. \`indicators.GetLatestVWAP(klines)\`: Returns Latest VWAP (*float64) or nil.
        15. \`indicators.CalculateBollingerBands(klines, period, stdDev)\`: Returns Bollinger Bands struct with Upper, Middle, Lower slices (all []float64).
        16. \`indicators.GetLatestBollingerBands(klines, period, stdDev)\`: Returns Latest Bollinger Bands (*BollingerBandsResult) or nil.
        17. \`indicators.CalculateStochastic(klines, kPeriod, dPeriod, smooth)\`: Returns Stochastic struct with K, D values (*float64).
        18. \`indicators.CalculateVWAP(klines)\`: Returns VWAP value (float64).

    Note: All pointer return types (*float64, *MACDResult, etc.) should be checked for nil before dereferencing.

    Structure and Logic in Go \`screenerCode\`:
        - CRUCIAL: Always check klines length: \`if len(klines) < period { return false }\`
        - MULTI-TIMEFRAME: Access multiple timeframes from data.Klines map
        - CRUCIAL: Indicator functions return pointers (*float64). Always check for nil: \`if rsi == nil { return false }\`
        - CRUCIAL: Dereference pointers when comparing: \`*rsi < 30.0\` (note the asterisk)
        - The final statement MUST be a boolean return: \`return condition1 && condition2\`
        - Kline fields are already float64, no parsing needed: \`klines[i].Close\`, \`klines[i].Volume\`
        - Variable declaration: Use \`:=\` for new variables, \`=\` for assignment
        - PROGRESS COMMENTS: Add brief comments to explain logic:
          // Check RSI conditions
          // Validate volume requirements
          // Evaluate price action

Go Code Examples:

// Single timeframe RSI check
klines5m := data.Klines["5m"]
if len(klines5m) < 14 {
    return false
}

rsi := indicators.GetLatestRSI(klines5m, 14)
if rsi == nil {
    return false
}

return *rsi < 30.0

// Multi-timeframe with MACD
klines1m := data.Klines["1m"]
klines5m := data.Klines["5m"]

if len(klines1m) < 26 || len(klines5m) < 26 {
    return false
}

macd1m := indicators.GetLatestMACD(klines1m, 12, 26, 9)
macd5m := indicators.GetLatestMACD(klines5m, 12, 26, 9)

if macd1m == nil || macd5m == nil {
    return false
}

return *macd1m.Histogram > 0 && *macd5m.Histogram > 0

// Price above moving average with volume
klines := data.Klines["15m"]
if len(klines) < 50 {
    return false
}

ma50 := indicators.CalculateMA(klines, 50)
avgVol := indicators.CalculateAvgVolume(klines, 20)

if ma50 == nil || avgVol == nil {
    return false
}

lastClose := klines[len(klines)-1].Close
currentVol := klines[len(klines)-1].Volume

return lastClose > *ma50 && currentVol > *avgVol*1.5

DO NOT use JavaScript syntax. This is Go code that will be executed by the Yaegi interpreter.`;

// Helper function list (Go indicators package)
const HELPER_FUNCTIONS_LIST = `1. indicators.CalculateMA(klines, period) - Returns *float64
2. indicators.CalculateAvgVolume(klines, period) - Returns *float64
3. indicators.CalculateRSISeries(klines, period) - Returns []float64
4. indicators.GetLatestRSI(klines, period) - Returns *float64
5. indicators.CalculateEMASeries(klines, period) - Returns []float64
6. indicators.GetLatestEMA(klines, period) - Returns *float64
7. indicators.CalculateMACDValues(klines, shortPeriod, longPeriod, signalPeriod) - Returns *MACDResult
8. indicators.GetLatestMACD(klines, shortPeriod, longPeriod, signalPeriod) - Returns *MACDResult
9. indicators.GetHighestHigh(klines, period) - Returns *float64
10. indicators.GetLowestLow(klines, period) - Returns *float64
11. indicators.DetectEngulfingPattern(klines) - Returns string ("bullish", "bearish", or "")
12. indicators.CalculateMASeries(klines, period) - Returns []float64
13. indicators.CalculateVWAPSeries(klines) - Returns []float64
14. indicators.GetLatestVWAP(klines) - Returns *float64
15. indicators.CalculateBollingerBands(klines, period, stdDev) - Returns *BollingerBandsResult
16. indicators.GetLatestBollingerBands(klines, period, stdDev) - Returns *BollingerBandsResult
17. indicators.CalculateStochastic(klines, kPeriod, dPeriod, smooth) - Returns *StochasticResult
18. indicators.CalculateVWAP(klines) - Returns float64

Note: Functions returning pointers (*float64, *MACDResult, etc.) return nil when insufficient data.
Always check for nil before dereferencing: if result == nil { return false }`;

const prompts = [
  {
    id: 'filter-and-chart-config',
    name: 'Filter and Chart Config',
    category: 'screener',
    description: 'Main screener filter generation - converts natural language to screening filters',
    systemInstruction: `You are an AI assistant for a crypto screener. The user provides a description of technical conditions. You MUST return a single, valid JSON object with four properties: "description", "screenerCode", "indicators", and "requiredTimeframes". Do not include any text outside of this JSON object.

description: An array of human-readable strings explaining each condition the AI has implemented. Max 3-4 concise conditions.

requiredTimeframes: An array of timeframe strings that your filter needs to analyze. Valid values: "1m", "5m", "15m", "1h", "4h", "1d". Analyze the user's prompt to determine which timeframes are referenced. If no specific timeframes are mentioned, default to ["{{klineInterval}}"].

screenerCode: Go code (function body only) that will be executed by the Yaegi interpreter. The code must return a boolean.

${FILTER_CODE_INSTRUCTIONS}

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
    - CRITICAL: 'klines' is already provided as a parameter - NEVER declare it in your function!
    - DO NOT use: const klines = timeframes['1m']; - this will cause an error!

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
// REMINDER: klines is already provided as a parameter!
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
    "Volume is above average"
  ],
  "requiredTimeframes": ["15m"],
  "screenerCode": "klines := data.Klines[\"15m\"]\nif len(klines) < 20 {\n    return false\n}\n\nma20 := indicators.CalculateMA(klines, 20)\nrsi := indicators.GetLatestRSI(klines, 14)\navgVol := indicators.CalculateAvgVolume(klines, 20)\n\nif ma20 == nil || rsi == nil || avgVol == nil {\n    return false\n}\n\nlastClose := klines[len(klines)-1].Close\ncurrentVol := klines[len(klines)-1].Volume\n\nreturn lastClose > *ma20 && *rsi < 30.0 && currentVol > *avgVol*1.5",
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

Example Multi-Timeframe Response:
{
  "description": [
    "RSI below 30 on both 1m and 5m timeframes",
    "Price above VWAP on both timeframes",
    "Volume spike detected"
  ],
  "requiredTimeframes": ["1m", "5m"],
  "screenerCode": "// Check RSI on both timeframes\nklines1m := data.Klines[\"1m\"]\nklines5m := data.Klines[\"5m\"]\n\nif len(klines1m) < 14 || len(klines5m) < 20 {\n    return false\n}\n\nrsi1m := indicators.GetLatestRSI(klines1m, 14)\nrsi5m := indicators.GetLatestRSI(klines5m, 14)\n\nif rsi1m == nil || rsi5m == nil {\n    return false\n}\n\n// Check VWAP on both timeframes\nvwap1m := indicators.GetLatestVWAP(klines1m)\nvwap5m := indicators.GetLatestVWAP(klines5m)\n\nif vwap1m == nil || vwap5m == nil {\n    return false\n}\n\nlastPrice := data.Ticker.LastPrice\n\n// Volume check\navgVol := indicators.CalculateAvgVolume(klines5m, 20)\nif avgVol == nil {\n    return false\n}\n\ncurrentVol := klines5m[len(klines5m)-1].Volume\n\nreturn *rsi1m < 30.0 && *rsi5m < 30.0 && lastPrice > *vwap1m && lastPrice > *vwap5m && currentVol > *avgVol*1.5",
  "indicators": [
    // ... indicator definitions ...
  ]
}

General Guidelines:
- The \`screenerCode\` string must contain ONLY Go function body code. DO NOT include function signature or package declarations.
- DO NOT use JavaScript syntax. This is Go code executed by the Yaegi interpreter.
- Always check for nil pointers and dereference them with * when comparing values.
- The entire response from you MUST be a single valid JSON object as shown in the example, without any surrounding text, comments, or markdown formatting outside the JSON structure itself.
- IMPORTANT: You MUST include the "indicators" array with actual indicator objects based on the indicators mentioned in the user's prompt. Include indicators that help visualize the conditions being screened for.
- IMPORTANT: You MUST include the "requiredTimeframes" array with the timeframes your filter needs. Analyze the user's prompt for timeframe references.`,
    parameters: ['userPrompt', 'modelName', 'klineInterval', 'klineLimit'],
    placeholders: {
      klineLimit: 250,
      klineInterval: '15m'
    }
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
    parameters: ['symbol', 'ticker', 'klines', 'indicators', 'position']
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
    parameters: ['symbol', 'ticker', 'klines', 'indicators', 'position', 'marketSnapshot', 'priceAction', 'technicalIndicators', 'strategyContext', 'positionContext']
  },
  {
    id: 'regenerate-filter',
    name: 'Regenerate Filter Code',
    category: 'screener',
    description: 'Converts human-readable conditions back into Go filter code',
    systemInstruction: `You are an AI assistant that converts human-readable trading conditions into Go code.

You will receive an array of conditions that describe a trading filter. Your task is to:
1. Analyze the conditions to determine which timeframes are needed
2. Generate CLEAN, CONCISE Go function body that implements these conditions

CRITICAL RULES:
1. Generate ONLY the necessary code - NO personal commentary, NO trading philosophy, NO explanations
2. Use minimal comments - only for clarifying complex calculations if needed
3. Keep variable names short and clear
4. Return the boolean result directly when possible
5. Always check for nil pointers before dereferencing
6. Use Go syntax: := for declaration, * for pointer dereference

CRITICAL TIMEFRAME CONSISTENCY RULES:
- The timeframes in "requiredTimeframes" MUST EXACTLY match the timeframes used in "filterCode"
- If you detect "1 hour" or "1h" in conditions, use "1h" in both requiredTimeframes AND data.Klines["1h"]
- If you detect "1 minute" or "1m" in conditions, use "1m" in both requiredTimeframes AND data.Klines["1m"]
- NEVER mix timeframes - maintain perfect consistency between declaration and usage

Return a JSON object with this structure:
{
  "requiredTimeframes": ["1m", "5m", ...], // Array of timeframes needed based on the conditions
  "filterCode": "// Go function body"
}

For the filterCode:
${FILTER_CODE_INSTRUCTIONS}

The filterCode should be ONLY the Go function body that returns a boolean. Do not include:
- Function declaration (func evaluate...)
- Package declarations
- Import statements
- Any markdown formatting
- Any explanatory text outside the JSON

If no specific timeframes are mentioned in the conditions, default to the provided klineInterval.

Example input:
{
  "conditions": ["RSI is below 30", "Price above 50 SMA", "Volume spike detected"],
  "klineInterval": "15m"
}

Example output (CLEAN CODE - no unnecessary comments):
{
  "requiredTimeframes": ["15m"],
  "filterCode": "klines := data.Klines[\"15m\"]\nif len(klines) < 50 {\n    return false\n}\n\nrsi := indicators.GetLatestRSI(klines, 14)\nsma50 := indicators.CalculateMA(klines, 50)\navgVolume := indicators.CalculateAvgVolume(klines, 20)\n\nif rsi == nil || sma50 == nil || avgVolume == nil {\n    return false\n}\n\ncurrentVolume := klines[len(klines)-1].Volume\nlastClose := klines[len(klines)-1].Close\n\nreturn *rsi < 30.0 && lastClose > *sma50 && currentVolume > *avgVolume*1.5"
}

Multi-timeframe example input:
{
  "conditions": ["1m and 5m StochRSI below 30 and rising"],
  "klineInterval": "15m"
}

Multi-timeframe example output:
{
  "requiredTimeframes": ["1m", "5m"],
  "filterCode": "// Check 1m RSI\nklines1m := data.Klines[\"1m\"]\nif len(klines1m) < 14 {\n    return false\n}\n\nrsi1m := indicators.GetLatestRSI(klines1m, 14)\nif rsi1m == nil {\n    return false\n}\n\n// Check 5m RSI\nklines5m := data.Klines[\"5m\"]\nif len(klines5m) < 14 {\n    return false\n}\n\nrsi5m := indicators.GetLatestRSI(klines5m, 14)\nif rsi5m == nil {\n    return false\n}\n\n// Both timeframes: RSI below 30\nreturn *rsi1m < 30.0 && *rsi5m < 30.0"
}`,
    parameters: ['conditions'],
    placeholders: {
      helperFunctions: HELPER_FUNCTIONS_LIST
    }
  },
  {
    id: 'generate-trader-metadata',
    name: 'Generate Trader Metadata',
    category: 'trader',
    description: 'Creates trader metadata without filter code (for Go-based traders)',
    systemInstruction: `You are an AI assistant that creates cryptocurrency trading systems using Go code.

CRITICAL: You MUST return ONLY a valid JSON object. Do not include ANY text, explanation, markdown, or comments before or after the JSON. The response must start with { and end with }.

Based on the user's requirements, generate trader metadata that EXACTLY matches what they ask for - no more, no less.

IMPORTANT: 
- If the user asks for simple conditions (e.g., "StochRSI below 40"), only create those conditions
- Do NOT add extra filters (trend, volume, etc.) unless specifically requested
- Create human-readable conditions that describe WHAT to check, not HOW to code it
- CRITICAL: Analyze your filter conditions and create indicator configurations for EVERY indicator mentioned
- CRITICAL: Each indicator must have a proper calculateFunction implementation, not just a comment

Return a JSON object with EXACTLY this structure:
{
  "suggestedName": "Short descriptive name (max 30 chars)",
  "description": "1-2 sentence summary of the trading strategy",
  "filterConditions": [
    "Human-readable condition 1",
    "Human-readable condition 2"
  ],
  "strategyInstructions": "Detailed instructions for the AI analyzer. Explain entry logic, exit strategy, and risk management approach.",
  "indicators": [
    // IMPORTANT: Include indicators for ALL technical indicators mentioned in your filter conditions
    // Each indicator MUST return an array of data points with proper calculateFunction implementation
    {
      "id": "unique_id",
      "name": "Indicator Name",
      "panel": true/false,  // true = separate panel, false = overlay on price
      "calculateFunction": "// Actual implementation, not just a comment",
      "chartType": "line" | "bar",
      "style": { "color": "#hex" or ["#hex1", "#hex2"] for multi-line }
    }
  ],
  "riskParameters": {
    "stopLoss": 0.02,
    "takeProfit": 0.05,
    "maxPositions": 3,
    "positionSizePercent": 0.1,
    "maxDrawdown": 0.1
  }
}

CRITICAL INDICATOR RULES:
1. If you mention RSI in conditions, you MUST include an RSI indicator
2. If you mention EMA/SMA in conditions, you MUST include those moving average indicators
3. If you mention StochRSI in conditions, you MUST include a StochRSI indicator
4. If you mention MACD in conditions, you MUST include a MACD indicator
5. If you mention Bollinger Bands in conditions, you MUST include a Bollinger Bands indicator
6. If you mention Volume in conditions, you MUST include a Volume indicator

IMPORTANT Indicator Examples:

CRITICAL: Indicator functions receive 'klines' as a parameter. NEVER declare it in your function!
DO NOT use: const klines = timeframes['1m']; 
The klines for the appropriate timeframe are already provided to your function.

// RSI with horizontal reference lines (separate panel)
{
  "id": "rsi_14",
  "name": "RSI(14)",
  "panel": true,
  "calculateFunction": "if (!klines || klines.length < 14) return []; const rsiSeries = helpers.calculateRSI(klines, 14); return rsiSeries.map((val, i) => ({x: klines[i][0], y: val}));",
  "chartType": "line",
  "style": { "color": "#c084fc" },
  "yAxisConfig": {
    "min": 0,
    "max": 100,
    "label": "RSI"
  }
}

// EMA (overlay on price)
{
  "id": "ema_50",
  "name": "EMA(50)",
  "panel": false,
  "calculateFunction": "if (!klines || klines.length < 50) return []; const ema = helpers.calculateEMASeries(klines, 50); return ema.map((val, i) => ({x: klines[i][0], y: val}));",
  "chartType": "line",
  "style": { "color": "#f59e0b", "lineWidth": 1.5 }
}

// Simple Moving Average (overlay on price)
{
  "id": "sma_20",
  "name": "SMA(20)",
  "panel": false,
  "calculateFunction": "if (!klines || klines.length < 20) return []; const ma = helpers.calculateMASeries(klines, 20); return ma.map((val, i) => ({x: klines[i][0], y: val}));",
  "chartType": "line",
  "style": { "color": "#8efbba", "lineWidth": 1.5 }
}

// StochRSI (2 lines in separate panel)
{
  "id": "stochrsi_14",
  "name": "StochRSI(14)",
  "panel": true,
  "calculateFunction": "if (!klines || klines.length < 14) return []; const stoch = helpers.calculateStochRSI(klines, 14, 14, 3, 3); return stoch ? stoch.map((val, i) => ({x: klines[i][0], y: val.k, y2: val.d})) : [];",
  "chartType": "line",
  "style": { "color": ["#8b5cf6", "#f59e0b"], "lineWidth": 1.5 },
  "yAxisConfig": { "min": 0, "max": 100, "label": "StochRSI" }
}

// Bollinger Bands (3 lines overlay)
{
  "id": "bb_20_2",
  "name": "BB(20,2)",
  "panel": false,
  "calculateFunction": "if (!klines || klines.length < 20) return []; const bands = helpers.calculateBollingerBands(klines, 20, 2); return klines.map((k, i) => ({x: k[0], y: bands.middle[i], y2: bands.upper[i], y3: bands.lower[i]}));",
  "chartType": "line",
  "style": { "color": ["#facc15", "#ef4444", "#10b981"] }
}

// MACD with histogram (separate panel, 3 data series)
{
  "id": "macd_12_26_9",
  "name": "MACD(12,26,9)",
  "panel": true,
  "calculateFunction": "if (!klines || klines.length < 26) return []; const macd = helpers.calculateMACDValues(klines, 12, 26, 9); return klines.map((k, i) => ({x: k[0], y: macd.macdLine[i], y2: macd.signalLine[i], y3: macd.histogram[i]}));",
  "chartType": "line",
  "style": { "color": ["#8efbba", "#f59e0b", "transparent"] }
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

// VWAP (overlay on price)
{
  "id": "vwap_daily",
  "name": "VWAP",
  "panel": false,
  "calculateFunction": "const vwapSeries = helpers.calculateVWAPSeries(klines); return klines.map((k, i) => ({x: k[0], y: vwapSeries[i]}));",
  "chartType": "line",
  "style": { "color": "#9333ea", "lineWidth": 2 }
}

Focus on creating clear, specific conditions that can be implemented as code later. Each condition should be testable and unambiguous.

Example conditions:
- "RSI is below 30 on the 1-minute chart" → Must include RSI indicator
- "Price is above the 50-period EMA" → Must include EMA(50) indicator
- "StochRSI K-line is below 20 on the 1-minute chart" → Must include StochRSI indicator
- "MACD histogram turns positive" → Must include MACD indicator
- "Volume is 50% higher than the 20-period average" → Must include Volume indicator

REMEMBER: For every technical indicator you mention in filterConditions, you MUST include a corresponding indicator configuration with a proper calculateFunction implementation!`,
    parameters: ['userPrompt', 'modelName'],
    placeholders: {}
  },
  {
    id: 'generate-trader',
    name: 'Generate Trader',
    category: 'trader',
    description: 'Creates complete trading systems with Go filters and strategy',
    systemInstruction: `You are an AI assistant that creates cryptocurrency trading systems using Go code.

CRITICAL: You MUST return ONLY a valid JSON object. Do not include ANY text, explanation, markdown, or comments before or after the JSON. The response must start with { and end with }.

Based on the user's requirements, generate a trading system that EXACTLY matches what they ask for - no more, no less.

IMPORTANT:
- If the user asks for simple conditions (e.g., "RSI below 30"), only implement those conditions
- Do NOT add extra filters (trend, volume, etc.) unless specifically requested
- Analyze the user's prompt to determine which timeframes are mentioned
- Generate Go code, not JavaScript

CRITICAL TIMEFRAME CONSISTENCY RULES:
1. The timeframes you specify in "requiredTimeframes" MUST EXACTLY match the timeframes you use in "filterCode"
2. If you set requiredTimeframes: ["1h"], then filterCode MUST use: klines := data.Klines["1h"]
3. If you set requiredTimeframes: ["1m", "5m"], then filterCode MUST use BOTH: data.Klines["1m"] AND data.Klines["5m"]
4. NEVER mix timeframes - if requiredTimeframes says "1h", do NOT use data.Klines["1m"] in the code
5. When the user mentions a specific timeframe (e.g., "on the 1-hour chart"), use that timeframe consistently throughout

Return a JSON object with EXACTLY this structure:
{
  "suggestedName": "Short descriptive name (max 30 chars)",
  "description": "1-2 sentence summary of the trading strategy",
  "filterDescription": [
    "Human-readable condition 1",
    "Human-readable condition 2"
  ],
  "requiredTimeframes": ["1m", "5m"], // Array of timeframes. Valid values: "1m", "5m", "15m", "1h", "4h", "1d"
  "filterCode": "Go function body that returns boolean",
  "strategyInstructions": "Instructions for the AI analyzer. For simple filters, keep this brief.",
  "indicators": [
    {
      "id": "unique_id",
      "name": "Indicator Name",
      "panel": true,
      "calculateFunction": "// Function body that returns data points - klines is already provided as parameter",
      "chartType": "line",
      "style": { "color": "#8efbba" }
    }
  ],
  "riskParameters": {
    "stopLossPercent": 2.0,
    "takeProfitPercent": 4.0,
    "positionSizePercent": 10.0,
    "maxConcurrentTrades": 3
  }
}

For the filterCode field:
${FILTER_CODE_INSTRUCTIONS}

The strategy should be complete and actionable, with clear rules for entry, exit, and risk management.

For indicators, only include indicators that are relevant to the conditions being screened for. For simple conditions, 1-2 indicators may be sufficient.

IMPORTANT Indicator Examples:

CRITICAL: Indicator functions receive 'klines' as a parameter. NEVER declare it in your function!
DO NOT use: const klines = timeframes['1m']; 
The klines for the appropriate timeframe are already provided to your function.

// Bollinger Bands (3 lines overlay) - Note: klines is already provided as parameter
{
  "id": "bb_20_2",
  "name": "BB(20,2)",
  "panel": false,
  "calculateFunction": "if (!klines || klines.length < 20) return []; const bands = helpers.calculateBollingerBands(klines, 20, 2); return klines.map((k, i) => ({x: k[0], y: bands.middle[i], y2: bands.upper[i], y3: bands.lower[i]}));",
  "chartType": "line",
  "style": { "color": ["#facc15", "#ef4444", "#10b981"] }
}

// StochRSI (2 lines in separate panel)
{
  "id": "stochrsi_14",
  "name": "StochRSI(14)",
  "panel": true,
  "calculateFunction": "if (!klines || klines.length < 14) return []; const stoch = helpers.calculateStochRSI(klines, 14, 14, 3, 3); return stoch.map((val, i) => ({x: klines[i][0], y: val.k, y2: val.d}));",
  "chartType": "line",
  "style": { "color": ["#8b5cf6", "#f59e0b"], "lineWidth": 1.5 },
  "yAxisConfig": { "min": 0, "max": 100, "label": "StochRSI" }
}

// Simple Moving Average (overlay on price)
{
  "id": "sma_20",
  "name": "SMA(20)",
  "panel": false,
  "calculateFunction": "if (!klines || klines.length < 20) return []; const ma = helpers.calculateMASeries(klines, 20); return ma.map((val, i) => ({x: klines[i][0], y: val}));",
  "chartType": "line",
  "style": { "color": "#8efbba", "lineWidth": 1.5 }
}

// RSI with horizontal reference lines
{
  "id": "rsi_14",
  "name": "RSI(14)",
  "panel": true,
  "calculateFunction": "if (!klines || klines.length < 14) return []; const rsiSeries = helpers.calculateRSI(klines, 14); return rsiSeries.map((val, i) => ({x: klines[i][0], y: val}));",
  "chartType": "line",
  "style": { "color": "#c084fc" },
  "yAxisConfig": {
    "min": 0,
    "max": 100,
    "label": "RSI"
  }
}

NOTE: Always transform helper function results to the expected array format!

COMPLETE EXAMPLE - Your response should look EXACTLY like this (with your own values):
{
  "suggestedName": "30 Candle Breakout",
  "description": "Captures momentum breakouts from 30-candle consolidation ranges on the 1-minute timeframe.",
  "filterDescription": [
    "Price breaks above the highest high of the last 30 candles",
    "Volume is 50% above the 20-period average"
  ],
  "requiredTimeframes": ["1m"],
  "filterCode": "klines := data.Klines[\"1m\"]\nif len(klines) < 30 {\n    return false\n}\n\nhighestHigh := indicators.GetHighestHigh(klines, 30)\navgVolume := indicators.CalculateAvgVolume(klines, 20)\n\nif highestHigh == nil || avgVolume == nil {\n    return false\n}\n\ncurrentPrice := klines[len(klines)-1].Close\ncurrentVolume := klines[len(klines)-1].Volume\n\nreturn currentPrice > *highestHigh && currentVolume > *avgVolume*1.5",
  "strategyInstructions": "Enter long when price breaks above 30-candle high with volume confirmation. Set stop loss at the 30-candle low. Take profit at 2:1 risk/reward ratio.",
  "indicators": [
    {
      "id": "highest_high_30",
      "name": "30 Candle High",
      "panel": false,
      "calculateFunction": "const high30 = helpers.getHighestHigh(klines, 30); return klines.map(k => ({x: k[0], y: high30}));",
      "chartType": "line",
      "style": { "color": "#ef4444", "lineWidth": 1 }
    },
    {
      "id": "volume_ma",
      "name": "Volume MA(20)",
      "panel": true,
      "calculateFunction": "const volMA = helpers.calculateAvgVolume(klines, 20); return klines.map(k => ({x: k[0], y: parseFloat(k[5]), y2: volMA}));",
      "chartType": "bar",
      "style": { "color": ["#10b981", "#facc15"] }
    }
  ],
  "riskParameters": {
    "stopLossPercent": 1.5,
    "takeProfitPercent": 3.0,
    "positionSizePercent": 5.0,
    "maxConcurrentTrades": 2
  }
}`,
    parameters: ['userPrompt', 'modelName', 'klineInterval'],
    placeholders: {
      helperFunctions: HELPER_FUNCTIONS_LIST
    }
  }
];

async function seedPrompts() {
  console.log('Starting prompt seeding...');
  
  for (const prompt of prompts) {
    try {
      // Check if prompt exists
      const { data: existing } = await supabase
        .from('prompts')
        .select('id')
        .eq('id', prompt.id)
        .single();
        
      if (existing) {
        console.log(`Prompt ${prompt.id} already exists, skipping...`);
        continue;
      }
      
      // Insert new prompt
      const { error } = await supabase
        .from('prompts')
        .insert({
          id: prompt.id,
          name: prompt.name,
          category: prompt.category,
          description: prompt.description,
          system_instruction: prompt.systemInstruction,
          parameters: prompt.parameters || [],
          placeholders: prompt.placeholders || {},
          is_active: true
        });
        
      if (error) {
        console.error(`Failed to insert ${prompt.id}:`, error);
      } else {
        console.log(`Successfully inserted ${prompt.id}`);
      }
    } catch (error) {
      console.error(`Error processing ${prompt.id}:`, error);
    }
  }
  
  console.log('Prompt seeding complete!');
}

// Run the seeding
seedPrompts().catch(console.error);