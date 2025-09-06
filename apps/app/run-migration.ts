import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('Missing VITE_SUPABASE_URL');
  process.exit(1);
}

// Check if we have service role key
if (!supabaseServiceKey) {
  console.log('\n⚠️  Service role key not found in environment.');
  console.log('\nTo apply the migration, you need to:');
  console.log('1. Go to: https://supabase.com/dashboard/project/jtpqkbybuxbcvqeffmtf/settings/api');
  console.log('2. Copy the "Service role key" (under Project API keys)');
  console.log('3. Add to .env.local: SUPABASE_SERVICE_ROLE_KEY=your-key-here');
  console.log('\nOr manually apply the migration:');
  console.log('1. Go to: https://supabase.com/dashboard/project/jtpqkbybuxbcvqeffmtf/sql/new');
  console.log('2. Copy contents of: supabase/migrations/009_update_generate_trader_metadata_prompt.sql');
  console.log('3. Run the SQL in the editor');
  process.exit(1);
}

// Create admin client with service role key
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('Running migration to update generate-trader-metadata prompt...');
    
    // Read the migration SQL
    const migrationSQL = readFileSync('../../supabase/migrations/009_update_generate_trader_metadata_prompt.sql', 'utf-8');
    
    // Since we can't run raw SQL directly, we need to use the admin client to upsert
    // Extract the prompt content from the SQL (this is a simplified approach)
    const promptContent = migrationSQL.match(/system_instruction,[\s\S]*?'([\s\S]*?)',[\s\S]*?ARRAY/)?.[1];
    
    if (!promptContent) {
      console.error('Could not extract prompt content from migration file');
      process.exit(1);
    }
    
    // Upsert the prompt using admin privileges
    const { data, error } = await supabaseAdmin
      .from('prompts')
      .upsert({
        id: 'generate-trader-metadata',
        name: 'Generate Trader Metadata',
        category: 'trader',
        description: 'Creates trader metadata without filter code',
        system_instruction: promptContent,
        parameters: ['userPrompt', 'modelName'],
        placeholders: {},
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      });
    
    if (error) {
      console.error('Error applying migration:', error);
      process.exit(1);
    }
    
    console.log('✅ Migration applied successfully!');
    console.log('The generate-trader-metadata prompt has been updated with comprehensive indicator examples.');
    
  } catch (error) {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

runMigration();