/**
 * Analysis Completeness Scorer
 *
 * Evaluates the quality and completeness of signal analysis
 *
 * Scoring criteria:
 * - Decision is valid (0.2 weight)
 * - Confidence is reasonable (0.2 weight)
 * - Reasoning is substantive (0.3 weight)
 * - Key levels provided (0.3 weight)
 */

export interface AnalysisEvalOutput {
  decision: 'enter_trade' | 'wait' | 'bad_setup';
  confidence: number;
  reasoning: string;
  keyLevels?: {
    entry?: number;
    stopLoss?: number;
    takeProfit?: number[];
    support?: number[];
    resistance?: number[];
  };
  tradePlan?: {
    setup?: string;
    execution?: string;
    invalidation?: string;
    riskReward?: number;
  };
}

export interface AnalysisEvalExpected {
  validDecisions: string[];
  minConfidence?: number;
  maxConfidence?: number;
  minReasoningLength?: number;
  requireKeyLevels?: boolean;
}

export async function scoreAnalysisCompleteness(args: {
  output: AnalysisEvalOutput;
  expected: AnalysisEvalExpected;
}): Promise<{ score: number; metadata: Record<string, any> }> {
  const { output, expected } = args;

  let decisionScore = 0;
  let confidenceScore = 0;
  let reasoningScore = 0;
  let keyLevelsScore = 0;

  // 1. Check decision validity (0.2 weight)
  const validDecisions = expected.validDecisions || ['enter_trade', 'wait', 'bad_setup'];
  decisionScore = validDecisions.includes(output.decision) ? 1.0 : 0.0;

  // 2. Check confidence range (0.2 weight)
  const minConf = expected.minConfidence ?? 0;
  const maxConf = expected.maxConfidence ?? 100;
  const confInRange = output.confidence >= minConf && output.confidence <= maxConf;
  const confIsNumber = typeof output.confidence === 'number' && !isNaN(output.confidence);
  confidenceScore = (confInRange && confIsNumber) ? 1.0 : 0.0;

  // 3. Check reasoning quality (0.3 weight)
  const minLength = expected.minReasoningLength ?? 50;
  const reasoningLength = output.reasoning?.length || 0;
  const hasReasoning = reasoningLength >= minLength;
  const hasSubstance = output.reasoning?.split(/\s+/).length >= 10; // At least 10 words
  const notGeneric = !output.reasoning?.toLowerCase().includes('analysis inconclusive');

  const reasoningChecks = [hasReasoning, hasSubstance, notGeneric];
  reasoningScore = reasoningChecks.filter(Boolean).length / reasoningChecks.length;

  // 4. Check key levels (0.3 weight)
  if (expected.requireKeyLevels) {
    const hasEntry = output.keyLevels?.entry && output.keyLevels.entry > 0;
    const hasStopLoss = output.keyLevels?.stopLoss && output.keyLevels.stopLoss > 0;
    const hasTakeProfit = output.keyLevels?.takeProfit && output.keyLevels.takeProfit.length > 0;
    const hasSupport = output.keyLevels?.support && output.keyLevels.support.length > 0;
    const hasResistance = output.keyLevels?.resistance && output.keyLevels.resistance.length > 0;

    const keyLevelChecks = [hasEntry, hasStopLoss, hasTakeProfit, hasSupport, hasResistance];
    keyLevelsScore = keyLevelChecks.filter(Boolean).length / keyLevelChecks.length;
  } else {
    keyLevelsScore = 1.0;
  }

  // Calculate weighted final score
  const finalScore = (
    decisionScore * 0.2 +
    confidenceScore * 0.2 +
    reasoningScore * 0.3 +
    keyLevelsScore * 0.3
  );

  return {
    score: finalScore,
    metadata: {
      decisionScore,
      confidenceScore,
      reasoningScore,
      keyLevelsScore,
      reasoningLength,
      decision: output.decision,
      confidence: output.confidence,
    },
  };
}
