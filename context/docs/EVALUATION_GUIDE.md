# Evaluation Framework Guide

Complete guide to the Braintrust evaluation framework for AI Trader.

## Overview

We use Braintrust evals to systematically measure and improve AI quality across three critical operations:
1. **Trader Metadata Extraction** - Parse trading conditions from natural language
2. **Filter Code Generation** - Generate valid Go code from conditions
3. **Signal Analysis** - Provide actionable trading insights

## Setup

### 1. Install Dependencies

```bash
pnpm add braintrust autoevals
```

### 2. Configure Environment

Add to `.env.local`:
```
BRAINTRUST_API_KEY=sk-OS6ksPJXNJJOaXBwPHmd0H3JfkYoucoCCTzKn6a69LsNmG3v
SUPABASE_ANON_KEY=your_anon_key
```

### 3. Verify Setup

```bash
braintrust --version
```

## Project Structure

```
/apps/app/evals/
├── datasets/
│   ├── trader-metadata-gold-standard.ts (50 examples)
│   ├── filter-code-gold-standard.ts (30 examples)
│   └── signal-analysis-gold-standard.ts (40 examples)
└── scorers/
    ├── metadataAccuracy.ts
    ├── codeCompiles.ts
    ├── analysisCompleteness.ts
    └── costEfficiency.ts

/filter-code.eval.ts (main eval - ready to run)
/scripts/run-evals.ts (batch runner)
```

## Running Evals

### Run Single Eval

```bash
# Filter code generation eval
braintrust eval filter-code.eval.ts

# With specific dataset
braintrust eval filter-code.eval.ts --filter "category=custom"
```

### Run All Evals

```bash
# Using batch script
pnpm run evals

# Or manually
braintrust eval *.eval.ts
```

### Local Testing (No Logging)

```bash
braintrust eval filter-code.eval.ts --no-send-logs
```

### Watch Mode (Re-run on Changes)

```bash
braintrust eval filter-code.eval.ts --watch
```

## Datasets

### Dataset 1: Trader Metadata (50 examples)

**Purpose**: Test natural language parsing into structured conditions

**Coverage**:
- RSI-based strategies (10)
- Moving average strategies (10)
- MACD strategies (5)
- Bollinger Bands (5)
- Volume strategies (5)
- Advanced/Custom (10)
- Edge cases (5)

**Example**:
```typescript
{
  input: "Buy when RSI crosses above 30 and price above 200 MA",
  expected: {
    conditions: ["RSI crosses above 30", "Price above 200-period MA"],
    direction: "bullish",
    indicators: ["RSI", "SMA"]
  }
}
```

### Dataset 2: Filter Code (30 examples)

**Purpose**: Test Go code generation correctness

**Coverage**:
- Helper function usage (10)
- Custom implementations (10)
- Multi-timeframe (5)
- Edge cases (5)

**Example**:
```typescript
{
  input: {
    conditions: ["Stochastic RSI K line below 40"],
    klineInterval: "15m"
  },
  expected: {
    must_compile: true,
    must_include: ["rsiValues := make([]float64", "stochRSI"],
    must_not_include: ["indicators.CalculateStochastic"],
    requiredTimeframes: ["15m"]
  }
}
```

### Dataset 3: Signal Analysis (40 examples)

**Purpose**: Test trading insight quality

**Status**: Placeholder dataset (expand as needed)

## Custom Scorers

### 1. usesCustomImplementation

**Purpose**: Verify custom indicator implementation (not helpers)

**Checks**:
- Contains custom loops (`for i :=`)
- Allocates arrays (`make([]float64`)
- Avoids helper functions (`indicators.`)

**Returns**: 0 or 1 (binary)

### 2. codeCompiles

**Purpose**: Basic Go syntax validation

**Checks**:
- Has return statement
- Proper nil checks
- Kline access patterns
- No syntax errors

**Returns**: 0 or 1 (binary)

### 3. includesRequired

**Purpose**: Check for required code patterns

**Checks**: All items in `must_include` array present

**Returns**: 0 to 1 (proportional to missing items)

### 4. avoidsForbidden

**Purpose**: Ensure certain patterns are NOT present

**Checks**: None of `must_not_include` items present

**Returns**: 0 or 1 (binary)

### 5. correctTimeframes

**Purpose**: Verify requiredTimeframes array

**Checks**:
- All expected timeframes present
- No extra timeframes

**Returns**: 1 (perfect), 0.5 (has all), 0 (missing some)

## Built-in AutoEvals Scorers

We use Braintrust's AutoEvals library:

- **Factuality**: LLM-based fact checking
- **Levenshtein**: String similarity (edit distance)
- **ValidJSON**: JSON format validation
- **NumericDiff**: Numeric comparison

## Viewing Results

### Terminal Output

After running eval:
```
Experiment: filter-code-v3-2025-11-01 (id: 123abc)
100% ████████████████ 30/30 [00:45<00:00]

UsesCustomImplementation: 0.90 (9/10 custom indicators correct)
CodeCompiles: 1.00 (all compile)
IncludesRequired: 0.95 (28/30 have all required patterns)
CorrectTimeframes: 1.00 (all timeframes correct)
Factuality: 0.88 (LLM judge)

Overall Score: 0.95
```

### Braintrust UI

Visit: https://www.braintrust.dev/app/AI%20Trader/p/experiments

**Features**:
- Filter by score ranges
- View individual test cases with inputs/outputs
- Compare experiments side-by-side
- Identify regressions
- Export results as CSV/JSON

## Workflow

### 1. Before Prompt Changes

