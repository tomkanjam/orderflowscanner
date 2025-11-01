/**
 * Prompt Loader V2 - Braintrust REST API Integration
 *
 * Phase 3: Uses Braintrust REST API directly (NO SDK, NO FALLBACK)
 *
 * Architecture:
 * 1. Load from Braintrust REST API only
 * 2. Cache prompts in memory (5-minute TTL)
 * 3. Throw error if prompt not found (no fallback)
 *
 * Why REST API instead of SDK:
 * - Braintrust SDK cannot find prompts created via REST API
 * - SDK and REST API use different backends/metadata
 * - Direct REST API calls are more reliable and debuggable
 */

export class PromptLoaderV2 {
  private braintrustApiKey: string;
  private braintrustProjectId: string;
  private cache: Map<string, { content: string; cachedAt: number }>;
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    braintrustApiKey: string,
    braintrustProjectId: string
  ) {
    this.braintrustApiKey = braintrustApiKey;
    this.braintrustProjectId = braintrustProjectId;
    this.cache = new Map();

    if (!this.braintrustApiKey) {
      throw new Error('BRAINTRUST_API_KEY is required');
    }

    if (!this.braintrustProjectId) {
      throw new Error('BRAINTRUST_PROJECT_ID is required');
    }

    console.log(`[PromptLoaderV2] Initialized with project ID: ${this.braintrustProjectId}`);
    console.log(`[PromptLoaderV2] API key length: ${this.braintrustApiKey.length} chars`);
  }

  /**
   * Load a prompt by name from Braintrust REST API
   *
   * NO FALLBACK - throws error if prompt not found
   *
   * @param slug - Prompt slug (e.g., 'regenerate-filter-go', 'generate-trader-metadata')
   * @returns Prompt content string
   */
  async loadPrompt(slug: string): Promise<string> {
    // Check cache first
    const cached = this.cache.get(slug);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      console.log(`[PromptLoader] Cache hit for prompt: ${slug}`);
      return cached.content;
    }

    console.log(`[PromptLoader] Loading prompt from Braintrust: ${slug}`);

    const content = await this.loadFromBraintrustAPI(slug);

    // Cache the prompt
    this.cache.set(slug, {
      content,
      cachedAt: Date.now()
    });

    console.log(`[PromptLoader] Loaded from Braintrust: ${slug} (${content.length} chars)`);
    return content;
  }

  /**
   * Load prompt from Braintrust REST API
   *
   * Uses direct REST API call instead of SDK to avoid SDK/REST disconnect issue
   */
  private async loadFromBraintrustAPI(slug: string): Promise<string> {
    const url = `https://api.braintrust.dev/v1/prompt?project_id=${this.braintrustProjectId}&slug=${slug}`;

    console.log(`[PromptLoader] Fetching from Braintrust REST API: ${slug}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.braintrustApiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Braintrust API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json();

    // Response format: { objects: [...] }
    if (!data.objects || data.objects.length === 0) {
      throw new Error(`Prompt '${slug}' not found in Braintrust project`);
    }

    const promptObject = data.objects[0];

    // Extract content from prompt_data structure
    if (!promptObject.prompt_data || !promptObject.prompt_data.prompt) {
      throw new Error(`Prompt '${slug}' has invalid structure - missing prompt_data.prompt`);
    }

    const promptData = promptObject.prompt_data.prompt;

    // Handle different prompt formats
    if (promptData.type === 'completion' && promptData.content) {
      console.log(`[PromptLoader] Found completion-type prompt (${promptData.content.length} chars)`);
      return promptData.content;
    }

    if (promptData.type === 'chat' && Array.isArray(promptData.messages)) {
      console.log(`[PromptLoader] Found chat-type prompt (${promptData.messages.length} messages)`);
      return promptData.messages.map((msg: any) => msg.content || '').join('\n\n');
    }

    if (typeof promptData === 'string') {
      console.log(`[PromptLoader] Found string-type prompt (${promptData.length} chars)`);
      return promptData;
    }

    throw new Error(
      `Prompt '${slug}' has unsupported format. Type: ${promptData.type}, Keys: ${Object.keys(promptData).join(', ')}`
    );
  }

  /**
   * Load a prompt and replace variables with provided values
   *
   * @param slug - Prompt slug
   * @param variables - Object with variable replacements (e.g., {conditions: '...', klineInterval: '1h'})
   * @returns Prompt with variables replaced
   */
  async loadPromptWithVariables(slug: string, variables: Record<string, string>): Promise<string> {
    let prompt = await this.loadPrompt(slug);

    // Replace all {{variable}} placeholders
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      prompt = prompt.replace(new RegExp(placeholder, 'g'), value);
    }

    return prompt;
  }

  /**
   * Clear the prompt cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[PromptLoader] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}
