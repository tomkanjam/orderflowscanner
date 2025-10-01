import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StopRequest {
  userId: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId }: StopRequest = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's active machine
    const { data: machine, error: fetchError } = await supabase
      .from('cloud_machines')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['provisioning', 'starting', 'running'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (fetchError || !machine) {
      return new Response(
        JSON.stringify({ error: 'No active machine found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Stopping machine:', machine.machine_id);

    // Update machine status to stopping
    const { error: updateError } = await supabase
      .from('cloud_machines')
      .update({
        status: 'stopping',
        stopped_at: new Date().toISOString()
      })
      .eq('id', machine.id);

    if (updateError) {
      console.error('Failed to update machine status:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update machine status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // TODO: In production, this would call Fly.io API to actually stop the machine
    // For now, we'll update to stopped status immediately
    // The actual Fly machine stopping will be done via flyctl CLI for beta testing

    // Simulate stopping delay, then update to stopped
    setTimeout(async () => {
      await supabase
        .from('cloud_machines')
        .update({ status: 'stopped' })
        .eq('id', machine.id);
    }, 2000);

    console.log('Machine stop initiated:', machine.machine_id);

    return new Response(
      JSON.stringify({
        machineId: machine.machine_id,
        status: 'stopping',
        message: 'Machine stop initiated'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Stop machine error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
