
import { getGenerativeModel } from "firebase/ai";
import { ai } from '../config/firebase';
import { AiFilterResponse, Kline, Ticker, CustomIndicatorConfig, IndicatorDataPoint } from '../types';
import { KLINE_HISTORY_LIMIT, KLINE_HISTORY_LIMIT_FOR_ANALYSIS } from "../constants";
import * as helpers from '../screenerHelpers'; // Import all helpers
import { observability } from './observabilityService';
import { TraderGeneration } from '../src/abstractions/trader.interfaces';
import { enhancePromptWithPersona } from '../src/constants/traderPersona';
import { promptManager } from '../src/services/promptManager';
import { aiRateLimiter } from '../src/utils/aiRateLimiter';
import { TraderMetadata, StreamingUpdate } from '../src/types/trader-generation.types';

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
  console.log('[generateFilterAndChartConfig] Getting prompt from manager...');
  const systemInstruction = await promptManager.getActivePromptContent('filter-and-chart-config', {
    klineLimit,
    klineInterval
  });

  if (!systemInstruction) {
    console.error('[generateFilterAndChartConfig] Failed to load filter-and-chart-config prompt');
    throw new Error('Failed to load filter-and-chart-config prompt');
  }
  console.log('[generateFilterAndChartConfig] Got prompt, length:', systemInstruction.length);

  
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

      // Generate content using Firebase AI Logic with rate limiting
      // Firebase AI Logic expects a simple string or parts array, not the full content structure
      const result = await aiRateLimiter.execute(
        () => model.generateContent(currentSystemInstruction + promptText),
        modelName,
        1 // Priority 1 for filter generation
      );
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
              // Try to fix common patterns where the AI forgets the return statement
              const trimmedFunction = indicator.calculateFunction.trim();
              
              // Check if it looks like it's trying to return an array/map operation
              if (trimmedFunction.includes('.map(') || trimmedFunction.includes('klines.map(')) {
                  // If it's missing a return at the start, add it
                  if (!trimmedFunction.startsWith('return')) {
                      console.warn(`[FIX_INDICATOR] Adding missing return statement to indicator ${index}`);
                      indicator.calculateFunction = 'return ' + trimmedFunction;
                  }
              }
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
    
    // Generate streaming content with rate limiting
    const result = await aiRateLimiter.execute(
      () => model.generateContentStream(enhancedSystemInstruction + "\n\nUser Request: " + userPrompt),
      modelName,
      1 // Priority 1 for streaming filter generation
    );
    
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
      
      // Validate and fix indicators
      parsedResponse.indicators.forEach((indicator, index) => {
        // Basic validation
        if (!indicator.calculateFunction || typeof indicator.calculateFunction !== 'string') {
          throw new Error(`Invalid indicator at index ${index}: missing or invalid 'calculateFunction'.`);
        }
        
        // Ensure calculateFunction returns something
        if (!indicator.calculateFunction.includes('return')) {
          console.warn(`[STREAMING] Indicator at index ${index} may be missing a return statement.`);
          // Try to fix common patterns where the AI forgets the return statement
          const trimmedFunction = indicator.calculateFunction.trim();
          
          // Check if it looks like it's trying to return an array/map operation
          if (trimmedFunction.includes('.map(') || trimmedFunction.includes('klines.map(')) {
            // If it's missing a return at the start, add it
            if (!trimmedFunction.startsWith('return')) {
              console.warn(`[FIX_INDICATOR_STREAMING] Adding missing return statement to indicator ${index}`);
              indicator.calculateFunction = 'return ' + trimmedFunction;
            }
          }
        }
      });
      
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
        
        // Generate content using Firebase AI Logic with rate limiting
        const result = await aiRateLimiter.execute(
            () => model.generateContent(prompt),
            modelName,
            4 // Priority 4 for market analysis
        );
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
    // Use calculated indicators if provided - NO FALLBACK
    // Traders must have properly configured indicators
    const technicalIndicators = marketData.calculatedIndicators || {
        currentPrice: marketData.price,
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
    
    // Get the prompt from the prompt manager
    const promptTemplate = await promptManager.getActivePromptContent('structured-analysis', {
        symbol: symbol,
        ticker: JSON.stringify(technicalIndicators, null, 2),
        klines: marketData.klines ? JSON.stringify(marketData.klines.slice(-aiAnalysisLimit).map((k, i) => ({
            bar: marketData.klines.length - Math.min(aiAnalysisLimit, marketData.klines.length) + i + 1,
            time: new Date(k[0]).toISOString(),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5])
        })), null, 2) : 'No historical data',
        indicators: JSON.stringify(technicalIndicators, null, 2),
        position: positionContext || 'No open position for this symbol'
    });

    if (!promptTemplate) {
        throw new Error('Failed to load structured-analysis prompt');
    }

    // Construct the user prompt with additional context
    const basePrompt = `${promptTemplate}

TRADER'S STRATEGY DIRECTIVE:
${strategy}

CURRENT MARKET DATA:
- Symbol: ${symbol}
- Price: $${marketData.price}
- 24h Volume: ${marketData.volume}
- Historical Bars: ${marketData.klines?.length || 0} candles available

Note: 
- Each indicator includes current value and a 'history' array with past values
- The history array contains up to ${Math.min(aiAnalysisLimit, marketData.klines?.length || 0)} recent values
- For multi-line indicators:
  - StochRSI: value = %K, value2 = %D
  - MACD: value = MACD line, value2 = Signal line, value3 = Histogram
  - Bollinger Bands: value = middle band, value2 = upper band, value3 = lower band
- Historical price data shows the most recent ${Math.min(aiAnalysisLimit, marketData.klines?.length || 0)} bars for analysis`;

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
        
        const result = await aiRateLimiter.execute(
            () => model.generateContent(enhancedPrompt),
            modelName,
            2 // Priority 2 for structured analysis
        );
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
    
    // Prepare data for the prompt
    const marketSnapshot = `- Symbol: ${symbol}
- Current Price: ${parseFloat(ticker.c).toFixed(4)} USDT
- 24h Change: ${ticker.P}%
- Analysis Scope: ${analysisKlines.length} candles on ${klineInterval} timeframe`;

    const priceAction = analysisKlines.slice(-klinesForDisplayCount).reverse()
        .map(k => `O:${parseFloat(k[1]).toFixed(4)}, H:${parseFloat(k[2]).toFixed(4)}, L:${parseFloat(k[3]).toFixed(4)}, C:${parseFloat(k[4]).toFixed(4)}, V:${parseFloat(k[5]).toFixed(2)}`)
        .join('\n');

    let technicalIndicators = '';

    if (indicators && indicators.length > 0 && analysisKlines.length > 0) {
        technicalIndicators = "INDICATOR READINGS (Last " + analysisKlines.length + " candles, showing 5 most recent values):\n";
        
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
                    
                    technicalIndicators += `- ${indicator.name}: [${indicatorValuesText}]\n`;
                    
                    // If indicator has multiple lines (y2, y3), show those too
                    if (dataPoints[0]?.y2 !== undefined) {
                        const y2Values = dataPoints
                            .filter(p => p.y2 !== null && p.y2 !== undefined)
                            .slice(-5)
                            .reverse()
                            .map(p => p.y2!.toFixed(4));
                        if (y2Values.length > 0) {
                            technicalIndicators += `  - Line 2: [${y2Values.join(', ')}]\n`;
                        }
                    }
                } else {
                    technicalIndicators += `- ${indicator.name}: [calculation error]\n`;
                }
            } catch (error) {
                console.error(`Error calculating indicator ${indicator.name}:`, error);
                technicalIndicators += `- ${indicator.name}: [error in calculation]\n`;
            }
        }
    }
    
    // Prepare strategy context
    const strategyContext = strategy && strategy.trim() ? 
        `TRADER'S STRATEGY DIRECTIVE:\n${strategy}\n\nBased on your expertise and this strategy, provide:\n1. TRADE DECISION: Execute specific action based on your analysis\n2. KEY LEVELS: Support, resistance, entry, stop, target levels\n3. MARKET STRUCTURE: Your read on the current setup\n\nFormat your response starting with:\nDECISION: [Your decisive action]\nANALYSIS: [Your expert technical analysis]` : "";

    // Get the prompt template from prompt manager
    const promptTemplate = await promptManager.getActivePromptContent('symbol-analysis', {
        symbol: symbol,
        ticker: JSON.stringify(ticker, null, 2),
        klines: JSON.stringify(analysisKlines, null, 2),
        indicators: JSON.stringify(indicators, null, 2),
        position: positionContext || '',
        marketSnapshot: marketSnapshot,
        priceAction: priceAction,
        technicalIndicators: technicalIndicators,
        strategyContext: strategyContext,
        positionContext: positionContext || ''
    });

    if (!promptTemplate) {
        throw new Error('Failed to load symbol-analysis prompt');
    }

    const startTime = Date.now();
    
    // Apply trader persona enhancement
    const enhancedPrompt = enhancePromptWithPersona(promptTemplate);
    
    try {
        // Create a model instance
        const model = getGenerativeModel(ai, { model: modelName });
        
        // Generate content using Firebase AI Logic with rate limiting
        const result = await aiRateLimiter.execute(
            () => model.generateContent(enhancedPrompt),
            modelName,
            3 // Priority 3 for symbol analysis
        );
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

// Regenerate filter code from human-readable conditions
export async function generateFilterCode(
    conditions: string[],
    modelName: string = 'gemini-2.5-pro',
    klineInterval: string = '1h'
): Promise<{ filterCode: string, requiredTimeframes?: string[] }> {
    const conditionsList = conditions.map((c, i) => `${i + 1}. ${c}`).join('\n');
    
    // Get the prompt from the prompt manager
    const promptTemplate = await promptManager.getActivePromptContent('regenerate-filter', {
        conditions: conditionsList
    });

    if (!promptTemplate) {
        throw new Error('Failed to load regenerate-filter prompt');
    }

    // Add the conditions and kline interval to the prompt
    const baseSystemInstruction = `${promptTemplate}

Given these conditions:
${conditionsList}

Kline interval: ${klineInterval}`;

    try {
        // DO NOT use persona for filter code - we want clean, concise code
        const model = getGenerativeModel(ai, {
            model: modelName,
            generationConfig: {
                responseMimeType: "application/json",
            }
        });

        const result = await aiRateLimiter.execute(
            () => model.generateContent(baseSystemInstruction),
            modelName,
            2 // Priority 2 for filter regeneration
        );
        const response = result.response;
        const responseText = response.text().trim();
        
        // Parse JSON response
        let parsedResponse;
        try {
            parsedResponse = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse regenerate response as JSON:', responseText);
            throw new Error('Failed to parse AI response as JSON');
        }
        
        const { filterCode, requiredTimeframes } = parsedResponse;
        
        if (!filterCode) {
            throw new Error('Response is missing filterCode');
        }
        
        // Basic validation
        if (!filterCode.includes('return')) {
            throw new Error('Generated filter code is missing a return statement');
        }
        
        // Try to validate the syntax by creating a function
        try {
            new Function('ticker', 'timeframes', 'helpers', 'hvnNodes', filterCode);
        } catch (syntaxError) {
            console.error('Generated filter code has syntax error:', syntaxError);
            console.error('Filter code:', filterCode);
            throw new Error(`Generated filter code has invalid syntax: ${syntaxError.message}`);
        }
        
        console.log('Successfully regenerated filter code from conditions');
        return { filterCode, requiredTimeframes };
    } catch (error) {
        console.error('Failed to regenerate filter code:', error);
        throw error;
    }
}

// Generate trader metadata with streaming support (Step 1)
export async function generateTraderMetadata(
    userPrompt: string,
    modelName: string = 'gemini-2.5-pro',
    onStream?: (update: StreamingUpdate) => void
): Promise<TraderMetadata> {
    // Get the prompt from the prompt manager
    const baseSystemInstruction = await promptManager.getActivePromptContent('generate-trader-metadata', {
        userPrompt: userPrompt,
        modelName: modelName
    });

    if (!baseSystemInstruction) {
        throw new Error('Failed to load generate-trader-metadata prompt');
    }

    const prompt = `Create trader metadata based on this strategy: "${userPrompt}"

Remember to:
1. Create clear, testable conditions
2. Include appropriate risk management
3. Suggest relevant indicators
4. Keep the name short and descriptive`;

    const startTime = Date.now();

    try {
        // Apply trader persona to system instruction
        const enhancedSystemInstruction = enhancePromptWithPersona(baseSystemInstruction);
        
        const model = getGenerativeModel(ai, { 
            model: modelName,
            // No responseMimeType for streaming
        });

        const result = await aiRateLimiter.execute(
            () => model.generateContentStream({
                systemInstruction: enhancedSystemInstruction,
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            }),
            modelName,
            1 // Priority 1 for trader generation
        );
        
        let buffer = '';
        let partialJson = '';
        let isJsonStarted = false;
        
        // Send initial progress
        onStream?.({ type: 'progress', progress: 0 });
        
        // Process the stream
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            buffer += chunkText;
            
            // Look for JSON start
            if (!isJsonStarted && buffer.includes('{')) {
                isJsonStarted = true;
                const jsonStartIndex = buffer.indexOf('{');
                partialJson = buffer.substring(jsonStartIndex);
            } else if (isJsonStarted) {
                partialJson += chunkText;
            }
            
            // Try to extract and stream conditions as they appear
            if (isJsonStarted && partialJson.includes('"filterConditions"')) {
                const conditionsMatch = partialJson.match(/"filterConditions"\s*:\s*\[([\s\S]*?)\]/);
                if (conditionsMatch) {
                    try {
                        const conditionsArray = JSON.parse(`[${conditionsMatch[1]}]`);
                        conditionsArray.forEach((condition: string) => {
                            onStream?.({ type: 'condition', condition });
                        });
                    } catch (e) {
                        // Partial JSON, continue buffering
                    }
                }
            }
            
            // Try to extract strategy instructions
            if (isJsonStarted && partialJson.includes('"strategyInstructions"')) {
                const strategyMatch = partialJson.match(/"strategyInstructions"\s*:\s*"([^"]*)"/);
                if (strategyMatch) {
                    onStream?.({ type: 'strategy', strategyText: strategyMatch[1] });
                }
            }
            
            // Update progress
            onStream?.({ 
                type: 'progress', 
                progress: Math.min(90, Math.floor((partialJson.length / 2000) * 100)) 
            });
        }
        
        // Parse the complete response
        const jsonMatch = buffer.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }
        
        const metadata = JSON.parse(jsonMatch[0]) as TraderMetadata;
        
        // Send completion
        onStream?.({ type: 'complete', metadata });
        
        return metadata;
    } catch (error) {
        onStream?.({ type: 'error', error: error as Error });
        throw error;
    }
}

