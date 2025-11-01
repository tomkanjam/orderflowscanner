/**
 * Filter Code Generation Evaluation
 *
 * Tests the ability to generate valid, correct Go filter code from trading conditions.
 * Validates both helper function usage and custom implementations.
 *
 * Run with: braintrust eval filter-code.eval.ts
 */

import { Eval } from "braintrust";
import { Factuality } from "autoevals";
import { filterCodeDataset } from "./apps/app/evals/datasets/filter-code-gold-standard";

// Custom scorer: Check if uses custom implementation when needed
function usesCustomImplementation(args: {
  output: string;
  expected: any;
  metadata: any;
}): { name: string; score: number; metadata?: any } | null {
  const { output, metadata } = args;

  // Skip if not a custom indicator
  if (metadata.category !== "custom") {
    return null;
  }

  const hasCustomLoop = output.includes("for i :=");
  const hasArrayAlloc = output.includes("make([]float64");
  const avoidedHelper = !output.includes("indicators.");

  const score = (hasCustomLoop && hasArrayAlloc && avoidedHelper) ? 1 : 0;

  return {
    name: "UsesCustomImplementation",
    score,
    metadata: {
      hasCustomLoop,
      hasArrayAlloc,
      avoidedHelper,
      indicator: metadata.indicator
    }
  };
}

// Custom scorer: Check if code appears to compile
function codeCompiles(args: {
  output: string;
}): { name: string; score: number; metadata?: any } {
  const { output } = args;

  // Check for Go syntax basics
  const hasReturn = output.includes("return");
  const hasProperNilChecks = output.includes("nil");
  const noObviousErrors = !output.includes("undefined:") &&
                          !output.includes("syntax error") &&
                          !output.includes("SyntaxError");

  // Check for proper kline access patterns
  const hasKlineAccess = output.includes("data.Klines[");
  const hasLengthCheck = output.includes("len(klines)");

  const score = (hasReturn && hasKlineAccess && hasLengthCheck && noObviousErrors) ? 1 : 0;

  return {
    name: "CodeCompiles",
    score,
    metadata: {
      hasReturn,
      hasProperNilChecks,
      hasKlineAccess,
      hasLengthCheck,
      noObviousErrors
    }
  };
}

// Custom scorer: Check required inclusions
function includesRequired(args: {
  output: string;
  expected: any;
}): { name: string; score: number; metadata?: any } {
  const { output, expected } = args;

  if (!expected.must_include) {
    return { name: "IncludesRequired", score: 1 };
  }

  const missing: string[] = [];
  for (const required of expected.must_include) {
    if (!output.includes(required)) {
      missing.push(required);
    }
  }

  const score = missing.length === 0 ? 1 : Math.max(0, 1 - (missing.length / expected.must_include.length));

  return {
    name: "IncludesRequired",
    score,
    metadata: {
      required: expected.must_include.length,
      missing: missing.length,
      missing_items: missing
    }
  };
}

// Custom scorer: Check forbidden patterns
function avoidsForbidden(args: {
  output: string;
  expected: any;
}): { name: string; score: number; metadata?: any } | null {
  const { output, expected } = args;

  if (!expected.must_not_include || expected.must_not_include.length === 0) {
    return null;
  }

  const found: string[] = [];
  for (const forbidden of expected.must_not_include) {
    if (output.includes(forbidden)) {
      found.push(forbidden);
    }
  }

  const score = found.length === 0 ? 1 : 0;

  return {
    name: "AvoidsForbidden",
    score,
    metadata: {
      forbidden: expected.must_not_include.length,
      found: found.length,
      found_items: found
    }
  };
}

// Custom scorer: Correct timeframes
function correctTimeframes(args: {
  output: any;
  expected: any;
}): { name: string; score: number; metadata?: any } {
  const { output, expected } = args;

  // output is the full response with requiredTimeframes
  const actualTimeframes = output.requiredTimeframes || [];
  const expectedTimeframes = expected.requiredTimeframes || [];

  // Check if all expected timeframes are present
  const hasAll = expectedTimeframes.every((tf: string) => actualTimeframes.includes(tf));
  // Check if no extra timeframes
  const noExtras = actualTimeframes.every((tf: string) => expectedTimeframes.includes(tf));

  const score = (hasAll && noExtras) ? 1 : (hasAll ? 0.5 : 0);

  return {
    name: "CorrectTimeframes",
    score,
    metadata: {
      expected: expectedTimeframes,
      actual: actualTimeframes,
      hasAll,
      noExtras
    }
  };
}

// Main eval
Eval("AI Trader", {
  data: () => filterCodeDataset,
  task: async (input) => {
    // Call the llm-proxy to generate filter code
    const response = await fetch("https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/llm-proxy", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        operation: "generate-filter-code",
        params: input
      })
    });

    if (!response.ok) {
      throw new Error(`LLM proxy error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Filter generation failed: ${result.error}`);
    }

    // Return the full result for timeframe checking
    return {
      filterCode: result.data.filterCode,
      requiredTimeframes: result.data.requiredTimeframes
    };
  },
  scores: [
    // Use output.filterCode for code-based scorers
    (args) => codeCompiles({ output: args.output.filterCode }),
    (args) => includesRequired({ output: args.output.filterCode, expected: args.expected }),
    (args) => avoidsForbidden({ output: args.output.filterCode, expected: args.expected }),
    (args) => usesCustomImplementation({ output: args.output.filterCode, expected: args.expected, metadata: args.metadata }),

    // Use full output for timeframe checking
    correctTimeframes,

    // Built-in LLM judge for overall quality
    (args) => Factuality({ input: args.input, output: args.output.filterCode, expected: args.expected })
  ],
  experimentName: `filter-code-v3-${new Date().toISOString().split('T')[0]}`,
  metadata: {
    prompt_version: "3.0",
    braintrust_txn_id: "1000196066663639760",
    git_commit: "48a8529",
    test_date: new Date().toISOString()
  }
});
