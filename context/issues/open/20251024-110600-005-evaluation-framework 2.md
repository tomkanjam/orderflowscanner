# Set Up Braintrust Evaluation Framework

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-24 11:06:03

## Context

Braintrust is integrated for observability but we're not using its evaluation framework. Without evals, we:
- Can't measure prompt quality objectively
- Can't compare model performance systematically
- Can't detect quality regressions
- Can't validate improvements before production
- Can't optimize for cost/quality tradeoffs

**Current State:**
- Braintrust tracing active in edge functions
- No evaluation datasets defined
- No scorers configured
- No automated eval runs
- Manual quality assessment only

**Impact:**
Flying blind on AI quality. Can't systematically improve trader generation or analysis.

## Linked Items
- Part of: `context/issues/open/20251024-110600-000-PROJECT-complete-braintrust-integration.md`

## Progress

Issue created, awaiting implementation.

## Spec

**Evaluation Strategy:**

Create evals for the three critical operations:
1. **Trader Metadata Generation** - Extract conditions from natural language
2. **Filter Code Generation** - Generate valid, correct Go code
3. **Signal Analysis** - Provide actionable trading insights

### Phase 1: Create Evaluation Datasets

**Dataset 1: Trader Metadata Quality**
- Location: Braintrust project "vyx" → Datasets
- Name: `trader-metadata-gold-standard`
- Size: 50 examples
- Structure:
  ```json
  {
    "input": "Buy when RSI crosses above 30 and price is above 200 MA",
    "expected_output": {
      "conditions": ["RSI crosses above 30", "Price above 200-period MA"],
      "direction": "bullish",
      "indicators": ["RSI", "SMA"]
    }
  }
  ```

**Dataset 2: Filter Code Correctness**
- Name: `filter-code-gold-standard`
- Size: 30 examples
- Structure:
  ```json
  {
    "input": {
      "conditions": ["RSI > 70", "Volume spike > 2x average"]
    },
    "expected_output": "valid Go code",
    "must_compile": true,
    "must_include": ["RSI", "volume"]
  }
  ```

**Dataset 3: Signal Analysis Quality**
- Name: `signal-analysis-gold-standard`
- Size: 40 examples
- Structure:
  ```json
  {
    "input": {
      "symbol": "BTCUSDT",
      "signal": "RSI oversold, bullish divergence",
      "market_data": {...}
    },
    "expected_output": {
      "should_include": ["entry level", "stop loss", "risk assessment"],
      "quality_threshold": 7
    }
  }
  ```

### Phase 2: Implement Scorers

**Scorer 1: Metadata Extraction Accuracy**
```typescript
// apps/app/evals/scorers/metadataAccuracy.ts
export async function scoreMetadataAccuracy(args: {
  input: string;
  output: any;
  expected: any;
}): Promise<number> {
  // Check if all expected conditions extracted
  // Check direction correctness
  // Check indicators identified
  // Return score 0-1
}
```

**Scorer 2: Code Compilation**
```typescript
// apps/app/evals/scorers/codeCompiles.ts
export async function scoreCodeCompiles(args: {
  output: string;
}): Promise<number> {
  // Attempt to compile Go code
  // Return 1 if compiles, 0 if fails
  // Log compilation errors
}
```

**Scorer 3: Analysis Completeness**
```typescript
// apps/app/evals/scorers/analysisCompleteness.ts
export async function scoreAnalysisCompleteness(args: {
  output: any;
  expected: any;
}): Promise<number> {
  // Check for required fields (entry, stop, risk)
  // Verify numerical values make sense
  // Check reasoning quality
  // Return score 0-1
}
```

**Scorer 4: Cost Efficiency**
```typescript
// apps/app/evals/scorers/costEfficiency.ts
export async function scoreCostEfficiency(args: {
  metadata: { tokens: number; latency: number };
}): Promise<number> {
  // Penalize excessive token usage
  // Penalize slow responses (> 5s)
  // Return score 0-1
}
```

### Phase 3: Set Up Eval Runs

**Eval 1: Trader Generation Quality**
- Frequency: Daily (automated)
- Dataset: `trader-metadata-gold-standard`
- Scorers: metadataAccuracy, costEfficiency
- Models to compare: gemini-2.5-flash vs claude-haiku-4.5
- Alert if score < 0.85

**Eval 2: Filter Code Quality**
- Frequency: On prompt change (manual trigger)
- Dataset: `filter-code-gold-standard`
- Scorers: codeCompiles, costEfficiency
- Alert if compilation rate < 95%

**Eval 3: Analysis Quality**
- Frequency: Weekly (automated)
- Dataset: `signal-analysis-gold-standard`
- Scorers: analysisCompleteness, costEfficiency
- Benchmark: Track quality over time

### Phase 4: Integration

**Connect evals to development workflow:**
1. Run evals before prompt changes (pre-commit hook)
2. Compare new vs old prompt version
3. Require approval if quality drops > 5%
4. Auto-deploy if quality improves > 10%

**Braintrust Dashboard Setup:**
- Create "Quality Monitor" view
- Display eval scores over time
- Alert on regressions
- Compare models side-by-side

## Implementation Steps

1. **Create eval datasets in Braintrust**
   - Use Braintrust UI or API to upload datasets
   - Ensure diversity in test cases (edge cases, common cases)

2. **Implement scorer functions**
   - Create `/apps/app/evals/scorers/` directory
   - Implement 4 core scorers
   - Test locally with sample data

3. **Create eval runner script**
   - Create `/scripts/run-evals.ts`
   - Uses Braintrust SDK to run evaluations
   - Outputs scores and comparison reports
   - Can be run manually or in CI/CD

4. **Set up automated eval schedule**
   - GitHub Actions or Supabase cron job
   - Runs daily evals on production prompts
   - Sends alerts to Slack/email on regressions

5. **Document eval workflow**
   - Create `/context/docs/EVALUATION_GUIDE.md`
   - How to add new eval datasets
   - How to write custom scorers
   - How to interpret eval results

**Files to Create:**
- `/apps/app/evals/scorers/metadataAccuracy.ts`
- `/apps/app/evals/scorers/codeCompiles.ts`
- `/apps/app/evals/scorers/analysisCompleteness.ts`
- `/apps/app/evals/scorers/costEfficiency.ts`
- `/scripts/run-evals.ts`
- `/context/docs/EVALUATION_GUIDE.md`

**Braintrust Configuration:**
- Upload 3 datasets (total ~120 examples)
- Configure 4 scorers
- Set up 3 eval runs
- Create dashboard views

**Testing:**
- Run evals locally with test datasets
- Verify scores make sense
- Test alert thresholds
- Confirm dashboard displays results

**Success Criteria:**
- 3 eval datasets uploaded to Braintrust
- 4 scorers implemented and tested
- Automated eval runs configured
- Dashboard shows quality trends
- Regression alerts working
- Documentation complete
- Team can add new evals independently
