/**
 * Get user access token for testing
 * This script signs in as tom@tomk.ca and retrieves the JWT
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jtpqkbybuxbcvqeffmtf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0cHFrYnlidXhiY3ZxZWZmbXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwMTY0MTIsImV4cCI6MjA2NTU5MjQxMn0.LDJmCjcjl5Qpbi8Kp4XnCfpSn2LsOHjN-ITZYX-6PYA';

async function getUserToken() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  console.log('[GetToken] Requesting magic link for tom@tomk.ca...');

  const { error } = await supabase.auth.signInWithOtp({
    email: 'tom@tomk.ca',
    options: {
      shouldCreateUser: false
    }
  });

  if (error) {
    console.error('[GetToken] Error:', error.message);
    return;
  }

  console.log('[GetToken] Magic link sent to tom@tomk.ca');
  console.log('[GetToken] Please check your email and click the link, then run this script again.');
  console.log('\nAlternatively, you can get the token from the browser:');
  console.log('1. Open browser console');
  console.log('2. Run: localStorage.getItem("sb-jtpqkbybuxbcvqeffmtf-auth-token")');
  console.log('3. Copy the access_token value');
}

getUserToken();
