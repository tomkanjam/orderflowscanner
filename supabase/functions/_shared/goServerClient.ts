// HTTP Client for Go Kline Server

interface Kline {
  t: number;  // OpenTime
  o: string;  // Open
  h: string;  // High
  l: string;  // Low
  c: string;  // Close
  v: string;  // Volume
  T: number;  // CloseTime
  q: string;  // QuoteVolume
  n: number;  // Trades
  V: string;  // TakerBuyBaseVolume
  Q: string;  // TakerBuyQuoteVolume
  x: boolean; // IsClosed
}

interface Ticker {
  s: string;  // Symbol
  c: string;  // Price
  v: string;  // Volume
  q: string;  // QuoteVolume
  P: string;  // PriceChangePercent
  h: string;  // High
  l: string;  // Low
  t: number;  // UpdateTime
}

/**
 * Fetch klines from the Go server
 */
export async function fetchKlines(symbol: string, interval: string, limit = 100): Promise<Kline[]> {
  const GO_SERVER_URL = Deno.env.get('GO_SERVER_URL') || 'https://vyx-kline-server.fly.dev';
  const GO_SERVER_API_KEY = Deno.env.get('GO_SERVER_API_KEY') || '';

  const response = await fetch(
    `${GO_SERVER_URL}/klines/${symbol}/${interval}?limit=${limit}`,
    {
      headers: { 'X-API-Key': GO_SERVER_API_KEY },
      signal: AbortSignal.timeout(5000)
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch klines: ${response.status}`);
  }

  const data = await response.json();
  return data.klines || [];
}

/**
 * Fetch ticker data for a single symbol
 */
export async function fetchTicker(symbol: string): Promise<Ticker | null> {
  const GO_SERVER_URL = Deno.env.get('GO_SERVER_URL') || 'https://vyx-kline-server.fly.dev';
  const GO_SERVER_API_KEY = Deno.env.get('GO_SERVER_API_KEY') || '';

  const response = await fetch(
    `${GO_SERVER_URL}/ticker/${symbol}`,
    {
      headers: { 'X-API-Key': GO_SERVER_API_KEY },
      signal: AbortSignal.timeout(5000)
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null; // Symbol not found
    }
    throw new Error(`Failed to fetch ticker: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch all available tickers
 */
export async function fetchAllTickers(): Promise<Record<string, Ticker>> {
  const GO_SERVER_URL = Deno.env.get('GO_SERVER_URL') || 'https://vyx-kline-server.fly.dev';
  const GO_SERVER_API_KEY = Deno.env.get('GO_SERVER_API_KEY') || '';

  const response = await fetch(
    `${GO_SERVER_URL}/tickers`,
    {
      headers: { 'X-API-Key': GO_SERVER_API_KEY },
      signal: AbortSignal.timeout(5000)
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch tickers: ${response.status}`);
  }

  return response.json();
}

/**
 * Convert Go server kline format to the format expected by our Edge Functions
 */
export function formatKlinesForEdgeFunction(klines: Kline[]) {
  return klines.map(k => ({
    openTime: k.t,
    open: parseFloat(k.o),
    high: parseFloat(k.h),
    low: parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
    closeTime: k.T,
    quoteAssetVolume: parseFloat(k.q),
    numberOfTrades: k.n,
    takerBuyBaseAssetVolume: parseFloat(k.V),
    takerBuyQuoteAssetVolume: parseFloat(k.Q),
  }));
}