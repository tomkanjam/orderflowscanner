#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-env

/**
 * Download Prompts from Braintrust
 *
 * Downloads current prompt content from Braintrust to local source files.
 * This establishes git as the source of truth while keeping Braintrust in sync.
 *
 * Run: deno run --allow-net --allow-read --allow-write --allow-env scripts/download-prompts-from-braintrust.ts
 */

const BRAINTRUST_API_KEY = Deno.env.get("BRAINTRUST_API_KEY");
const BRAINTRUST_PROJECT_ID = Deno.env.get("BRAINTRUST_PROJECT_ID") || "5df22744-d29c-4b01-b18b-e3eccf2ddbba";

if (!BRAINTRUST_API_KEY) {
  console.error("Error: BRAINTRUST_API_KEY environment variable is required");
  console.error("Get your API key from: https://www.braintrust.dev/app/settings/api-keys");
  Deno.exit(1);
}

interface PromptDownloadConfig {
  slug: string;
  targetPath: string;
}

const prompts: PromptDownloadConfig[] = [
  {
    slug: "regenerate-filter-go",
    targetPath: "./backend/go-screener/prompts/regenerate-filter-go.md"
  },
  {
    slug: "analyze-signal",
    targetPath: "./supabase/functions/llm-proxy/prompts/analyze-signal.md"
  }
];

async function downloadPrompt(config: PromptDownloadConfig): Promise<void> {
  console.log(`\n📥 Downloading ${config.slug}...`);

  try {
    const response = await fetch(
      `https://api.braintrust.dev/v1/prompt?project_id=${BRAINTRUST_PROJECT_ID}&slug=${config.slug}`,
      {
        headers: {
          "Authorization": `Bearer ${BRAINTRUST_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const prompt = data.objects?.[0];

    if (!prompt) {
      throw new Error(`Prompt '${config.slug}' not found in Braintrust`);
    }

    const content = prompt.prompt_data?.prompt?.content;
    if (!content) {
      throw new Error(`Prompt '${config.slug}' has no content`);
    }

    // Write to file
    await Deno.writeTextFile(config.targetPath, content);

    const lines = content.split('\n').length;
    const chars = content.length;

    console.log(`   ✅ Downloaded successfully`);
    console.log(`   Target: ${config.targetPath}`);
    console.log(`   Lines: ${lines}`);
    console.log(`   Size: ${chars} chars`);
    console.log(`   Model: ${prompt.prompt_data?.options?.model}`);
    console.log(`   Version: ${prompt._xact_id}`);

  } catch (error) {
    console.error(`   ❌ Download failed:`, error.message);
    throw error;
  }
}

async function main() {
  console.log("🚀 Downloading Prompts from Braintrust");
  console.log(`   Project ID: ${BRAINTRUST_PROJECT_ID}`);
  console.log(`   Prompts: ${prompts.length}`);

  let successCount = 0;
  let failureCount = 0;

  for (const config of prompts) {
    try {
      await downloadPrompt(config);
      successCount++;
    } catch (error) {
      failureCount++;
      console.error(`\n❌ Failed to download ${config.slug}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Successfully downloaded: ${successCount}/${prompts.length}`);
  if (failureCount > 0) {
    console.log(`❌ Failed: ${failureCount}/${prompts.length}`);
    Deno.exit(1);
  }

  console.log("\n🎉 All prompts downloaded successfully!");
  console.log("\nNext steps:");
  console.log("1. Review the downloaded files");
  console.log("2. Commit to git: git add backend/go-screener/prompts supabase/functions/llm-proxy/prompts");
  console.log("3. Future changes: edit these files directly, then upload to Braintrust");
}

if (import.meta.main) {
  main();
}
