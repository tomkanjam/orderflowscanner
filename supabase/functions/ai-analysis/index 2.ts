import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AnalysisRequest, AnalysisResponse, TradePlan } from "./types.ts";
import { GeminiClient } from "./geminiClient.ts";
import { PromptBuilder } from "./promptBuilder.ts";
import { KeyLevelCalculator } from "./keyLevelCalculator.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-correlation-id',
};

// Initialize components (API key loaded from environment)
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const MODEL_NAME = 'gemini-2.5-flash'; // Fast model for low latency

const geminiClient = new GeminiClient(GEMINI_API_KEY, MODEL_NAME);
const promptBuilder = new PromptBuilder();
const keyLevelCalculator = new KeyLevelCalculator();

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const correlationId = req.headers.get('x-correlation-id') || crypto.randomUUID();
  const startTime = Date.now();

  // Health check endpoint (public - no auth required)
  if (req.method === 'GET' && req.url.endsWith('/health')) {
    return new Response(
      JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Validate authentication (required for all non-health endpoints)
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header');
    }

    // 2. Parse and validate request
    const request: AnalysisRequest = await req.json();

    if (!request.signalId || !request.symbol || !request.strategy) {
      throw new Error('Missing required fields: signalId, symbol, strategy');
    }

    console.log(`[${correlationId}] Analyzing signal ${request.signalId} for ${request.symbol}`);

    // 3. Build prompt with market data
    const prompt = promptBuilder.buildAnalysisPrompt(request);

    // 4. Call Gemini API for structured analysis
    const { analysis, tokensUsed, rawResponse } = await geminiClient.generateStructuredAnalysis(prompt);

    console.log(`[${correlationId}] Gemini analysis: ${analysis.decision} (confidence: ${analysis.confidence})`);

    // 5. Calculate key price levels
    const keyLevels = keyLevelCalculator.calculateKeyLevels(
      request.price,
      request.klines,
      request.calculatedIndicators,
      analysis.decision
    );

    // 6. Extract trade plan from analysis
    const tradePlan: TradePlan = analysis.tradePlan;

    // 7. Build complete response
    const response: AnalysisResponse = {
      signalId: request.signalId,
      decision: analysis.decision,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      keyLevels,
      tradePlan,
      technicalIndicators: analysis.technicalContext,
      metadata: {
        analysisLatencyMs: Date.now() - startTime,
        geminiTokensUsed: tokensUsed,
        modelName: MODEL_NAME,
        rawAiResponse: rawResponse
      }
    };

    console.log(`[${correlationId}] Analysis complete: ${response.decision} (${response.metadata.analysisLatencyMs}ms, ${tokensUsed} tokens)`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const latency = Date.now() - startTime;
    console.error(`[${correlationId}] Analysis failed after ${latency}ms:`, error);

    // Return safe default response
    const errorResponse: AnalysisResponse = {
      signalId: 'unknown',
      decision: 'bad_setup',
      confidence: 0,
      reasoning: 'Analysis failed due to technical error. Please review manually.',
      keyLevels: {
        entry: 0,
        stopLoss: 0,
        takeProfit: [],
        support: [],
        resistance: []
      },
      tradePlan: {
        setup: 'Analysis unavailable',
        execution: 'Analysis unavailable',
        invalidation: 'Analysis unavailable',
        riskReward: 0
      },
      technicalIndicators: {},
      metadata: {
        analysisLatencyMs: latency,
        geminiTokensUsed: 0,
        modelName: MODEL_NAME,
        rawAiResponse: ''
      },
      error: {
        code: 'ANALYSIS_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: true
      }
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
