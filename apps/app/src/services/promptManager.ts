import { supabase, isSupabaseConfigured } from '../config/supabase';

export interface PromptTemplate {
  id: string;
  name: string;
  category: 'screener' | 'analysis' | 'trader';
  description: string;
  systemInstruction: string;
  userPromptTemplate?: string;
  parameters?: string[];
  placeholders?: Record<string, any>;
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

class PromptManager {
  private promptCache: Map<string, PromptTemplate> = new Map();
  private initialized = false;

  async initialize() {
    if (this.initialized) return;
    
    if (!isSupabaseConfigured()) {
      throw new Error('[PromptManager] Database not configured - cannot load prompts');
    }

    await this.loadFromDatabase();
    this.initialized = true;
  }

  private async loadFromDatabase() {
    if (!supabase) {
      throw new Error('Supabase not configured');
    }

    try {
      // Load all active prompts
      const { data: prompts, error } = await supabase
        .from('prompts')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;

      if (!prompts || prompts.length === 0) {
        throw new Error('No prompts found in database');
      }

      // Cache prompts
      prompts.forEach(prompt => {
        this.promptCache.set(prompt.id, {
          ...prompt,
          lastModified: new Date(prompt.updated_at),
          placeholders: prompt.placeholders || {},
          parameters: prompt.parameters || [],
          version: 1 // Default version, will be updated if active versions exist
        });
      });

      console.log(`[PromptManager] Loaded ${prompts.length} prompts from database`);

      // Load active versions/overrides
      await this.loadActiveVersions();
    } catch (error) {
      console.error('[PromptManager] Database load failed:', error);
      throw error;
    }
  }

  private async loadActiveVersions() {
    if (!supabase) return;

    try {
      const { data: versions, error } = await supabase
        .from('prompt_versions')
        .select('*')
        .eq('is_active', true);

      if (error) {
        // Only log if it's not a "table doesn't exist" error
        if (error.code !== '42P01' && error.code !== 'PGRST116') {
          console.error('[PromptManager] Failed to load prompt versions:', error);
        }
        return;
      }

      if (versions) {
        versions.forEach(version => {
          const prompt = this.promptCache.get(version.prompt_id);
          if (prompt) {
            prompt.systemInstruction = version.system_instruction;
            prompt.userPromptTemplate = version.user_prompt_template;
            prompt.version = version.version;
            prompt.lastModified = new Date(version.created_at);
          }
        });
        console.log(`[PromptManager] Applied ${versions.length} active versions`);
      }
    } catch (error) {
      console.error('[PromptManager] Failed to load versions:', error);
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

  async getActivePromptContent(
    id: string, 
    placeholderValues?: Record<string, any>
  ): Promise<string | null> {
    const prompt = await this.getPrompt(id);
    if (!prompt) return null;

    let content = prompt.systemInstruction;

    // Replace placeholders
    if (placeholderValues || prompt.placeholders) {
      const values = { ...prompt.placeholders, ...placeholderValues };
      content = this.replacePlaceholders(content, values);
    }

    return content;
  }

  async savePromptOverride(
    promptId: string, 
    content: string, 
    userEmail: string
  ): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) {
      console.warn('[PromptManager] Cannot save override - database not configured');
      return false;
    }

    try {
      // Get current prompt to determine next version
      const prompt = this.promptCache.get(promptId);
      if (!prompt) {
        console.error(`[PromptManager] Prompt ${promptId} not found`);
        return false;
      }

      // Deactivate previous versions
      await supabase
        .from('prompt_versions')
        .update({ is_active: false })
        .eq('prompt_id', promptId)
        .eq('is_active', true);

      // Insert new version
      const { data, error } = await supabase
        .from('prompt_versions')
        .insert({
          prompt_id: promptId,
          system_instruction: content,
          version: prompt.version + 1,
          created_by: userEmail,
          is_active: true
        })
        .select()
        .single();

      if (error) throw error;

      // Update cache
      if (data) {
        prompt.systemInstruction = content;
        prompt.version = data.version;
        prompt.lastModified = new Date(data.created_at);
      }

      console.log(`[PromptManager] Saved override for ${promptId}, version ${data.version}`);
      return true;
    } catch (error) {
      console.error('[PromptManager] Failed to save override:', error);
      return false;
    }
  }

  async getPromptHistory(promptId: string): Promise<PromptOverride[]> {
    if (!isSupabaseConfigured() || !supabase) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('prompt_versions')
        .select('*')
        .eq('prompt_id', promptId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[PromptManager] Failed to load history:', error);
      return [];
    }
  }

  async revertToVersion(promptId: string, versionId: string): Promise<boolean> {
    if (!isSupabaseConfigured() || !supabase) {
      return false;
    }

    try {
      // Get the version to revert to
      const { data: version, error: versionError } = await supabase
        .from('prompt_versions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (versionError || !version) {
        console.error('[PromptManager] Version not found:', versionError);
        return false;
      }

      // Deactivate all versions
      await supabase
        .from('prompt_versions')
        .update({ is_active: false })
        .eq('prompt_id', promptId);

      // Activate the selected version
      const { error: updateError } = await supabase
        .from('prompt_versions')
        .update({ is_active: true })
        .eq('id', versionId);

      if (updateError) throw updateError;

      // Update cache
      const prompt = this.promptCache.get(promptId);
      if (prompt) {
        prompt.systemInstruction = version.system_instruction;
        prompt.version = version.version;
        prompt.lastModified = new Date(version.created_at);
      }

      console.log(`[PromptManager] Reverted ${promptId} to version ${version.version}`);
      return true;
    } catch (error) {
      console.error('[PromptManager] Failed to revert version:', error);
      return false;
    }
  }

  // Replace placeholders in prompt content
  private replacePlaceholders(content: string, values: Record<string, any>): string {
    // Replace {{key}} style placeholders
    Object.entries(values).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, String(value));
    });

    // Replace ${key} style placeholders
    Object.entries(values).forEach(([key, value]) => {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      content = content.replace(regex, String(value));
    });

    return content;
  }

  // Force reload prompts from database
  async reload() {
    this.initialized = false;
    this.promptCache.clear();
    await this.initialize();
  }
}

// Create singleton instance
export const promptManager = new PromptManager();