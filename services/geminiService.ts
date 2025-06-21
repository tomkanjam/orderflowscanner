
import { GoogleGenAI, GenerateContentResponse, Content } from "@google/genai";
import { AiFilterResponse, Kline, Ticker, CustomIndicatorConfig } from '../types';
import { KLINE_HISTORY_LIMIT, KLINE_HISTORY_LIMIT_FOR_ANALYSIS } from "../constants";
import * as helpers from '../screenerHelpers'; // Import all helpers

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("Gemini API key not found. Please set the API_KEY environment variable.");
}
const ai = new GoogleGenAI({ apiKey: API_KEY || "YOUR_API_KEY_HERE" }); // Fallback for environments where process.env is not set up

export async function generateFilterAndChartConfig(
  userPrompt: string,
  modelName: string, 
  klineInterval: string
): Promise<AiFilterResponse> {
  if (!API_KEY) throw new Error("Gemini API key is not configured.");

  const systemInstruction = `You are an AI assistant for a crypto screener. The user provides a description of technical conditions. You MUST return a single, valid JSON object with three properties: "description", "screenerCode", and "indicators". Do not include any text outside of this JSON object.

description: An array of human-readable strings explaining each condition the AI has implemented. Max 3-4 concise conditions.

screenerCode: A string containing the body of a JavaScript function \`(ticker, klines, helpers)\` that returns a boolean (true if conditions met, false otherwise).
    Function Arguments:
        \`ticker\`: A 24hr summary object for the symbol. Example: \`{ "s": "BNBUSDT", "P": "2.500" (priceChangePercent), "c": "590.5" (lastPrice), "q": "100000000" (quoteVolume), ...otherProps }\`.
        \`klines\`: An array of the last ${KLINE_HISTORY_LIMIT} candlestick data points for the selected \`${klineInterval}\` interval. Each kline is an array: \`[openTime (number), open (string), high (string), low (string), close (string), volume (string), ...otherElements]\`.
            - \`klines[i][0]\` is openTime (timestamp).
            - \`klines[i][1]\` is open price.
            - \`klines[i][2]\` is high price.
            - \`klines[i][3]\` is low price.
            - \`klines[i][4]\` is close price.
            - \`klines[i][5]\` is volume.
            The most recent kline is \`klines[klines.length - 1]\`. This kline might be open/live if data is streaming.
        \`helpers\`: An object providing pre-defined utility functions. Call them as \`helpers.functionName(...)\`.

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

    Structure and Logic in \`screenerCode\`:
        - CRUCIAL: Always check \`klines.length\` before accessing elements or performing calculations. If insufficient, return \`false\`.
        - CRUCIAL: Helper functions return \`null\` or arrays with \`null\`s for insufficient data. Check for these \`null\`s.
        - CRUCIAL: The final statement in \`screenerCode\` MUST be a boolean return. E.g., \`return condition1 && condition2;\`.
        - Parse kline values (open, high, low, close, volume) using \`parseFloat()\`.
        - Avoid \`NaN\`/\`Infinity\` without safeguards. If a condition is ambiguous, interpret reasonably or omit and note in \`description\`.

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
        "fillColor": "#hexWithAlpha"     // Optional area fill (e.g., "#3b82f633")
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
    - Custom combinations or proprietary calculations

    Color Guidelines:
    - Blue shades (#3b82f6, #60a5fa): Primary indicators, bullish signals
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
  "style": { "color": "#3b82f6", "lineWidth": 1.5 }
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
  "style": { "color": ["#3b82f6", "#f59e0b", "transparent"] }
}

Example Complete Response:
{
  "description": [
    "Price is above the 20-period moving average",
    "RSI is oversold (below 30)",
    "Bollinger Bands are tightening (volatility squeeze)"
  ],
  "screenerCode": "const ma20 = helpers.calculateMA(klines, 20); const rsi = helpers.getLatestRSI(klines, 14); if (!ma20 || !rsi) return false; const lastClose = parseFloat(klines[klines.length - 1][4]); const bbWidth = /* calculate BB width */; return lastClose > ma20 && rsi < 30 && bbWidth < threshold;",
  "indicators": [
    /* Moving Average indicator object */,
    /* RSI indicator object */,
    /* Bollinger Bands indicator object */
  ]
}

General Guidelines:
- The \`screenerCode\` string must contain ONLY the JavaScript function body. DO NOT include helper function definitions.
- The entire response from you MUST be a single valid JSON object as shown in the example, without any surrounding text, comments, or markdown formatting outside the JSON structure itself.
`;
  
  let retryAttempted = false;

  async function makeApiCall(promptText: string, isRetry: boolean): Promise<AiFilterResponse> {
    const currentSystemInstruction = isRetry ? "" : systemInstruction + "\n\nUser Request: ";
    const contents: Content[] = [
      { role: "user", parts: [{ text: currentSystemInstruction + promptText }] }
    ];

    let rawTextFromGemini: string = "";
    try {
      const geminiApiResult: GenerateContentResponse = await ai.models.generateContent({
        model: modelName,
        contents: contents,
        config: {
          responseMimeType: "application/json",
        }
      });

      rawTextFromGemini = geminiApiResult.text;
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
      } else if (!API_KEY) {
          errorMessage = "Gemini API key is not configured. Cannot make requests.";
      }
      
      throw new Error(`Gemini API request failed: ${errorMessage}`);
    }
  }
  return makeApiCall(userPrompt, false);
}


