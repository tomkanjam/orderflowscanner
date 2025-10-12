import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StartTraderRequest {
  traderId: string;
}

serve(async (req) => {
  const timestamp = new Date().toISOString();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log(`[${timestamp}] start-trader invoked`);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { traderId }: StartTraderRequest = await req.json();
    console.log(`[${timestamp}] Request: traderId=${traderId}`);

    if (!traderId) {
      return new Response(
        JSON.stringify({ error: 'traderId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with user's JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader }
      }
    });

    // Verify user is authenticated and get user ID
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error(`[${timestamp}] Authentication failed:`, authError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${timestamp}] Authenticated user: ${user.id}`);

    // Get user subscription tier
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('tier')
      .eq('user_id', user.id)
      .single();

    if (subError || !subscription) {
      console.error(`[${timestamp}] Failed to get subscription:`, subError);
      return new Response(
        JSON.stringify({ error: 'Failed to get subscription information' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check tier restrictions (FREE cannot start traders)
    if (subscription.tier === 'free') {
      return new Response(
        JSON.stringify({
          error: 'Upgrade required',
          message: 'Free tier users cannot start traders. Upgrade to Pro or Elite.'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${timestamp}] User tier: ${subscription.tier}`);

    // Call shared Go backend API to start trader
    const goBackendUrl = Deno.env.get('GO_BACKEND_URL') || 'http://localhost:8080';
    const startUrl = `${goBackendUrl}/api/v1/traders/${traderId}/start`;

    console.log(`[${timestamp}] Calling Go backend: ${startUrl}`);

    const backendResponse = await fetch(startUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
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

    console.log(`[${timestamp}] ✅ Trader started successfully`);

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
