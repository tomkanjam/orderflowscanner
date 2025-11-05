/**
 * Generate Filter Code Operation
 *
 * Generates Go filter code from trading conditions
 * Phase 2a: Integrated with Braintrust tracing
 */

import { traced } from "npm:braintrust@0.0.157";

export async function handleGenerateFilterCode(
  params: any,
  openRouterClient: any,
  promptLoader: any,
  config: any
): Promise<any> {
  return await traced(async (span) => {
    const { conditions, klineInterval } = params;

    // Log operation inputs to Braintrust
    span.log({
      input: { conditions, klineInterval },
      metadata: {
        operation: 'generate-filter-code',
        modelId: config.modelId,
        promptVersion: config.promptVersion,
        conditionCount: conditions?.length || 0
      }
    });

    if (!conditions || conditions.length === 0) {
      throw new Error('Missing required field: conditions');
    }

    if (!klineInterval) {
      throw new Error('Missing required field: klineInterval');
    }

    console.log(`[GenerateFilterCode] Generating filter for ${conditions.length} conditions`);

    // 1. Load prompt template (with version from config)
    const promptTemplate = await promptLoader.loadPrompt('regenerate-filter-go', config.promptVersion);

    // 2. Build prompt with variables
    const conditionsList = conditions.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n');
    const prompt = await promptLoader.loadPromptWithVariables('regenerate-filter-go', {
      conditions: conditionsList,
      klineInterval
    }, config.promptVersion);

    // 3. Call OpenRouter (using config for model selection)
    const result = await openRouterClient.generateStructuredResponse(prompt, {
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      modelName: config.modelId
    });

    // 4. Validate response
    if (!result.data.filterCode) {
      throw new Error('Missing filterCode in response');
    }

    if (!result.data.requiredTimeframes || !Array.isArray(result.data.requiredTimeframes)) {
      throw new Error('Missing or invalid requiredTimeframes in response');
    }

    // 5. Build response (include seriesCode and indicators for visualization)
    const filterResult = {
      filterCode: result.data.filterCode,
      seriesCode: result.data.seriesCode || '',          // NEW: For backend indicator calculation
      indicators: result.data.indicators || [],           // NEW: For chart rendering metadata
      requiredTimeframes: result.data.requiredTimeframes,
      language: 'go'
    };

    console.log(
      `[GenerateFilterCode] Successfully generated filter code (${result.data.filterCode.length} chars, ${result.tokensUsed} tokens, ${filterResult.indicators.length} indicators)`
    );

    // Log operation outputs to Braintrust
    span.log({
      output: filterResult,
      metrics: {
        total_tokens: result.tokensUsed,
        code_length: result.data.filterCode.length,
        series_code_length: result.data.seriesCode?.length || 0,
        indicator_count: filterResult.indicators.length,
        timeframes_count: result.data.requiredTimeframes.length
      }
    });

    return {
      data: filterResult,
      usage: { total_tokens: result.tokensUsed }
    };
  }, { name: "generate_filter_code", type: "task" });
}
