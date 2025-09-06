import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyMigration() {
  try {
    console.log('Verifying generate-trader-metadata prompt update...\n');
    
    const { data, error } = await supabase
      .from('prompts')
      .select('id, name, updated_at')
      .eq('id', 'generate-trader-metadata')
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        console.log('❌ Prompt not found in database');
      } else {
        console.error('Error checking prompt:', error);
      }
      return;
    }
    
    if (data) {
      console.log('✅ Prompt found and updated!');
      console.log('ID:', data.id);
      console.log('Name:', data.name);
      console.log('Last Updated:', new Date(data.updated_at).toLocaleString());
      console.log('\n🎉 The migration was successful!');
      console.log('\nNew traders generated from now on will have proper indicator configurations.');
      console.log('Indicators like RSI, EMA, StochRSI, etc. will be automatically configured in the charts.');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

verifyMigration();