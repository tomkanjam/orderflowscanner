
import { getGenerativeModel } from "firebase/ai";
import { ai } from '../config/firebase';
import { AiFilterResponse, Kline, Ticker, CustomIndicatorConfig, IndicatorDataPoint } from '../types';
import { KLINE_HISTORY_LIMIT, KLINE_HISTORY_LIMIT_FOR_ANALYSIS } from "../constants";
import * as helpers from '../screenerHelpers'; // Import all helpers
import { observability } from './observabilityService';
import { TraderGeneration } from '../src/abstractions/trader.interfaces';
import { enhancePromptWithPersona } from '../src/constants/traderPersona';
import { promptManager } from '../src/services/promptManager';

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

  // Get the system instruction from the prompt manager
  const systemInstruction = await promptManager.getActivePromptContent('filter-and-chart-config', {
    klineLimit,
    klineInterval
  });

  if (!systemInstruction) {
    throw new Error('Failed to load filter-and-chart-config prompt');
  }

  
  let retryAttempted = false;

  async function makeApiCall(promptText: string, isRetry: boolean): Promise<AiFilterResponse> {
    const baseInstruction = isRetry ? "" : systemInstruction + "\n\nUser Request: ";
    const currentSystemInstruction = isRetry ? baseInstruction : enhancePromptWithPersona(baseInstruction);
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
  
  // Get the system instruction from the prompt manager
  const baseSystemInstruction = await promptManager.getActivePromptContent('filter-and-chart-config', {
    klineLimit,
    klineInterval
  });

  if (!baseSystemInstruction) {
    throw new Error('Failed to load filter-and-chart-config prompt');
  }

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

    // Apply trader persona to system instruction
    const enhancedSystemInstruction = enhancePromptWithPersona(baseSystemInstruction);
    
    // Generate streaming content
    const result = await model.generateContentStream(enhancedSystemInstruction + "\n\nUser Request: " + userPrompt);
    
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
    marketData: { price: number; volume: number; klines: Kline[]; calculatedIndicators?: Record<string, any> },
    strategy: string,
    modelName: string = 'gemini-2.5-flash',
    aiAnalysisLimit: number = 100,
    positionContext?: string
): Promise<string> {
    // Use calculated indicators if provided, otherwise calculate basic ones
    const technicalIndicators = marketData.calculatedIndicators || {
        currentPrice: marketData.price,
        sma20: helpers.calculateMA(marketData.klines, 20),
        rsi: helpers.getLatestRSI(marketData.klines, 14),
        macd: helpers.getLatestMACD(marketData.klines),
        volume: marketData.volume,
    };
    
    // Debug log the indicators being passed to AI
    console.log(`[DEBUG] generateStructuredAnalysis for ${symbol}:`, {
        hasCalculatedIndicators: !!marketData.calculatedIndicators,
        indicatorCount: Object.keys(technicalIndicators).length,
        indicatorNames: Object.keys(technicalIndicators),
        klineCount: marketData.klines?.length || 0,
        aiAnalysisLimit: aiAnalysisLimit
    });
    
    // Import trader persona dynamically
    const { enhancePromptWithPersona } = await import('../src/constants/traderPersona');
    
    const basePrompt = `
Analyze this ${symbol} setup and provide a structured JSON response based on your expertise.

TRADER'S STRATEGY DIRECTIVE:
${strategy}

CURRENT MARKET DATA:
- Symbol: ${symbol}
- Price: $${marketData.price}
- 24h Volume: ${marketData.volume}
- Historical Bars: ${marketData.klines?.length || 0} candles available

${positionContext ? `${positionContext}\n` : 'Position Status: No open position for this symbol\n'}

TECHNICAL INDICATORS:
${JSON.stringify(technicalIndicators, null, 2)}

Historical Price Data (OHLCV):
${marketData.klines ? JSON.stringify(marketData.klines.slice(-aiAnalysisLimit).map((k, i) => ({
  bar: marketData.klines.length - Math.min(aiAnalysisLimit, marketData.klines.length) + i + 1,
  time: new Date(k[0]).toISOString(),
  open: parseFloat(k[1]),
  high: parseFloat(k[2]),
  low: parseFloat(k[3]),
  close: parseFloat(k[4]),
  volume: parseFloat(k[5])
})), null, 2) : 'No historical data'}

Note: 
- Each indicator includes current value and a 'history' array with past values
- The history array contains up to ${Math.min(aiAnalysisLimit, marketData.klines?.length || 0)} recent values
- For multi-line indicators:
  - StochRSI: value = %K, value2 = %D
  - MACD: value = MACD line, value2 = Signal line, value3 = Histogram
  - Bollinger Bands: value = middle band, value2 = upper band, value3 = lower band
- Historical price data shows the most recent ${Math.min(aiAnalysisLimit, marketData.klines?.length || 0)} bars for analysis

Return ONLY a valid JSON object with this exact structure:
{
  "decision": "buy" | "sell" | "hold" | "no_trade" | "monitor",
  "direction": "long" | "short" (required if decision is "buy" or "sell"),
  "confidence": 0.0-1.0,
  "reasoning": "Detailed explanation of why this decision was made based on the strategy",
  "keyLevels": {
    "entry": number,
    "stopLoss": number,
    "takeProfit": [number, number, number],
    "support": [number],
    "resistance": [number]
  },
  "tradePlan": {
    "entry": "Specific entry price or condition",
    "stopLoss": "Risk management level with reasoning",
    "takeProfit": "Target levels with reasoning for each",
    "positionSize": "Recommended allocation percentage",
    "timeframe": "Expected trade duration",
    "notes": "Additional trade management notes"
  } (only if decision is "buy" or "sell"),
  "chartAnalysis": "Technical analysis of the current setup"
}

DECISION FRAMEWORK:
- "buy": Long entry conditions met with proper confluence
- "sell": Short entry conditions met with proper confluence
- "hold": In position, conditions favor maintaining
- "monitor": Setup developing, needs more confirmation
- "no_trade": Conditions don't meet your standards

Apply your full trading methodology to this decision.
`;

    // Apply trader persona to enhance the prompt
    const enhancedPrompt = enhancePromptWithPersona(basePrompt);

    const startTime = Date.now();
    
    try {
        const model = getGenerativeModel(ai, { 
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
            }
        });
        
        const result = await model.generateContent(enhancedPrompt);
        const response = result.response;
        const text = response.text();
        
        // Track successful analysis
        await observability.trackAnalysis(
            'structured',
            modelName,
            enhancedPrompt,
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
    ticker: Ticker | null,
    allKlinesForSymbol: Kline[] | null, 
    indicators: CustomIndicatorConfig[] | null,
    modelName: string,
    klineInterval: string,
    analysisKlineLimit: number = KLINE_HISTORY_LIMIT_FOR_ANALYSIS,
    strategy?: string,
    includePositionContext: boolean = true
): Promise<string> {
    // Handle missing data by fetching it if needed
    if (!ticker || !allKlinesForSymbol) {
        // Import binanceService dynamically to avoid circular dependencies
        const { fetchTickerData, fetchKlines } = await import('../services/binanceService');
        
        if (!ticker) {
            const tickers = await fetchTickerData();
            ticker = tickers.find(t => t.s === symbol);
            if (!ticker) {
                throw new Error(`No ticker data available for ${symbol}`);
            }
        }
        
        if (!allKlinesForSymbol) {
            allKlinesForSymbol = await fetchKlines(symbol, klineInterval as any, analysisKlineLimit);
        }
    }

    const analysisKlines = allKlinesForSymbol.slice(-analysisKlineLimit);
    const klinesForDisplayCount = Math.min(analysisKlines.length, 15); 

    // Get position context if requested
    let positionContext = '';
    if (includePositionContext) {
        const { getPositionContext } = await import('../src/utils/positionContext');
        const positionCtx = await getPositionContext(symbol);
        positionContext = `\n${positionCtx.formattedText}\n`;
    }

    // Import trader persona
    const { enhancePromptWithPersona } = await import('../src/constants/traderPersona');
    
    let basePrompt = `Provide your expert technical analysis for ${symbol} on the ${klineInterval} timeframe.

MARKET SNAPSHOT:
- Symbol: ${symbol}
- Current Price: ${parseFloat(ticker.c).toFixed(4)} USDT
- 24h Change: ${ticker.P}%
- Analysis Scope: ${analysisKlines.length} candles${positionContext}

RECENT PRICE ACTION (Last ${klinesForDisplayCount} candles, newest first):
${analysisKlines.slice(-klinesForDisplayCount).reverse().map(k => `O:${parseFloat(k[1]).toFixed(4)}, H:${parseFloat(k[2]).toFixed(4)}, L:${parseFloat(k[3]).toFixed(4)}, C:${parseFloat(k[4]).toFixed(4)}, V:${parseFloat(k[5]).toFixed(2)}`).join('\n')}
`;

    if (indicators && indicators.length > 0 && analysisKlines.length > 0) {
        basePrompt += "\nINDICATOR READINGS (Last " + analysisKlines.length + " candles, showing 5 most recent values):\n";
        
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
                    
                    basePrompt += `- ${indicator.name}: [${indicatorValuesText}]\n`;
                    
                    // If indicator has multiple lines (y2, y3), show those too
                    if (dataPoints[0]?.y2 !== undefined) {
                        const y2Values = dataPoints
                            .filter(p => p.y2 !== null && p.y2 !== undefined)
                            .slice(-5)
                            .reverse()
                            .map(p => p.y2!.toFixed(4));
                        if (y2Values.length > 0) {
                            basePrompt += `  - Line 2: [${y2Values.join(', ')}]\n`;
                        }
                    }
                } else {
                    basePrompt += `- ${indicator.name}: [calculation error]\n`;
                }
            } catch (error) {
                console.error(`Error calculating indicator ${indicator.name}:`, error);
                basePrompt += `- ${indicator.name}: [error in calculation]\n`;
            }
        }
    }
    
    if (strategy && strategy.trim()) {
        basePrompt += `\n\nTRADER'S STRATEGY DIRECTIVE:\n${strategy}\n\nBased on your expertise and this strategy, provide:\n1. TRADE DECISION: Execute specific action based on your analysis\n2. KEY LEVELS: Support, resistance, entry, stop, target levels\n3. MARKET STRUCTURE: Your read on the current setup\n\nFormat your response starting with:\nDECISION: [Your decisive action]\nANALYSIS: [Your expert technical analysis]`;
    } else {
        basePrompt += "\n\nProvide your expert technical analysis focusing on:\n- Market structure and trend\n- Key support/resistance levels\n- Volume analysis and order flow\n- Potential trade setups forming";
    }

    const startTime = Date.now();
    
    // Apply trader persona enhancement
    const enhancedPrompt = enhancePromptWithPersona(basePrompt);
    
    try {
        // Create a model instance
        const model = getGenerativeModel(ai, { model: modelName });
        
        // Generate content using Firebase AI Logic
        const result = await model.generateContent(enhancedPrompt);
        const response = result.response;
        const text = response.text();
        
        // Track successful symbol analysis
        await observability.trackAnalysis(
            'symbol',
            modelName,
            enhancedPrompt,
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
            enhancedPrompt,
            null,
            null,
            Date.now() - startTime,
            symbol,
            errorMessage
        );
        
        throw new Error(`Symbol analysis API request for ${symbol} failed: ${errorMessage}`);
    }
}

