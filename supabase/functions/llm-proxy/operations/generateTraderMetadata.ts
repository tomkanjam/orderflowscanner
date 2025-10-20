/**
 * Generate Trader Metadata Operation
 *
 * Generates trader metadata from user description with streaming support
 * Phase 2a: Integrated with Braintrust tracing
 */

import { traced } from "npm:braintrust@0.0.157";
import { createSSEStream, sendProgress, sendMetadata, sendComplete, streamOpenRouterChunks } from "../streaming.ts";

export async function handleGenerateTraderMetadata(
  params: any,
  openRouterClient: any,
  promptLoader: any,
  stream = false,
  config: any
): Promise<any> {
  return await traced(async (span) => {
    const { userPrompt } = params;

    // Log operation inputs to Braintrust
    span.log({
      input: { userPrompt, stream },
      metadata: {
        operation: 'generate-trader-metadata',
        modelId: config.modelId,
        promptVersion: config.promptVersion,
        streaming: stream
      }
    });

    if (!userPrompt) {
      throw new Error('Missing required field: userPrompt');
    }

    console.log(`[GenerateTraderMetadata] Generating metadata for user prompt (streaming: ${stream})`);

    // Load prompt template
    const prompt = await promptLoader.loadPromptWithVariables('generate-trader-metadata', {
      userDescription: userPrompt
    });

    // If streaming requested, return SSE stream
    if (stream) {
      return createSSEStream(async (controller) => {
        sendProgress(controller, 10, 'Analyzing trading strategy...');

        // Stream the response (using config for model selection)
        const streamGen = openRouterClient.chatStream([{ role: 'user', content: prompt }], {
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          modelName: config.modelId
        });

        sendProgress(controller, 30, 'Generating trader metadata...');

        // Collect streamed content
        const fullContent = await streamOpenRouterChunks(controller, streamGen);

        sendProgress(controller, 80, 'Parsing metadata...');

        // Parse the complete response
        let metadata;
        try {
          metadata = JSON.parse(fullContent);
        } catch (parseError) {
          // Try to extract JSON from markdown
          const jsonMatch = fullContent.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            metadata = JSON.parse(jsonMatch[1]);
          } else {
            throw new Error('Failed to parse metadata JSON');
          }
        }

        // Validate metadata
        validateMetadata(metadata);

        sendProgress(controller, 100, 'Metadata generated successfully');

        // Send individual metadata fields as events
        if (metadata.suggestedName) {
          sendMetadata(controller, 'name', metadata.suggestedName);
        }
        if (metadata.category) {
          sendMetadata(controller, 'category', metadata.category);
        }
        if (metadata.conditions) {
          metadata.conditions.forEach((condition: string, idx: number) => {
            sendMetadata(controller, 'condition', { index: idx, value: condition });
          });
        }
        if (metadata.strategyInstructions) {
          sendMetadata(controller, 'strategy', metadata.strategyInstructions);
        }

        // Log streaming result to Braintrust
        span.log({
          output: metadata,
          metrics: {
            conditions_count: metadata.conditions?.length || 0,
            expected_win_rate: metadata.expectedWinRate || 0
          }
        });

        // Send complete event
        sendComplete(controller, metadata);
      });
    }

    // Non-streaming path (using config for model selection)
    const result = await openRouterClient.generateStructuredResponse(prompt, {
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      modelName: config.modelId
    });

    // Validate metadata
    validateMetadata(result.data);

    console.log(`[GenerateTraderMetadata] Successfully generated metadata (${result.tokensUsed} tokens)`);

    // Log operation outputs to Braintrust
    span.log({
      output: result.data,
      metrics: {
        total_tokens: result.tokensUsed,
        conditions_count: result.data.conditions?.length || 0,
        expected_win_rate: result.data.expectedWinRate || 0
      }
    });

    return {
      data: result.data,
      usage: { total_tokens: result.tokensUsed }
    };
  }, { name: "generate_trader_metadata", type: "task" });
}

/**
 * Validate trader metadata structure
 */
function validateMetadata(metadata: any): void {
  const requiredFields = [
    'suggestedName',
    'category',
    'conditions',
    'strategyInstructions',
    'timeframe',
    'riskLevel'
  ];

  const missingFields = requiredFields.filter(field => !(field in metadata));

  if (missingFields.length > 0) {
    throw new Error(`Metadata missing required fields: ${missingFields.join(', ')}`);
  }

  if (!Array.isArray(metadata.conditions)) {
    throw new Error('conditions must be an array');
  }

  if (metadata.conditions.length === 0) {
    throw new Error('conditions array cannot be empty');
  }

  if (typeof metadata.expectedWinRate !== 'undefined') {
    if (
      typeof metadata.expectedWinRate !== 'number' ||
      metadata.expectedWinRate < 0 ||
      metadata.expectedWinRate > 100
    ) {
      throw new Error('expectedWinRate must be a number between 0 and 100');
    }
  }
}