```bash
# Run baseline eval
braintrust eval filter-code.eval.ts
# Note the experiment ID
```

### 2. Make Changes

- Update Braintrust prompt
- Deploy to llm-proxy
- Wait 5 minutes for cache clear

### 3. After Changes

```bash
# Run new eval
braintrust eval filter-code.eval.ts
# Compare in UI using experiment IDs
```

### 4. Review Results

Go to Braintrust UI → Experiments → Compare

**Look for**:
- Overall score change
- Individual scorer improvements/regressions
- Failed test cases (red)
- New failures vs baseline

### 5. Decision

- **Score improved >5%**: Deploy to production
- **Score unchanged**: Review individual cases
- **Score dropped >5%**: Investigate and fix

## Adding New Test Cases

### 1. Add to Dataset

```typescript
// apps/app/evals/datasets/filter-code-gold-standard.ts
{
  input: {
    conditions: ["Your new condition"],
    klineInterval: "15m"
  },
  expected: {
    must_compile: true,
    must_include: ["expected patterns"],
    requiredTimeframes: ["15m"]
  },
  metadata: { category: "custom", indicator: "YourIndicator" }
}
```

### 2. Re-run Eval

```bash
braintrust eval filter-code.eval.ts
```

### 3. Review New Case

Check Braintrust UI for the new case's score.

## Adding New Scorers

### 1. Create Scorer Function

```typescript
// In eval file or separate file
function myCustomScorer(args: {
  output: string;
  expected: any;
  metadata: any;
}): { name: string; score: number; metadata?: any } | null {
  // Your scoring logic
  const score = /* 0 to 1 */;

  return {
    name: "MyCustomScorer",
    score,
    metadata: { /* debug info */ }
  };
}
```

### 2. Add to Eval

```typescript
scores: [
  myCustomScorer,
  // ... other scorers
]
```

### 3. Test

```bash
braintrust eval filter-code.eval.ts
```

## Troubleshooting

### Error: "braintrust: command not found"

Install Braintrust SDK:
```bash
pnpm add -g braintrust
```

### Error: "Authentication failed"

Check `.env.local` has correct `BRAINTRUST_API_KEY`.

### Error: "Module not found: braintrust"

Install dependency:
```bash
pnpm add braintrust autoevals
```

### Eval Runs But No Results in UI

Check:
1. Using correct API key
2. Project ID matches: `5df22744-d29c-4b01-b18b-e3eccf2ddbba`
3. Not using `--no-send-logs` flag

### Slow Eval Execution

- Use `--parallel` flag for concurrent execution
- Reduce dataset size for testing
- Cache LLM responses (Braintrust does this automatically)

## Best Practices

### 1. Start Small

Begin with 5-10 test cases, expand based on failures.

### 2. Test Edge Cases

Include:
- Invalid inputs
- Extreme values
- Missing data
- Complex logic

### 3. Mix Scorer Types

Combine:
- Simple heuristics (fast, cheap)
- LLM judges (slow, expensive, accurate)
- Custom domain-specific checks

### 4. Track Versions

Always set metadata in evals:
```typescript
metadata: {
  prompt_version: "3.0",
  git_commit: "48a8529",
  test_date: new Date().toISOString()
}
```

### 5. Compare Baselines

Use `BaseExperiment()` scorer to compare against previous runs:
```typescript
import { BaseExperiment } from "braintrust";

scores: [
  BaseExperiment(), // Compares to previous experiment
  // ... other scorers
]
```

### 6. Monitor Production

Enable online evals with sampling:
```typescript
// In llm-proxy
span.log({
  scores: {
    hasCustomImpl: filterCode.includes("make([]float64") ? 1 : 0
  }
});
```

## Automation

### GitHub Actions (TODO)

```yaml
name: Run Evals
on:
  push:
    paths:
      - 'supabase/functions/llm-proxy/**'
      - '**.eval.ts'
jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: pnpm install
      - run: braintrust eval *.eval.ts
        env:
          BRAINTRUST_API_KEY: ${{ secrets.BRAINTRUST_API_KEY }}
```

### Pre-commit Hook (TODO)

```bash
#!/bin/bash
# .git/hooks/pre-commit
if git diff --cached --name-only | grep -q "llm-proxy"; then
  echo "Running evals..."
  braintrust eval filter-code.eval.ts --no-send-logs
fi
```

## Current Status

**✅ Complete**:
- Dataset 1: Trader Metadata (50 examples)
- Dataset 2: Filter Code (30 examples)
- Filter Code Eval with 5 custom scorers
- Comprehensive documentation

**🚧 In Progress**:
- Dataset 3: Signal Analysis (placeholder, needs expansion)
- Trader metadata eval runner
- Signal analysis eval runner

**📋 TODO**:
- Install Braintrust SDK (`pnpm add braintrust autoevals`)
- Test filter-code.eval.ts locally
- Upload datasets to Braintrust UI
- Set up automated eval runs
- Add GitHub Actions integration

## Resources

- **Braintrust Skill**: `~/.claude/skills/braintrust/skill.md`
- **Braintrust Docs**: https://www.braintrust.dev/docs
- **AutoEvals**: https://github.com/braintrustdata/autoevals
- **Project Dashboard**: https://www.braintrust.dev/app/AI%20Trader
- **Issue**: `context/issues/open/20251024-110600-005-evaluation-framework.md`

## Support

Questions? Check:
1. This guide
2. Braintrust skill (`~/.claude/skills/braintrust/skill.md`)
3. Issue tracker (`context/issues/`)
4. Braintrust docs
