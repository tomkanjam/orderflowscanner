import { API_BASE_URL, TOP_N_PAIRS_LIMIT, KLINE_HISTORY_LIMIT, DEBUG_MODE, STABLECOIN_BLACKLIST } from '../constants';
import { Ticker, Kline, KlineInterval } from '../types';

export async function fetchTopPairsAndInitialKlines(
  interval: KlineInterval,
  klineLimit: number = KLINE_HISTORY_LIMIT
): Promise<{ symbols: string[], tickers: Map<string, Ticker>, klinesData: Map<string, Kline[]> }> {
  try {
    const tickerResponse = await fetch(`${API_BASE_URL}/ticker/24hr`);
    if (!tickerResponse.ok) {
      console.error('Binance API error:', tickerResponse.status, tickerResponse.statusText);
      throw new Error(`Failed to fetch 24h ticker data. Status: ${tickerResponse.status}`);
    }
    const allApiTickers: any[] = await tickerResponse.json();

  const spotTickers = allApiTickers
    .filter(t => {
      // Basic checks for USDT pairs
      if (!t.symbol.endsWith('USDT')) return false;
      if (t.symbol.includes('_')) return false; // Exclude futures/options
      if (t.symbol.includes('UP') || t.symbol.includes('DOWN')) return false; // Exclude leveraged tokens
      if (t.symbol.includes('BEAR') || t.symbol.includes('BULL')) return false; // Exclude leveraged tokens
      if (parseFloat(t.quoteVolume) <= 100000) return false; // Volume threshold

      // Extract base asset (remove USDT suffix)
      const baseAsset = t.symbol.slice(0, -4); // Remove 'USDT'

      // Check if base asset is a stablecoin
      if (STABLECOIN_BLACKLIST.includes(baseAsset)) {
        if (DEBUG_MODE) console.log(`Filtering out stablecoin: ${t.symbol}`);
        return false;
      }

      return true;
    })
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, TOP_N_PAIRS_LIMIT);

  if (spotTickers.length === 0) {
    console.error('No spot tickers found after filtering!');
    throw new Error("Could not retrieve any top volume USDT pairs from Binance.");
  }

  const symbols = spotTickers.map(t => t.symbol);
  const tickersMap = new Map<string, Ticker>();
  spotTickers.forEach(t => tickersMap.set(t.symbol, {
    s: t.symbol,
    P: t.priceChangePercent,
    c: t.lastPrice,
    q: t.quoteVolume,
    ...t // Store the whole ticker object
  }));

  const klinesData = new Map<string, Kline[]>();
  const klinePromises = symbols.map(async (symbol) => {
    try {
      const klineResponse = await fetch(`${API_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${klineLimit}`);
      if (!klineResponse.ok) {
        console.warn(`Failed to fetch klines for ${symbol} (${interval}). Status: ${klineResponse.status}`);
        return; // Skip this symbol if klines fail
      }
      const klines: Kline[] = await klineResponse.json();
      klinesData.set(symbol, klines);
    } catch (e) {
      console.warn(`Error fetching klines for ${symbol} (${interval}):`, e);
    }
  });

  await Promise.all(klinePromises);
  
  // Filter out symbols for which klines could not be fetched
  const finalSymbols = symbols.filter(s => klinesData.has(s));
  const finalTickersMap = new Map<string, Ticker>();
  finalSymbols.forEach(s => {
    const ticker = tickersMap.get(s);
    if (ticker) {
        finalTickersMap.set(s, ticker);
    }
  });


  return { symbols: finalSymbols, tickers: finalTickersMap, klinesData };
  } catch (error) {
    console.error('fetchTopPairsAndInitialKlines failed:', error);
    throw error;
  }
}