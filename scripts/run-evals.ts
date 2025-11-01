#!/usr/bin/env tsx
/**
 * Batch Eval Runner
 *
 * Runs all evaluations in sequence and generates a summary report.
 *
 * Usage:
 *   pnpm run evals
 *   pnpm run evals --filter=filter-code
 *   pnpm run evals --no-send-logs (local only)
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface EvalResult {
  name: string;
  success: boolean;
  experimentId?: string;
  scores?: Record<string, number>;
  error?: string;
  duration: number;
}

const EVALS = [
  {
    name: 'filter-code',
    file: 'filter-code.eval.ts',
    description: 'Filter Code Generation'
  },
  {
    name: 'trader-metadata',
    file: 'trader-metadata.eval.ts',
    description: 'Trader Metadata Extraction'
  },
  {
    name: 'signal-analysis',
    file: 'signal-analysis.eval.ts',
    description: 'Signal Analysis Quality'
  }
];

async function runEval(evalConfig: typeof EVALS[0], flags: string[]): Promise<EvalResult> {
  const startTime = Date.now();
  console.log(`\n📊 Running: ${evalConfig.description}`);
  console.log(`   File: ${evalConfig.file}`);

  try {
    const command = `braintrust eval ${evalConfig.file} ${flags.join(' ')}`;
    console.log(`   Command: ${command}\n`);

    const { stdout, stderr } = await execAsync(command, {
      env: {
        ...process.env,
        BRAINTRUST_API_KEY: process.env.BRAINTRUST_API_KEY || 'sk-OS6ksPJXNJJOaXBwPHmd0H3JfkYoucoCCTzKn6a69LsNmG3v'
      }
    });

    const duration = Date.now() - startTime;

    // Parse experiment ID from output
    const experimentIdMatch = stdout.match(/Experiment.*\(id: ([a-f0-9-]+)\)/);
    const experimentId = experimentIdMatch ? experimentIdMatch[1] : undefined;

    console.log(stdout);
    if (stderr) console.error(stderr);

    return {
      name: evalConfig.name,
      success: true,
      experimentId,
      duration
    };
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ Failed: ${error.message}`);

    return {
      name: evalConfig.name,
      success: false,
      error: error.message,
      duration
    };
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const filterArg = args.find(arg => arg.startsWith('--filter='));
  const filter = filterArg ? filterArg.split('=')[1] : null;
  const otherFlags = args.filter(arg => !arg.startsWith('--filter='));

  // Filter evals
  const evalsToRun = filter
    ? EVALS.filter(e => e.name === filter)
    : EVALS;

  if (evalsToRun.length === 0) {
    console.error(`❌ No evals found matching filter: ${filter}`);
    process.exit(1);
  }

  console.log('🚀 Braintrust Eval Runner');
  console.log(`📅 Date: ${new Date().toISOString()}`);
  console.log(`📋 Running ${evalsToRun.length} eval(s)`);

  const results: EvalResult[] = [];

  // Run evals sequentially
  for (const evalConfig of evalsToRun) {
    const result = await runEval(evalConfig, otherFlags);
    results.push(result);
  }

  // Generate summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 EVAL SUMMARY');
  console.log('='.repeat(80));

  let totalDuration = 0;
  let successCount = 0;

  for (const result of results) {
    totalDuration += result.duration;
    if (result.success) successCount++;

    const status = result.success ? '✅' : '❌';
    const durationStr = `${(result.duration / 1000).toFixed(1)}s`;

    console.log(`\n${status} ${result.name}`);
    console.log(`   Duration: ${durationStr}`);

    if (result.experimentId) {
      console.log(`   Experiment ID: ${result.experimentId}`);
      console.log(`   View: https://www.braintrust.dev/app/AI%20Trader/p/experiments/${result.experimentId}`);
    }

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Total: ${successCount}/${results.length} passed`);
  console.log(`Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('='.repeat(80));

  // Exit with error if any failed
  if (successCount < results.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
