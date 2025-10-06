/**
 * GeminiClient - Direct Gemini REST API integration for Deno Edge Functions
 * Handles structured analysis generation with retry logic and timeout
 */

import { GeminiRequest, GeminiResponse, GeminiAnalysis } from "./types.ts";

export class GeminiClient {
  private apiKey: string;
  private modelName: string;
  private baseUrl = "https://generativelanguage.googleapis.com/v1/models";

  constructor(apiKey: string, modelName: string = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.modelName = modelName;
  }

  /**
   * Generate structured trading analysis from Gemini API
   *
   * @param prompt - Complete prompt with market data and instructions
   * @param maxRetries - Maximum retry attempts (default: 3)
   * @returns Structured analysis with token usage and raw response
   */
  async generateStructuredAnalysis(
    prompt: string,
    maxRetries: number = 3
  ): Promise<{ analysis: GeminiAnalysis; tokensUsed: number; rawResponse: string }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Calculate backoff delay (exponential: 2s, 4s, 8s)
        if (attempt > 0) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log(`[GeminiClient] Retry attempt ${attempt + 1}/${maxRetries} after ${backoffMs}ms`);
          await this.delay(backoffMs);
        }

        // Prepare request payload
        const requestBody: GeminiRequest = {
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.3, // Lower temperature for more consistent trading analysis
            maxOutputTokens: 2048
          }
        };

        // Make API call with 20-second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const url = `${this.baseUrl}/${this.modelName}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Handle rate limit errors with longer backoff
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
          console.warn(`[GeminiClient] Rate limited. Waiting ${waitMs}ms before retry.`);
          await this.delay(waitMs);
          continue; // Retry without counting against maxRetries
        }

        // Handle other HTTP errors
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        // Parse response
        const geminiResponse: GeminiResponse = await response.json();

        // Validate response structure
        if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
          throw new Error('Gemini API returned no candidates');
        }

        const candidate = geminiResponse.candidates[0];

        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
          throw new Error('Gemini API returned invalid candidate structure');
        }

        // Extract and parse JSON response
        const rawResponse = candidate.content.parts[0].text;
        let analysis: GeminiAnalysis;

        try {
          analysis = JSON.parse(rawResponse);
        } catch (parseError) {
          throw new Error(`Failed to parse Gemini JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        }

        // Validate required fields in parsed analysis
        this.validateAnalysis(analysis);

        // Extract token usage
        const tokensUsed = geminiResponse.usageMetadata?.totalTokenCount || 0;

        console.log(`[GeminiClient] Analysis generated successfully. Tokens used: ${tokensUsed}`);

        return {
          analysis,
          tokensUsed,
          rawResponse
        };

      } catch (error) {
        lastError = error as Error;

        // Log error details
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            console.error(`[GeminiClient] Request timeout (20s) on attempt ${attempt + 1}`);
          } else {
            console.error(`[GeminiClient] Error on attempt ${attempt + 1}:`, error.message);
          }
        }

        // Don't retry if this is the last attempt
        if (attempt === maxRetries - 1) {
          break;
        }
      }
    }

    // All retries exhausted
    throw new Error(
      `Gemini API failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Validate that the parsed analysis contains all required fields
   */
  private validateAnalysis(analysis: any): asserts analysis is GeminiAnalysis {
    const requiredFields = ['decision', 'confidence', 'reasoning', 'tradePlan', 'technicalContext'];
    const missingFields = requiredFields.filter(field => !(field in analysis));

    if (missingFields.length > 0) {
      throw new Error(`Gemini analysis missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate decision enum
    const validDecisions = ['enter_trade', 'bad_setup', 'wait'];
    if (!validDecisions.includes(analysis.decision)) {
      throw new Error(`Invalid decision: ${analysis.decision}. Must be one of: ${validDecisions.join(', ')}`);
    }

    // Validate confidence range
    if (typeof analysis.confidence !== 'number' || analysis.confidence < 0 || analysis.confidence > 100) {
      throw new Error(`Invalid confidence: ${analysis.confidence}. Must be a number between 0 and 100`);
    }

    // Validate tradePlan structure
    const requiredTradePlanFields = ['setup', 'execution', 'invalidation', 'riskReward'];
    const missingTradePlanFields = requiredTradePlanFields.filter(
      field => !(field in analysis.tradePlan)
    );

    if (missingTradePlanFields.length > 0) {
      throw new Error(
        `Gemini tradePlan missing required fields: ${missingTradePlanFields.join(', ')}`
      );
    }
  }

  /**
   * Helper function for async delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
