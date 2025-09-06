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

// Read the migration file
const migrationSQL = readFileSync('../../supabase/migrations/009_update_generate_trader_metadata_prompt.sql', 'utf-8');

// Extract just the INSERT/UPDATE statement
const insertStatement = migrationSQL.split('-- First, insert or update')[1].split('-- Add a comment')[0].trim();

async function applyMigration() {
  try {
    console.log('Attempting to apply migration to update generate-trader-metadata prompt...');
    
    // Since we can't run raw SQL directly with anon key, let's try to check if the prompt exists first
    const { data: existing, error: fetchError } = await supabase
      .from('prompts')
      .select('id')
      .eq('id', 'generate-trader-metadata');
    
    if (fetchError) {
      console.error('Error checking for existing prompt:', fetchError);
      console.log('\n⚠️  Unable to apply migration via client library due to permissions.');
      console.log('\n📋 Please apply the migration manually:');
      console.log('1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/jtpqkbybuxbcvqeffmtf');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Copy and run the SQL from: supabase/migrations/009_update_generate_trader_metadata_prompt.sql');
      return;
    }
    
    console.log('Existing prompts found:', existing?.length || 0);
    
    if (existing && existing.length > 0) {
      console.log('\n✅ The prompt table is accessible. The migration can be applied through the Supabase Dashboard.');
    } else {
      console.log('\n⚠️  No prompts found in the database. You may need to seed the initial prompts first.');
    }
    
    console.log('\n📋 To apply the migration:');
    console.log('1. Go to: https://supabase.com/dashboard/project/jtpqkbybuxbcvqeffmtf/sql/new');
    console.log('2. Copy the contents of: supabase/migrations/009_update_generate_trader_metadata_prompt.sql');
    console.log('3. Paste and run the SQL in the editor');
    console.log('\nThis will update the generate-trader-metadata prompt to include proper indicator examples.');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

applyMigration();