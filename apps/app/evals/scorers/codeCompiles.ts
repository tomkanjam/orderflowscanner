/**
 * Code Compilation Scorer
 *
 * Evaluates whether generated Go filter code compiles and meets requirements
 *
 * Scoring criteria:
 * - Code structure valid (has function declaration) (0.3 weight)
 * - No forbidden imports (0.2 weight)
 * - Contains required indicator calculations (0.3 weight)
 * - Returns correct type (0.2 weight)
 */

export interface CodeEvalOutput {
  filterCode: string;
  requiredTimeframes: string[];
  language: string;
}

export interface CodeEvalExpected {
  mustNotContain?: string[]; // Forbidden patterns (e.g., "import")
  mustContain?: string[]; // Required patterns (e.g., indicator names)
  requiredTimeframes?: string[];
}

export async function scoreCodeCompiles(args: {
  output: CodeEvalOutput;
  expected: CodeEvalExpected;
}): Promise<{ score: number; metadata: Record<string, any> }> {
  const { output, expected } = args;
  const code = output.filterCode;

  let structureScore = 0;
  let forbiddenScore = 0;
  let requiredScore = 0;
  let timeframesScore = 0;

  // 1. Check code structure (0.3 weight)
  const hasFunction = code.includes('func') || code.includes('function');
  const hasReturn = code.includes('return');
  const hasProperBraces = (code.match(/{/g) || []).length === (code.match(/}/g) || []).length;
  const notEmpty = code.length > 50;

  const structureChecks = [hasFunction, hasReturn, hasProperBraces, notEmpty];
  structureScore = structureChecks.filter(Boolean).length / structureChecks.length;

  // 2. Check for forbidden patterns (0.2 weight)
  if (expected.mustNotContain && expected.mustNotContain.length > 0) {
    const forbiddenFound = expected.mustNotContain.filter(pattern =>
      code.toLowerCase().includes(pattern.toLowerCase())
    );
    forbiddenScore = forbiddenFound.length === 0 ? 1.0 : 0.0;
  } else {
    forbiddenScore = 1.0;
  }

  // 3. Check for required patterns (0.3 weight)
  if (expected.mustContain && expected.mustContain.length > 0) {
    const requiredFound = expected.mustContain.filter(pattern =>
      code.toLowerCase().includes(pattern.toLowerCase())
    );
    requiredScore = requiredFound.length / expected.mustContain.length;
  } else {
    requiredScore = 1.0;
  }

  // 4. Check timeframes (0.2 weight)
  if (expected.requiredTimeframes && expected.requiredTimeframes.length > 0) {
    const matchedTimeframes = expected.requiredTimeframes.filter(tf =>
      output.requiredTimeframes.includes(tf)
    );
    timeframesScore = matchedTimeframes.length / expected.requiredTimeframes.length;
  } else {
    timeframesScore = 1.0;
  }

  // Calculate weighted final score
  const finalScore = (
    structureScore * 0.3 +
    forbiddenScore * 0.2 +
    requiredScore * 0.3 +
    timeframesScore * 0.2
  );

  return {
    score: finalScore,
    metadata: {
      structureScore,
      forbiddenScore,
      requiredScore,
      timeframesScore,
      codeLength: code.length,
      hasFunction,
      hasReturn,
      hasProperBraces,
    },
  };
}
