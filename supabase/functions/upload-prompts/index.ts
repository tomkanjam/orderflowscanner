/**
 * Upload Prompts to Braintrust
 *
 * This edge function uploads prompts to Braintrust using the API key
 * stored in Supabase secrets.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const BRAINTRUST_API_URL = 'https://api.braintrust.dev/v1'
const PROJECT_ID = '5df22744-d29c-4b01-b18b-e3eccf2ddbba'

// The regenerate-filter-go prompt content
const PROMPT_CONTENT = `# Go Filter Code Generation Prompt

You are an AI assistant that converts human-readable trading conditions into **Go code**.

You will receive an array of conditions that describe a trading filter. Your task is to:
1. Analyze the conditions to determine which timeframes are needed
2. Generate the Go function body that implements these conditions

Return a JSON object with this structure:
\`\`\`json
{
  "requiredTimeframes": ["1m", "5m", ...], // Array of timeframes needed based on the conditions
  "filterCode": "// Go function body"
}
\`\`\`

## Input Format

You will receive:
- \`conditions\`: An array of strings describing the trading conditions
- \`klineInterval\`: The default timeframe preference (e.g., "1h", "5m")

## For the filterCode:

### Function Signature

The code you generate will be wrapped in a function with this signature:
\`\`\`go
func Filter(data MarketData) bool {
    // Your generated code goes here
    return true  // or false
}
\`\`\`

**CRITICAL**: You are generating ONLY the function **body** (the code inside the braces). Do NOT include:
- The function declaration \`func Filter(data MarketData) bool {\`
- The closing brace \`}\`
- Package declaration
- Import statements
- Helper function definitions
- Any markdown formatting
- Any explanatory text outside the JSON

### Available Data Types and Functions

See the full prompt in backend/go-screener/prompts/regenerate-filter-go.md for complete API documentation.

Key types:
- \`data.Ticker\`: Real-time ticker data (LastPrice, PriceChangePercent, QuoteVolume)
- \`data.Klines["1m"]\`: Kline data by timeframe (Open, High, Low, Close, Volume)
- \`indicators.CalculateMA(klines, period)\`: Moving average
- \`indicators.GetLatestRSI(klines, period)\`: RSI indicator
- \`indicators.GetLatestMACD(klines, short, long, signal)\`: MACD indicator
- And many more...

### Example Response

For conditions: ["RSI below 30", "Price above 50-day MA"]

\`\`\`json
{
  "filterCode": "klines := data.Klines[\\"1h\\"]\\n\\nif klines == nil || len(klines) < 50 {\\n    return false\\n}\\n\\nrsi := indicators.GetLatestRSI(klines, 14)\\nma50 := indicators.CalculateMA(klines, 50)\\n\\nif rsi == nil || ma50 == nil {\\n    return false\\n}\\n\\nlastPrice := klines[len(klines)-1].Close\\n\\nreturn *rsi < 30.0 && lastPrice > *ma50",
  "requiredTimeframes": ["1h"]
}
\`\`\`

### Critical Rules

1. Always check if klines exist and have sufficient length
2. Always check for nil pointers before dereferencing
3. Use := for variable declarations
4. Return boolean values
5. Include proper error handling`

async function uploadPrompt(apiKey: string) {
  const payload = {
    project_id: PROJECT_ID,
    name: 'Regenerate Filter Code (Go)',
    slug: 'regenerate-filter-go',
    description: 'Generates Go filter code for cryptocurrency trading signals',
    prompt_data: {
      prompt: {
        type: 'completion',
        content: PROMPT_CONTENT
      },
      options: {
        model: 'anthropic/claude-haiku-4.5',
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
    throw new Error(`HTTP ${response.status}: ${errorText}`)
  }

  const result = await response.json()
  console.log('Successfully uploaded prompt:', result.id)
  return result
}

serve(async (req) => {
  try {
    const apiKey = Deno.env.get('BRAINTRUST_API_KEY')
    if (!apiKey) {
      throw new Error('BRAINTRUST_API_KEY not set')
    }

    const result = await uploadPrompt(apiKey)

    return new Response(
      JSON.stringify({
        success: true,
        promptId: result.id,
        slug: 'regenerate-filter-go',
        message: 'Prompt uploaded successfully'
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('Error uploading prompt:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})
