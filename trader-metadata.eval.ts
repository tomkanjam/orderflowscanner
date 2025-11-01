/**
 * Trader Metadata Extraction Evaluation
 *
 * Tests the ability to extract structured trading conditions from natural language.
 *
 * Run with: braintrust eval trader-metadata.eval.ts
 */

import { Eval } from "braintrust";
import { Factuality, Levenshtein } from "autoevals";
import { traderMetadataDataset } from "./apps/app/evals/datasets/trader-metadata-gold-standard";

// Custom scorer: Condition extraction accuracy
function conditionAccuracy(args: {
  output: any;
  expected: any;
}): { name: string; score: number; metadata?: any } {
  const { output, expected } = args;

  if (!output.conditions || !expected.conditions) {
    return { name: "ConditionAccuracy", score: 0 };
  }

  const extractedCount = output.conditions.length;
  const expectedCount = expected.conditions.length;

  // Check if all expected conditions were extracted
  let matchedCount = 0;
  for (const expectedCond of expected.conditions) {
    const found = output.conditions.some((extracted: string) =>
      extracted.toLowerCase().includes(expectedCond.toLowerCase().split(" ").slice(0, 3).join(" "))
    );
    if (found) matchedCount++;
  }

  const score = matchedCount / expectedCount;

  return {
    name: "ConditionAccuracy",
    score,
    metadata: {
      expected: expectedCount,
      extracted: extractedCount,
      matched: matchedCount
    }
  };
}

// Custom scorer: Direction correctness
function directionCorrect(args: {
  output: any;
  expected: any;
}): { name: string; score: number } {
  const { output, expected } = args;

  if (!output.direction || !expected.direction) {
    return { name: "DirectionCorrect", score: 0 };
  }

  const score = output.direction.toLowerCase() === expected.direction.toLowerCase() ? 1 : 0;

  return { name: "DirectionCorrect", score };
}

// Custom scorer: Indicator identification
function indicatorAccuracy(args: {
  output: any;
  expected: any;
}): { name: string; score: number; metadata?: any } {
  const { output, expected } = args;

  if (!output.indicators || !expected.indicators) {
    return { name: "IndicatorAccuracy", score: 0 };
  }

  if (expected.indicators.length === 0) {
    return { name: "IndicatorAccuracy", score: 1 };
  }

  let matchedCount = 0;
  for (const expectedInd of expected.indicators) {
    const found = output.indicators.some((extracted: string) =>
      extracted.toLowerCase().includes(expectedInd.toLowerCase()) ||
      expectedInd.toLowerCase().includes(extracted.toLowerCase())
    );
    if (found) matchedCount++;
  }

  const score = matchedCount / expected.indicators.length;

  return {
    name: "IndicatorAccuracy",
    score,
    metadata: {
      expected: expected.indicators,
      extracted: output.indicators,
      matched: matchedCount
    }
  };
}

// Main eval
Eval("AI Trader", {
  data: () => traderMetadataDataset,
  task: async (input) => {
    // Call the llm-proxy to generate trader metadata
    const response = await fetch("https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/llm-proxy", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        operation: "generate-trader-metadata",
        params: {
          description: input
        }
      })
    });

    if (!response.ok) {
      throw new Error(`LLM proxy error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Metadata generation failed: ${result.error}`);
    }

    return result.data;
  },
  scores: [
    conditionAccuracy,
    directionCorrect,
    indicatorAccuracy,
    Factuality
  ],
  experimentName: `trader-metadata-${new Date().toISOString().split('T')[0]}`,
  metadata: {
    dataset_size: 50,
    test_date: new Date().toISOString()
  }
});
