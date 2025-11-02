import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { fetchKlines, fetchTicker, formatKlinesForEdgeFunction } from '../_shared/goServerClient.ts';

// Initialize clients
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);


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

// Type definitions
interface KlineData {
  t: number;
  openTime?: number;
  o: string;
  open?: number;
  h: string;
  high?: number;
  l: string;
  low?: number;
  c: string;
  close?: number;
  v: string;
  volume?: number;
  T?: number;
  closeTime?: number;
  q?: string;
  quoteAssetVolume?: number;
  n?: number;
  numberOfTrades?: number;
  V?: string;
  takerBuyBaseAssetVolume?: number;
  Q?: string;
  takerBuyQuoteAssetVolume?: number;
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

  // Helper functions with "get" prefix (used by filter code)
  const getLatestBollingerBands = (klines, period, stdDev) => {
    if (!klines || klines.length < period) return null;
    const closes = klines.map(k => k.close);
    const recentCloses = closes.slice(-period);
    const sma = recentCloses.reduce((a, b) => a + b, 0) / period;
    const variance = recentCloses.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: sma + (std * stdDev),
      middle: sma,
      lower: sma - (std * stdDev)
    };
  };

  const getLatestRSI = (klines, period = 14) => {
    if (!klines || klines.length < period + 1) return null;
    const closes = klines.map(k => k.close);
    return calculateRSI(closes, period);
  };

  const getLatestVolumeProfile = (klines) => {
    if (!klines || klines.length === 0) return null;
    const latest = klines[klines.length - 1];
    return {
      buyVolume: latest.buyVolume,
      sellVolume: latest.sellVolume,
      volumeDelta: latest.volumeDelta,
      buyPressure: latest.buyVolume / latest.volume,
      sellPressure: latest.sellVolume / latest.volume
    };
  };

  const getAverageVolumeDelta = (klines, period = 20) => {
    if (!klines || klines.length < period) return null;
    const recent = klines.slice(-period);
    const sum = recent.reduce((acc, k) => acc + k.volumeDelta, 0);
    return sum / period;
  };

  // Create helpers object for filter code access
  const helpers = {
    calculateMA,
    calculateRSI,
    calculateVolumeMA,
    getLatestBollingerBands,
    getLatestRSI,
    getLatestVolumeProfile,
    getAverageVolumeDelta
  };
`;

async function executeTraderFilter(
  trader: Trader,
  symbols: string[]
): Promise<{ symbol: string; matched: boolean; error?: string }[]> {
  const results: { symbol: string; matched: boolean; error?: string }[] = [];

  for (const symbol of symbols) {
    try {
      // Fetch ticker data from Go server
      const tickerData = await fetchTicker(symbol);
      if (!tickerData) {
        results.push({ symbol, matched: false, error: 'Failed to fetch ticker data' });
        continue;
      }

      // Fetch 1m klines for analysis
      const klines1mRaw = await fetchKlines(symbol, '1m', 100);
      const klines1m = formatKlinesForEdgeFunction(klines1mRaw);

      // Fetch kline data for required timeframes
      const klinesData: Record<string, any[]> = {
        '1m': klines1m  // We already have 1m klines
      };
      // Fetch other required timeframes (skip 1m as we already have it)
      for (const timeframe of trader.filter.requiredTimeframes || ['5m']) {
        if (timeframe === '1m') continue; // Already fetched

        const klinesRaw = await fetchKlines(symbol, timeframe, 100);
        klinesData[timeframe] = formatKlinesForEdgeFunction(klinesRaw);
      }

      // Create execution context
      const ticker = {
        symbol: tickerData.s,
        price: parseFloat(tickerData.c),
        open: parseFloat(tickerData.c), // Using close as open approximation
        high: parseFloat(tickerData.h),
        low: parseFloat(tickerData.l),
        volume: parseFloat(tickerData.v),
        quoteVolume: parseFloat(tickerData.q),
        priceChange: 0, // Not available in current ticker format
        priceChangePercent: parseFloat(tickerData.P),
        trades: 0 // Not available in current ticker format
      };

      // Process klines for each timeframe
      // Filter code expects object format with pre-computed volume metrics
      const klines: Record<string, any> = {};
      for (const [timeframe, data] of Object.entries(klinesData)) {
        if (data.length > 0) {
          // Convert to object format with volume enrichment
          klines[timeframe] = data.map(k => {
            const volume = k.volume;
            const buyVolume = k.takerBuyBaseAssetVolume;
            const sellVolume = volume - buyVolume;

            return {
              openTime: k.openTime,
              closeTime: k.closeTime,
              open: k.open,
              high: k.high,
              low: k.low,
              close: k.close,
              volume: volume,
              buyVolume: buyVolume,
              sellVolume: sellVolume,
              volumeDelta: buyVolume - sellVolume,
              quoteVolume: k.quoteAssetVolume,
              trades: k.numberOfTrades
            };
          });
        }
      }

      // Execute filter code in sandboxed context
      const filterFunction = new Function(
        'ticker',
        'timeframes',  // Match parameter name expected by filter code
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
  const startTime = Date.now();
  let executionId: string | null = null;

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

    // Create execution history record
    const { data: executionRecord, error: executionError } = await supabase
      .from('execution_history')
      .insert({
        trader_id: traderId,
        started_at: new Date().toISOString(),
        symbols_checked: symbols.length
      })
      .select('id')
      .single();

    if (!executionError && executionRecord) {
      executionId = executionRecord.id;
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

    // Update execution history with completion time
    const executionTimeMs = Date.now() - startTime;
    if (executionId) {
      await supabase
        .from('execution_history')
        .update({
          completed_at: new Date().toISOString(),
          symbols_matched: matches.length,
          execution_time_ms: executionTimeMs
        })
        .eq('id', executionId);
    }

    // Return results
    return new Response(
      JSON.stringify({
        traderId,
        timestamp: new Date().toISOString(),
        totalSymbols: symbols.length,
        matches,
        results,
        executionTimeMs
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Edge function error:', error);

    // Update execution history with error
    const executionTimeMs = Date.now() - startTime;
    if (executionId) {
      await supabase
        .from('execution_history')
        .update({
          completed_at: new Date().toISOString(),
          execution_time_ms: executionTimeMs,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        .eq('id', executionId);
    }

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