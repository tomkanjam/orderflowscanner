#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
 * Verify Prompt Sync
 *
 * Verifies that prompts in git match what's deployed in Braintrust.
 * Used by pre-commit hooks and CI to prevent drift.
 *
 * Run: deno run --allow-net --allow-read --allow-env scripts/verify-prompt-sync.ts
 *
 * Exit codes:
 * 0 - All prompts in sync
 * 1 - Prompts out of sync or errors
 */

const BRAINTRUST_API_KEY = Deno.env.get("BRAINTRUST_API_KEY");
const BRAINTRUST_PROJECT_ID = Deno.env.get("BRAINTRUST_PROJECT_ID") || "5df22744-d29c-4b01-b18b-e3eccf2ddbba";

if (!BRAINTRUST_API_KEY) {
  console.error("Error: BRAINTRUST_API_KEY environment variable is required");
  console.error("Get your API key from: https://www.braintrust.dev/app/settings/api-keys");
  Deno.exit(1);
}

/**
 * Calculate SHA-256 hash of content
 */
async function calculateHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface PromptCheck {
  slug: string;
  sourcePath: string;
}

const prompts: PromptCheck[] = [
  {
    slug: "regenerate-filter-go",
    sourcePath: "./backend/go-screener/prompts/regenerate-filter-go.md"
  },
  {
    slug: "analyze-signal",
    sourcePath: "./supabase/functions/llm-proxy/prompts/analyze-signal.md"
  }
];

interface VerificationResult {
  slug: string;
  inSync: boolean;
  gitHash: string;
  braintrustHash: string;
  error?: string;
}

async function verifyPrompt(config: PromptCheck): Promise<VerificationResult> {
  const result: VerificationResult = {
    slug: config.slug,
    inSync: false,
    gitHash: "",
    braintrustHash: ""
  };

  try {
    // Read local file and calculate hash
    const localContent = await Deno.readTextFile(config.sourcePath);
    result.gitHash = await calculateHash(localContent);

    // Fetch from Braintrust
    const response = await fetch(
      `https://api.braintrust.dev/v1/prompt?project_id=${BRAINTRUST_PROJECT_ID}&slug=${config.slug}`,
      {
        headers: {
          "Authorization": `Bearer ${BRAINTRUST_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      result.error = `Braintrust API error: HTTP ${response.status}`;
      return result;
    }

    const data = await response.json();
    const prompt = data.objects?.[0];

    if (!prompt) {
      result.error = "Prompt not found in Braintrust";
      return result;
    }

    // Get hash from metadata (if available) or calculate from content
    const storedHash = prompt.metadata?.git_source_hash;
    if (storedHash) {
      result.braintrustHash = storedHash;
    } else {
      // Fallback: calculate hash from content
      const braintrustContent = prompt.prompt_data?.prompt?.content || "";
      result.braintrustHash = await calculateHash(braintrustContent);
    }

    // Compare hashes
    result.inSync = result.gitHash === result.braintrustHash;

  } catch (error) {
    result.error = error.message;
  }

  return result;
}

async function main() {
  console.log("🔍 Verifying Prompt Sync");
  console.log(`   Project ID: ${BRAINTRUST_PROJECT_ID}`);
  console.log(`   Prompts to check: ${prompts.length}\n`);

  const results: VerificationResult[] = [];

  for (const config of prompts) {
    console.log(`Checking ${config.slug}...`);
    const result = await verifyPrompt(config);
    results.push(result);

    if (result.error) {
      console.log(`   ❌ Error: ${result.error}`);
    } else if (result.inSync) {
      console.log(`   ✅ In sync`);
      console.log(`   Hash: ${result.gitHash.substring(0, 16)}...`);
    } else {
      console.log(`   ❌ Out of sync!`);
      console.log(`   Git hash:       ${result.gitHash.substring(0, 16)}...`);
      console.log(`   Braintrust hash: ${result.braintrustHash.substring(0, 16)}...`);
    }
    console.log();
  }

  // Summary
  console.log("=".repeat(60));
  const syncCount = results.filter(r => r.inSync).length;
  const outOfSyncCount = results.filter(r => !r.inSync && !r.error).length;
  const errorCount = results.filter(r => r.error).length;

  console.log(`✅ In sync: ${syncCount}/${prompts.length}`);
  if (outOfSyncCount > 0) {
    console.log(`❌ Out of sync: ${outOfSyncCount}/${prompts.length}`);
  }
  if (errorCount > 0) {
    console.log(`⚠️  Errors: ${errorCount}/${prompts.length}`);
  }

  if (outOfSyncCount > 0 || errorCount > 0) {
    console.log("\n⚠️  ACTION REQUIRED:");
    console.log("Run: deno run --allow-net --allow-read --allow-env scripts/upload-all-prompts-to-braintrust.ts");
    Deno.exit(1);
  }

  console.log("\n🎉 All prompts are in sync!");
  Deno.exit(0);
}

if (import.meta.main) {
  main();
}
