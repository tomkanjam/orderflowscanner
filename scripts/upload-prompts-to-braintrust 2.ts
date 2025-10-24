#!/usr/bin/env node
/**
 * Upload Prompts to Braintrust
 *
 * This script uploads prompts to Braintrust via REST API
 *
 * Usage:
 *   BRAINTRUST_API_KEY=your_key BRAINTRUST_PROJECT_ID=your_project_id node upload-prompts-to-braintrust.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const BRAINTRUST_API_URL = 'https://api.braintrust.dev/v1';

// Get API key and project ID from environment
const API_KEY = process.env.BRAINTRUST_API_KEY;
const PROJECT_ID = process.env.BRAINTRUST_PROJECT_ID;

if (!API_KEY) {
  console.error('❌ BRAINTRUST_API_KEY environment variable is required');
  console.error('Get your API key from: https://www.braintrust.dev/app/settings/api-keys');
  process.exit(1);
}

if (!PROJECT_ID) {
  console.error('❌ BRAINTRUST_PROJECT_ID environment variable is required');
  console.error('Find your project ID in Braintrust project settings');
  process.exit(1);
}

// Load the prompt content from the documentation file
const promptDocPath = path.join(__dirname, '../docs/BRAINTRUST_PROMPT_SETUP.md');
let promptContent: string;

try {
  const doc = fs.readFileSync(promptDocPath, 'utf-8');

  // Extract the prompt content between the markers
  const startMarker = '```\nYou are an AI assistant';
  const endMarker = 'Transform these conditions into working Go code using the API above.\n```';

  const startIndex = doc.indexOf(startMarker);
  const endIndex = doc.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error('Could not find prompt content markers in documentation');
  }

  promptContent = doc.substring(startIndex + 4, endIndex + endMarker.length - 4).trim();
  console.log(`✅ Loaded prompt content (${promptContent.length} characters)`);
} catch (error) {
  console.error('❌ Failed to load prompt content:', error);
  process.exit(1);
}

/**
 * Create or update a prompt in Braintrust
 */
async function upsertPrompt(
  slug: string,
  name: string,
  description: string,
  content: string,
  model: string = 'gemini-2.5-flash'
) {
  console.log(`\n📤 Upserting prompt: ${name} (${slug})`);

  const payload = {
    project_id: PROJECT_ID,
    name,
    slug,
    description,
    prompt_data: {
      prompt: {
        type: 'completion',
        content
      },
      options: {
        model,
        params: {
          temperature: 0.7,
          max_tokens: 2000,
          response_format: {
            type: 'json_object'
          }
        }
      }
    }
  };

  try {
    // Use PUT for upsert (creates if doesn't exist, updates if exists)
    const response = await fetch(`${BRAINTRUST_API_URL}/prompt`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    console.log(`✅ Successfully upserted prompt: ${slug}`);
    console.log(`   ID: ${result.id || 'N/A'}`);
    return result;
  } catch (error) {
    console.error(`❌ Failed to upsert prompt ${slug}:`, error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 Uploading prompts to Braintrust...\n');
  console.log(`Project ID: ${PROJECT_ID}`);
  console.log(`API URL: ${BRAINTRUST_API_URL}`);

  try {
    // Upload generate-filter-code prompt
    await upsertPrompt(
      'generate-filter-code',
      'Generate Filter Code (Go)',
      'Generates Go filter code for cryptocurrency trading signals with proper error handling and validation',
      promptContent,
      'gemini-2.5-flash'
    );

    console.log('\n✅ All prompts uploaded successfully!');
    console.log('\n📋 Next steps:');
    console.log('1. Visit Braintrust UI to verify prompts: https://www.braintrust.dev/');
    console.log('2. Test prompts in Braintrust playground');
    console.log('3. Deploy to production');
    console.log('4. Create a trader in the UI to test end-to-end');
  } catch (error) {
    console.error('\n❌ Upload failed:', error);
    process.exit(1);
  }
}

main();
