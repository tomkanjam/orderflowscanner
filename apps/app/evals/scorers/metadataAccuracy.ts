/**
 * Metadata Accuracy Scorer
 *
 * Evaluates how well the AI extracts trading conditions and metadata from natural language
 *
 * Scoring criteria:
 * - All expected conditions identified (0.4 weight)
 * - Direction correctly classified (0.2 weight)
 * - Indicators properly detected (0.2 weight)
 * - Strategy instructions coherent (0.2 weight)
 */

export interface MetadataEvalInput {
  userPrompt: string;
}

export interface MetadataEvalOutput {
  suggestedName: string;
  category: string;
  conditions: string[];
  strategyInstructions: string;
  timeframe: string;
  riskLevel: string;
}

export interface MetadataEvalExpected {
  expectedConditions: string[];
  expectedDirection?: 'bullish' | 'bearish' | 'neutral';
  expectedIndicators?: string[];
  minConditions?: number;
}

export async function scoreMetadataAccuracy(args: {
  input: MetadataEvalInput;
  output: MetadataEvalOutput;
  expected: MetadataEvalExpected;
}): Promise<{ score: number; metadata: Record<string, any> }> {
  const { output, expected } = args;

  let conditionsScore = 0;
  let directionScore = 0;
  let indicatorsScore = 0;
  let coherenceScore = 0;

  // 1. Check if all expected conditions are present (0.4 weight)
  const outputConditionsLower = output.conditions.map(c => c.toLowerCase());
  const matchedConditions = expected.expectedConditions.filter(expectedCond =>
    outputConditionsLower.some(outputCond =>
      outputCond.includes(expectedCond.toLowerCase()) ||
      expectedCond.toLowerCase().includes(outputCond)
    )
  );

  conditionsScore = matchedConditions.length / expected.expectedConditions.length;

  // 2. Check direction if specified (0.2 weight)
  if (expected.expectedDirection) {
    const categoryLower = output.category.toLowerCase();
    const directionMatch = categoryLower.includes(expected.expectedDirection);
    directionScore = directionMatch ? 1.0 : 0.0;
  } else {
    directionScore = 1.0; // N/A, give full credit
  }

  // 3. Check indicators if specified (0.2 weight)
  if (expected.expectedIndicators && expected.expectedIndicators.length > 0) {
    const strategyLower = output.strategyInstructions.toLowerCase();
    const conditionsText = output.conditions.join(' ').toLowerCase();
    const fullText = strategyLower + ' ' + conditionsText;

    const foundIndicators = expected.expectedIndicators.filter(indicator =>
      fullText.includes(indicator.toLowerCase())
    );

    indicatorsScore = foundIndicators.length / expected.expectedIndicators.length;
  } else {
    indicatorsScore = 1.0; // N/A, give full credit
  }

  // 4. Check coherence - basic checks (0.2 weight)
  const hasName = output.suggestedName && output.suggestedName.length > 3;
  const hasStrategy = output.strategyInstructions && output.strategyInstructions.length > 20;
  const hasTimeframe = output.timeframe && output.timeframe.length > 0;
  const hasRisk = output.riskLevel && ['low', 'medium', 'high'].includes(output.riskLevel.toLowerCase());

  const coherenceChecks = [hasName, hasStrategy, hasTimeframe, hasRisk];
  coherenceScore = coherenceChecks.filter(Boolean).length / coherenceChecks.length;

  // Calculate weighted final score
  const finalScore = (
    conditionsScore * 0.4 +
    directionScore * 0.2 +
    indicatorsScore * 0.2 +
    coherenceScore * 0.2
  );

  return {
    score: finalScore,
    metadata: {
      conditionsScore,
      directionScore,
      indicatorsScore,
      coherenceScore,
      matchedConditions: matchedConditions.length,
      totalExpectedConditions: expected.expectedConditions.length,
      outputConditionCount: output.conditions.length,
    },
  };
}
