import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProvisionRequest {
  userId: string;
  region?: string;
  cpuPriority?: 'low' | 'normal' | 'high';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, region = 'sjc', cpuPriority = 'normal' }: ProvisionRequest = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify Elite tier
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (profile.subscription_tier !== 'elite') {
      return new Response(
        JSON.stringify({ error: 'Elite tier required for cloud execution' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing running machine
    const { data: existing } = await supabase
      .from('cloud_machines')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['provisioning', 'starting', 'running'])
      .single();

    if (existing) {
      console.log('Existing machine found:', existing.machine_id);
      return new Response(
        JSON.stringify({
          machineId: existing.machine_id,
          websocketUrl: existing.websocket_url,
          status: existing.status,
          message: 'Machine already running'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate machine ID
    const machineId = `trademind-${userId.substring(0, 8)}`;
    const websocketUrl = `wss://${machineId}.fly.dev`;

    // For now, create database record in "provisioning" state
    // Actual Fly.io deployment will be handled separately
    const { data: machine, error: insertError } = await supabase
      .from('cloud_machines')
      .insert({
        user_id: userId,
        machine_id: machineId,
        region: region,
        status: 'provisioning',
        websocket_url: websocketUrl,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to create machine record', details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Machine provisioning initiated:', machineId);

    // TODO: In production, this would call Fly.io API to actually provision the machine
    // For now, we'll simulate the provisioning by updating status after a delay
    // The actual Fly deployment will be done via flyctl CLI for beta testing

    return new Response(
      JSON.stringify({
        machineId: machine.machine_id,
        websocketUrl: machine.websocket_url,
        status: machine.status,
        message: 'Machine provisioning initiated. Connect via WebSocket for updates.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Provisioning error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
