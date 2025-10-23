#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env

/**
 * Upload regenerate-filter-go prompt to Braintrust
 *
 * Usage:
 *   BRAINTRUST_API_KEY=xxx deno run --allow-read --allow-net --allow-env scripts/upload-prompt-to-braintrust.ts
 */

const BRAINTRUST_API_URL = 'https://api.braintrust.dev/v1'
const PROJECT_ID = '5df22744-d29c-4b01-b18b-e3eccf2ddbba'

async function main() {
  const apiKey = Deno.env.get('BRAINTRUST_API_KEY')
  if (!apiKey) {
    console.error('Error: BRAINTRUST_API_KEY environment variable not set')
    Deno.exit(1)
  }

  // Read the full prompt from file
  const promptPath = './backend/go-screener/prompts/regenerate-filter-go.md'
  console.log(`Reading prompt from ${promptPath}...`)
  const promptContent = await Deno.readTextFile(promptPath)
  console.log(`Loaded ${promptContent.length} characters from prompt file`)

  const payload = {
    project_id: PROJECT_ID,
    name: 'Regenerate Filter Code (Go)',
    slug: 'regenerate-filter-go',
    description: 'Generates Go filter code for cryptocurrency trading signals',
    prompt_data: {
      prompt: {
        type: 'completion',
        content: promptContent
      },
      options: {
        model: 'google/gemini-2.5-flash',
        params: {
          temperature: 0.4,
          max_tokens: 4000
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
  console.log(`   Slug: regenerate-filter-go`)
  console.log(`   Model: google/gemini-2.5-flash`)
  console.log('\nYou can now test trader creation in the UI.')
}

main()
