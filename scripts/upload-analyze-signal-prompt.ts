#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env

/**
 * Upload analyze-signal prompt to Braintrust
 *
 * Usage:
 *   BRAINTRUST_API_KEY=xxx deno run --allow-read --allow-net --allow-env scripts/upload-analyze-signal-prompt.ts
 */

const BRAINTRUST_API_URL = 'https://api.braintrust.dev/v1'
const PROJECT_ID = '5df22744-d29c-4b01-b18b-e3eccf2ddbba'

async function main() {
  const apiKey = Deno.env.get('BRAINTRUST_API_KEY')

  if (!apiKey) {
    console.error('Error: BRAINTRUST_API_KEY environment variable is required')
    console.error('Get your API key from: https://www.braintrust.dev/ → Organization Settings → API Keys')
    Deno.exit(1)
  }

  // Read the prompt from file
  const promptPath = './supabase/functions/llm-proxy/prompts/analyze-signal.md'
  console.log(`Reading prompt from ${promptPath}...`)
  const promptContent = await Deno.readTextFile(promptPath)
  console.log(`Loaded ${promptContent.length} characters from prompt file`)

  const payload = {
    project_id: PROJECT_ID,
    name: 'Analyze Trading Signal',
    slug: 'analyze-signal',
    description: 'Analyzes trading signals with AI to generate trade decisions (Elite tier auto-analysis)',
    prompt_data: {
      prompt: {
        type: 'completion',
        content: promptContent
      },
      options: {
        model: 'google/gemini-2.5-flash',
        params: {
          temperature: 0.2,
          max_tokens: 2000,
          response_format: { type: 'json_object' }
        }
      }
    }
  }

  console.log('Uploading prompt to Braintrust...')
  const response = await fetch(`${BRAINTRUST_API_URL}/prompt`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Error: HTTP ${response.status}: ${errorText}`)
    Deno.exit(1)
  }

  const result = await response.json()
  console.log('✅ Successfully uploaded prompt!')
  console.log(`   ID: ${result.id}`)
  console.log(`   Slug: analyze-signal`)
  console.log(`   Model: google/gemini-2.5-flash`)
  console.log(`   Temperature: 0.2`)
  console.log('\nThe analyze-signal operation is now ready for use.')
  console.log('Database trigger will call: POST /llm-proxy { operation: "analyze-signal", params: {...} }')
}

main()
