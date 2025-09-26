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

const EDGE_FUNCTION_URL = Deno.env.get('EDGE_FUNCTION_URL') || 'https://your-project.supabase.co/functions/v1/execute-trader';

interface Trader {
  id: string;
  name: string;
  enabled: boolean;
  tier: string;
  user_id?: string;
}

// Intervals to check for closed candles
const INTERVALS = ['1m', '5m', '15m', '1h'];

// Get all symbols being tracked
async function getActiveSymbols(): Promise<string[]> {
  // For now, use the default list - in production this would come from database
  return [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'SHIBUSDT', 'DOTUSDT'
  ];
}

// Check which intervals have new closed candles
async function getNewClosedCandles(symbol: string): Promise<string[]> {
  const closedIntervals: string[] = [];
  const now = Date.now();

  for (const interval of INTERVALS) {
    const lastClosedKey = `lastClosed:${symbol}:${interval}`;
    const lastProcessedKey = `lastProcessed:${symbol}:${interval}`;

    const [lastClosed, lastProcessed] = await Promise.all([
      redis.get(lastClosedKey),
      redis.get(lastProcessedKey)
    ]);

    // If we have a new closed candle
    if (lastClosed && (!lastProcessed || Number(lastClosed) > Number(lastProcessed))) {
      closedIntervals.push(interval);
      // Mark as processed
      await redis.set(lastProcessedKey, lastClosed, { ex: 86400 }); // 24h TTL
    }
  }

  return closedIntervals;
}

// Trigger trader execution for specific intervals
async function triggerTraderExecutions(symbols: string[], intervals: string[]) {
  // Get all active traders that match these intervals
  const { data: traders, error } = await supabase
    .from('traders')
    .select('*')
    .eq('enabled', true)
    .in('execution_interval', intervals);

  if (error || !traders) {
    console.error('Failed to fetch traders:', error);
    return;
  }

  console.log(`Triggering ${traders.length} traders for intervals: ${intervals.join(', ')}`);

  // Execute each trader
  const promises = traders.map(async (trader: Trader) => {
    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({
          traderId: trader.id,
          symbols,
          userId: trader.user_id
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      console.log(`Trader ${trader.name}: ${result.matches.length} matches`);

    } catch (error) {
      console.error(`Failed to execute trader ${trader.id}:`, error);
    }
  });

  await Promise.allSettled(promises);
}

serve(async (req) => {
  try {
    // This can be triggered by:
    // 1. Cron job (every minute)
    // 2. Manual trigger
    // 3. Webhook from data collector when candles close

    const method = req.method;

    if (method !== 'POST' && method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    console.log(`Trigger execution started at ${new Date().toISOString()}`);

    // Get active symbols
    const symbols = await getActiveSymbols();

    // Check for new closed candles across all symbols
    const symbolsWithNewCandles: Map<string, string[]> = new Map();

    for (const symbol of symbols) {
      const closedIntervals = await getNewClosedCandles(symbol);
      if (closedIntervals.length > 0) {
        symbolsWithNewCandles.set(symbol, closedIntervals);
      }
    }

    // Group by interval
    const intervalToSymbols: Map<string, string[]> = new Map();
    for (const [symbol, intervals] of symbolsWithNewCandles) {
      for (const interval of intervals) {
        if (!intervalToSymbols.has(interval)) {
          intervalToSymbols.set(interval, []);
        }
        intervalToSymbols.get(interval)!.push(symbol);
      }
    }

    // Trigger executions for each interval
    const executionPromises: Promise<void>[] = [];
    for (const [interval, syms] of intervalToSymbols) {
      executionPromises.push(triggerTraderExecutions(syms, [interval]));
    }

    await Promise.allSettled(executionPromises);

    const summary = {
      timestamp: new Date().toISOString(),
      symbolsChecked: symbols.length,
      candlesClosed: Array.from(intervalToSymbols.entries()).map(([interval, syms]) => ({
        interval,
        symbols: syms.length
      }))
    };

    console.log('Execution summary:', summary);

    return new Response(
      JSON.stringify(summary),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Trigger error:', error);
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