// Two-step trader generation - for backward compatibility
export async function generateTrader(
    userPrompt: string,
    modelName: string = 'gemini-2.5-pro',
    klineInterval: string = '1h',
    onStream?: (update: StreamingUpdate) => void
): Promise<TraderGeneration> {
    const startTime = Date.now();

    try {
        // Step 1: Generate metadata with streaming
        console.log('[generateTrader] Step 1: Generating metadata...');
        const metadata = await generateTraderMetadata(userPrompt, modelName, onStream);
        
        // Step 2: Generate filter code
        console.log('[generateTrader] Step 2: Generating filter code...');
        onStream?.({ type: 'progress', progress: 95 });
        
        const { filterCode, requiredTimeframes } = await generateFilterCode(
            metadata.filterConditions,
            modelName,
            klineInterval
        );
        
        // Combine results
        const traderGeneration: TraderGeneration = {
            suggestedName: metadata.suggestedName,
            description: metadata.description,
            filterCode: filterCode,
            filterDescription: metadata.filterConditions,
            strategyInstructions: metadata.strategyInstructions,
            indicators: metadata.indicators,
            riskParameters: metadata.riskParameters,
            requiredTimeframes: requiredTimeframes
        };
        
        // Track the generation
        await observability.trackGeneration(
            userPrompt,
            modelName,
            klineInterval,
            250, // Default kline limit for trader generation
            JSON.stringify(traderGeneration),
            null, // Usage metadata not available in streaming
            Date.now() - startTime
        );
        
        console.log('[generateTrader] Successfully generated trader:', traderGeneration.suggestedName);
        onStream?.({ type: 'complete' });
        
        return traderGeneration;
    } catch (error) {
        console.error('[generateTrader] Generation failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        await observability.trackGeneration(
            userPrompt,
            modelName,
            klineInterval,
            250,
            null,
            null,
            Date.now() - startTime,
            errorMessage
        );
        
        onStream?.({ type: 'error', error: error as Error });
        throw new Error(`Trader generation failed: ${errorMessage}`);
    }
}

