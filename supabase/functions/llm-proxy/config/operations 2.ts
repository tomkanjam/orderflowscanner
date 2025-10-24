/**
 * LLM Operation Configurations
 *
 * Centralized configuration for all LLM-powered operations.
 * This allows model/prompt changes without frontend deploys and enables
 * Braintrust evaluation-driven optimization.
 *
 * Each operation specifies:
 * - modelId: OpenRouter model identifier
 * - promptVersion: Semantic version for prompt tracking
 * - temperature: Randomness (0 = deterministic, 1 = creative)
 * - maxTokens: Maximum response length
 *
 * To update based on Braintrust evaluations:
 * 1. Run evals comparing models/prompts
 * 2. Identify winner (highest score)
 * 3. Update config below
 * 4. Deploy edge function
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
    promptVersion: 'v1.2',
    temperature: 0.7,
    maxTokens: 2000,
    description: 'Extract strategy metadata from user description'
  },

  /**
   * Generate Go filter code from conditions
   *
   * Purpose: Convert trading conditions into executable Go code
   * Optimization goal: Code correctness, all conditions covered, no imports
   * Braintrust scorers: ValidGoCode, FilterCodeRequirements, ConditionCoverage
   */
  'generate-filter-code': {
    modelId: 'anthropic/claude-haiku-4.5',
    promptVersion: 'v1.1',
    temperature: 0.4, // Lower temperature for code generation
    maxTokens: 4000,
    description: 'Generate Go filter code from trading conditions'
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
    promptVersion: 'v1.1',
    temperature: 0.6,
    maxTokens: 6000,
    description: 'Generate complete trader from user description'
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
