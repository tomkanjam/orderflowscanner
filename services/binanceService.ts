import { API_BASE_URL, WS_BASE_URL, TOP_N_PAIRS_LIMIT, KLINE_HISTORY_LIMIT, DEBUG_MODE } from '../constants';
import { Ticker, Kline, KlineInterval } from '../types';

export async function fetchTopPairsAndInitialKlines(
  interval: KlineInterval,
  klineLimit: number = KLINE_HISTORY_LIMIT
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
  
  // Create WebSocket with proper error handling
  let ws: WebSocket;
  try {
    ws = new WebSocket(WS_BASE_URL + allStreams);
  } catch (e) {
    if (DEBUG_MODE) console.error("Failed to create WebSocket:", e);
    throw e;
  }

  // Set up event handlers before connection
  ws.onopen = () => {
    // WebSocket connected successfully
    onOpen();
  };
  
  ws.onerror = (error) => {
    if (DEBUG_MODE) console.error("WebSocket error:", error);
    onError(error);
  };
  
  ws.onclose = (event) => {
    // WebSocket closed
    onClose();
  };

  ws.onmessage = (event) => {
    try {
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
          const kline: Kline = [
            k.t,  // openTime
            k.o,  // open
            k.h,  // high
            k.l,  // low
            k.c,  // close
            k.v,  // volume
            k.T,  // closeTime
            k.q,  // quoteAssetVolume
            k.n,  // numberOfTrades
            k.V,  // takerBuyBaseAssetVolume
            k.Q,  // takerBuyQuoteAssetVolume
            k.B   // ignore
          ];
          onKlineUpdate(klineData.s, kline, k.x); // k.x indicates if the kline is closed
        }
      }
    } catch (e) {
      if (DEBUG_MODE) console.error("Error processing WebSocket message:", e);
    }
  };

  return ws;
}

export function connectMultiIntervalWebSocket(
  symbols: string[],
  intervals: Set<KlineInterval>,
  onTickerUpdate: (ticker: Ticker) => void,
  onKlineUpdate: (symbol: string, interval: KlineInterval, kline: Kline, isClosed: boolean) => void,
  onOpen: () => void,
  onError: (error: Event) => void,
  onClose: () => void
): WebSocket {
  if (symbols.length === 0) {
    throw new Error("Cannot connect WebSocket with no symbols.");
  }
  
  if (intervals.size === 0) {
    throw new Error("Cannot connect WebSocket with no intervals.");
  }
  
  // Create ticker streams (only need one per symbol)
  const tickerStreams = symbols.map(s => `${s.toLowerCase()}@ticker`);
  
  // Create kline streams for each interval
  const klineStreams: string[] = [];
  symbols.forEach(symbol => {
    intervals.forEach(interval => {
      klineStreams.push(`${symbol.toLowerCase()}@kline_${interval}`);
    });
  });
  
  const allStreams = [...tickerStreams, ...klineStreams].join('/');
  
  // Binance has a limit of 1024 streams per connection
  if (tickerStreams.length + klineStreams.length > 1024) {
    console.warn(`Too many streams (${tickerStreams.length + klineStreams.length}). Maximum is 1024.`);
  }
  
  // Create WebSocket with proper error handling
  let ws: WebSocket;
  try {
    ws = new WebSocket(WS_BASE_URL + allStreams);
  } catch (e) {
    if (DEBUG_MODE) console.error("Failed to create WebSocket:", e);
    throw e;
  }

  // Set up event handlers before connection
  ws.onopen = () => {
    console.log(`Multi-interval WebSocket connected with ${intervals.size} intervals for ${symbols.length} symbols`);
    onOpen();
  };
  
  ws.onerror = (error) => {
    if (DEBUG_MODE) console.error("WebSocket error:", error);
    onError(error);
  };
  
  ws.onclose = (event) => {
    console.log("Multi-interval WebSocket closed");
    onClose();
  };

  ws.onmessage = (event) => {
    try {
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
          
          // Extract interval from stream name (e.g., "btcusdt@kline_1m" -> "1m")
          const streamParts = message.stream.split('_');
          const interval = streamParts[streamParts.length - 1] as KlineInterval;
          
          const kline: Kline = [
            k.t,  // openTime
            k.o,  // open
            k.h,  // high
            k.l,  // low
            k.c,  // close
            k.v,  // volume
            k.T,  // closeTime
            k.q,  // quoteAssetVolume
            k.n,  // numberOfTrades
            k.V,  // takerBuyBaseAssetVolume
            k.Q,  // takerBuyQuoteAssetVolume
            k.B   // ignore
          ];
          onKlineUpdate(klineData.s, interval, kline, k.x); // k.x indicates if the kline is closed
        }
      }
    } catch (e) {
      if (DEBUG_MODE) console.error("Error processing WebSocket message:", e);
    }
  };

  return ws;
}