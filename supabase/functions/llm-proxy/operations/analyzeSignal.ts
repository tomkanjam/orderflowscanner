/**
 * Analyze Signal Operation
 *
 * Analyzes trading signals with AI to generate trade decisions
 * Phase 2a: Integrated with Braintrust tracing
 */

import { traced } from "npm:braintrust@0.0.157";

export async function handleAnalyzeSignal(
  params: any,
  openRouterClient: any,
  promptLoader: any,
  config: any
): Promise<any> {
  return await traced(async (span) => {
    const { signalId, symbol, traderId, userId, timestamp, price, strategy } = params;

    // Log operation inputs to Braintrust
    span.log({
      input: { signalId, symbol, traderId, price, strategy },
      metadata: {
        operation: 'analyze-signal',
        modelId: config.modelId,
        promptVersion: config.promptVersion,
        userId,
        timestamp
      }
    });

    // Validate required fields
    if (!signalId || !symbol || !strategy) {
      throw new Error('Missing required fields: signalId, symbol, strategy');
    }

    console.log(`[AnalyzeSignal] Analyzing signal ${signalId} for ${symbol}`);

    // 1. Load prompt template from Braintrust
    const promptTemplate = await promptLoader.loadPrompt('analyze-signal');

    // 2. Build prompt with variables
    const strategyInstructions = typeof strategy === 'object'
      ? strategy.instructions || JSON.stringify(strategy)
      : strategy;

    const prompt = await promptLoader.loadPromptWithVariables('analyze-signal', {
      symbol,
      price: price?.toString() || 'unknown',
      strategy: strategyInstructions,
      timestamp: timestamp || new Date().toISOString()
    });

    // 3. Call OpenRouter with structured response format
    const result = await openRouterClient.generateStructuredResponse(prompt, {
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      modelName: config.modelId
    });

    // 4. Validate response structure
    if (!result.data.decision) {
      throw new Error('Missing decision in response');
    }

    if (!['enter_trade', 'bad_setup', 'wait'].includes(result.data.decision)) {
      throw new Error(`Invalid decision: ${result.data.decision}`);
    }

    if (typeof result.data.confidence !== 'number' || result.data.confidence < 0 || result.data.confidence > 100) {
      throw new Error(`Invalid confidence: ${result.data.confidence}`);
    }

    if (!result.data.reasoning) {
      throw new Error('Missing reasoning in response');
    }

    // 5. Build response with default values for missing fields
    const analysisResult = {
      signalId,
      decision: result.data.decision,
      confidence: result.data.confidence,
      reasoning: result.data.reasoning,
      keyLevels: result.data.keyLevels || {
        entry: price || 0,
        stopLoss: 0,
        takeProfit: [],
        support: [],
        resistance: []
      },
      tradePlan: result.data.tradePlan || {
        setup: result.data.reasoning,
        execution: 'Manual execution required',
        invalidation: 'Analysis inconclusive',
        riskReward: 0
      },
      technicalIndicators: result.data.technicalContext || {},
      metadata: {
        analysisLatencyMs: 0, // Will be calculated by caller
        tokensUsed: result.tokensUsed,
        modelName: config.modelId,
        rawAiResponse: result.rawResponse
      }
    };

    console.log(
      `[AnalyzeSignal] Analysis complete: ${analysisResult.decision} (confidence: ${analysisResult.confidence}, ${result.tokensUsed} tokens)`
    );

    // Log operation outputs to Braintrust
    span.log({
      output: analysisResult,
      metrics: {
        total_tokens: result.tokensUsed,
        confidence: analysisResult.confidence
      }
    });

    // Store analysis in signal_analyses table
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseKey) {
      try {
        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/signal_analyses`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            signal_id: signalId,
            trader_id: traderId,
            user_id: userId,
            decision: analysisResult.decision,
            confidence: analysisResult.confidence,
            reasoning: analysisResult.reasoning,
            key_levels: analysisResult.keyLevels,
            trade_plan: analysisResult.tradePlan,
            technical_indicators: analysisResult.technicalIndicators,
            raw_ai_response: analysisResult.metadata.rawAiResponse,
            analysis_latency_ms: analysisResult.metadata.analysisLatencyMs,
            gemini_tokens_used: analysisResult.metadata.tokensUsed,
            model_name: analysisResult.metadata.modelName
          })
        });

        if (!insertResponse.ok) {
          const errorText = await insertResponse.text();
          console.error(`[AnalyzeSignal] Failed to store analysis: ${errorText}`);
        } else {
          console.log(`[AnalyzeSignal] Analysis stored for signal ${signalId}`);
        }
      } catch (dbError) {
        console.error(`[AnalyzeSignal] Database error:`, dbError);
      }
    } else {
      console.warn('[AnalyzeSignal] Missing Supabase credentials - analysis not stored');
    }

    return {
      data: analysisResult,
      usage: { total_tokens: result.tokensUsed }
    };
  }, { name: "analyze_signal", type: "task" });
}
