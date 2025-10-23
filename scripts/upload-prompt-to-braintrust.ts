#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env

/**
 * Upload regenerate-filter-go prompt to Braintrust
 *
 * Usage Option 1 (Environment Variable):
 *   BRAINTRUST_API_KEY=xxx deno run --allow-read --allow-net --allow-env scripts/upload-prompt-to-braintrust.ts
 *
 * Usage Option 2 (Interactive):
 *   deno run --allow-read --allow-net --allow-env scripts/upload-prompt-to-braintrust.ts
 *   (Script will prompt for API key)
 *
 * Get your API key from: https://www.braintrust.dev/ → Organization Settings → API Keys
 */

const BRAINTRUST_API_URL = 'https://api.braintrust.dev/v1'
const PROJECT_ID = '5df22744-d29c-4b01-b18b-e3eccf2ddbba'

async function promptForApiKey(): Promise<string> {
  console.log('\nBraintrust API Key not found in environment.')
  console.log('Get your API key from: https://www.braintrust.dev/ → Organization Settings → API Keys\n')

  const buf = new Uint8Array(1024)
  await Deno.stdout.write(new TextEncoder().encode('Enter your Braintrust API key: '))
  const n = await Deno.stdin.read(buf)
  if (n === null) {
    throw new Error('Failed to read API key from stdin')
  }

  return new TextDecoder().decode(buf.subarray(0, n)).trim()
}

async function main() {
  let apiKey = Deno.env.get('BRAINTRUST_API_KEY')

  if (!apiKey) {
    apiKey = await promptForApiKey()
  }

  if (!apiKey) {
    console.error('Error: BRAINTRUST_API_KEY is required')
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
