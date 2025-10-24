/**
 * OpenRouterClient - OpenRouter REST API integration for Deno Edge Functions
 * Unified client for all LLM operations via OpenRouter
 *
 * Phase 2a: Integrated with Braintrust for tracing and observability
 */

import { traced } from "npm:braintrust@0.0.157";

export class OpenRouterClient {
  private apiKey: string;
  private modelName: string;
  private baseUrl = "https://openrouter.ai/api/v1";
  private appUrl: string;
  private appName: string;

  constructor(
    apiKey: string,
    modelName = 'google/gemini-2.5-flash',
    appUrl = 'https://vyx.app',
    appName = 'vyx.app'
  ) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.appUrl = appUrl;
    this.appName = appName;
  }

  /**
   * Make a chat completion request (non-streaming)
   *
   * @param messages - Array of conversation messages
   * @param options - Additional options (temperature, max_tokens, etc.)
   * @returns Response with content and token usage
   */
  async chat(messages: any[], options: any = {}): Promise<any> {
    return await traced(async (span) => {
      const requestBody = {
        model: options.modelName || this.modelName,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2048,
        ...(options.response_format && { response_format: options.response_format })
      };

      // Log request to Braintrust
      span.log({
        input: messages,
        metadata: {
          model: requestBody.model,
          temperature: requestBody.temperature,
          max_tokens: requestBody.max_tokens,
          response_format: requestBody.response_format?.type
        }
      });

      const response = await this.makeRequest(requestBody);
      const openRouterResponse = await response.json();

      if (!openRouterResponse.choices || openRouterResponse.choices.length === 0) {
        throw new Error('OpenRouter API returned no choices');
      }

      const choice = openRouterResponse.choices[0];
      if (!choice.message || !choice.message.content) {
        throw new Error('OpenRouter API returned invalid choice structure');
      }

      const content = choice.message.content;
      const tokensUsed = openRouterResponse.usage?.total_tokens || 0;

      // Log response to Braintrust
      span.log({
        output: content,
        metrics: {
          prompt_tokens: openRouterResponse.usage?.prompt_tokens || 0,
          completion_tokens: openRouterResponse.usage?.completion_tokens || 0,
          total_tokens: tokensUsed
        }
      });

      return {
        content,
        usage: { total_tokens: tokensUsed },
        rawResponse: content
      };
    }, { name: "openrouter_chat", type: "llm" });
  }

  /**
   * Make a streaming chat completion request
   *
   * @param messages - Array of conversation messages
   * @param options - Additional options
   * @returns Async generator yielding content chunks
   */
  async *chatStream(messages: any[], options: any = {}): AsyncGenerator<string> {
    const requestBody = {
      model: options.modelName || this.modelName,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 2048,
      stream: true
    };

    const response = await this.makeRequest(requestBody);

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') {
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const jsonStr = trimmed.substring(6);
              const chunk = JSON.parse(jsonStr);
              const delta = chunk.choices[0]?.delta;

              if (delta?.content) {
                yield delta.content;
              }
            } catch (e) {
              console.error('[OpenRouterClient] Failed to parse stream chunk:', e);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Generate structured response with retry logic
   *
   * @param prompt - Complete prompt text
   * @param options - Additional options
   * @returns Parsed JSON response with token usage
   */
  async generateStructuredResponse(prompt: string, options: any = {}): Promise<any> {
    const maxRetries = options.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log(`[OpenRouterClient] Retry attempt ${attempt + 1}/${maxRetries} after ${backoffMs}ms`);
          await this.delay(backoffMs);
        }

        const result = await this.chat([{ role: 'user', content: prompt }], {
          ...options,
          response_format: { type: 'json_object' }
        });

        // Parse JSON response
        let data;
        try {
          data = JSON.parse(result.content);
        } catch (parseError) {
          // Try to extract JSON from markdown code blocks
          const jsonMatch = result.content.match(/```json\n([\s\S]*?)\n```/);
          if (jsonMatch) {
            data = JSON.parse(jsonMatch[1]);
          } else {
            throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
          }
        }

        return {
          data,
          tokensUsed: result.usage.total_tokens,
          rawResponse: result.rawResponse
        };

      } catch (error) {
        lastError = error as Error;
        console.error(`[OpenRouterClient] Error on attempt ${attempt + 1}:`, error instanceof Error ? error.message : 'Unknown error');

        if (attempt === maxRetries - 1) {
          break;
        }
      }
    }

    throw new Error(`OpenRouter API failed after ${maxRetries} attempts. Last error: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Make HTTP request to OpenRouter API with error handling
   */
  private async makeRequest(requestBody: any): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const url = `${this.baseUrl}/chat/completions`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.appUrl,
          'X-Title': this.appName
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle rate limit errors
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        console.warn(`[OpenRouterClient] Rate limited. Waiting ${waitMs}ms before retry.`);
        await this.delay(waitMs);
        return this.makeRequest(requestBody); // Recursive retry
      }

      // Handle other HTTP errors
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
      }

      return response;

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout (30s)');
      }
      throw error;
    }
  }

  /**
   * Helper function for async delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
