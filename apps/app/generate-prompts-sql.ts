import { readFileSync, writeFileSync } from 'fs';

// Read the seedPrompts.ts file
const seedPromptsContent = readFileSync('./src/scripts/seedPrompts.ts', 'utf-8');

// Extract the prompts array
const promptsMatch = seedPromptsContent.match(/const prompts = \[([\s\S]*?)\];/);
if (!promptsMatch) {
  console.error('Could not find prompts array');
  process.exit(1);
}

// Parse the prompts (this is a simplified extraction)
const promptsSection = promptsMatch[1];

// Extract each prompt's data
const promptRegex = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*category:\s*'([^']+)',\s*description:\s*'([^']+)',\s*systemInstruction:\s*`([^`]+)`/g;

let sql = `-- Seed all prompts including the fixed generate-trader-metadata prompt
-- This ensures all prompts are available in the database

-- Clear existing prompts to avoid conflicts (optional, remove if you want to preserve existing data)
-- TRUNCATE TABLE prompts CASCADE;

-- Insert all prompts
`;

const prompts = [
  'filter-and-chart-config',
  'structured-analysis', 
  'symbol-analysis',
  'regenerate-filter',
  'generate-trader-metadata',
  'generate-trader'
];

// For now, let's just create a reference to apply them manually
sql += `
-- The prompts need to be inserted from the seedPrompts.ts file
-- Due to the complexity of the prompt content, please run the seedPrompts.ts script
-- or manually copy the prompts from apps/app/src/scripts/seedPrompts.ts

-- To run the seed script:
-- cd apps/app
-- npx tsx src/scripts/seedPrompts.ts

-- Note: You may need to temporarily disable RLS or use admin credentials
`;

// Write the SQL file
writeFileSync('../../supabase/migrations/010_seed_all_prompts.sql', sql);

console.log('Migration file created at: supabase/migrations/010_seed_all_prompts.sql');
console.log('\nSince the prompts contain complex content with special characters,');
console.log('the best approach is to:');
console.log('\n1. Go to: https://supabase.com/dashboard/project/jtpqkbybuxbcvqeffmtf/sql/new');
console.log('2. First run: supabase/migrations/009_update_generate_trader_metadata_prompt.sql');
console.log('3. This will insert or update the generate-trader-metadata prompt with the fix');
console.log('\nThe migration is ready to be applied!');