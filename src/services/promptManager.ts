import { supabase, isSupabaseConfigured } from '../config/supabase';

export interface PromptTemplate {
  id: string;
  name: string;
  category: 'screener' | 'analysis' | 'trader';
  description: string;
  systemInstruction: string;
  userPromptTemplate?: string;
  parameters?: string[];
  lastModified: Date;
  version: number;
  isActive?: boolean;
}

export interface PromptOverride {
  id: string;
  prompt_id: string;
  content: string;
  created_at: string;
  created_by: string;
  is_active: boolean;
  version: number;
}

// Default prompts extracted from geminiService.ts
const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: 'filter-and-chart-config',
    name: 'Filter and Chart Config',
    category: 'screener',
    description: 'Main screener filter generation - converts natural language to screening filters',
    systemInstruction: `You are an AI assistant for a crypto screener. The user provides a description of technical conditions. You MUST return a single, valid JSON object with three properties: "description", "screenerCode", and "indicators". Do not include any text outside of this JSON object.

description: An array of human-readable strings explaining each condition the AI has implemented. Max 3-4 concise conditions.

screenerCode: A string containing the body of a JavaScript function \`(ticker, klines, helpers, hvnNodes)\` that returns a boolean (true if conditions met, false otherwise).`,
    parameters: ['userPrompt', 'modelName', 'klineInterval', 'klineLimit'],
    lastModified: new Date(),
    version: 1,
    isActive: true
  },
  {
    id: 'structured-analysis',
    name: 'Structured Analysis',
    category: 'analysis',
    description: 'Analyzes a specific symbol for trading decisions',
    systemInstruction: `Analyze this {symbol} setup and provide a structured JSON response with your trading decision.`,
    parameters: ['symbol', 'ticker', 'klines', 'indicators', 'position'],
    lastModified: new Date(),
    version: 1,
    isActive: true
  },
  {
    id: 'symbol-analysis',
    name: 'Symbol Analysis',
    category: 'analysis', 
    description: 'Provides detailed technical analysis for a symbol',
    systemInstruction: `Provide your expert technical analysis for {symbol}. Consider the current market conditions, technical indicators, and price action.`,
    parameters: ['symbol', 'ticker', 'klines', 'indicators', 'position'],
    lastModified: new Date(),
    version: 1,
    isActive: true
  },
  {
    id: 'regenerate-filter',
    name: 'Regenerate Filter Code',
    category: 'screener',
    description: 'Converts human-readable conditions back into JavaScript filter code',
    systemInstruction: `You are an AI assistant that converts human-readable trading conditions into JavaScript code. Generate ONLY the JavaScript function body.`,
    parameters: ['conditions'],
    lastModified: new Date(),
    version: 1,
    isActive: true
  },
  {
    id: 'generate-trader',
    name: 'Generate Trader',
    category: 'trader',
    description: 'Creates complete trading systems with filters and strategy',
    systemInstruction: `You are an AI assistant that creates complete cryptocurrency trading systems. Generate a comprehensive trading system based on the user's requirements.`,
    parameters: ['userPrompt', 'modelName', 'klineInterval'],
    lastModified: new Date(),
    version: 1,
    isActive: true
  }
];

class PromptManager {
  private promptCache: Map<string, PromptTemplate> = new Map();
  private overridesCache: Map<string, PromptOverride> = new Map();
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    
    // Load default prompts
    DEFAULT_PROMPTS.forEach(prompt => {
      this.promptCache.set(prompt.id, prompt);
    });

    // Load overrides from Supabase if configured
    if (isSupabaseConfigured()) {
      await this.loadOverrides();
    }

    this.initialized = true;
  }

  private async loadOverrides() {
    try {
      const { data, error } = await supabase!
        .from('prompt_overrides')
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('Failed to load prompt overrides:', error);
        return;
      }

      if (data) {
        data.forEach((override: PromptOverride) => {
          this.overridesCache.set(override.prompt_id, override);
          
          // Apply override to cached prompt
          const prompt = this.promptCache.get(override.prompt_id);
          if (prompt) {
            prompt.systemInstruction = override.content;
            prompt.version = override.version;
            prompt.lastModified = new Date(override.created_at);
          }
        });
      }
    } catch (error) {
      console.error('Error loading prompt overrides:', error);
    }
  }

  async getAllPrompts(): Promise<PromptTemplate[]> {
    await this.initialize();
    return Array.from(this.promptCache.values());
  }

  async getPrompt(id: string): Promise<PromptTemplate | null> {
    await this.initialize();
    return this.promptCache.get(id) || null;
  }

  async getPromptContent(id: string): Promise<string | null> {
    const prompt = await this.getPrompt(id);
    return prompt?.systemInstruction || null;
  }

  async savePromptOverride(
    promptId: string, 
    content: string, 
    userEmail: string
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) {
      console.warn('Supabase not configured, saving to local storage only');
      
      // Save to local storage as fallback
      const prompt = this.promptCache.get(promptId);
      if (prompt) {
        prompt.systemInstruction = content;
        prompt.version += 1;
        prompt.lastModified = new Date();
        localStorage.setItem(`prompt_override_${promptId}`, JSON.stringify({
          content,
          version: prompt.version,
          lastModified: prompt.lastModified
        }));
        return true;
      }
      return false;
    }

    try {
      // Deactivate previous overrides
      await supabase!
        .from('prompt_overrides')
        .update({ is_active: false })
        .eq('prompt_id', promptId)
        .eq('is_active', true);

      // Insert new override
      const { data, error } = await supabase!
        .from('prompt_overrides')
        .insert({
          prompt_id: promptId,
          content,
          created_by: userEmail,
          is_active: true,
          version: (this.promptCache.get(promptId)?.version || 0) + 1
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to save prompt override:', error);
        return false;
      }

      // Update cache
      if (data) {
        this.overridesCache.set(promptId, data);
        const prompt = this.promptCache.get(promptId);
        if (prompt) {
          prompt.systemInstruction = content;
          prompt.version = data.version;
          prompt.lastModified = new Date(data.created_at);
        }
      }

      return true;
    } catch (error) {
      console.error('Error saving prompt override:', error);
      return false;
    }
  }

  async getPromptHistory(promptId: string): Promise<PromptOverride[]> {
    if (!isSupabaseConfigured()) {
      return [];
    }

    try {
      const { data, error } = await supabase!
        .from('prompt_overrides')
        .select('*')
        .eq('prompt_id', promptId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load prompt history:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error loading prompt history:', error);
      return [];
    }
  }

  // Get the actual prompt content that would be used in the system
  async getActivePromptContent(id: string): Promise<string | null> {
    await this.initialize();
    
    // Check for local storage override first (for non-Supabase environments)
    if (!isSupabaseConfigured()) {
      const localOverride = localStorage.getItem(`prompt_override_${id}`);
      if (localOverride) {
        try {
          const override = JSON.parse(localOverride);
          return override.content;
        } catch (e) {
          console.error('Failed to parse local override:', e);
        }
      }
    }
    
    return this.getPromptContent(id);
  }
}

export const promptManager = new PromptManager();