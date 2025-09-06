import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Load the updated prompt from seedPrompts.ts
const seedPromptsContent = readFileSync('./src/scripts/seedPrompts.ts', 'utf-8');

// Extract the generate-trader-metadata prompt
const metadataPromptMatch = seedPromptsContent.match(/id: 'generate-trader-metadata',[\s\S]*?systemInstruction: `([\s\S]*?)`,\s*parameters:/);

if (!metadataPromptMatch) {
  console.error('Could not find generate-trader-metadata prompt');
  process.exit(1);
}

const updatedSystemInstruction = metadataPromptMatch[1];

async function updatePrompt() {
  try {
    // First, check if the prompt exists
    const { data: existing, error: fetchError } = await supabase
      .from('prompts')
      .select('*')
      .eq('id', 'generate-trader-metadata')
      .single();
    
    if (fetchError) {
      console.error('Error fetching prompt:', fetchError);
      return;
    }
    
    if (!existing) {
      console.log('Prompt not found in database');
      return;
    }
    
    // Update the existing prompt
    const { data, error } = await supabase
      .from('prompts')
      .update({
        system_instruction: updatedSystemInstruction,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'generate-trader-metadata')
      .select();
    
    if (error) {
      console.error('Error updating prompt:', error);
    } else {
      console.log('Successfully updated generate-trader-metadata prompt');
      console.log('Updated prompt length:', updatedSystemInstruction.length, 'characters');
    }
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

updatePrompt();
