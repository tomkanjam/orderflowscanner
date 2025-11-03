# Braintrust Evaluation Framework

Complete guide to evaluating LLM quality using Braintrust and custom scorers.

## Overview

The evaluation framework measures LLM performance across three critical operations:
1. **Trader Metadata Generation** - Extracting conditions from natural language
2. **Filter Code Generation** - Generating valid, correct Go code  
3. **Signal Analysis** - Providing actionable trading insights

## Quick Start

```bash
# Run specific operation evaluation
pnpm tsx scripts/run-evals.ts --operation=generate-trader-metadata
pnpm tsx scripts/run-evals.ts --operation=generate-filter-code
pnpm tsx scripts/run-evals.ts --operation=analyze-signal

# Run all evaluations
pnpm tsx scripts/run-evals.ts --all
```

## Scorers

Located in `apps/app/evals/scorers/`:
- `metadataAccuracy.ts` - Metadata extraction quality (40% conditions, 20% direction, 20% indicators, 20% coherence)
- `codeCompiles.ts` - Code correctness (30% structure, 20% no imports, 30% required patterns, 20% timeframes)
- `analysisCompleteness.ts` - Analysis quality (20% decision, 20% confidence, 30% reasoning, 30% key levels)
- `costEfficiency.ts` - Token/latency efficiency (50% tokens, 50% latency)

## Adding Test Data

Create datasets in `apps/app/evals/datasets/` with input/output/expected triples.

Recommended dataset sizes: 30-50 examples per operation.

## Recommended Thresholds

- **Metadata Accuracy**: 85% minimum
- **Code Compilation**: 95% minimum
- **Analysis Completeness**: 80% minimum
- **Cost Efficiency**: 70% minimum

## Integration

Scorers are designed to work with Braintrust's evaluation API for tracking quality over time.

See scorer files for detailed usage examples.
