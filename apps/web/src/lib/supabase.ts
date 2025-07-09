import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function addToWaitlist(email: string, source?: string) {
  const { data, error } = await supabase
    .from('waitlist')
    .insert([
      {
        email,
        referral_source: source,
        utm_source: typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('utm_source') : null,
        utm_medium: typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('utm_medium') : null,
        utm_campaign: typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('utm_campaign') : null,
      }
    ])
    .select()
    .single();

  if (error) {
    // Check if it's a duplicate email error
    if (error.code === '23505') {
      throw new Error('You\'re already on the waitlist!');
    }
    throw error;
  }

  return data;
}

export async function getWaitlistCount() {
  const { count, error } = await supabase
    .from('waitlist')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching waitlist count:', error);
    return 0;
  }

  return count || 0;
}