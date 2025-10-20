import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './apps/app/.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const { data, error } = await supabase
  .from('prompts')
  .select('id, name, system_instruction')
  .eq('id', 'generate-trader-metadata')
  .single();

if (error) {
  console.error('Error:', error);
  process.exit(1);
}

if (data) {
  const instruction = data.system_instruction;

  if (instruction.includes('"filterConditions"')) {
    console.log('✅ Prompt uses "filterConditions" (CORRECT)');
  } else if (instruction.includes('"conditions"')) {
    console.log('❌ Prompt uses "conditions" (WRONG!)');
  } else {
    console.log('⚠️  Could not find either field in prompt');
  }

  // Show a snippet
  const match = instruction.match(/"(filterConditions|conditions)":\s*\[/);
  if (match) {
    const start = instruction.indexOf(match[0]);
    console.log('\nSnippet around the field:');
    console.log(instruction.substring(start - 50, start + 250));
  }
}