// Helper to parse and validate trader generation response
function parseAndValidateTraderGeneration(responseText: string): TraderGeneration {
    try {
        // Extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            console.error('[TRADER_GENERATION] No JSON found in response:', responseText);
            throw new Error('No JSON found in response');
        }
        
        console.log('[TRADER_GENERATION] Extracted JSON string:', jsonMatch[0]);
        
        const parsed = JSON.parse(jsonMatch[0]);
        
        console.log('[TRADER_GENERATION] Parsed JSON object:', JSON.stringify(parsed, null, 2));
        
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
            parsed.indicators.map((ind: any) => ({
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
        
        const finalTrader = {
            suggestedName: parsed.suggestedName,
            description: parsed.description || parsed.suggestedName,
            filterCode: parsed.filterCode,
            filterDescription: parsed.filterDescription,
            strategyInstructions: parsed.strategyInstructions,
            indicators: parsed.indicators,
            riskParameters: parsed.riskParameters,
            requiredTimeframes: parsed.requiredTimeframes
        };
        
        console.log('[TRADER_GENERATION] Final validated trader object:', JSON.stringify(finalTrader, null, 2));
        
        return finalTrader;
    } catch (error) {
        console.error('Failed to parse trader generation:', error);
        throw new Error(`Invalid trader generation response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}