import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { Redis } from 'https://esm.sh/@upstash/redis@1.34.3';

// Initialize clients
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const redisUrl = Deno.env.get('UPSTASH_REDIS_URL')!;
const redisToken = Deno.env.get('UPSTASH_REDIS_TOKEN')!;
const redis = new Redis({ url: redisUrl, token: redisToken });

// Types matching the frontend
interface TraderFilter {
  code: string;
  indicators?: any[];
  requiredTimeframes: string[];
}

interface Trader {
  id: string;
  name: string;
  filter: TraderFilter;
  tier: string;
  user_id?: string;
}

interface KlineData {
  t: number;
  T: number;
  s: string;
  i: string;
  o: string;
  c: string;
  h: string;
  l: string;
  v: string;
  n: number;
  x: boolean;
  q: string;
}

interface TickerData {
  s: string;
  c: string;
  o: string;
  h: string;
  l: string;
  v: string;
  q: string;
  p: string;
  P: string;
  n: number;
}

// Helper functions (minimal set needed for execution)
const helpers = `
  const calculateMA = (prices, period) => {
    if (prices.length < period) return null;
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  };

  const calculateRSI = (prices, period = 14) => {
    if (prices.length < period + 1) return null;

    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  };

  const calculateVolumeMA = (volumes, period) => {
    if (volumes.length < period) return null;
    const sum = volumes.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  };
`;

async function executeTraderFilter(
  trader: Trader,
  symbols: string[]
): Promise<{ symbol: string; matched: boolean; error?: string }[]> {
  const results: { symbol: string; matched: boolean; error?: string }[] = [];

  for (const symbol of symbols) {
    try {
      // Fetch ticker data
      const tickerKey = `ticker:${symbol}`;
      const tickerData = await redis.get(tickerKey) as TickerData | null;

      if (!tickerData) {
        results.push({ symbol, matched: false, error: 'No ticker data' });
        continue;
      }

      // Fetch kline data for required timeframes
      const klinesData: Record<string, KlineData[]> = {};
      for (const timeframe of trader.filter.requiredTimeframes || ['5m']) {
        const klineKey = `klines:${symbol}:${timeframe}`;
        const klines = await redis.zrange(klineKey, -100, -1) as string[];
        klinesData[timeframe] = klines.map(k =>
          typeof k === 'string' ? JSON.parse(k) : k
        );
      }

      // Create execution context
      const ticker = {
        symbol: tickerData.s,
        price: parseFloat(tickerData.c),
        open: parseFloat(tickerData.o),
        high: parseFloat(tickerData.h),
        low: parseFloat(tickerData.l),
        volume: parseFloat(tickerData.v),
        quoteVolume: parseFloat(tickerData.q),
        priceChange: parseFloat(tickerData.p),
        priceChangePercent: parseFloat(tickerData.P),
        trades: tickerData.n
      };

      // Process klines for each timeframe
      const klines: Record<string, any> = {};
      for (const [timeframe, data] of Object.entries(klinesData)) {
        if (data.length > 0) {
          klines[timeframe] = {
            prices: data.map(k => parseFloat(k.c)),
            opens: data.map(k => parseFloat(k.o)),
            highs: data.map(k => parseFloat(k.h)),
            lows: data.map(k => parseFloat(k.l)),
            volumes: data.map(k => parseFloat(k.v)),
            timestamps: data.map(k => k.t),
            closes: data.map(k => parseFloat(k.c))
          };
        }
      }

      // Execute filter code in sandboxed context
      const filterFunction = new Function(
        'ticker',
        'klines',
        helpers + '\n' + trader.filter.code
      );

      const matched = Boolean(filterFunction(ticker, klines));
      results.push({ symbol, matched });

    } catch (error) {
      console.error(`Error executing filter for ${symbol}:`, error);
      results.push({
        symbol,
        matched: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

serve(async (req) => {
  try {
    // Parse request
    const { traderId, symbols, userId } = await req.json();

    if (!traderId || !symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch trader from database
    const { data: trader, error: traderError } = await supabase
      .from('traders')
      .select('*')
      .eq('id', traderId)
      .single();

    if (traderError || !trader) {
      return new Response(
        JSON.stringify({ error: 'Trader not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Verify access (if user-specific)
    if (trader.user_id && userId && trader.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Execute filter for all symbols
    const results = await executeTraderFilter(trader, symbols);

    // Filter for matches
    const matches = results
      .filter(r => r.matched)
      .map(r => r.symbol);

    // Store results in database if there are matches
    if (matches.length > 0) {
      const { error: insertError } = await supabase
        .from('trader_signals')
        .insert({
          trader_id: traderId,
          symbols: matches,
          timestamp: new Date().toISOString(),
          metadata: {
            totalSymbols: symbols.length,
            matchCount: matches.length
          }
        });

      if (insertError) {
        console.error('Failed to store signals:', insertError);
      }

      // Publish to Realtime channel
      const channel = supabase.channel('signals');
      await channel.send({
        type: 'broadcast',
        event: 'new-signal',
        payload: {
          traderId,
          symbols: matches,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Return results
    return new Response(
      JSON.stringify({
        traderId,
        timestamp: new Date().toISOString(),
        totalSymbols: symbols.length,
        matches,
        results
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});