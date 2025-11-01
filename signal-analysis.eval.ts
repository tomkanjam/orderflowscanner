/**
 * Signal Analysis Evaluation
 *
 * Tests the ability to provide actionable trading insights with entry/exit/risk levels.
 *
 * Run with: braintrust eval signal-analysis.eval.ts
 * Note: Dataset is placeholder - expand as needed
 */

import { Eval } from "braintrust";
import { Factuality } from "autoevals";
import { signalAnalysisDataset } from "./apps/app/evals/datasets/signal-analysis-gold-standard";

// Custom scorer: Check for required fields
function hasRequiredFields(args: {
  output: any;
  expected: any;
}): { name: string; score: number; metadata?: any } {
  const { output, expected } = args;

  if (!expected.should_include) {
    return { name: "HasRequiredFields", score: 1 };
  }

  const outputText = JSON.stringify(output).toLowerCase();

  let foundCount = 0;
  const missing: string[] = [];

  for (const required of expected.should_include) {
    if (outputText.includes(required.toLowerCase().replace(/ /g, ""))) {
      foundCount++;
    } else {
      missing.push(required);
    }
  }

  const score = foundCount / expected.should_include.length;

  return {
    name: "HasRequiredFields",
    score,
    metadata: {
      required: expected.should_include.length,
      found: foundCount,
      missing
    }
  };
}

// Custom scorer: Analysis quality (subjective)
function analysisQuality(args: {
  output: any;
}): { name: string; score: number; metadata?: any } {
  const { output } = args;

  const outputText = JSON.stringify(output).toLowerCase();

  // Heuristics for quality
  const hasNumbers = /\d+/.test(outputText);
  const hasRisk = outputText.includes("risk") || outputText.includes("stop");
  const hasEntry = outputText.includes("entry") || outputText.includes("enter");
  const hasTarget = outputText.includes("target") || outputText.includes("exit");
  const hasReasoning = outputText.length > 100;

  const checks = [hasNumbers, hasRisk, hasEntry, hasTarget, hasReasoning];
  const score = checks.filter(Boolean).length / checks.length;

  return {
    name: "AnalysisQuality",
    score,
    metadata: {
      hasNumbers,
      hasRisk,
      hasEntry,
      hasTarget,
      hasReasoning
    }
  };
}

// Main eval
Eval("AI Trader", {
  data: () => signalAnalysisDataset,
  task: async (input) => {
    // Call the llm-proxy to analyze signal
    const response = await fetch("https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/llm-proxy", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        operation: "analyze-signal",
        params: input
      })
    });

    if (!response.ok) {
      throw new Error(`LLM proxy error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Signal analysis failed: ${result.error}`);
    }

    return result.data;
  },
  scores: [
    hasRequiredFields,
    analysisQuality,
    Factuality
  ],
  experimentName: `signal-analysis-${new Date().toISOString().split('T')[0]}`,
  metadata: {
    dataset_size: signalAnalysisDataset.length,
    test_date: new Date().toISOString(),
    note: "Placeholder dataset - expand as needed"
  }
});