// Generate a complete trader configuration from natural language
export async function regenerateFilterCode(
    conditions: string[],
    modelName: string = 'gemini-2.5-pro',
    klineInterval: string = '1h'
): Promise<{ filterCode: string }> {
    const conditionsList = conditions.map((c, i) => `${i + 1}. ${c}`).join('\n');
    
    const baseSystemInstruction = `You are an AI assistant that converts human-readable trading conditions into JavaScript filter code.

Given these conditions:
${conditionsList}

Generate ONLY the JavaScript function body for (ticker, klines, helpers, hvnNodes) => boolean

IMPORTANT:
- Return ONLY the raw JavaScript code - no markdown formatting, no code blocks, no backticks
- Just the function body code, no JSON wrapper
- Use only the 4 provided parameters: ticker, klines, helpers, hvnNodes
- Do NOT reference undefined variables like 'inputs', 'data', etc.
- The code must return true when ALL conditions are met, false otherwise
- Use helper functions like calculateMA, calculateRSI, etc.
- Do NOT wrap the response in \`\`\`javascript\`\`\` or any other formatting

Available helpers include:
- calculateMA(klines, period) / calculateMASeries(klines, period) / calculateSMA(values, period)
- calculateRSI(klines, period) / getLatestRSI(klines, period)
- calculateEMA(values, period) / calculateEMASeries(klines, period) / getLatestEMA(klines, period)
- calculateMACD(closes, short=12, long=26, signal=9) / calculateMACDValues(klines) / getLatestMACD(klines)
- calculateBollingerBands(klines, period=20, stdDev=2) / getLatestBollingerBands(klines, period, stdDev)
- calculateStochRSI(klines, rsiPeriod=14, stochPeriod=14, kPeriod=3, dPeriod=3) / getLatestStochRSI(klines)
- calculateStochastic(klines, kPeriod=14, dPeriod=3, smooth=3)
- calculateADX(klines, period=14)
- calculateAvgVolume(klines, period)
- calculateVWAP(klines) / calculateVWAPSeries(klines, anchorPeriod) / getLatestVWAP(klines)
- calculateVWAPBands(klines, anchorPeriod, stdDevMultiplier) / getLatestVWAPBands(klines)
- calculatePVISeries(klines, initialPVI=1000) / getLatestPVI(klines)
- detectRSIDivergence(klines, rsiPeriod=14, lookback=30) / detectGenericDivergence(series1, series2)
- detectEngulfingPattern(klines)
- calculateHighVolumeNodes(klines, options) / isNearHVN(price, hvnNodes, tolerance)
- getClosestHVN(price, hvnNodes, direction) / countHVNInRange(priceLow, priceHigh, hvnNodes)
- getHighestHigh(klines, period) / getLowestLow(klines, period)
- clearHVNCache(cacheKey)

The klines array format: each kline is [timestamp, open, high, low, close, volume, ...other]
The ticker object has properties like: ticker.c (lastPrice), ticker.P (priceChangePercent), ticker.q (quoteVolume)

Kline interval: ${klineInterval}`;

    try {
        // Apply trader persona to system instruction
        const enhancedSystemInstruction = enhancePromptWithPersona(baseSystemInstruction);
        
        const model = getGenerativeModel(ai, {
            model: modelName,
            generationConfig: {
                responseMimeType: "text/plain",
            }
        });

        const result = await model.generateContent(enhancedSystemInstruction);
        const response = result.response;
        let filterCode = response.text().trim();
        
        // Remove markdown code blocks if present
        if (filterCode.startsWith('```')) {
            // Remove opening code block
            filterCode = filterCode.replace(/^```[a-zA-Z]*\n?/, '');
            // Remove closing code block
            filterCode = filterCode.replace(/\n?```$/, '');
            filterCode = filterCode.trim();
        }
        
        // Remove any remaining backticks
        filterCode = filterCode.replace(/^`+|`+$/g, '');
        
        // Basic validation
        if (!filterCode.includes('return')) {
            throw new Error('Generated filter code is missing a return statement');
        }
        
        // Try to validate the syntax by creating a function
        try {
            new Function('ticker', 'klines', 'helpers', 'hvnNodes', filterCode);
        } catch (syntaxError) {
            console.error('Generated filter code has syntax error:', syntaxError);
            console.error('Filter code:', filterCode);
            throw new Error(`Generated filter code has invalid syntax: ${syntaxError.message}`);
        }
        
        console.log('Successfully regenerated filter code from conditions');
        return { filterCode };
    } catch (error) {
        console.error('Failed to regenerate filter code:', error);
        throw error;
    }
}

