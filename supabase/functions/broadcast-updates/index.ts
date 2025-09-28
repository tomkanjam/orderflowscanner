import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

interface KlineUpdate {
  symbol: string;
  timeframe: string;
  kline: {
    openTime: number;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    closeTime: number;
    quoteVolume: string;
    trades: number;
  };
  type: 'update' | 'close' | 'new';
  timestamp: number;
}

interface BroadcastRequest {
  channel: string;
  event: string;
  payload: KlineUpdate | any;
  auth?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Get CORS headers for this request
  const corsHeaders = getCorsHeaders(req);

  try {
    // Verify authentication (service role key required)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const body: BroadcastRequest = await req.json();
    const { channel, event, payload } = body;

    // Validate input
    if (!channel || !event || !payload) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: channel, event, payload' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Broadcast to the specified channel
    const channelName = channel.startsWith('market:') ? channel : `market:${channel}`;

    const { error } = await supabase
      .channel(channelName)
      .send({
        type: 'broadcast',
        event,
        payload
      });

    if (error) {
      console.error('Broadcast error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to broadcast', details: error }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Log for monitoring
    console.log(`Broadcast to ${channelName}:`, {
      event,
      payloadSize: JSON.stringify(payload).length,
      timestamp: new Date().toISOString()
    });

    return new Response(
      JSON.stringify({
        success: true,
        channel: channelName,
        event,
        timestamp: Date.now()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in broadcast-updates:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});