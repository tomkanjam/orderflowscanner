import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { fetchAllTickers } from '../_shared/goServerClient.ts';

// Initialize clients
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);


const EDGE_FUNCTION_URL = Deno.env.get('EDGE_FUNCTION_URL') || 'https://your-project.supabase.co/functions/v1/execute-trader';

interface Trader {
  id: string;
  name: string;
  enabled: boolean;
  tier: string;
  user_id?: string;
}

// Get all symbols being tracked from Go server
async function getActiveSymbols(): Promise<string[]> {
  try {
    const tickers = await fetchAllTickers();
    return Object.keys(tickers);
  } catch (error) {
    console.error('Failed to fetch active symbols:', error);
    // Fallback to default list
    return [
      'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
      'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'SHIBUSDT', 'DOTUSDT'
    ];
  }
}

// Trigger trader execution for all traders
async function triggerTraderExecutions(symbols: string[]) {
  // Get all active traders
  const { data: traders, error } = await supabase
    .from('traders')
    .select('*')
    .eq('enabled', true);

  if (error || !traders) {
    console.error('Failed to fetch traders:', error);
    return;
  }

  console.log(`Triggering ${traders.length} traders for ${symbols.length} symbols`);

  // Execute each trader
  const promises = traders.map(async (trader: Trader) => {
    const traderStartTime = Date.now();
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
      const executionTimeMs = Date.now() - traderStartTime;
      console.log(`Trader ${trader.name}: ${result.matches?.length || 0} matches in ${executionTimeMs}ms`);

      return { success: true, traderId: trader.id, executionTimeMs, matches: result.matches?.length || 0 };

    } catch (error) {
      const executionTimeMs = Date.now() - traderStartTime;
      console.error(`Failed to execute trader ${trader.id}:`, error);
      return { success: false, traderId: trader.id, executionTimeMs, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  const results = await Promise.allSettled(promises);

  // Aggregate metrics
  return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
}

serve(async (req) => {
  const startTime = Date.now();

  try {
    // This can be triggered by:
    // 1. Cron job (every minute)
    // 2. Manual trigger
    // 3. WebSocket notification from Go server (future enhancement)

    const method = req.method;

    if (method !== 'POST' && method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    console.log(`Trigger execution started at ${new Date().toISOString()}`);

    // Get active symbols from Go server
    const symbols = await getActiveSymbols();

    // Trigger trader executions
    // The Go server already tracks closed candles, so we just trigger all traders
    // They will check the latest data and execute if conditions match
    const traderResults = await triggerTraderExecutions(symbols);

    const totalExecutionTime = Date.now() - startTime;
    const successCount = traderResults.filter((r: any) => r.success).length;
    const failureCount = traderResults.filter((r: any) => !r.success).length;
    const avgExecutionTime = traderResults.length > 0
      ? traderResults.reduce((sum: number, r: any) => sum + r.executionTimeMs, 0) / traderResults.length
      : 0;

    const summary = {
      timestamp: new Date().toISOString(),
      symbolsChecked: symbols.length,
      tradersExecuted: traderResults.length,
      successCount,
      failureCount,
      totalExecutionTimeMs: totalExecutionTime,
      avgTraderExecutionTimeMs: Math.round(avgExecutionTime),
      message: 'Traders triggered successfully',
      details: traderResults
    };

    console.log('Execution summary:', {
      ...summary,
      details: `${successCount} successful, ${failureCount} failed`
    });

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
        details: error instanceof Error ? error.message : 'Unknown error',
        executionTimeMs: Date.now() - startTime
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});