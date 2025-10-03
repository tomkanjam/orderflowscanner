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
  const timestamp = new Date().toISOString();

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    console.log(`[${timestamp}] ========================================`);
    console.log(`[${timestamp}] provision-machine invoked`);
    console.log(`[${timestamp}] Method: ${req.method}`);

    const { userId, region = 'sjc', cpuPriority = 'normal' }: ProvisionRequest = await req.json();
    console.log(`[${timestamp}] Request: userId=${userId}, region=${region}, cpuPriority=${cpuPriority}`);

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

    if (subscriptionError || !subscription) {
      return new Response(
        JSON.stringify({ error: 'User subscription not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (subscription.tier !== 'elite') {
      return new Response(
        JSON.stringify({ error: 'Elite tier required for cloud execution' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for ANY existing machine (all statuses)
    const { data: existing, error: existingError } = await supabase
      .from('cloud_machines')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();  // Returns null if not found, not an error

    if (existingError) {
      console.error('Error checking for existing machine:', existingError);
      return new Response(
        JSON.stringify({ error: 'Failed to check existing machine', details: existingError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Machine already active - return it
    if (existing && ['provisioning', 'starting', 'running'].includes(existing.status)) {
      console.log(`[${new Date().toISOString()}] Existing active machine found:`, existing.machine_id, existing.status);
      return new Response(
        JSON.stringify({
          machineId: existing.machine_id,
          websocketUrl: existing.websocket_url,
          status: existing.status,
          message: 'Machine already active'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Machine in stopping state - reject with clear error
    if (existing && existing.status === 'stopping') {
      console.warn(`[${new Date().toISOString()}] Machine is stopping, cannot provision:`, existing.machine_id);
      return new Response(
        JSON.stringify({
          error: 'Machine is currently stopping',
          message: 'Please wait for the machine to fully stop before restarting.',
          machineId: existing.machine_id,
          status: existing.status
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Declare machine and wasReused variables
    let machine;
    let wasReused = false;

    // Machine in terminal state (stopped, error) - reuse record
    if (existing && ['stopped', 'error'].includes(existing.status)) {
      console.log(`[${new Date().toISOString()}] Reusing existing machine in ${existing.status} state:`, existing.machine_id);

      // Archive previous error if exists
      if (existing.error_message) {
        const previousError = {
          error: existing.error_message,
          error_count: existing.error_count,
          timestamp: existing.updated_at
        };

        // Log retry event with context
        await supabase
          .from('cloud_events')
          .insert({
            machine_id: existing.machine_id,
            user_id: userId,
            event_type: 'machine_retry',
            severity: 'info',
            message: `Retrying provision after ${existing.status} state`,
            details: { previous_error: previousError, region },
          });

        console.log(`[${new Date().toISOString()}] Archived previous error to cloud_events`);
      }

      // Reset machine to provisioning state
      const { data: resetMachine, error: updateError } = await supabase
        .from('cloud_machines')
        .update({
          status: 'provisioning',
          region: region,  // Allow region change on retry
          error_message: null,  // Clear previous error
          provisioned_at: null,  // Reset lifecycle timestamps
          started_at: null,
          stopped_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error(`[${new Date().toISOString()}] Failed to reset machine:`, updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to reset machine record', details: updateError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[${new Date().toISOString()}] Machine reset to provisioning state:`, resetMachine.machine_id);
      machine = resetMachine;
      wasReused = true;
    } else {
      // Only reach here if no existing machine (first-time provision)
      const machineId = `vyx-${userId.substring(0, 8)}`;
      const websocketUrl = `wss://${machineId}.fly.dev`;

      console.log(`[${new Date().toISOString()}] First-time provision for user ${userId}, creating new machine:`, machineId);

      // Create database record in "provisioning" state
      const { data: newMachine, error: insertError } = await supabase
        .from('cloud_machines')
        .insert({
          user_id: userId,
          machine_id: machineId,
          region: region,
          status: 'provisioning',
          websocket_url: websocketUrl,
          error_count: 0,  // Initialize error count
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

      machine = newMachine;
      wasReused = false;
    }

    console.log(`[${new Date().toISOString()}] Machine provisioning initiated:`, machine.machine_id);

    // Call Fly.io API to provision machine
    const flyToken = Deno.env.get('FLY_API_TOKEN');
    const flyAppName = Deno.env.get('FLY_APP_NAME') || 'vyx-app';
    // Use specific deployment tag for immutability and guaranteed fresh code
    const dockerImage = Deno.env.get('DOCKER_IMAGE') || 'registry.fly.io/vyx-app:deployment-01K6NX8XAC5KFQHMJ58DH6TFDA';

    console.log(`[${new Date().toISOString()}] Using deployment image: ${dockerImage}`);

    console.log(`[${new Date().toISOString()}] Environment check:`);
    console.log(`  - FLY_API_TOKEN: ${flyToken ? `EXISTS (length: ${flyToken.length})` : 'MISSING ❌'}`);
    console.log(`  - FLY_APP_NAME: ${flyAppName}`);
    console.log(`  - DOCKER_IMAGE: ${dockerImage}`);

    if (!flyToken) {
      const errorMsg = 'FLY_API_TOKEN not configured - cannot provision Fly.io machine';
      console.error(`[${new Date().toISOString()}] CRITICAL ERROR: ${errorMsg}`);

      // Update machine to error state
      await supabase
        .from('cloud_machines')
        .update({
          status: 'error',
          error_message: errorMsg,
        })
        .eq('id', machine.id);

      return new Response(
        JSON.stringify({
          error: errorMsg,
          message: 'Server configuration error - FLY_API_TOKEN missing',
          machineId: machine.machine_id,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (flyToken) {
      try {
        console.log(`[${new Date().toISOString()}] Calling Fly.io API to create machine in ${region}...`);
        console.log(`[${new Date().toISOString()}]   App: ${flyAppName}`);
        console.log(`[${new Date().toISOString()}]   Machine name: ${machine.machine_id}`);
        console.log(`[${new Date().toISOString()}]   Image: ${dockerImage}`);

        const requestBody = {
          name: machine.machine_id,
          region: region,
          config: {
            image: dockerImage,
            auto_destroy: true,
            restart: {
              policy: 'on-failure',
              max_retries: 3,
            },
            env: {
              USER_ID: userId,
              MACHINE_ID: machine.machine_id,
              SUPABASE_URL: supabaseUrl,
              SUPABASE_SERVICE_KEY: supabaseServiceKey,
              GEMINI_API_KEY: Deno.env.get('GEMINI_API_KEY') || '',
              CPU_PRIORITY: cpuPriority,
              // Add timestamp to ensure fresh image pull
              IMAGE_TIMESTAMP: new Date().toISOString(),
            },
            services: [
              {
                ports: [
                  { port: 80, handlers: ['http'] },
                  { port: 443, handlers: ['tls', 'http'] },
                  { port: 8080, handlers: ['http'] },
                ],
                protocol: 'tcp',
                internal_port: 8080,
              },
            ],
          },
        };

        console.log(`[${new Date().toISOString()}] Fly.io API request body:`, JSON.stringify(requestBody, null, 2));

        const flyResponse = await fetch(
          `https://api.machines.dev/v1/apps/${flyAppName}/machines`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${flyToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          }
        );

        console.log(`[${new Date().toISOString()}] Fly.io API response status: ${flyResponse.status} ${flyResponse.statusText}`);

        if (!flyResponse.ok) {
          const errorText = await flyResponse.text();
          console.error(`[${new Date().toISOString()}] Fly.io API error response:`, errorText);
          throw new Error(`Fly API error (${flyResponse.status}): ${errorText}`);
        }

        const flyMachine = await flyResponse.json();
        console.log(`[${new Date().toISOString()}] ✅ Fly machine created successfully:`, flyMachine.id);
        console.log(`[${new Date().toISOString()}] Fly machine details:`, JSON.stringify(flyMachine, null, 2));

        // Update machine status to 'starting'
        await supabase
          .from('cloud_machines')
          .update({
            status: 'starting',
            started_at: new Date().toISOString(),
          })
          .eq('id', machine.id);

        // Log success event
        await supabase
          .from('cloud_events')
          .insert({
            machine_id: machine.machine_id,
            event_type: 'provision',
            message: 'Machine provisioned successfully on Fly.io',
            details: { fly_machine_id: flyMachine.id, region },
            user_id: userId,
          });

        return new Response(
          JSON.stringify({
            machineId: machine.machine_id,
            websocketUrl: machine.websocket_url,
            status: 'starting',
            flyMachineId: flyMachine.id,
            wasReused: wasReused,  // Indicates if existing record was reused
            message: wasReused
              ? 'Machine restarted successfully on Fly.io'
              : 'Machine provisioned successfully on Fly.io'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

      } catch (flyError) {
        console.error(`[${new Date().toISOString()}] ❌ Fly.io provisioning failed:`, flyError);
        console.error(`[${new Date().toISOString()}] Error details:`, {
          name: flyError instanceof Error ? flyError.name : 'Unknown',
          message: flyError instanceof Error ? flyError.message : String(flyError),
          stack: flyError instanceof Error ? flyError.stack : 'N/A',
        });

        // Update machine status to 'error'
        await supabase
          .from('cloud_machines')
          .update({
            status: 'error',
            error_message: flyError instanceof Error ? flyError.message : 'Fly.io provisioning failed',
          })
          .eq('id', machine.id);

        // Increment error_count atomically
        await supabase.rpc('increment_machine_error_count', {
          p_machine_id: machine.id
        });

        console.log(`[${new Date().toISOString()}] Machine marked as error, error_count incremented`);

        // Log error event
        await supabase
          .from('cloud_events')
          .insert({
            machine_id: machine.machine_id,
            event_type: 'error',
            severity: 'error',
            message: 'Failed to provision machine on Fly.io',
            details: { error: flyError instanceof Error ? flyError.message : String(flyError) },
            user_id: userId,
          });

        return new Response(
          JSON.stringify({
            error: 'Failed to provision machine on Fly.io',
            message: flyError instanceof Error ? flyError.message : 'Unknown error',
            machineId: machine.machine_id,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

  } catch (error) {
    console.error(`[${new Date().toISOString()}] ❌ UNHANDLED PROVISIONING ERROR:`, error);
    console.error(`[${new Date().toISOString()}] Error details:`, {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'N/A',
    });

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Check Edge Function logs for full error details'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
