// AI Model configurations for TradeMind

export const AI_MODELS = {
  // Gemini 2.0 Flash - Default model for fast analysis
  GEMINI_2_FLASH: {
    id: 'gemini-2.0-flash-exp',
    name: 'Gemini 2.0 Flash',
    description: 'Fast and efficient analysis',
    tier: 'free',
    rateLimit: 60, // requests per minute
    features: {
      multiModal: true,
      contextWindow: 1048576, // 1M tokens
      speed: 'fast',
      accuracy: 'good',
    },
  },
  
  // Gemini 1.5 Pro - Advanced model for deeper analysis
  GEMINI_15_PRO: {
    id: 'gemini-1.5-pro-latest',
    name: 'Gemini 1.5 Pro',
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

export type ModelId = keyof typeof AI_MODELS;
export type Model = typeof AI_MODELS[ModelId];

export const DEFAULT_MODEL = AI_MODELS.GEMINI_2_FLASH.id;
export const PRO_MODEL = AI_MODELS.GEMINI_15_PRO.id;