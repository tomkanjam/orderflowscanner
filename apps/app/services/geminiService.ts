
import { AiFilterResponse, Kline, Ticker, CustomIndicatorConfig, IndicatorDataPoint, KlineInterval } from '../types';
import { KLINE_HISTORY_LIMIT, KLINE_HISTORY_LIMIT_FOR_ANALYSIS } from "../constants";
import * as helpers from '../screenerHelpers'; // Import all helpers
import { observability } from './observabilityService';
import { TraderGeneration } from '../src/abstractions/trader.interfaces';
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

// Regenerate filter code from human-readable conditions
// NOW GENERATES GO CODE for all new traders
export async function generateFilterCode(
    conditions: string[],
    modelName: string = 'gemini-2.5-pro',
    klineInterval: string = '1h'
): Promise<{ filterCode: string, requiredTimeframes?: string[], language: 'go' }> {
    try {
        // Call llm-proxy Edge Function via OpenRouter
        const { supabase } = await import('../src/config/supabase');
        if (!supabase) {
            throw new Error('Supabase client not configured');
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error('Not authenticated');
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                operation: 'generate-filter-code',
                params: {
                    conditions,
                    modelName,
                    klineInterval
                },
                stream: false
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Edge function call failed');
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.error?.message || 'Filter code generation failed');
        }

        const { filterCode, requiredTimeframes } = result.data;

        if (!filterCode) {
            throw new Error('Response is missing filterCode');
        }

        // Basic validation for Go code
        if (!filterCode.includes('return')) {
            throw new Error('Generated filter code is missing a return statement');
        }

        // Check for common Go patterns (not exhaustive, Yaegi will do full validation)
        if (!filterCode.includes(':=') && !filterCode.includes('data.')) {
            console.warn('Generated code may not be valid Go - missing common Go patterns');
        }

        console.log('[generateFilterCode] Successfully generated Go filter code via llm-proxy');
        console.log('[generateFilterCode] Required timeframes:', requiredTimeframes);
        console.log('[generateFilterCode] Code length:', filterCode.length);

        return {
            filterCode,
            requiredTimeframes,
            language: 'go'
        };
    } catch (error) {
        console.error('Failed to generate filter code:', error);
        throw error;
    }
}