export async function getMarketAnalysis(
    topTickers: Ticker[],
    modelName: string,
    klineInterval: string
): Promise<string> {
    if (!API_KEY) throw new Error("Gemini API key is not configured.");

    const prompt = `
Provide a brief market analysis (2-3 short paragraphs) based on the current top ${topTickers.length} USDT pairs by volume on Binance Spot for the ${klineInterval} interval.
Focus on general trends, potential strong performers, or notable patterns observed in the provided ticker data. Do not give financial advice. Keep the language professional and concise.
Top Tickers (Symbol, 24h Change %, Last Price):
${topTickers.slice(0,10).map(t => `${t.s}: ${t.P}%, ${parseFloat(t.c).toFixed(4)}`).join('\n')}
Consider overall market sentiment if inferable from this limited data.
`;
    try {
        const geminiApiResult: GenerateContentResponse = await ai.models.generateContent({ 
            model: modelName,
            contents: [{ role: "user", parts: [{text: prompt}] }],
        });
        return geminiApiResult.text;
    } catch (error) {
        console.error("Error calling Gemini API for market analysis:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Market analysis API request failed: ${errorMessage}`);
    }
}


export async function getSymbolAnalysis(
    symbol: string,
    ticker: Ticker,
    allKlinesForSymbol: Kline[], 
    indicators: CustomIndicatorConfig[] | null,
    modelName: string,
    klineInterval: string
): Promise<string> {
    if (!API_KEY) throw new Error("Gemini API key is not configured.");

    const analysisKlines = allKlinesForSymbol.slice(-KLINE_HISTORY_LIMIT_FOR_ANALYSIS);
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
        
        // Import the executor function for analysis
        const { executeIndicatorFunction } = await import('../indicatorExecutor');
        
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
    prompt += "\nFocus on price action, potential support/resistance levels, and volume analysis based on the provided data. Do not give financial advice. Keep the analysis concise and data-driven.";

    try {
        const geminiApiResult: GenerateContentResponse = await ai.models.generateContent({ 
            model: modelName,
            contents: [{ role: "user", parts: [{text: prompt}] }],
        });
        return geminiApiResult.text;
    } catch (error) {
        console.error(`Error calling Gemini API for ${symbol} analysis:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Symbol analysis API request for ${symbol} failed: ${errorMessage}`);
    }
}