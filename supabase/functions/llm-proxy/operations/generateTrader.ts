/**
 * Generate Trader Operation
 *
 * Full trader generation combining metadata + filter code with streaming
 * Phase 2a: Integrated with Braintrust tracing
 */

import { traced } from "npm:braintrust@0.0.157";
import { createSSEStream, sendProgress, sendMetadata, sendComplete } from "../streaming.ts";
import { handleGenerateTraderMetadata } from "./generateTraderMetadata.ts";
import { handleGenerateFilterCode } from "./generateFilterCode.ts";
import { getOperationConfig } from "../config/operations.ts";

export async function handleGenerateTrader(
  params: any,
  openRouterClient: any,
  promptLoader: any,
  stream = false,
  config: any
): Promise<any> {
  return await traced(async (span) => {
    const { userPrompt, klineInterval = '1h' } = params;

    // Log operation inputs to Braintrust
    span.log({
      input: { userPrompt, klineInterval, stream },
      metadata: {
        operation: 'generate-trader',
        modelId: config.modelId,
        promptVersion: config.promptVersion,
        streaming: stream
      }
    });

    if (!userPrompt) {
      throw new Error('Missing required field: userPrompt');
    }

    console.log(`[GenerateTrader] Starting full trader generation (streaming: ${stream})`);

    // If streaming requested, return SSE stream
    if (stream) {
      return createSSEStream(async (controller) => {
        let totalTokens = 0;

        // Step 1: Generate metadata
        sendProgress(controller, 10, 'Analyzing trading strategy...');
        const metadataConfig = getOperationConfig('generate-trader-metadata');
        const metadataResult = await handleGenerateTraderMetadata(
          { userPrompt },
          openRouterClient,
          promptLoader,
          false,
          metadataConfig
        );
        totalTokens += metadataResult.usage.total_tokens;
        sendProgress(controller, 40, 'Trader metadata generated');

        // Send metadata events
        const metadata = metadataResult.data;
        if (metadata.suggestedName) {
          sendMetadata(controller, 'name', metadata.suggestedName);
        }
        if (metadata.conditions) {
          metadata.conditions.forEach((condition: string, idx: number) => {
            sendMetadata(controller, 'condition', { index: idx, value: condition });
          });
        }
        if (metadata.strategyInstructions) {
          sendMetadata(controller, 'strategy', metadata.strategyInstructions);
        }

        // Step 2: Generate filter code
        sendProgress(controller, 50, 'Generating filter code...');
        const filterConfig = getOperationConfig('generate-filter-code');
        const filterResult = await handleGenerateFilterCode(
          { conditions: metadata.conditions, klineInterval },
          openRouterClient,
          promptLoader,
          filterConfig
        );
        totalTokens += filterResult.usage.total_tokens;
        sendProgress(controller, 90, 'Filter code generated');

        // Send filter metadata
        sendMetadata(controller, 'filterCode', filterResult.data.filterCode);
        sendMetadata(controller, 'requiredTimeframes', filterResult.data.requiredTimeframes);

        // Step 3: Combine results
        const result = {
          metadata: metadataResult.data,
          filterCode: filterResult.data,
          tokensUsed: totalTokens
        };

        // Log streaming result to Braintrust
        span.log({
          output: result,
          metrics: {
            total_tokens: totalTokens,
            metadata_tokens: metadataResult.usage.total_tokens,
            filter_tokens: filterResult.usage.total_tokens,
            conditions_count: metadata.conditions?.length || 0
          }
        });

        sendProgress(controller, 100, 'Trader generation complete');
        sendComplete(controller, result);
      });
    }

    // Non-streaming path
    let totalTokens = 0;

    // Step 1: Generate metadata
    console.log('[GenerateTrader] Step 1: Generating metadata...');
    const metadataConfig = getOperationConfig('generate-trader-metadata');
    const metadataResult = await handleGenerateTraderMetadata(
      { userPrompt },
      openRouterClient,
      promptLoader,
      false,
      metadataConfig
    );
    totalTokens += metadataResult.usage.total_tokens;

    // Step 2: Generate filter code
    console.log('[GenerateTrader] Step 2: Generating filter code...');
    const filterConfig = getOperationConfig('generate-filter-code');
    const filterResult = await handleGenerateFilterCode(
      { conditions: metadataResult.data.conditions, klineInterval },
      openRouterClient,
      promptLoader,
      filterConfig
    );
    totalTokens += filterResult.usage.total_tokens;

    // Step 3: Combine results
    const result = {
      metadata: metadataResult.data,
      filterCode: filterResult.data,
      tokensUsed: totalTokens
    };

    console.log(`[GenerateTrader] Successfully generated trader (${totalTokens} tokens total)`);

    // Log operation outputs to Braintrust
    span.log({
      output: result,
      metrics: {
        total_tokens: totalTokens,
        metadata_tokens: metadataResult.usage.total_tokens,
        filter_tokens: filterResult.usage.total_tokens,
        conditions_count: metadataResult.data.conditions?.length || 0
      }
    });

    return {
      data: result,
      usage: { total_tokens: totalTokens }
    };
  }, { name: "generate_trader", type: "task" });
}