// Generate trader metadata with streaming support (Step 1)
export async function generateTraderMetadata(
    userPrompt: string,
    modelName: string = 'gemini-2.5-pro',
    onStream?: (update: StreamingUpdate) => void
): Promise<TraderMetadata> {
    const startTime = Date.now();

    try {
        // Send initial progress
        onStream?.({ type: 'progress', progress: 0 });

        // Call llm-proxy Edge Function via OpenRouter
        const { supabase } = await import('../src/config/supabase');
        if (!supabase) {
            throw new Error('Supabase client not configured');
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            throw new Error('Not authenticated');
        }

        // Call the llm-proxy Edge Function with SSE streaming
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`
            },
            body: JSON.stringify({
                operation: 'generate-trader-metadata',
                params: {
                    userPrompt,
                    modelName
                },
                stream: true
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Edge function call failed');
        }

        if (!response.body) {
            throw new Error('No response body');
        }

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let metadata: TraderMetadata | null = null;
        let chunkCount = 0;
        let currentEvent = ''; // Persist across chunks

        console.log('[generateTraderMetadata] Starting SSE stream processing...');

        while (true) {
            const { done, value} = await reader.read();
            if (done) {
                console.log('[generateTraderMetadata] Stream done');
                break;
            }

            chunkCount++;
            const chunk = decoder.decode(value, { stream: true });
            console.log(`[generateTraderMetadata] Chunk ${chunkCount}:`, chunk);

            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                console.log(`[generateTraderMetadata] Processing line:`, line);

                if (line.startsWith('event: ')) {
                    currentEvent = line.slice(7).trim();
                    console.log(`[generateTraderMetadata] Event: ${currentEvent}`);
                } else if (line.startsWith('data: ')) {
                    try {
                        const dataStr = line.slice(6);
                        console.log(`[generateTraderMetadata] Data string:`, dataStr);
                        const data = JSON.parse(dataStr);
                        console.log(`[generateTraderMetadata] Parsed data for event ${currentEvent}:`, data);

                        if (currentEvent === 'progress') {
                            onStream?.({ type: 'progress', progress: data.progress });
                        } else if (currentEvent === 'metadata') {
                            // Handle different metadata types
                            if (data.type === 'condition') {
                                onStream?.({ type: 'condition', condition: data.value.value || data.value });
                            } else if (data.type === 'strategy') {
                                onStream?.({ type: 'strategy', strategyText: data.value });
                            }
                        } else if (currentEvent === 'complete') {
                            console.log('[generateTraderMetadata] Received complete event with metadata:', data.data);
                            metadata = data.data;
                        } else if (currentEvent === 'error') {
                            throw new Error(data.message || 'Stream error');
                        }
                    } catch (parseError) {
                        console.error('[generateTraderMetadata] Failed to parse SSE data:', parseError, line);
                    }
                    currentEvent = '';
                }
            }
        }

        console.log('[generateTraderMetadata] Final metadata:', metadata);

        if (!metadata) {
            throw new Error('No metadata received from stream');
        }

        // Track the generation
        await observability.trackGeneration(
            userPrompt,
            modelName,
            '1h', // Default interval
            250,
            JSON.stringify(metadata),
            null,
            Date.now() - startTime
        );

        // Send completion
        onStream?.({ type: 'complete', metadata });

        return metadata;
    } catch (error) {
        console.error('[generateTraderMetadata] Error:', error);

        await observability.trackGeneration(
            userPrompt,
            modelName,
            '1h',
            250,
            null,
            null,
            Date.now() - startTime,
            error instanceof Error ? error.message : String(error)
        );

        onStream?.({ type: 'error', error: error as Error });
        throw error;
    }
}

/**
 * Convert timeframe string (like "1h", "5m", "1d") to KlineInterval enum
 */
function parseTimeframeToInterval(timeframe: string | undefined): KlineInterval {
    const normalizedTimeframe = timeframe?.toLowerCase().trim();

    switch (normalizedTimeframe) {
        case '1m':
        case '1min':
        case '1 minute':
            return KlineInterval.ONE_MINUTE;
        case '5m':
        case '5min':
        case '5 minutes':
            return KlineInterval.FIVE_MINUTES;
        case '15m':
        case '15min':
        case '15 minutes':
            return KlineInterval.FIFTEEN_MINUTES;
        case '1h':
        case '1hr':
        case '1 hour':
        case '60m':
            return KlineInterval.ONE_HOUR;
        case '4h':
        case '4hr':
        case '4 hours':
            return KlineInterval.FOUR_HOURS;
        case '1d':
        case '1day':
        case '1 day':
        case '24h':
            return KlineInterval.ONE_DAY;
        default:
            console.warn(`[parseTimeframeToInterval] Unknown timeframe "${timeframe}", defaulting to 5m`);
            return KlineInterval.FIVE_MINUTES;
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

        // Parse the timeframe from metadata (e.g., "1h", "5m") to KlineInterval
        const extractedInterval = parseTimeframeToInterval(metadata.timeframe);
        console.log(`[generateTrader] Extracted interval from metadata: ${metadata.timeframe} -> ${extractedInterval}`);

        // Step 2: Generate filter code (Go) using the extracted interval
        console.log('[generateTrader] Step 2: Generating Go filter code...');
        onStream?.({ type: 'progress', progress: 95 });

        const { filterCode, requiredTimeframes, language } = await generateFilterCode(
            metadata.conditions,
            modelName,
            extractedInterval // Use extracted interval instead of passed parameter
        );

        // Combine results
        const traderGeneration: TraderGeneration = {
            suggestedName: metadata.suggestedName,
            description: metadata.strategyInstructions, // Use strategy instructions as description
            filterCode: filterCode,
            filterDescription: metadata.conditions,
            strategyInstructions: metadata.strategyInstructions,
            indicators: metadata.indicators || [],
            riskParameters: metadata.riskParameters,
            requiredTimeframes: requiredTimeframes,
            language: language, // 'go' for all new traders
            interval: extractedInterval // Include the extracted interval from metadata
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
