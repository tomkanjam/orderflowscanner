/**
 * Prompt Loader V2 - Braintrust Integration with Supabase Fallback
 *
 * Phase 2b: Uses Braintrust SDK for prompt management with Supabase fallback
 *
 * Architecture:
 * 1. Try loading from Braintrust (if configured)
 * 2. Fall back to Supabase prompts table
 * 3. Cache prompts in memory (5-minute TTL)
 */

import { loadPrompt } from "npm:braintrust@0.0.157";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export class PromptLoaderV2 {
  private supabaseUrl: string;
  private supabaseKey: string;
  private braintrustProjectName: string;
  private cache: Map<string, { content: string; cachedAt: number; source: 'braintrust' | 'supabase' }>;
  private cacheTTL = 5 * 60 * 1000; // 5 minutes
  private useBraintrust: boolean;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    braintrustProjectName = 'AI Trader',
    useBraintrust = true
  ) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.braintrustProjectName = braintrustProjectName;
    this.cache = new Map();
    this.useBraintrust = useBraintrust;
  }

  /**
   * Load a prompt by name
   *
   * Tries Braintrust first, falls back to Supabase
   *
   * @param name - Prompt slug/name (e.g., 'regenerate-filter-go', 'generate-trader-metadata')
   * @returns Prompt content string
   */
  async loadPrompt(name: string): Promise<string> {
    // Check cache first
    const cached = this.cache.get(name);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      console.log(`[PromptLoader] Cache hit for prompt: ${name} (source: ${cached.source})`);
      return cached.content;
    }

    console.log(`[PromptLoader] Loading prompt: ${name}`);

    // Try Braintrust first (if enabled)
    if (this.useBraintrust) {
      try {
        const content = await this.loadFromBraintrust(name);
        if (content) {
          // Cache the prompt
          this.cache.set(name, {
            content,
            cachedAt: Date.now(),
            source: 'braintrust'
          });
          console.log(`[PromptLoader] Loaded from Braintrust: ${name} (${content.length} chars)`);
          return content;
        }
      } catch (error) {
        console.warn(
          `[PromptLoader] Braintrust load failed for '${name}', falling back to Supabase:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    // Fall back to Supabase
    try {
      const content = await this.loadFromSupabase(name);

      // Cache the prompt
      this.cache.set(name, {
        content,
        cachedAt: Date.now(),
        source: 'supabase'
      });

      console.log(`[PromptLoader] Loaded from Supabase: ${name} (${content.length} chars)`);
      return content;
    } catch (error) {
      console.error(`[PromptLoader] Failed to load prompt '${name}' from both sources:`, error);
      throw error;
    }
  }

  /**
   * Load prompt from Braintrust
   *
   * Note: Prompts must be created in Braintrust UI first
   */
  private async loadFromBraintrust(slug: string): Promise<string | null> {
    try {
      // Load prompt from Braintrust
      // The SDK handles caching automatically (memory + disk)
      const prompt = await loadPrompt({
        projectName: this.braintrustProjectName,
        slug
      });

      // Braintrust prompts return structured data
      // We need to extract the text content
      if (prompt && typeof prompt === 'object') {
        // Check if it has messages array (chat format)
        if ('messages' in prompt && Array.isArray(prompt.messages)) {
          // Combine all messages into single string
          return prompt.messages.map((msg: any) => msg.content || '').join('\n\n');
        }

        // Check if it has a prompt field (string format)
        if ('prompt' in prompt && typeof prompt.prompt === 'string') {
          return prompt.prompt;
        }

        // If we can't extract content, return null to trigger fallback
        console.warn(`[PromptLoader] Braintrust prompt '${slug}' has unexpected format`);
        return null;
      }

      return null;
    } catch (error) {
      // Return null to trigger fallback (don't throw)
      return null;
    }
  }

  /**
   * Load prompt from Supabase (fallback)
   */
  private async loadFromSupabase(name: string): Promise<string> {
    const supabase = createClient(this.supabaseUrl, this.supabaseKey);

    const { data, error } = await supabase
      .from('prompts')
      .select('system_instruction, user_prompt_template')
      .eq('id', name)
      .single();

    if (error) {
      throw new Error(`Failed to load prompt '${name}': ${error.message}`);
    }

    if (!data) {
      throw new Error(`Prompt '${name}' not found in database`);
    }

    // Combine system_instruction and user_prompt_template (if exists)
    const content = data.user_prompt_template
      ? `${data.system_instruction}\n\n${data.user_prompt_template}`
      : data.system_instruction;

    return content;
  }

  /**
   * Load a prompt and replace variables with provided values
   *
   * @param name - Prompt name
   * @param variables - Object with variable replacements (e.g., {conditions: '...', klineInterval: '1h'})
   * @returns Prompt with variables replaced
   */
  async loadPromptWithVariables(name: string, variables: Record<string, string>): Promise<string> {
    let prompt = await this.loadPrompt(name);

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
  getCacheStats(): { size: number; keys: string[]; sources: { braintrust: number; supabase: number } } {
    const sources = { braintrust: 0, supabase: 0 };

    for (const cached of this.cache.values()) {
      sources[cached.source]++;
    }

    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      sources
    };
  }

  /**
   * Enable or disable Braintrust
   */
  setBraintrustEnabled(enabled: boolean): void {
    this.useBraintrust = enabled;
    console.log(`[PromptLoader] Braintrust ${enabled ? 'enabled' : 'disabled'}`);
  }
}
