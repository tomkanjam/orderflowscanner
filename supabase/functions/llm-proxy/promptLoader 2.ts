/**
 * Prompt Loader - Load prompts from Supabase
 *
 * Phase 1b: Loads prompts from Supabase `prompts` table
 * Phase 2: Will be replaced with Braintrust SDK
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export class PromptLoader {
  private supabaseUrl: string;
  private supabaseKey: string;
  private cache: Map<string, { content: string; cachedAt: number }>;
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.supabaseKey = supabaseKey;
    this.cache = new Map();
  }

  /**
   * Load a prompt by name from Supabase
   *
   * @param name - Prompt name (e.g., 'generate-trader-metadata', 'regenerate-filter-go')
   * @returns Prompt content string
   */
  async loadPrompt(name: string): Promise<string> {
    // Check cache first
    const cached = this.cache.get(name);
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      console.log(`[PromptLoader] Cache hit for prompt: ${name}`);
      return cached.content;
    }

    console.log(`[PromptLoader] Loading prompt from Supabase: ${name}`);

    try {
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

      // Cache the prompt
      this.cache.set(name, {
        content,
        cachedAt: Date.now()
      });

      console.log(`[PromptLoader] Successfully loaded prompt: ${name} (${content.length} chars)`);
      return content;

    } catch (error) {
      console.error(`[PromptLoader] Error loading prompt '${name}':`, error);
      throw error;
    }
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
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}
