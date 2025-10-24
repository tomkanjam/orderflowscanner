import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get userId from query params or body
    const url = new URL(req.url);
    let userId = url.searchParams.get('userId');

    if (!userId && req.method === 'POST') {
      const body = await req.json();
      userId = body.userId;
    }

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all machines for user, ordered by most recent
    const { data: machines, error: fetchError } = await supabase
      .from('cloud_machines')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('Failed to fetch machines:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch machine status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!machines || machines.length === 0) {
      return new Response(
        JSON.stringify({
          hasMachine: false,
          machines: [],
          activeMachine: null
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find active machine
    const activeMachine = machines.find(m =>
      ['provisioning', 'starting', 'running'].includes(m.status)
    );

    console.log('Machine status fetched for user:', userId);

    return new Response(
      JSON.stringify({
        hasMachine: true,
        machines: machines,
        activeMachine: activeMachine || null,
        totalMachines: machines.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Get machine status error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
