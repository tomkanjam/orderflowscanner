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

    // Call Fly.io API to stop machine
    const flyToken = Deno.env.get('FLY_API_TOKEN');
    const flyAppName = Deno.env.get('FLY_APP_NAME') || 'vyx-app';

    if (flyToken) {
      try {
        console.log(`Calling Fly.io API to stop machine ${machine.machine_id}...`);

        const flyResponse = await fetch(
          `https://api.machines.dev/v1/apps/${flyAppName}/machines/${machine.machine_id}/stop`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${flyToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (!flyResponse.ok) {
          const errorText = await flyResponse.text();
          throw new Error(`Fly API error (${flyResponse.status}): ${errorText}`);
        }

        console.log('Fly machine stopped successfully:', machine.machine_id);

        // Update to stopped status
        await supabase
          .from('cloud_machines')
          .update({ status: 'stopped' })
          .eq('id', machine.id);

        // Log success event
        await supabase
          .from('cloud_events')
          .insert({
            machine_id: machine.machine_id,
            event_type: 'stop',
            message: 'Machine stopped successfully on Fly.io',
            user_id: userId,
          });

        return new Response(
          JSON.stringify({
            machineId: machine.machine_id,
            status: 'stopped',
            message: 'Machine stopped successfully on Fly.io'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (flyError) {
        console.error('Fly.io stop failed:', flyError);

        // Update machine status to 'error'
        await supabase
          .from('cloud_machines')
          .update({
            status: 'error',
            error_message: flyError instanceof Error ? flyError.message : 'Fly.io stop failed',
            error_count: (machine.error_count || 0) + 1,
          })
          .eq('id', machine.id);

        // Log error event
        await supabase
          .from('cloud_events')
          .insert({
            machine_id: machine.machine_id,
            event_type: 'error',
            severity: 'error',
            message: 'Failed to stop machine on Fly.io',
            details: { error: flyError instanceof Error ? flyError.message : String(flyError) },
            user_id: userId,
          });

        return new Response(
          JSON.stringify({
            error: 'Failed to stop machine on Fly.io',
            message: flyError instanceof Error ? flyError.message : 'Unknown error',
            machineId: machine.machine_id,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // FLY_API_TOKEN not set - simulate stop for development
      console.warn('FLY_API_TOKEN not set - running in simulation mode');

      // Simulate stopping delay
      setTimeout(async () => {
        await supabase
          .from('cloud_machines')
          .update({ status: 'stopped' })
          .eq('id', machine.id);
      }, 2000);

      console.log('Machine stop initiated (simulation mode):', machine.machine_id);

      return new Response(
        JSON.stringify({
          machineId: machine.machine_id,
          status: 'stopping',
          message: 'Machine stop initiated (simulation mode - FLY_API_TOKEN not set)'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
