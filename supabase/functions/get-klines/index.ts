import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Redis } from 'https://esm.sh/@upstash/redis@1.34.3';

// Initialize Redis client
const redisUrl = Deno.env.get('UPSTASH_REDIS_URL')!;
const redisToken = Deno.env.get('UPSTASH_REDIS_TOKEN')!;
const redis = new Redis({ url: redisUrl, token: redisToken });

// CORS headers
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
    const { symbol, timeframe, limit = 100 } = await req.json();

    if (!symbol || !timeframe) {
      return new Response(
        JSON.stringify({ error: 'Missing symbol or timeframe' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Fetch klines from Redis
    const klineKey = `klines:${symbol}:${timeframe}`;
    const klines = await redis.zrange(klineKey, -limit, -1) as string[];

    // Parse klines
    const parsedKlines = klines.map(k =>
      typeof k === 'string' ? JSON.parse(k) : k
    );

    // Also fetch current ticker data
    const tickerKey = `ticker:${symbol}`;
    const tickerData = await redis.get(tickerKey);

    return new Response(
      JSON.stringify({
        klines: parsedKlines,
        ticker: tickerData,
        symbol,
        timeframe
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error fetching klines:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});