export async function generateTrader(
    userPrompt: string,
    modelName: string = 'gemini-2.5-pro',
    klineInterval: string = '1h'
): Promise<TraderGeneration> {
    const baseSystemInstruction = `You are an AI assistant that creates complete cryptocurrency trading systems. The user provides a trading strategy description, and you create a unified "Trader" that includes both market scanning filters and trading execution strategy.

Generate a JSON response with the following structure:
{
  "suggestedName": "A short, descriptive name for this trader (e.g., 'RSI Bounce Trader', 'Momentum Breakout Bot')",
  "description": "A 1-2 sentence description of what this trader does",
  "filterDescription": ["Array of 3-4 human-readable conditions this trader looks for"],
  "filterCode": "JavaScript function body for (ticker, klines, helpers, hvnNodes) => boolean. IMPORTANT: Only use the provided parameters - do not reference undefined variables like 'inputs' or 'data'",
  "strategyInstructions": "Detailed instructions for AI analysis including entry criteria, exit criteria, and risk management",
  "indicators": [
    /* Array of indicator configurations for charting
    Each indicator should follow this structure:
    {
      "id": "unique_id",
      "name": "Display Name",
      "panel": true/false (true = separate panel, false = overlay on price),
      "calculateFunction": "JavaScript function body returning data points",
      "chartType": "line" or "bar",
      "style": { "color": ["#color1", "#color2"], "lineWidth": 1.5 },
      "yAxisConfig": { "min": 0, "max": 100, "label": "RSI" } // optional
    }
    */
  ],
  "riskParameters": {
    "stopLoss": /* percentage as decimal, e.g., 0.02 for 2% */,
    "takeProfit": /* percentage as decimal, e.g., 0.05 for 5% */,
    "maxPositions": /* number */,
    "positionSizePercent": /* percentage of portfolio as decimal */,
    "maxDrawdown": /* maximum acceptable drawdown as decimal */
  }
}

IMPORTANT GUIDELINES:
1. The filter and strategy must work together cohesively - the filter finds opportunities that match the strategy
2. The filterCode must use the helper functions available (calculateMA, calculateRSI, etc.)
3. Risk parameters should be conservative by default unless the user specifies otherwise
4. Include relevant technical indicators that support the strategy
5. The strategyInstructions should be clear enough for the AI analyzer to make consistent decisions
6. The filterCode function receives exactly 4 parameters: ticker, klines, helpers, hvnNodes
   - Do NOT reference any other variables like 'inputs', 'data', 'config', etc.
   - All data must come from these 4 parameters only

Available helper functions for filterCode:
- calculateMA(klines, period) / calculateMASeries(klines, period) / calculateSMA(values, period)
- calculateRSI(klines, period) / getLatestRSI(klines, period)
- calculateEMA(values, period) / calculateEMASeries(klines, period) / getLatestEMA(klines, period)
- calculateMACD(closes, short=12, long=26, signal=9) / calculateMACDValues(klines) / getLatestMACD(klines)
- calculateBollingerBands(klines, period=20, stdDev=2) - Returns {upper: [], middle: [], lower: []}
- getLatestBollingerBands(klines, period=20, stdDev=2) - Returns {upper: number, middle: number, lower: number}
- calculateStochRSI(klines, rsiPeriod=14, stochPeriod=14, kPeriod=3, dPeriod=3) / getLatestStochRSI(klines)
- calculateStochastic(klines, kPeriod=14, dPeriod=3, smooth=3)
- calculateADX(klines, period=14)
- calculateAvgVolume(klines, period)
- calculateVWAP(klines) / calculateVWAPSeries(klines, anchorPeriod) / getLatestVWAP(klines)
- calculateVWAPBands(klines, anchorPeriod, stdDevMultiplier) / getLatestVWAPBands(klines)
- calculatePVISeries(klines, initialPVI=1000) / getLatestPVI(klines)
- detectRSIDivergence(klines, rsiPeriod=14, lookback=30) / detectGenericDivergence(series1, series2)
- detectEngulfingPattern(klines)
- calculateHighVolumeNodes(klines, options) / isNearHVN(price, hvnNodes, tolerance)
- getClosestHVN(price, hvnNodes, direction) / countHVNInRange(priceLow, priceHigh, hvnNodes)
- getHighestHigh(klines, period) / getLowestLow(klines, period)
- clearHVNCache(cacheKey)

IMPORTANT: Always check if helper function results exist before accessing properties:
Example: 
  const bb = helpers.getLatestBollingerBands(klines, 20, 2);
  if (!bb || bb.lower === null) return false;
  // Now safe to use bb.lower

Example indicator objects:
- Moving Average: {"id": "ma_20", "name": "MA(20)", "panel": false, "calculateFunction": "const ma = helpers.calculateMASeries(klines, 20); return klines.map((k, i) => ({x: k[0], y: ma[i]}));", "chartType": "line", "style": {"color": "#facc15"}}
- RSI: {"id": "rsi_14", "name": "RSI(14)", "panel": true, "calculateFunction": "const rsi = helpers.calculateRSI(klines, 14) || []; return rsi.map((val, i) => ({x: klines[i][0], y: val}));", "chartType": "line", "style": {"color": "#8b5cf6"}, "yAxisConfig": {"min": 0, "max": 100}}
- Volume: {"id": "volume", "name": "Volume", "panel": true, "calculateFunction": "return klines.map(k => ({x: k[0], y: parseFloat(k[5]), color: parseFloat(k[4]) > parseFloat(k[1]) ? '#10b981' : '#ef4444'}));", "chartType": "bar"}

IMPORTANT: The filterDescription should be human-readable explanations of what the filter is looking for, NOT code. Users should understand the conditions without seeing JavaScript.

Example user prompt: "Create a mean reversion trader that buys oversold conditions"
Example response would include:
- filterDescription: ["RSI is below 30 (oversold)", "Price is near a support level", "Volume is above average"]
- filterCode: The actual JavaScript implementation
- indicators: RSI indicator, support/resistance levels, volume indicator
- Conservative risk parameters (2% stop loss, 5% take profit)`;

    const prompt = `Create a complete trader based on this strategy: "${userPrompt}"

Remember to:
1. Make the filter and strategy work together
2. Include appropriate risk management
3. Suggest relevant indicators
4. Keep the name short and descriptive`;

    const startTime = Date.now();

    try {
        // Apply trader persona to system instruction
        const enhancedSystemInstruction = enhancePromptWithPersona(baseSystemInstruction);
        
        const model = getGenerativeModel(ai, { model: modelName });
        const result = await model.generateContent({
            systemInstruction: enhancedSystemInstruction,
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        
        const response = result.response;
        const text = response.text();
        
        // Track the generation
        await observability.trackAnalysis(
            'trader_generation',
            modelName,
            prompt,
            text,
            response.usageMetadata,
            Date.now() - startTime
        );
        
        // Parse and validate the response
        const parsed = parseAndValidateTraderGeneration(text);
        return parsed;
    } catch (error) {
        console.error('Error generating trader:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        await observability.trackAnalysis(
            'trader_generation',
            modelName,
            prompt,
            null,
            null,
            Date.now() - startTime,
            undefined,
            errorMessage
        );
        
        throw new Error(`Trader generation failed: ${errorMessage}`);
    }
}

// Helper to parse and validate trader generation response
function parseAndValidateTraderGeneration(responseText: string): TraderGeneration {
    try {
        // Extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Validate required fields
        if (!parsed.suggestedName || typeof parsed.suggestedName !== 'string') {
            throw new Error('Invalid or missing suggestedName');
        }
        
        if (!parsed.filterCode || typeof parsed.filterCode !== 'string') {
            throw new Error('Invalid or missing filterCode');
        }
        
        if (!parsed.strategyInstructions || typeof parsed.strategyInstructions !== 'string') {
            throw new Error('Invalid or missing strategyInstructions');
        }
        
        // Ensure arrays
        parsed.filterDescription = Array.isArray(parsed.filterDescription) ? parsed.filterDescription : [];
        parsed.indicators = Array.isArray(parsed.indicators) ? parsed.indicators : [];
        
        // Debug log the generated indicators
        console.log(`[DEBUG] generateTrader created ${parsed.indicators.length} indicators:`, 
            parsed.indicators.map(ind => ({
                id: ind.id,
                name: ind.name,
                panel: ind.panel,
                hasCalculateFunction: !!ind.calculateFunction,
                functionLength: ind.calculateFunction?.length
            }))
        );
        
        // Validate risk parameters with defaults
        const defaultRisk = {
            stopLoss: 0.02,
            takeProfit: 0.05,
            maxPositions: 3,
            positionSizePercent: 0.1,
            maxDrawdown: 0.1
        };
        
        parsed.riskParameters = {
            ...defaultRisk,
            ...(parsed.riskParameters || {})
        };
        
        return {
            suggestedName: parsed.suggestedName,
            description: parsed.description || parsed.suggestedName,
            filterCode: parsed.filterCode,
            filterDescription: parsed.filterDescription,
            strategyInstructions: parsed.strategyInstructions,
            indicators: parsed.indicators,
            riskParameters: parsed.riskParameters
        };
    } catch (error) {
        console.error('Failed to parse trader generation:', error);
        throw new Error(`Invalid trader generation response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}