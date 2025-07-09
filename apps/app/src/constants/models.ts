// AI Model configurations for TradeMind

export const AI_MODELS = {
  // Gemini 2.5 Flash Lite - Lightweight model for basic analysis
  GEMINI_25_FLASH_LITE: {
    id: 'gemini-2.5-flash-lite-preview-06-17',
    name: 'Gemini 2.5 Flash Lite',
    description: 'Lightweight and fast analysis',
    tier: 'lite',
    rateLimit: 100, // requests per minute
    features: {
      multiModal: true,
      contextWindow: 524288, // 512K tokens
      speed: 'very_fast',
      accuracy: 'basic',
    },
  },
  
  // Gemini 2.5 Flash - Standard model for balanced analysis
  GEMINI_25_FLASH: {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast and efficient analysis',
    tier: 'standard',
    rateLimit: 60, // requests per minute
    features: {
      multiModal: true,
      contextWindow: 1048576, // 1M tokens
      speed: 'fast',
      accuracy: 'good',
    },
  },
  
  // Gemini 2.5 Pro - Advanced model for deeper analysis
  GEMINI_25_PRO: {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    description: 'Advanced analysis with higher accuracy',
    tier: 'pro',
    rateLimit: 30, // requests per minute
    features: {
      multiModal: true,
      contextWindow: 2097152, // 2M tokens
      speed: 'moderate',
      accuracy: 'excellent',
    },
  },
} as const;

// Model tiers for trader configuration
export type ModelTier = 'lite' | 'standard' | 'pro';

export const MODEL_TIERS: Record<ModelTier, { name: string; model: string; description: string }> = {
  lite: {
    name: 'Lite',
    model: AI_MODELS.GEMINI_25_FLASH_LITE.id,
    description: 'Fast, basic analysis - good for high-frequency signals'
  },
  standard: {
    name: 'Standard',
    model: AI_MODELS.GEMINI_25_FLASH.id,
    description: 'Balanced speed and accuracy - recommended for most strategies'
  },
  pro: {
    name: 'Pro',
    model: AI_MODELS.GEMINI_25_PRO.id,
    description: 'Deeper analysis - best for complex strategies'
  }
};

export type ModelId = keyof typeof AI_MODELS;
export type Model = typeof AI_MODELS[ModelId];

export const DEFAULT_MODEL = AI_MODELS.GEMINI_25_FLASH.id;
export const PRO_MODEL = AI_MODELS.GEMINI_25_PRO.id;