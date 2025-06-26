
import { getGenerativeModel } from "firebase/ai";
import { ai } from '../config/firebase';
import { AiFilterResponse, Kline, Ticker, CustomIndicatorConfig, IndicatorDataPoint } from '../types';
import { KLINE_HISTORY_LIMIT, KLINE_HISTORY_LIMIT_FOR_ANALYSIS } from "../constants";
import * as helpers from '../screenerHelpers'; // Import all helpers
import { observability } from './observabilityService';

// Simple indicator executor for analysis (full version is in worker)
function executeIndicatorFunction(
  code: string,
  klines: Kline[],
  params?: Record<string, any>
): IndicatorDataPoint[] {
  try {
    const func = new Function(
      'klines', 
      'helpers', 
      'params',
      'Math',
      'parseFloat',
      'parseInt',
      'isNaN',
      'isFinite',
      code
    );
    
    const result = func(
      klines, 
      helpers, 
      params || {},
      Math,
      parseFloat,
      parseInt,
      isNaN,
      isFinite
    );
    
    if (!Array.isArray(result)) return [];
    
    return result.filter(point => 
      point && 
      typeof point === 'object' && 
      typeof point.x === 'number' && 
      !isNaN(point.x) && 
      isFinite(point.x)
    ).map(point => ({
      x: point.x,
      y: point.y === null || point.y === undefined ? null : Number(point.y),
      y2: point.y2 === null || point.y2 === undefined ? null : Number(point.y2),
      y3: point.y3 === null || point.y3 === undefined ? null : Number(point.y3),
      y4: point.y4 === null || point.y4 === undefined ? null : Number(point.y4),
      color: point.color
    }));
  } catch (error) {
    console.error('Indicator execution failed:', error);
    return [];
  }
}

// Firebase AI Logic handles API keys securely on the server side
// No need to expose API keys in the frontend code

export interface StreamingUpdate {
  type: 'progress' | 'stream' | 'complete' | 'error';
  message?: string;
  partialJson?: string;
  tokenCount?: number;
  response?: AiFilterResponse;
  error?: Error;
  tokenUsage?: {
    prompt: number;
    response: number;
    total: number;
  };
}

