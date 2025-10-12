import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const timestamp = new Date().toISOString();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log(`[${timestamp}] get-trader-status invoked`);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get trader ID from URL query parameter
    const url = new URL(req.url);
    const traderId = url.searchParams.get('traderId');

    if (!traderId) {
      return new Response(
        JSON.stringify({ error: 'traderId query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${timestamp}] Request: traderId=${traderId}`);

    // Initialize Supabase client with user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error(`[${timestamp}] Authentication failed:`, authError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${timestamp}] Authenticated user: ${user.id}`);

    // Call shared Go backend API to get trader status
    const goBackendUrl = Deno.env.get('GO_BACKEND_URL') || 'http://localhost:8080';
    const statusUrl = `${goBackendUrl}/api/v1/traders/${traderId}/status`;

    console.log(`[${timestamp}] Calling Go backend: ${statusUrl}`);

    const backendResponse = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
      },
    });

    const responseData = await backendResponse.json();

    if (!backendResponse.ok) {
      console.error(`[${timestamp}] Backend error (${backendResponse.status}):`, responseData);
      return new Response(
        JSON.stringify(responseData),
        {
          status: backendResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`[${timestamp}] ✅ Retrieved trader status`);

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[${timestamp}] ❌ Error:`, error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
