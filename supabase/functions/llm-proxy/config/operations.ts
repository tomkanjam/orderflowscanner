/**
 * LLM Operation Configurations
 *
 * Centralized configuration for all LLM-powered operations.
 * This allows model/prompt changes without frontend deploys and enables
 * Braintrust evaluation-driven optimization.
 *
 * Each operation specifies:
 * - modelId: OpenRouter model identifier
 * - temperature: Randomness (0 = deterministic, 1 = creative)
 * - maxTokens: Maximum response length
 *
 * Prompts are always fetched from Braintrust (latest version).
 * Update prompts directly in Braintrust UI for immediate effect (5min cache TTL).
 *
 * To update based on Braintrust evaluations:
 * 1. Run evals comparing models/prompts
 * 2. Identify winner (highest score)
 * 3. Update config below (for models) or Braintrust UI (for prompts)
 * 4. Deploy edge function (if changing models)
 */

export const OPERATION_CONFIGS = {
  /**
   * Generate strategy metadata from user prompt
   *
   * Purpose: Extract strategy name, description, conditions from natural language
   * Optimization goal: Accuracy of condition extraction, name quality
   * Braintrust scorers: MetadataCompleteness, ConditionQuality, NamingQuality
   */
  'generate-trader-metadata': {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 2000,
    description: 'Extract strategy metadata from user description'
  },

  /**
   * Generate complete trader (metadata + code + strategy)
   *
   * Purpose: End-to-end trader generation from user prompt
   * Optimization goal: Overall quality, consistency between metadata and code
   * Braintrust scorers: WorkflowCompleteness, MetadataCodeConsistency
   */
  'generate-trader': {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.6,
    maxTokens: 6000,
    description: 'Generate complete trader from user description'
  },

  /**
   * Analyze trading signal with AI
   *
   * Purpose: Evaluate signal quality and generate trade decision
   * Optimization goal: Analysis accuracy, decision quality, reasoning clarity
   * Braintrust scorers: DecisionAccuracy, ReasoningQuality, RiskAssessment
   */
  'analyze-signal': {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.2, // Low temperature for consistent analysis
    maxTokens: 2000,
    description: 'Analyze trading signal and generate decision'
  }
};

/**
 * Get configuration for an operation
 *
 * @param operation - The operation name
 * @returns Configuration object
 * @throws Error if operation not found
 */
export function getOperationConfig(operation: string): any {
  const config = OPERATION_CONFIGS[operation as keyof typeof OPERATION_CONFIGS];

  if (!config) {
    throw new Error(
      `Unknown operation: ${operation}. Valid operations: ${Object.keys(OPERATION_CONFIGS).join(', ')}`
    );
  }

  return config;
}

/**
 * Validate that a model ID is properly formatted for OpenRouter
 *
 * OpenRouter model IDs must:
 * - Include organization prefix (e.g., "google/")
 * - Not use deprecated model names
 *
 * @param modelId - The model identifier to validate
 * @returns true if valid
 */
export function isValidModelId(modelId: string): boolean {
  // Must have organization prefix
  if (!modelId.includes('/')) {
    return false;
  }

  // Known invalid patterns
  const invalidPatterns = [
    /^gemini-/,           // Missing org prefix
    /gemini-2\.0-flash-exp$/ // Deprecated experimental model
  ];

  return !invalidPatterns.some(pattern => pattern.test(modelId));
}

/**
 * Get all configured operation names
 */
export function getOperationNames(): string[] {
  return Object.keys(OPERATION_CONFIGS);
}
