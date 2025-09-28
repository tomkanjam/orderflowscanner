import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Redis } from 'https://esm.sh/@upstash/redis@1.34.3';
import { z } from 'https://esm.sh/zod@3.22.4';

// Input validation schema
const requestSchema = z.object({
  symbol: z.string().min(1).max(20),
  timeframe: z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d']),
  limit: z.number().min(1).max(500).default(100)
});

// Initialize Redis client with error handling
let redis: Redis | null = null;

try {
  const redisUrl = Deno.env.get('UPSTASH_REDIS_URL');
  const redisToken = Deno.env.get('UPSTASH_REDIS_TOKEN');

  if (!redisUrl || !redisToken) {
    console.error('Redis credentials not configured');
  } else {
    redis = new Redis({ url: redisUrl, token: redisToken });
  }
} catch (error) {
  console.error('Failed to initialize Redis client:', error);
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Transform kline data from string format to proper numeric format
function transformKline(klineStr: string): any {
  try {
    const kline = typeof klineStr === 'string' ? JSON.parse(klineStr) : klineStr;

    // Transform string values to numbers for numeric fields
    return {
      openTime: parseInt(kline.openTime || kline[0]),
      open: parseFloat(kline.open || kline[1]),
      high: parseFloat(kline.high || kline[2]),
      low: parseFloat(kline.low || kline[3]),
      close: parseFloat(kline.close || kline[4]),
      volume: parseFloat(kline.volume || kline[5]),
      closeTime: parseInt(kline.closeTime || kline[6]),
      quoteVolume: parseFloat(kline.quoteVolume || kline[7]),
      trades: parseInt(kline.trades || kline[8]),
      takerBuyBaseVolume: parseFloat(kline.takerBuyBaseVolume || kline[9]),
      takerBuyQuoteVolume: parseFloat(kline.takerBuyQuoteVolume || kline[10])
    };
  } catch (error) {
    console.error('Failed to transform kline:', error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  const startTime = Date.now();

  try {
    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Validate input
    const parseResult = requestSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({
          error: 'Validation failed',
          details: parseResult.error.errors
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { symbol, timeframe, limit } = parseResult.data;

    // Check Redis availability
    if (!redis) {
      return new Response(
        JSON.stringify({
          error: 'Data service temporarily unavailable',
          fallback: true
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Fetch klines from Redis with error handling
    let klines: string[] = [];
    let tickerData = null;

    try {
      const klineKey = `klines:${symbol}:${timeframe}`;

      // Use ZRANGE to get the most recent klines (sorted by timestamp)
      const rawKlines = await redis.zrange(klineKey, -limit, -1) as string[];

      if (!rawKlines || rawKlines.length === 0) {
        console.log(`No klines found for ${symbol}:${timeframe}`);
      } else {
        // Transform klines to proper numeric format
        klines = rawKlines
          .map(transformKline)
          .filter(k => k !== null);
      }

      // Fetch current ticker data
      const tickerKey = `ticker:${symbol}`;
      tickerData = await redis.get(tickerKey);

      // Transform ticker data if it exists
      if (tickerData && typeof tickerData === 'object') {
        tickerData = {
          symbol: tickerData.symbol || symbol,
          price: parseFloat(tickerData.price || tickerData.lastPrice || 0),
          volume: parseFloat(tickerData.volume || 0),
          quoteVolume: parseFloat(tickerData.quoteVolume || 0),
          priceChangePercent: parseFloat(tickerData.priceChangePercent || 0),
          high24h: parseFloat(tickerData.high24h || tickerData.highPrice || 0),
          low24h: parseFloat(tickerData.low24h || tickerData.lowPrice || 0)
        };
      }
    } catch (redisError) {
      console.error('Redis operation failed:', redisError);
      // Return partial success with empty data rather than failing completely
      return new Response(
        JSON.stringify({
          klines: [],
          ticker: null,
          symbol,
          timeframe,
          cached: false,
          latency: Date.now() - startTime,
          error: 'Data fetch failed, returning empty dataset'
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-Response-Time': `${Date.now() - startTime}ms`
          },
          status: 200
        }
      );
    }

    // Return successful response
    return new Response(
      JSON.stringify({
        klines,
        ticker: tickerData,
        symbol,
        timeframe,
        count: klines.length,
        cached: false,
        latency: Date.now() - startTime
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=5',
          'X-Response-Time': `${Date.now() - startTime}ms`
        },
        status: 200
      }
    );
  } catch (error) {
    console.error('Unexpected error in get-klines function:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        latency: Date.now() - startTime
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Response-Time': `${Date.now() - startTime}ms`
        }
      }
    );
  }
});