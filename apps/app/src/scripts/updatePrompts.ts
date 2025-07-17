// Script to update existing prompts in the database
// Run with: npx tsx src/scripts/updatePrompts.ts

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Need service key to bypass RLS

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase configuration. Make sure SUPABASE_SERVICE_KEY is set.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updatePrompts() {
  console.log('Updating prompts with timeframe consistency rules...');
  
  // Update generate-trader prompt
  const generateTraderUpdate = {
    system_instruction: `You are an AI assistant that creates cryptocurrency trading systems.

CRITICAL: You MUST return ONLY a valid JSON object. Do not include ANY text, explanation, markdown, or comments before or after the JSON. The response must start with { and end with }.

Based on the user's requirements, generate a trading system that EXACTLY matches what they ask for - no more, no less.

IMPORTANT: 
- If the user asks for simple conditions (e.g., "StochRSI below 40"), only implement those conditions
- Do NOT add extra filters (trend, volume, etc.) unless specifically requested
- Analyze the user's prompt to determine which timeframes are mentioned

CRITICAL TIMEFRAME CONSISTENCY RULES:
1. The timeframes you specify in "requiredTimeframes" MUST EXACTLY match the timeframes you use in "filterCode"
2. If you set requiredTimeframes: ["1h"], then filterCode MUST use: const klines = timeframes['1h'];
3. If you set requiredTimeframes: ["1m", "5m"], then filterCode MUST use BOTH: timeframes['1m'] AND timeframes['5m']
4. NEVER mix timeframes - if requiredTimeframes says "1h", do NOT use timeframes['1m'] in the code
5. When the user mentions a specific timeframe (e.g., "on the 1-hour chart"), use that timeframe consistently throughout

[Rest of the prompt continues as before...]`
  };

  const { error: error1 } = await supabase
    .from('prompts')
    .update(generateTraderUpdate)
    .eq('id', 'generate-trader');
    
  if (error1) {
    console.error('Failed to update generate-trader:', error1);
  } else {
    console.log('Successfully updated generate-trader prompt');
  }

  // Update regenerate-filter prompt
  const regenerateFilterUpdate = {
    system_instruction: `You are an AI assistant that converts human-readable trading conditions into JavaScript code.

You will receive an array of conditions that describe a trading filter. Your task is to:
1. Analyze the conditions to determine which timeframes are needed
2. Generate the JavaScript function body that implements these conditions

CRITICAL TIMEFRAME CONSISTENCY RULES:
- The timeframes in "requiredTimeframes" MUST EXACTLY match the timeframes used in "filterCode"
- If you detect "1 hour" or "1h" in conditions, use "1h" in both requiredTimeframes AND timeframes['1h']
- If you detect "1 minute" or "1m" in conditions, use "1m" in both requiredTimeframes AND timeframes['1m']
- NEVER mix timeframes - maintain perfect consistency between declaration and usage

[Rest of the prompt continues as before...]`
  };

  const { error: error2 } = await supabase
    .from('prompts')
    .update(regenerateFilterUpdate)
    .eq('id', 'regenerate-filter');
    
  if (error2) {
    console.error('Failed to update regenerate-filter:', error2);
  } else {
    console.log('Successfully updated regenerate-filter prompt');
  }

  console.log('Prompt updates complete!');
}

updatePrompts().catch(console.error);