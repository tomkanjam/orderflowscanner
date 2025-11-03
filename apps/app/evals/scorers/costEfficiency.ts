/**
 * Cost Efficiency Scorer
 *
 * Evaluates whether the LLM response is cost-efficient
 *
 * Scoring criteria:
 * - Token usage within acceptable range (0.5 weight)
 * - Latency within acceptable range (0.5 weight)
 */

export interface CostEvalMetadata {
  total_tokens?: number;
  latency_ms?: number;
  model?: string;
}

export interface CostEvalExpected {
  maxTokens?: number;
  maxLatencyMs?: number;
  warnTokens?: number;
  warnLatencyMs?: number;
}

export async function scoreCostEfficiency(args: {
  metadata: CostEvalMetadata;
  expected: CostEvalExpected;
}): Promise<{ score: number; metadata: Record<string, any> }> {
  const { metadata, expected } = args;

  let tokensScore = 1.0;
  let latencyScore = 1.0;

  // 1. Check token usage (0.5 weight)
  if (metadata.total_tokens !== undefined && expected.maxTokens) {
    const tokenRatio = metadata.total_tokens / expected.maxTokens;

    if (metadata.total_tokens <= expected.maxTokens) {
      tokensScore = 1.0;
    } else if (metadata.total_tokens <= expected.maxTokens * 1.2) {
      // 20% over budget - partial penalty
      tokensScore = 0.7;
    } else {
      // Way over budget - heavy penalty
      tokensScore = 0.3;
    }

    // Bonus for being very efficient
    if (expected.warnTokens && metadata.total_tokens < expected.warnTokens) {
      tokensScore = Math.min(1.0, tokensScore + 0.1);
    }
  }

  // 2. Check latency (0.5 weight)
  if (metadata.latency_ms !== undefined && expected.maxLatencyMs) {
    const latencyRatio = metadata.latency_ms / expected.maxLatencyMs;

    if (metadata.latency_ms <= expected.maxLatencyMs) {
      latencyScore = 1.0;
    } else if (metadata.latency_ms <= expected.maxLatencyMs * 1.5) {
      // 50% over budget - partial penalty
      latencyScore = 0.6;
    } else {
      // Way too slow - heavy penalty
      latencyScore = 0.2;
    }

    // Bonus for being very fast
    if (expected.warnLatencyMs && metadata.latency_ms < expected.warnLatencyMs) {
      latencyScore = Math.min(1.0, latencyScore + 0.1);
    }
  }

  // Calculate weighted final score
  const finalScore = (tokensScore * 0.5 + latencyScore * 0.5);

  return {
    score: finalScore,
    metadata: {
      tokensScore,
      latencyScore,
      totalTokens: metadata.total_tokens || 0,
      latencyMs: metadata.latency_ms || 0,
      model: metadata.model || 'unknown',
    },
  };
}