export async function generateFilterAndChartConfig(
  userPrompt: string,
  modelName: string, 
  klineInterval: string,
  klineLimit: number = KLINE_HISTORY_LIMIT
): Promise<AiFilterResponse> {

  const systemInstruction = `You are an AI assistant for a crypto screener. The user provides a description of technical conditions. You MUST return a single, valid JSON object with three properties: "description", "screenerCode", and "indicators". Do not include any text outside of this JSON object.

description: An array of human-readable strings explaining each condition the AI has implemented. Max 3-4 concise conditions.

screenerCode: A string containing the body of a JavaScript function \`(ticker, klines, helpers, hvnNodes)\` that returns a boolean (true if conditions met, false otherwise).
    Function Arguments:
        \`ticker\`: A 24hr summary object for the symbol. Example: \`{ "s": "BNBUSDT", "P": "2.500" (priceChangePercent), "c": "590.5" (lastPrice), "q": "100000000" (quoteVolume), ...otherProps }\`.
        \`klines\`: An array of the last ${klineLimit} candlestick data points for the selected \`${klineInterval}\` interval. Each kline is an array: \`[openTime (number), open (string), high (string), low (string), close (string), volume (string), ...otherElements]\`.
            - \`klines[i][0]\` is openTime (timestamp).
            - \`klines[i][1]\` is open price.
            - \`klines[i][2]\` is high price.
            - \`klines[i][3]\` is low price.
            - \`klines[i][4]\` is close price.
            - \`klines[i][5]\` is volume.
            The most recent kline is \`klines[klines.length - 1]\`. This kline might be open/live if data is streaming.
        \`helpers\`: An object providing pre-defined utility functions. Call them as \`helpers.functionName(...)\`.
        \`hvnNodes\`: An array of high volume nodes (support/resistance levels). To use HVN data, first calculate it using \`const hvnNodes = helpers.calculateHighVolumeNodes(klines, {lookback: 100});\` then use helper functions like \`helpers.isNearHVN()\` or access the nodes directly. Each node has \`{ price: number, volume: number, strength: number (0-100), buyVolume: number, sellVolume: number, priceRange: [number, number] }\`.

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

    Structure and Logic in \`screenerCode\`:
        - CRUCIAL: Always check \`klines.length\` before accessing elements or performing calculations. If insufficient, return \`false\`.
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
  "calculateFunction": "// Calculate candles since UTC midnight for daily reset\nconst lastKlineTime = klines[klines.length-1][0];\nconst lastDate = new Date(lastKlineTime);\n// Get UTC midnight of the current day\nconst utcMidnight = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate(), 0, 0, 0, 0);\nlet candlesSinceMidnight = 0;\n// Count candles since UTC midnight\nfor (let i = klines.length - 1; i >= 0; i--) {\n  if (klines[i][0] < utcMidnight) break;\n  candlesSinceMidnight++;\n}\n// Use all klines if no candles found since midnight (for safety)\nconst anchorPeriod = candlesSinceMidnight > 0 ? candlesSinceMidnight : undefined;\nconst vwapSeries = helpers.calculateVWAPSeries(klines, anchorPeriod);\nreturn klines.map((k, i) => ({x: k[0], y: vwapSeries[i]}));",
  "chartType": "line",
  "style": { "color": "#9333ea", "lineWidth": 2 }
}

// VWAP with standard deviation bands (only when user mentions "VWAP bands", "VWAP with bands", "VWAP standard deviation", etc.):
{
  "id": "vwap_daily_bands",
  "name": "VWAP with Bands",
  "panel": false,
  "calculateFunction": "// Calculate candles since UTC midnight for daily reset\nconst lastKlineTime = klines[klines.length-1][0];\nconst lastDate = new Date(lastKlineTime);\n// Get UTC midnight of the current day\nconst utcMidnight = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate(), 0, 0, 0, 0);\nlet candlesSinceMidnight = 0;\n// Count candles since UTC midnight\nfor (let i = klines.length - 1; i >= 0; i--) {\n  if (klines[i][0] < utcMidnight) break;\n  candlesSinceMidnight++;\n}\n// Use all klines if no candles found since midnight (for safety)\nconst anchorPeriod = candlesSinceMidnight > 0 ? candlesSinceMidnight : undefined;\nconst bands = helpers.calculateVWAPBands(klines, anchorPeriod, 2);\nreturn klines.map((k, i) => ({x: k[0], y: bands.vwap[i], y2: bands.upperBand[i], y3: bands.lowerBand[i]}));",
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
  "screenerCode": "const ma20 = helpers.calculateMA(klines, 20); const rsi = helpers.getLatestRSI(klines, 14); if (!ma20 || !rsi) return false; const lastClose = parseFloat(klines[klines.length - 1][4]); const bbWidth = /* calculate BB width */; return lastClose > ma20 && rsi < 30 && bbWidth < threshold;",

Example HVN-based Response:
{
  "description": [
    "RSI showing bullish divergence",
    "Price is near a strong support level (HVN)",
    "Volume above 20-period average"
  ],
  "screenerCode": "const divergence = helpers.detectRSIDivergence(klines); const lastClose = parseFloat(klines[klines.length - 1][4]); const hvnNodes = helpers.calculateHighVolumeNodes(klines, {lookback: 100}); const isNearSupport = helpers.isNearHVN(lastClose, hvnNodes, 0.5); const avgVol = helpers.calculateAvgVolume(klines, 20); const currentVol = parseFloat(klines[klines.length - 1][5]); return divergence === 'bullish_regular' && isNearSupport && currentVol > avgVol * 1.5;",
  "indicators": [
    /* Moving Average indicator object */,
    /* RSI indicator object */,
    /* Bollinger Bands indicator object */
  ]
}

General Guidelines:
- The \`screenerCode\` string must contain ONLY the JavaScript function body. DO NOT include helper function definitions.
- The entire response from you MUST be a single valid JSON object as shown in the example, without any surrounding text, comments, or markdown formatting outside the JSON structure itself.
- For VWAP: Use the basic "vwap_daily" indicator by default. Only use "vwap_daily_bands" when the user explicitly asks for VWAP bands, standard deviation bands, or VWAP with bands.
`;
  
  let retryAttempted = false;

  async function makeApiCall(promptText: string, isRetry: boolean): Promise<AiFilterResponse> {
    const currentSystemInstruction = isRetry ? "" : systemInstruction + "\n\nUser Request: ";
    const startTime = Date.now();
    
    let rawTextFromGemini: string = "";
    try {
      // Create a model instance with the specified model name
      const model = getGenerativeModel(ai, {
        model: modelName,
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      // Generate content using Firebase AI Logic
      // Firebase AI Logic expects a simple string or parts array, not the full content structure
      const result = await model.generateContent(currentSystemInstruction + promptText);
      const response = result.response;
      rawTextFromGemini = response.text();
      const parsedResponse = JSON.parse(rawTextFromGemini) as AiFilterResponse;

      // ---- Start: Validation of parsedResponse structure ----
      if (!parsedResponse.screenerCode || typeof parsedResponse.screenerCode !== 'string') {
        throw new Error("AI response is missing 'screenerCode' or it's not a string.");
      }
      if (!parsedResponse.screenerCode.trim().includes('return')) {
          console.warn("AI screenerCode might be missing an explicit return statement.");
      }
      if (!parsedResponse.description || !Array.isArray(parsedResponse.description)) {
          throw new Error("AI response is missing 'description' or it's not an array.");
      }
      if (!parsedResponse.indicators || !Array.isArray(parsedResponse.indicators)) {
          throw new Error("AI response is missing 'indicators' or it's not an array.");
      }
      parsedResponse.indicators.forEach((indicator, index) => {
          // Validate required fields
          if (!indicator.id || typeof indicator.id !== 'string') {
              throw new Error(`Invalid indicator at index ${index}: missing or invalid 'id'.`);
          }
          if (!indicator.name || typeof indicator.name !== 'string') {
              throw new Error(`Invalid indicator at index ${index}: missing or invalid 'name'.`);
          }
          if (typeof indicator.panel !== 'boolean') {
              throw new Error(`Invalid indicator at index ${index}: 'panel' must be a boolean.`);
          }
          if (!indicator.calculateFunction || typeof indicator.calculateFunction !== 'string') {
              throw new Error(`Invalid indicator at index ${index}: missing or invalid 'calculateFunction'.`);
          }
          if (!['line', 'bar', 'candlestick'].includes(indicator.chartType)) {
              throw new Error(`Invalid indicator at index ${index}: 'chartType' must be 'line', 'bar', or 'candlestick'.`);
          }
          if (!indicator.style || typeof indicator.style !== 'object') {
              throw new Error(`Invalid indicator at index ${index}: missing or invalid 'style'.`);
          }
          
          // Validate optional fields
          if (indicator.yAxisConfig && typeof indicator.yAxisConfig !== 'object') {
              throw new Error(`Invalid indicator at index ${index}: 'yAxisConfig' must be an object if provided.`);
          }
          
          // Basic validation of calculateFunction - check it's not empty
          if (indicator.calculateFunction.trim().length < 10) {
              throw new Error(`Invalid indicator at index ${index}: 'calculateFunction' appears to be empty or too short.`);
          }
          
          // Ensure calculateFunction returns something
          if (!indicator.calculateFunction.includes('return')) {
              console.warn(`Indicator at index ${index} may be missing a return statement.`);
          }
      });
      if (parsedResponse.description.some(d => typeof d !== 'string')) {
          throw new Error("AI response 'description' array must only contain strings.");
      }
      // ---- End: Validation of parsedResponse structure ----

      // Track successful generation (only for non-retry calls to avoid duplicates)
      if (!isRetry) {
        await observability.trackGeneration(
          userPrompt,
          modelName,
          klineInterval,
          klineLimit,
          parsedResponse,
          response.usageMetadata,
          Date.now() - startTime
        );
      }

      return parsedResponse;

    } catch (error) {
      if (error instanceof SyntaxError && !retryAttempted && !isRetry) {
        retryAttempted = true;
        console.warn("Initial Gemini response parsing failed. Attempting auto-fix...");
        const fixItPrompt = `The following JSON response you previously provided is malformed. Please fix it and return ONLY the corrected, valid JSON object. Do not include any other text or explanations.\n\nMalformed JSON:\n\`\`\`json\n${rawTextFromGemini}\n\`\`\`\n\nCorrected JSON:`;
        return makeApiCall(fixItPrompt, true);
      }

      console.error(`Error calling Gemini API for filter generation ${isRetry ? "(after auto-fix attempt)" : ""}:`, error);
      let errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.toLowerCase().includes("api key not valid")) {
          errorMessage = "The Gemini API key is not valid. Please check your configuration.";
      } else if (errorMessage.includes("Candidate was blocked due to RECITATION")) {
           errorMessage = "AI filter generation failed due to content policy (recitation). Please try a different or more specific prompt.";
      } else if (errorMessage.includes("Candidate was blocked due to SAFETY")) {
           errorMessage = "AI filter generation failed due to safety settings. Please try a different prompt.";
      } else if (error instanceof SyntaxError) {
          errorMessage = `AI returned an invalid JSON response ${retryAttempted ? "(even after an auto-fix attempt)" : ""}. It might be incomplete or malformed. Raw text: ${rawTextFromGemini.substring(0,1000) || "unavailable"}`;
      }
      
      // Track error (only for non-retry calls to avoid duplicates)
      if (!isRetry) {
        await observability.trackGeneration(
          userPrompt,
          modelName,
          klineInterval,
          klineLimit,
          null,
          null,
          Date.now() - startTime,
          errorMessage
        );
      }
      
      throw new Error(`Gemini API request failed: ${errorMessage}`);
    }
  }
  return makeApiCall(userPrompt, false);
}

export async function generateFilterAndChartConfigStream(
  userPrompt: string,
  modelName: string, 
  klineInterval: string,
  klineLimit: number = KLINE_HISTORY_LIMIT,
  onUpdate?: (update: StreamingUpdate) => void
): Promise<AiFilterResponse> {
  
  // Use the same system instruction with progress comments
  const systemInstruction = `You are an AI assistant for a crypto screener. The user provides a description of technical conditions. You MUST return a single, valid JSON object with three properties: "description", "screenerCode", and "indicators". Do not include any text outside of this JSON object.

description: An array of human-readable strings explaining each condition the AI has implemented. Max 3-4 concise conditions.

screenerCode: A string containing the body of a JavaScript function \`(ticker, klines, helpers, hvnNodes)\` that returns a boolean (true if conditions met, false otherwise).
    Function Arguments:
        \`ticker\`: A 24hr summary object for the symbol. Example: \`{ "s": "BNBUSDT", "P": "2.500" (priceChangePercent), "c": "590.5" (lastPrice), "q": "100000000" (quoteVolume), ...otherProps }\`.
        \`klines\`: An array of the last ${klineLimit} candlestick data points for the selected \`${klineInterval}\` interval. Each kline is an array: \`[openTime (number), open (string), high (string), low (string), close (string), volume (string), ...otherElements]\`.
            - \`klines[i][0]\` is openTime (timestamp).
            - \`klines[i][1]\` is open price.
            - \`klines[i][2]\` is high price.
            - \`klines[i][3]\` is low price.
            - \`klines[i][4]\` is close price.
            - \`klines[i][5]\` is volume.
            The most recent kline is \`klines[klines.length - 1]\`. This kline might be open/live if data is streaming.
        \`helpers\`: An object providing pre-defined utility functions. Call them as \`helpers.functionName(...)\`.
        \`hvnNodes\`: An array of high volume nodes (support/resistance levels). To use HVN data, first calculate it using \`const hvnNodes = helpers.calculateHighVolumeNodes(klines, {lookback: 100});\` then use helper functions like \`helpers.isNearHVN()\` or access the nodes directly. Each node has \`{ price: number, volume: number, strength: number (0-100), buyVolume: number, sellVolume: number, priceRange: [number, number] }\`.

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

    Structure and Logic in \`screenerCode\`:
        - CRUCIAL: Always check \`klines.length\` before accessing elements or performing calculations. If insufficient, return \`false\`.
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
    - VWAP: For daily reset, calculate candles since day start. See VWAP example.
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

// VWAP with bands (overlay on price)
// IMPORTANT: Daily VWAP resets at 00:00 UTC (Binance server time)
// For other reset times, user should specify in their prompt
{
  "id": "vwap_daily",
  "name": "VWAP (Daily)",
  "panel": false,
  "calculateFunction": "// Calculate candles since UTC midnight for daily reset\\nconst lastKlineTime = klines[klines.length-1][0];\\nconst lastDate = new Date(lastKlineTime);\\n// Get UTC midnight of the current day\\nconst utcMidnight = Date.UTC(lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate(), 0, 0, 0, 0);\\nlet candlesSinceMidnight = 0;\\n// Count candles since UTC midnight\\nfor (let i = klines.length - 1; i >= 0; i--) {\\n  if (klines[i][0] < utcMidnight) break;\\n  candlesSinceMidnight++;\\n}\\n// Use all klines if no candles found since midnight (for safety)\\nconst anchorPeriod = candlesSinceMidnight > 0 ? candlesSinceMidnight : undefined;\\nconst bands = helpers.calculateVWAPBands(klines, anchorPeriod, 1);\\nreturn klines.map((k, i) => ({x: k[0], y: bands.vwap[i], y2: bands.upperBand[i], y3: bands.lowerBand[i]}));",
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
  "screenerCode": "const ma20 = helpers.calculateMA(klines, 20); const rsi = helpers.getLatestRSI(klines, 14); if (!ma20 || !rsi) return false; const lastClose = parseFloat(klines[klines.length - 1][4]); const bbWidth = /* calculate BB width */; return lastClose > ma20 && rsi < 30 && bbWidth < threshold;",

Example HVN-based Response:
{
  "description": [
    "RSI showing bullish divergence",
    "Price is near a strong support level (HVN)",
    "Volume above 20-period average"
  ],
  "screenerCode": "const divergence = helpers.detectRSIDivergence(klines); const lastClose = parseFloat(klines[klines.length - 1][4]); const hvnNodes = helpers.calculateHighVolumeNodes(klines, {lookback: 100}); const isNearSupport = helpers.isNearHVN(lastClose, hvnNodes, 0.5); const avgVol = helpers.calculateAvgVolume(klines, 20); const currentVol = parseFloat(klines[klines.length - 1][5]); return divergence === 'bullish_regular' && isNearSupport && currentVol > avgVol * 1.5;",
  "indicators": [
    /* Moving Average indicator object */,
    /* RSI indicator object */,
    /* Bollinger Bands indicator object */
  ]
}

General Guidelines:
- The \`screenerCode\` string must contain ONLY the JavaScript function body. DO NOT include helper function definitions.
- The entire response from you MUST be a single valid JSON object as shown in the example, without any surrounding text, comments, or markdown formatting outside the JSON structure itself.
- CRITICAL: Start your response with { and end with }. No text before or after the JSON.`;

  const startTime = Date.now();
  const getTimestamp = () => new Date().toISOString().slice(11, 23); // HH:MM:SS.sss
  console.log(`[${getTimestamp()}] [Streaming] Starting generation...`);
  
  // Generate trace ID for this streaming session
  const traceId = observability.generateTraceId();
  const progressUpdates: string[] = [];
  
  // Track stream start
  await observability.trackStreamStart(traceId, userPrompt, modelName, klineInterval);
  
  try {
    // Create a model instance with the specified model name
    const model = getGenerativeModel(ai, {
      model: modelName,
      // Note: Removed responseMimeType to enable true streaming
      // We'll validate JSON after streaming completes
    });

    // Generate streaming content
    const result = await model.generateContentStream(systemInstruction + "\n\nUser Request: " + userPrompt);
    
    let buffer = '';
    let tokenCount = 0;
    let lastProgressMessage = '';
    let chunkCount = 0;
    let lastSearchPosition = 0; // Track where we last searched to avoid re-scanning
    
    // Process the stream
    let updateCounter = 0;
    const UPDATE_INTERVAL = 3; // Update UI every 3 chunks for better progress visibility
    
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      buffer += chunkText;
      tokenCount += Math.ceil(chunkText.length / 4); // Rough token estimate
      updateCounter++;
      chunkCount++;
      
      // Log each chunk for debugging
      if (chunkCount <= 5 || chunkCount % 10 === 0) {
        console.log(`[${getTimestamp()}] [Streaming] Chunk ${chunkCount}: ${chunkText.length} chars`);
      }
      
      // Only process and update UI periodically to avoid performance issues
      if (updateCounter % UPDATE_INTERVAL === 0) {
        console.log(`[${getTimestamp()}] [Streaming] Processed ${chunkCount} chunks, ${buffer.length} chars, ~${tokenCount} tokens`);
        // Extract progress comments from screenerCode if present
        if (buffer.includes('"screenerCode"') && lastSearchPosition < buffer.length) {
          try {
            // Find all comment patterns in the new portion of the buffer
            const searchText = buffer.substring(lastSearchPosition);
            let commentIndex = searchText.indexOf('//');
            
            while (commentIndex !== -1) {
              // Extract the comment line - look for both \n and ; as line endings
              let lineEnd = searchText.indexOf('\\n', commentIndex);
              if (lineEnd === -1) lineEnd = searchText.indexOf('\n', commentIndex);
              if (lineEnd === -1) lineEnd = searchText.indexOf(';', commentIndex);
              const comment = searchText.substring(commentIndex + 2, lineEnd !== -1 ? lineEnd : searchText.length).trim();
              
              // Debug: log all comments found
              if (comment.length > 0) {
                console.log(`[${getTimestamp()}] [Streaming] Found comment: "${comment}"`);
              }
              
              // Check if it matches our progress pattern (starts with capital, ends with ...)
              if (comment.match(/^[A-Z].*\.\.\.$/)) {
                const progressText = comment.replace('...', '');
                if (progressText !== lastProgressMessage && progressText.length > 5 && progressText.length < 100) {
                  lastProgressMessage = progressText;
                  console.log(`[${getTimestamp()}] [Streaming] Progress matched: ${progressText}`);
                  progressUpdates.push(progressText);
                  onUpdate?.({
                    type: 'progress',
                    message: progressText,
                    tokenCount
                  });
                }
              }
              
              // Find next comment
              const nextSearchStart = commentIndex + 2;
              commentIndex = searchText.indexOf('//', nextSearchStart);
            }
            
            // Update search position to avoid re-scanning
            lastSearchPosition = buffer.length - 100; // Keep some overlap for comments split across chunks
          } catch (error) {
            console.warn(`[${getTimestamp()}] Error extracting progress:`, error);
          }
        }
        
        // Send streaming update (without the buffer to avoid memory issues)
        onUpdate?.({
          type: 'stream',
          tokenCount
        });
      }
    }
    
    // Send final update with accurate token count
    onUpdate?.({
      type: 'stream',
      tokenCount
    });
    
    console.log(`[${getTimestamp()}] [Streaming] Stream complete. Total: ${chunkCount} chunks, ${buffer.length} chars, ~${tokenCount} tokens`);
    console.log(`[${getTimestamp()}] [Streaming] Time elapsed: ${Date.now() - startTime}ms`);
    
    // Get the complete response and token usage
    const response = await result.response;
    const usage = response.usageMetadata;
    
    console.log(`[${getTimestamp()}] [Streaming] Parsing JSON response...`);
    
    // Parse the final JSON
    try {
      // Try to extract JSON if there's any extra text
      let jsonStr = buffer.trim();
      
      // If response doesn't start with {, try to find the JSON
      if (!jsonStr.startsWith('{')) {
        const jsonStart = jsonStr.indexOf('{');
        if (jsonStart !== -1) {
          jsonStr = jsonStr.substring(jsonStart);
          console.log(`[${getTimestamp()}] [Streaming] Trimmed ${jsonStart} chars before JSON`);
        }
      }
      
      // If response doesn't end with }, try to find the end
      if (!jsonStr.endsWith('}')) {
        const jsonEnd = jsonStr.lastIndexOf('}');
        if (jsonEnd !== -1) {
          jsonStr = jsonStr.substring(0, jsonEnd + 1);
          console.log(`[${getTimestamp()}] [Streaming] Trimmed chars after JSON`);
        }
      }
      
      const parsedResponse = JSON.parse(jsonStr) as AiFilterResponse;
      
      // Validate response structure (same validation as before)
      if (!parsedResponse.screenerCode || typeof parsedResponse.screenerCode !== 'string') {
        throw new Error("AI response is missing 'screenerCode' or it's not a string.");
      }
      if (!parsedResponse.screenerCode.trim().includes('return')) {
        console.warn("AI screenerCode might be missing an explicit return statement.");
      }
      if (!parsedResponse.description || !Array.isArray(parsedResponse.description)) {
        throw new Error("AI response is missing 'description' or it's not an array.");
      }
      if (!parsedResponse.indicators || !Array.isArray(parsedResponse.indicators)) {
        throw new Error("AI response is missing 'indicators' or it's not an array.");
      }
      
      // Send complete update with token usage
      onUpdate?.({
        type: 'complete',
        response: parsedResponse,
        tokenUsage: {
          prompt: usage?.promptTokenCount || 0,
          response: usage?.candidatesTokenCount || 0,
          total: usage?.totalTokenCount || 0
        }
      });
      
      // Track successful stream completion
      await observability.trackStreamComplete(
        traceId,
        modelName,
        klineInterval,
        parsedResponse,
        usage,
        Date.now() - startTime,
        progressUpdates
      );
      
      return parsedResponse;
      
    } catch (parseError) {
      console.error(`[${getTimestamp()}] Error parsing streamed response:`, parseError);
      onUpdate?.({
        type: 'error',
        error: new Error("Failed to parse AI response")
      });
      throw parseError;
    }
    
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[${getTimestamp()}] [Streaming] Error after ${elapsed}ms:`, error);
    
    // Check for specific error types
    if (error instanceof Error) {
      if (error.message.includes('responseMimeType')) {
        console.error(`[${getTimestamp()}] [Streaming] Issue with JSON response type`);
      }
    }
    
    onUpdate?.({
      type: 'error',
      error: error instanceof Error ? error : new Error(String(error))
    });
    
    // Track stream error
    await observability.trackStreamComplete(
      traceId,
      modelName,
      klineInterval,
      null,
      null,
      Date.now() - startTime,
      progressUpdates,
      error instanceof Error ? error.message : String(error)
    );
    
    throw error;
  }
}


export async function getMarketAnalysis(
    topTickers: Ticker[],
    modelName: string,
    klineInterval: string
): Promise<string> {

    const prompt = `
Provide a brief market analysis (2-3 short paragraphs) based on the current top ${topTickers.length} USDT pairs by volume on Binance Spot for the ${klineInterval} interval.
Focus on general trends, potential strong performers, or notable patterns observed in the provided ticker data. Do not give financial advice. Keep the language professional and concise.
Top Tickers (Symbol, 24h Change %, Last Price):
${topTickers.slice(0,10).map(t => `${t.s}: ${t.P}%, ${parseFloat(t.c).toFixed(4)}`).join('\n')}
Consider overall market sentiment if inferable from this limited data.
`;
    const startTime = Date.now();
    
    try {
        // Create a model instance
        const model = getGenerativeModel(ai, { model: modelName });
        
        // Generate content using Firebase AI Logic
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        // Track successful market analysis
        await observability.trackAnalysis(
            'market',
            modelName,
            prompt,
            text,
            response.usageMetadata,
            Date.now() - startTime
        );
        
        return text;
    } catch (error) {
        console.error("Error calling Gemini API for market analysis:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Track error
        await observability.trackAnalysis(
            'market',
            modelName,
            prompt,
            null,
            null,
            Date.now() - startTime,
            undefined,
            errorMessage
        );
        
        throw new Error(`Market analysis API request failed: ${errorMessage}`);
    }
}


export async function generateStructuredAnalysis(
    symbol: string,
    marketData: { price: number; volume: number; klines: Kline[] },
    strategy: string,
    modelName: string = 'gemini-1.5-flash-latest'
): Promise<string> {
    const technicalIndicators = {
        currentPrice: marketData.price,
        sma20: helpers.calculateMA(marketData.klines, 20),
        rsi: helpers.getLatestRSI(marketData.klines, 14),
        macd: helpers.getLatestMACD(marketData.klines),
        volume: marketData.volume,
    };
    
    const prompt = `
You are an expert trading analyst. Analyze this ${symbol} setup and provide a structured JSON response.

Strategy: ${strategy}

Current Market Data:
- Price: $${marketData.price}
- 24h Volume: ${marketData.volume}

Technical Indicators:
${JSON.stringify(technicalIndicators, null, 2)}

Return ONLY a valid JSON object with this exact structure:
{
  "decision": "bad_setup" | "good_setup" | "enter_trade",
  "direction": "long" | "short" (only if decision is "enter_trade"),
  "confidence": 0.0-1.0,
  "reasoning": "Detailed explanation based on the strategy",
  "keyLevels": {
    "entry": number,
    "stopLoss": number,
    "takeProfit": [number, number, number],
    "support": [number],
    "resistance": [number]
  },
  "chartAnalysis": "Technical analysis of the current setup"
}

Focus on:
1. How well the current setup matches the strategy criteria
2. Risk/reward ratio
3. Market structure and trend
4. Key support/resistance levels
5. Entry timing

Be decisive and specific. Only suggest "enter_trade" if the setup strongly matches the strategy with good risk/reward.
`;

    const startTime = Date.now();
    
    try {
        const model = getGenerativeModel(ai, { 
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
            }
        });
        
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        // Track successful analysis
        await observability.trackAnalysis(
            'structured',
            modelName,
            prompt,
            text,
            response.usageMetadata,
            Date.now() - startTime,
            symbol
        );
        
        return text;
    } catch (error) {
        console.error(`Error generating structured analysis for ${symbol}:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Track error
        await observability.trackAnalysis(
            'structured',
            modelName,
            prompt,
            null,
            null,
            Date.now() - startTime,
            symbol,
            errorMessage
        );
        
        throw new Error(`Structured analysis failed for ${symbol}: ${errorMessage}`);
    }
}

