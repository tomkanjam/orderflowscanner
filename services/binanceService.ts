
import { API_BASE_URL, WS_BASE_URL, TOP_N_PAIRS_LIMIT, KLINE_HISTORY_LIMIT } from '../constants';
import { Ticker, Kline, KlineInterval } from '../types';

export async function fetchTopPairsAndInitialKlines(
  interval: KlineInterval
): Promise<{ symbols: string[], tickers: Map<string, Ticker>, klinesData: Map<string, Kline[]> }> {
  const tickerResponse = await fetch(`${API_BASE_URL}/ticker/24hr`);
  if (!tickerResponse.ok) {
    throw new Error(`Failed to fetch 24h ticker data. Status: ${tickerResponse.status}`);
  }
  const allApiTickers: any[] = await tickerResponse.json();

  const spotTickers = allApiTickers
    .filter(t => t.symbol.endsWith('USDT') && !t.symbol.includes('_') && !t.symbol.includes('UP') && !t.symbol.includes('DOWN') && !t.symbol.includes('BEAR') && !t.symbol.includes('BULL') && parseFloat(t.quoteVolume) > 100000) // Basic filtering for spot USDT pairs with decent volume
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, TOP_N_PAIRS_LIMIT);

  if (spotTickers.length === 0) {
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
      const klineResponse = await fetch(`${API_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${KLINE_HISTORY_LIMIT}`);
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
}

export function connectWebSocket(
  symbols: string[],
  interval: KlineInterval,
  onTickerUpdate: (ticker: Ticker) => void,
  onKlineUpdate: (symbol: string, kline: Kline, isClosed: boolean) => void,
  onOpen: () => void,
  onError: (error: Event) => void,
  onClose: () => void
): WebSocket {
  if (symbols.length === 0) {
      throw new Error("Cannot connect WebSocket with no symbols.");
  }
  const tickerStreams = symbols.map(s => `${s.toLowerCase()}@ticker`);
  const klineStreams = symbols.map(s => `${s.toLowerCase()}@kline_${interval}`);
  const allStreams = [...tickerStreams, ...klineStreams].join('/');
  
  const ws = new WebSocket(WS_BASE_URL + allStreams);

  ws.onopen = onOpen;
  ws.onerror = onError;
  ws.onclose = onClose;

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data as string);
    if (message.stream && message.data) {
      if (message.stream.includes('@ticker')) {
        const tickerData = message.data;
        onTickerUpdate({
          s: tickerData.s, // Symbol
          P: tickerData.P, // Price change percent
          c: tickerData.c, // Last price
          q: tickerData.q, // Total traded quote asset volume in 24hr
          ...tickerData
        });
      } else if (message.stream.includes('@kline')) {
        const klineData = message.data;
        const k = klineData.k;
        const newKline: Kline = [
          k.t, // Kline start time
          k.o, // Open price
          k.h, // High price
          k.l, // Low price
          k.c, // Close price
          k.v, // Base asset volume
          k.T, // Kline close time
          k.q, // Quote asset volume
          k.n, // Number of trades
          k.V, // Taker buy base asset volume
          k.Q, // Taker buy quote asset volume
          k.B  // Ignore
        ];
        onKlineUpdate(klineData.s, newKline, k.x); // k.x is 'is this kline closed?' boolean
      }
    }
  };
  return ws;
}
