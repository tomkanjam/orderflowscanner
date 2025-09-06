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

async function listPrompts() {
  const { data, error } = await supabase
    .from('prompts')
    .select('id, name, category, is_active')
    .order('id');
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Prompts in database:');
    data?.forEach(p => console.log(`- ${p.id} (${p.category}): ${p.name} [active: ${p.is_active}]`));
  }
}

listPrompts();
