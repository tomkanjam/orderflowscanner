export interface PrebuiltStrategy {
  id: string;
  name: string;
  description: string;
  category: 'scalping' | 'daytrading' | 'momentum' | 'reversal';
  timeframe: '1m' | '5m' | '15m' | '1h';
  holdTime: string;
  conditions: string[];
  tradePlan: {
    entry: string;
    stopLoss: string;
    takeProfit: string;
    positionSize: string;
  };
  prompt: string; // Natural language prompt for the strategy
  screenerCode: string;
}

export const prebuiltStrategies: PrebuiltStrategy[] = [
  {
    id: 'quick-scalp',
    name: 'Quick Scalp',
    description: 'VWAP bounce with momentum for rapid gains',
    category: 'scalping',
    timeframe: '1m',
    holdTime: '5-15 mins',
    conditions: [
      'Price touches VWAP (±0.1%)',
      'RSI < 35 (oversold)',
      'Volume spike > 2x average',
      'No resistance above'
    ],
    tradePlan: {
      entry: 'Market buy on signal',
      stopLoss: '0.3% below entry',
      takeProfit: '0.4-0.6% above entry',
      positionSize: '10% of capital'
    },
    prompt: 'Find coins where price is within 0.1% of VWAP, RSI is below 35 (oversold), and volume is at least 2x the 20-period average',
    screenerCode: `
      const vwap = helpers.calculateVWAP(klines);
      const currentPrice = parseFloat(ticker.c);
      const closes = klines.map(k => parseFloat(k[4]));
      const rsi = helpers.calculateRSI(closes, 14);
      const volumes = klines.map(k => parseFloat(k[5]));
      const avgVolume = helpers.calculateSMA(volumes, 20);
      const currentVolume = volumes[volumes.length - 1];
      
      const priceNearVWAP = Math.abs(currentPrice - vwap) / vwap < 0.001;
      const isOversold = rsi < 35;
      const hasVolumeSpike = currentVolume > avgVolume * 2;
      
      return priceNearVWAP && isOversold && hasVolumeSpike;
    `,
  },
  {
    id: '5min-momentum',
    name: '5-Min Momentum',
    description: 'EMA crossover with volume confirmation',
    category: 'momentum',
    timeframe: '5m',
    holdTime: '15-45 mins',
    conditions: [
      '9 EMA crosses above 21 EMA',
      'MACD histogram turning positive',
      'Volume > 1.5x average',
      'Price above VWAP'
    ],
    tradePlan: {
      entry: 'Buy on EMA cross confirmation',
      stopLoss: '0.5% below 21 EMA',
      takeProfit: '1-1.5% above entry',
      positionSize: '15% of capital'
    },
    prompt: '9 EMA crosses above 21 EMA with MACD histogram positive, volume above 1.5x average, and price above VWAP',
    screenerCode: `
      const closes = klines.map(k => parseFloat(k[4]));
      const ema9 = helpers.calculateEMA(closes, 9);
      const ema21 = helpers.calculateEMA(closes, 21);
      const prevEma9 = helpers.calculateEMA(closes.slice(0, -1), 9);
      const prevEma21 = helpers.calculateEMA(closes.slice(0, -1), 21);
      
      const macd = helpers.calculateMACD(closes);
      const vwap = helpers.calculateVWAP(klines);
      const currentPrice = parseFloat(ticker.c);
      
      const volumes = klines.map(k => parseFloat(k[5]));
      const avgVolume = helpers.calculateSMA(volumes, 20);
      const currentVolume = volumes[volumes.length - 1];
      
      const emaCrossover = prevEma9 <= prevEma21 && ema9 > ema21;
      const macdPositive = macd.histogram > 0;
      const volumeConfirm = currentVolume > avgVolume * 1.5;
      const aboveVWAP = currentPrice > vwap;
      
      return emaCrossover && macdPositive && volumeConfirm && aboveVWAP;
    `,
  },
  {
    id: '15min-reversal',
    name: '15-Min Reversal',
    description: 'Oversold bounce at support levels',
    category: 'reversal',
    timeframe: '15m',
    holdTime: '30m-2hr',
    conditions: [
      'RSI < 30 (oversold)',
      'Stochastic < 20',
      'Near daily pivot support',
      'Bullish divergence forming'
    ],
    tradePlan: {
      entry: 'Limit buy at support',
      stopLoss: '0.8% below support',
      takeProfit: '1.5-2% or next resistance',
      positionSize: '20% of capital'
    },
    prompt: 'RSI below 30 and stochastic below 20, near daily pivot support levels with potential bullish divergence',
    screenerCode: `
      const closes = klines.map(k => parseFloat(k[4]));
      const rsi = helpers.calculateRSI(closes, 14);
      const stoch = helpers.calculateStochastic(klines, 14, 3, 3);
      
      // Calculate daily pivot support (simplified)
      const high = Math.max(...klines.slice(-24).map(k => parseFloat(k[2])));
      const low = Math.min(...klines.slice(-24).map(k => parseFloat(k[3])));
      const close = parseFloat(klines[klines.length - 1][4]);
      const pivot = (high + low + close) / 3;
      const s1 = 2 * pivot - high;
      const currentPrice = parseFloat(ticker.c);
      
      const isOversold = rsi < 30;
      const stochOversold = stoch.k < 20;
      const nearSupport = Math.abs(currentPrice - s1) / s1 < 0.005; // Within 0.5% of S1
      
      return isOversold && stochOversold && nearSupport;
    `,
  },
  {
    id: 'breakout-scalp',
    name: 'Breakout Scalp',
    description: 'Range breakout with volume surge',
    category: 'scalping',
    timeframe: '5m',
    holdTime: '10-30 mins',
    conditions: [
      'Break above 30-min high',
      'Volume > 3x average',
      'ADX rising above 25',
      'No immediate resistance'
    ],
    tradePlan: {
      entry: 'Buy stop above breakout',
      stopLoss: '0.4% below breakout level',
      takeProfit: '0.8-1% continuation',
      positionSize: '15% of capital'
    },
    prompt: 'Price breaks above 30-minute high with volume 3x average and ADX rising above 25',
    screenerCode: `
      const currentPrice = parseFloat(ticker.c);
      const recentHigh = Math.max(...klines.slice(-6).map(k => parseFloat(k[2]))); // 30 min = 6 x 5min candles
      const volumes = klines.map(k => parseFloat(k[5]));
      const avgVolume = helpers.calculateSMA(volumes, 20);
      const currentVolume = volumes[volumes.length - 1];
      const adx = helpers.calculateADX(klines, 14);
      
      const breakout = currentPrice > recentHigh * 1.001; // 0.1% above high
      const volumeSurge = currentVolume > avgVolume * 3;
      const adxRising = adx > 25 && adx > helpers.calculateADX(klines.slice(0, -1), 14);
      
      return breakout && volumeSurge && adxRising;
    `,
  },
  {
    id: 'bull-flag-micro',
    name: 'Bull Flag Micro',
    description: 'Micro patterns on strong movers',
    category: 'scalping',
    timeframe: '1m',
    holdTime: '5-20 mins',
    conditions: [
      'Flag pattern after 0.5%+ surge',
      'Volume declining in flag',
      'RSI cooling from 70 to 50-60',
      'MACD holding above signal'
    ],
    tradePlan: {
      entry: 'Buy on flag breakout',
      stopLoss: '0.25% below flag low',
      takeProfit: '0.5-0.8% measured move',
      positionSize: '10% of capital'
    },
    prompt: 'Bull flag pattern after 0.5% surge with declining volume, RSI cooling from overbought to 50-60 range',
    screenerCode: `
      const closes = klines.map(k => parseFloat(k[4]));
      const volumes = klines.map(k => parseFloat(k[5]));
      const rsi = helpers.calculateRSI(closes, 14);
      const macd = helpers.calculateMACD(closes);
      
      // Find surge (at least 0.5% move in last 10 candles)
      const recentLow = Math.min(...closes.slice(-10, -5));
      const recentHigh = Math.max(...closes.slice(-5));
      const surge = (recentHigh - recentLow) / recentLow > 0.005;
      
      // Check for consolidation/flag
      const lastThreeVolumes = volumes.slice(-3);
      const volumeDeclining = lastThreeVolumes[2] < lastThreeVolumes[1] && lastThreeVolumes[1] < lastThreeVolumes[0];
      
      const rsiCooling = rsi > 50 && rsi < 65;
      const macdAboveSignal = macd.MACD > macd.signal;
      
      return surge && volumeDeclining && rsiCooling && macdAboveSignal;
    `,
  },
  {
    id: 'hourly-swing',
    name: 'Hourly Swing',
    description: 'Trend continuation for day trades',
    category: 'daytrading',
    timeframe: '1h',
    holdTime: '2-6 hours',
    conditions: [
      'Higher low formed',
      'Price bounces from 20 MA',
      'MACD above signal line',
      'Uptrend intact (50 MA rising)'
    ],
    tradePlan: {
      entry: 'Buy at 20 MA test',
      stopLoss: '1.5% below recent low',
      takeProfit: '3-4% trend target',
      positionSize: '25% of capital'
    },
    prompt: 'Higher low pattern with price bouncing from 20 MA, MACD above signal, and 50 MA rising indicating uptrend',
    screenerCode: `
      const closes = klines.map(k => parseFloat(k[4]));
      const lows = klines.map(k => parseFloat(k[3]));
      const currentPrice = parseFloat(ticker.c);
      
      const ma20 = helpers.calculateSMA(closes, 20);
      const ma50 = helpers.calculateSMA(closes, 50);
      const prevMa50 = helpers.calculateSMA(closes.slice(0, -1), 50);
      const macd = helpers.calculateMACD(closes);
      
      // Check for higher low (compare current area low to previous low)
      const recentLow = Math.min(...lows.slice(-5));
      const previousLow = Math.min(...lows.slice(-15, -10));
      const higherLow = recentLow > previousLow;
      
      // Price near 20 MA (within 0.5%)
      const nearMA20 = Math.abs(currentPrice - ma20) / ma20 < 0.005;
      const macdAboveSignal = macd.MACD > macd.signal;
      const uptrendIntact = ma50 > prevMa50;
      
      return higherLow && nearMA20 && macdAboveSignal && uptrendIntact;
    `,
  },
];