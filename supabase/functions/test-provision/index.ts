/**
 * Test version of provision-machine that bypasses authentication
 * FOR TESTING ONLY - uses hardcoded user ID
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const { region = 'sin', cpuPriority = 'normal' } = await req.json();

    // HARDCODED FOR TESTING
    const userId = '63eea370-27a1-4099-866a-e3ed340b278d';

    console.log('[TestProvision] Starting with userId:', userId);

    // Get environment variables
    const flyToken = Deno.env.get('FLY_API_TOKEN');
    const dockerImage = Deno.env.get('DOCKER_IMAGE') || 'registry.fly.io/vyx-app:stub';
    const flyAppName = Deno.env.get('FLY_APP_NAME') || 'vyx-app';

    console.log('[TestProvision] Fly token present:', !!flyToken);
    console.log('[TestProvision] Docker image:', dockerImage);
    console.log('[TestProvision] Fly app name:', flyAppName);

    if (!flyToken) {
      return new Response(
        JSON.stringify({ error: 'FLY_API_TOKEN not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify Elite tier
    const { data: subscription, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .select('tier')
      .eq('user_id', userId)
      .single();

    console.log('[TestProvision] Subscription query result:', { subscription, subscriptionError });

    if (subscriptionError || !subscription) {
      return new Response(
        JSON.stringify({ error: 'User subscription not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (subscription.tier !== 'elite') {
      return new Response(
        JSON.stringify({ error: `Elite tier required. Current tier: ${subscription.tier}` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate machine ID
    const machineId = `trademind-${userId.split('-')[0]}`;
    console.log('[TestProvision] Machine ID:', machineId);

    // Create Fly machine
    const cpuConfig = cpuPriority === 'high' ? { cpus: 2, memory_mb: 512 } : { cpus: 1, memory_mb: 256 };

    const flyConfig = {
      name: machineId,
      region: region,
      config: {
        image: dockerImage,
        ...cpuConfig,
        services: [
          {
            ports: [
              {
                port: 443,
                handlers: ['tls', 'http']
              },
              {
                port: 80,
                handlers: ['http']
              }
            ],
            protocol: 'tcp',
            internal_port: 8080
          }
        ],
        checks: {
          health: {
            type: 'http',
            port: 8080,
            method: 'get',
            path: '/health',
            interval: '30s',
            timeout: '5s'
          }
        }
      }
    };

    console.log('[TestProvision] Fly config:', JSON.stringify(flyConfig, null, 2));

    const flyResponse = await fetch(`https://api.fly.io/v1/apps/${flyAppName}/machines`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(flyConfig)
    });

    const flyResponseText = await flyResponse.text();
    console.log('[TestProvision] Fly response status:', flyResponse.status);
    console.log('[TestProvision] Fly response body:', flyResponseText);

    if (!flyResponse.ok) {
      return new Response(
        JSON.stringify({
          error: 'Failed to provision machine on Fly.io',
          message: `Fly API error (${flyResponse.status}): ${flyResponseText}`,
          machineId
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const flyMachine = JSON.parse(flyResponseText);
    console.log('[TestProvision] Fly machine created:', flyMachine.id);

    // Store in database
    const { error: dbError } = await supabase
      .from('cloud_machines')
      .insert({
        user_id: userId,
        machine_id: machineId,
        region: region,
        status: 'provisioning',
        cpus: cpuConfig.cpus,
        memory_mb: cpuConfig.memory_mb,
        fly_app_name: flyAppName,
        fly_machine_version: flyMachine.id
      });

    if (dbError) {
      console.error('[TestProvision] Database error:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to store machine record', message: dbError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[TestProvision] Success! Machine provisioned:', machineId);

    return new Response(
      JSON.stringify({
        success: true,
        machineId,
        flyMachineId: flyMachine.id,
        region,
        status: 'provisioning'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[TestProvision] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
