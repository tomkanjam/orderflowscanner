#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
 * Upload All Prompts to Braintrust
 *
 * Uploads prompt content from git source files to Braintrust.
 * Run: deno run --allow-net --allow-read --allow-env scripts/upload-all-prompts-to-braintrust.ts
 */

const BRAINTRUST_API_KEY = Deno.env.get("BRAINTRUST_API_KEY");
const BRAINTRUST_PROJECT_ID = Deno.env.get("BRAINTRUST_PROJECT_ID") || "5df22744-d29c-4b01-b18b-e3eccf2ddbba";

if (!BRAINTRUST_API_KEY) {
  console.error("Error: BRAINTRUST_API_KEY environment variable is required");
  console.error("Get your API key from: https://www.braintrust.dev/app/settings/api-keys");
  Deno.exit(1);
}

interface PromptConfig {
  slug: string;
  name: string;
  description: string;
  sourcePath: string;
  model: string;
  temperature: number;
  maxTokens: number;
  responseFormat?: { type: string };
}

const prompts: PromptConfig[] = [
  {
    slug: "regenerate-filter-go",
    name: "Regenerate Filter Code (Go)",
    description: "Converts trading conditions into Go filter code with full indicator API documentation",
    sourcePath: "./backend/go-screener/prompts/regenerate-filter-go.md",
    model: "anthropic/claude-haiku-4.5",
    temperature: 0.4,
    maxTokens: 4000,
    responseFormat: { type: "json_object" }
  },
  {
    slug: "generate-filter-code",
    name: "Generate Filter Code (Go)",
    description: "Generates Go filter code from trading conditions",
    sourcePath: "./backend/go-screener/prompts/generate-filter-code.md",
    model: "anthropic/claude-haiku-4.5",
    temperature: 0.4,
    maxTokens: 4000,
    responseFormat: { type: "json_object" }
  },
  {
    slug: "analyze-signal",
    name: "Analyze Trading Signal",
    description: "Analyzes trading signals and provides structured decision with risk management",
    sourcePath: "./supabase/functions/llm-proxy/prompts/analyze-signal.md",
    model: "google/gemini-2.5-flash",
    temperature: 0.2,
    maxTokens: 2000,
    responseFormat: { type: "json_object" }
  },
  {
    slug: "generate-trader-metadata",
    name: "Generate Trader Metadata",
    description: "Extracts strategy metadata from user description",
    sourcePath: "./supabase/functions/llm-proxy/prompts/generate-trader-metadata.md",
    model: "google/gemini-2.5-flash",
    temperature: 0.7,
    maxTokens: 2000,
    responseFormat: { type: "json_object" }
  }
];

async function uploadPrompt(config: PromptConfig): Promise<void> {
  console.log(`\n📤 Uploading ${config.slug}...`);

  // Read prompt content
  let promptContent: string;
  try {
    promptContent = await Deno.readTextFile(config.sourcePath);
  } catch (error) {
    console.error(`❌ Failed to read ${config.sourcePath}:`, error.message);
    throw error;
  }

  const lineCount = promptContent.split('\n').length;
  console.log(`   Source: ${config.sourcePath}`);
  console.log(`   Lines: ${lineCount}`);

  // Prepare payload
  const payload = {
    project_id: BRAINTRUST_PROJECT_ID,
    slug: config.slug,
    name: config.name,
    description: config.description,
    prompt_data: {
      prompt: {
        type: "completion",
        content: promptContent
      },
      options: {
        model: config.model,
        params: {
          temperature: config.temperature,
          max_tokens: config.maxTokens,
          ...(config.responseFormat && { response_format: config.responseFormat })
        }
      }
    }
  };

  // Upload to Braintrust
  try {
    const response = await fetch("https://api.braintrust.dev/v1/prompt", {
      method: "PUT",
      headers: {
        "Authorization": `Bearer ${BRAINTRUST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`   ✅ Uploaded successfully`);
    console.log(`   ID: ${result.id}`);
    console.log(`   Version: ${result._xact_id}`);

    // Verify upload
    await verifyPrompt(config.slug, lineCount);

  } catch (error) {
    console.error(`   ❌ Upload failed:`, error.message);
    throw error;
  }
}

async function verifyPrompt(slug: string, expectedLines: number): Promise<void> {
  console.log(`   🔍 Verifying upload...`);

  try {
    const response = await fetch(
      `https://api.braintrust.dev/v1/prompt?project_id=${BRAINTRUST_PROJECT_ID}&slug=${slug}`,
      {
        headers: {
          "Authorization": `Bearer ${BRAINTRUST_API_KEY}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Verification failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    const prompt = data.objects?.[0];

    if (!prompt) {
      throw new Error("Prompt not found after upload");
    }

    const content = prompt.prompt_data?.prompt?.content || "";
    const actualLines = content.split('\n').length;

    console.log(`   Lines in Braintrust: ${actualLines}`);

    const diff = Math.abs(actualLines - expectedLines);
    if (diff > 5) {
      console.warn(`   ⚠️  Line count mismatch: expected ~${expectedLines}, got ${actualLines}`);
    } else {
      console.log(`   ✅ Verification passed`);
    }

  } catch (error) {
    console.error(`   ⚠️  Verification warning:`, error.message);
    // Don't throw - upload succeeded even if verification had issues
  }
}

async function main() {
  console.log("🚀 Uploading All Prompts to Braintrust");
  console.log(`   Project ID: ${BRAINTRUST_PROJECT_ID}`);
  console.log(`   Prompts: ${prompts.length}`);

  let successCount = 0;
  let failureCount = 0;

  for (const config of prompts) {
    try {
      await uploadPrompt(config);
      successCount++;
    } catch (error) {
      failureCount++;
      console.error(`\n❌ Failed to upload ${config.slug}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`✅ Successfully uploaded: ${successCount}/${prompts.length}`);
  if (failureCount > 0) {
    console.log(`❌ Failed: ${failureCount}/${prompts.length}`);
    Deno.exit(1);
  }

  console.log("\n🎉 All prompts uploaded successfully!");
  console.log("View in Braintrust: https://www.braintrust.dev/app/AI%20Trader/p/prompts");
}

if (import.meta.main) {
  main();
}
