import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from 'https://esm.sh/zod@3.22.4';
import { fetchKlines, fetchTicker, formatKlinesForEdgeFunction } from '../_shared/goServerClient.ts';
import { getCorsHeaders, handleCorsPreflightRequest, withCorsHeaders } from '../_shared/cors.ts';
import { validateAuth, checkRateLimit, rateLimitResponse, logAuthSuccess, unauthorizedResponse } from '../_shared/auth.ts';

// Input validation schema
const requestSchema = z.object({
  symbol: z.string().min(1).max(20),
  timeframe: z.enum(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d']),
  limit: z.number().min(1).max(500).default(100)
});


serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req);
  if (preflightResponse) {
    return preflightResponse;
  }

  // Get CORS headers for this request
  const corsHeaders = getCorsHeaders(req);

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

  // Validate authentication - allow anonymous but with rate limits
  const authResult = await validateAuth(req, {
    requireAuth: false,
    allowAnonymous: true
  });

  if (!authResult.success) {
    return unauthorizedResponse(authResult.error || 'Authentication failed', corsHeaders);
  }

  const authContext = authResult.context!;

  // Check rate limits based on user tier
  if (!checkRateLimit(authContext, 'get-klines')) {
    return rateLimitResponse(authContext, corsHeaders);
  }

  // Log successful authentication
  logAuthSuccess(authContext, 'get-klines');

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

    // Fetch data from Go server
    let klines: any[] = [];
    let tickerData = null;

    try {
      // Fetch klines from Go server
      const rawKlines = await fetchKlines(symbol, timeframe, limit);

      if (rawKlines && rawKlines.length > 0) {
        // Format klines to match expected format
        klines = formatKlinesForEdgeFunction(rawKlines);
      } else {
        console.log(`No klines found for ${symbol}:${timeframe}`);
      }

      // Fetch ticker data from Go server
      const ticker = await fetchTicker(symbol);

      if (ticker) {
        // Transform to match expected format
        tickerData = {
          symbol: ticker.s,
          price: parseFloat(ticker.c),
          volume: parseFloat(ticker.v),
          quoteVolume: parseFloat(ticker.q),
          priceChangePercent: parseFloat(ticker.P),
          high24h: parseFloat(ticker.h),
          low24h: parseFloat(ticker.l)
        };
      }
    } catch (fetchError) {
      console.error('Go server fetch failed:', fetchError);
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

    // Return successful response with auth context
    return new Response(
      JSON.stringify({
        klines,
        ticker: tickerData,
        symbol,
        timeframe,
        count: klines.length,
        cached: false,
        latency: Date.now() - startTime,
        auth: {
          tier: authContext.userTier,
          authenticated: authContext.isAuthenticated
        }
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=5',
          'X-Response-Time': `${Date.now() - startTime}ms`,
          'X-User-Tier': authContext.userTier
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