export async function getSymbolAnalysis(
    symbol: string,
    ticker: Ticker,
    allKlinesForSymbol: Kline[], 
    indicators: CustomIndicatorConfig[] | null,
    modelName: string,
    klineInterval: string,
    analysisKlineLimit: number = KLINE_HISTORY_LIMIT_FOR_ANALYSIS,
    strategy?: string
): Promise<string> {

    const analysisKlines = allKlinesForSymbol.slice(-analysisKlineLimit);
    const klinesForDisplayCount = Math.min(analysisKlines.length, 15); 

    let prompt = `Provide a brief technical analysis (2-3 short paragraphs) for ${symbol} on the ${klineInterval} interval.
Current Price: ${parseFloat(ticker.c).toFixed(4)} USDT
24h Change: ${ticker.P}%
Analysis is based on the last ${analysisKlines.length} klines.
Recent Kline Data (Open, High, Low, Close, Volume) - last ${klinesForDisplayCount} of ${analysisKlines.length}, most recent first:
${analysisKlines.slice(-klinesForDisplayCount).reverse().map(k => `O:${parseFloat(k[1]).toFixed(4)}, H:${parseFloat(k[2]).toFixed(4)}, L:${parseFloat(k[3]).toFixed(4)}, C:${parseFloat(k[4]).toFixed(4)}, V:${parseFloat(k[5]).toFixed(2)}`).join('\n')}
`;

    if (indicators && indicators.length > 0 && analysisKlines.length > 0) {
        prompt += "\nIndicator Data (based on last " + analysisKlines.length + " klines, latest 5 values shown - most recent first, 'null' if not calculable):\n";
        
        // Execute indicators inline for analysis
        
        for (const indicator of indicators) {
            try {
                // Execute the custom indicator function
                const dataPoints = executeIndicatorFunction(
                    indicator.calculateFunction,
                    analysisKlines
                );
                
                if (dataPoints.length > 0) {
                    // Get latest 5 non-null values for the primary series (y)
                    const latestValues = dataPoints
                        .filter(p => p.y !== null)
                        .slice(-5)
                        .reverse()
                        .map(p => p.y!.toFixed(4));
                    
                    const indicatorValuesText = latestValues.length > 0 
                        ? latestValues.join(', ') 
                        : 'not enough data';
                    
                    prompt += `- ${indicator.name}: [${indicatorValuesText}]\n`;
                    
                    // If indicator has multiple lines (y2, y3), show those too
                    if (dataPoints[0]?.y2 !== undefined) {
                        const y2Values = dataPoints
                            .filter(p => p.y2 !== null && p.y2 !== undefined)
                            .slice(-5)
                            .reverse()
                            .map(p => p.y2!.toFixed(4));
                        if (y2Values.length > 0) {
                            prompt += `  - Line 2: [${y2Values.join(', ')}]\n`;
                        }
                    }
                } else {
                    prompt += `- ${indicator.name}: [calculation error]\n`;
                }
            } catch (error) {
                console.error(`Error calculating indicator ${indicator.name}:`, error);
                prompt += `- ${indicator.name}: [error in calculation]\n`;
            }
        }
    }
    
    if (strategy && strategy.trim()) {
        prompt += `\n\nUser's Trading Strategy:\n${strategy}\n\nBased on this strategy and the technical analysis above, provide:\n1. Trade Decision: BUY, SELL, HOLD, or WAIT (one word)\n2. Reasoning: Why this decision? (max 2 sentences)\n3. Trade Plan: Specific action to take (max 2 sentences)\n\nFormat your response as:\nDECISION: [BUY/SELL/HOLD/WAIT]\nREASONING: [Your reasoning]\nTRADE PLAN: [Your plan]\n\nFollowed by your regular technical analysis.`;
    } else {
        prompt += "\nFocus on price action, potential support/resistance levels, and volume analysis based on the provided data. Do not give financial advice. Keep the analysis concise and data-driven.";
    }

    const startTime = Date.now();
    
    try {
        // Create a model instance
        const model = getGenerativeModel(ai, { model: modelName });
        
        // Generate content using Firebase AI Logic
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        
        // Track successful symbol analysis
        await observability.trackAnalysis(
            'symbol',
            modelName,
            prompt,
            text,
            response.usageMetadata,
            Date.now() - startTime,
            symbol
        );
        
        return text;
    } catch (error) {
        console.error(`Error calling Gemini API for ${symbol} analysis:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // Track error
        await observability.trackAnalysis(
            'symbol',
            modelName,
            prompt,
            null,
            null,
            Date.now() - startTime,
            symbol,
            errorMessage
        );
        
        throw new Error(`Symbol analysis API request for ${symbol} failed: ${errorMessage}`);
    }
}