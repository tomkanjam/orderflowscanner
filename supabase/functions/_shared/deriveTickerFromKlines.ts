/**
 * Derive ticker data from kline candles
 * This replaces the need for separate ticker storage in Redis
 */

export interface KlineData {
  t: number;  // Open time
  T: number;  // Close time
  s: string;  // Symbol
  i: string;  // Interval
  o: string;  // Open
  c: string;  // Close
  h: string;  // High
  l: string;  // Low
  v: string;  // Volume
  n: number;  // Number of trades
  x: boolean; // Is closed
  q: string;  // Quote volume
}

export interface DerivedTicker {
  s: string;  // Symbol (matches existing TickerData format)
  c: string;  // Current price (close)
  o: string;  // Open price (24h ago)
  h: string;  // High (24h)
  l: string;  // Low (24h)
  v: string;  // Volume (24h)
  q: string;  // Quote volume (24h)
  p: string;  // Price change
  P: string;  // Price change percent
  n?: number; // Trade count (optional, sum from klines if needed)
}

/**
 * Derive ticker data from an array of klines
 * @param symbol - The trading pair symbol
 * @param klines - Array of klines (should be 1m klines for best accuracy)
 * @returns Derived ticker object matching the TickerData structure
 */
export function deriveTickerFromKlines(
  symbol: string,
  klines: KlineData[]
): DerivedTicker | null {
  // Handle empty or invalid input
  if (!klines || klines.length === 0) {
    console.warn(`No klines available for ${symbol}`);
    return null;
  }

  // Get the latest kline for current price
  const latestKline = klines[klines.length - 1];
  const currentPrice = parseFloat(latestKline.c);

  // Calculate 24h window (1440 minutes for 1m klines)
  // If we have less than 24h of data, use what we have
  const targetKlineCount = Math.min(1440, klines.length);
  const startIndex = Math.max(0, klines.length - targetKlineCount);

  // Get the oldest kline in our 24h window for open price
  const oldestKline = klines[startIndex];
  const openPrice = parseFloat(oldestKline.o);

  // Calculate 24h high, low, and volumes
  let high24h = 0;
  let low24h = Infinity;
  let volume24h = 0;
  let quoteVolume24h = 0;
  let tradeCount24h = 0;

  // Process klines in the 24h window
  for (let i = startIndex; i < klines.length; i++) {
    const kline = klines[i];
    const high = parseFloat(kline.h);
    const low = parseFloat(kline.l);
    const volume = parseFloat(kline.v);
    const quoteVolume = parseFloat(kline.q);

    if (high > high24h) high24h = high;
    if (low < low24h) low24h = low;
    volume24h += volume;
    quoteVolume24h += quoteVolume;

    // Sum trade counts if available
    if (kline.n) {
      tradeCount24h += kline.n;
    }
  }

  // Calculate price change and percentage
  const priceChange = currentPrice - openPrice;
  const priceChangePercent = openPrice > 0 ? (priceChange / openPrice) * 100 : 0;

  // Return ticker object matching the existing format
  return {
    s: symbol,
    c: currentPrice.toString(),
    o: openPrice.toString(),
    h: high24h.toString(),
    l: low24h.toString(),
    v: volume24h.toString(),
    q: quoteVolume24h.toString(),
    p: priceChange.toString(),
    P: priceChangePercent.toFixed(3),
    n: tradeCount24h > 0 ? tradeCount24h : undefined
  };
}

/**
 * Parse kline data from Redis storage format
 * Redis stores klines as JSON strings that need parsing
 */
export function parseKlineFromRedis(klineStr: string | any): KlineData | null {
  try {
    // If already an object, return it
    if (typeof klineStr === 'object' && klineStr !== null) {
      return klineStr as KlineData;
    }

    // Parse JSON string
    if (typeof klineStr === 'string') {
      return JSON.parse(klineStr) as KlineData;
    }

    return null;
  } catch (error) {
    console.error('Failed to parse kline:', error);
    return null;
  }
}

/**
 * Get ticker data for real-time display
 * This provides a simpler interface for components that just need current price/volume
 */
export function getSimplifiedTicker(ticker: DerivedTicker | null): {
  symbol: string;
  price: number;
  priceChangePercent: number;
  volume: number;
  quoteVolume: number;
} | null {
  if (!ticker) return null;

  return {
    symbol: ticker.s,
    price: parseFloat(ticker.c),
    priceChangePercent: parseFloat(ticker.P),
    volume: parseFloat(ticker.v),
    quoteVolume: parseFloat(ticker.q)
  };
}