-- Seed built-in signals for different tiers
-- Note: Replace 'system-user-id' with the actual UUID of your admin user

-- Anonymous tier signals (basic, simple to understand)
INSERT INTO traders (
  name, description, enabled, mode, 
  filter, strategy, metrics,
  user_id, ownership_type, access_tier, is_built_in,
  category, difficulty
) VALUES 
-- 1. RSI Oversold Bounce
(
  'RSI Oversold Bounce',
  'Detects when RSI drops below 30, indicating potential oversold conditions',
  true,
  'demo',
  jsonb_build_object(
    'code', 'const rsi = await indicators.rsi(klines, 14);
return rsi.value < 30 && rsi.increasing;',
    'description', ARRAY['RSI(14) < 30', 'RSI is increasing'],
    'refreshInterval', '1m',
    'requiredTimeframes', ARRAY['1m']
  ),
  jsonb_build_object(
    'instructions', 'Look for bounce opportunities when RSI indicates oversold conditions',
    'riskManagement', jsonb_build_object(
      'stopLoss', 0.02,
      'takeProfit', 0.05,
      'maxPositions', 3,
      'positionSizePercent', 0.1
    ),
    'aiAnalysisLimit', 100,
    'modelTier', 'standard',
    'maxConcurrentAnalysis', 3
  ),
  '{}',
  null,
  'system',
  'anonymous',
  true,
  'reversal',
  'beginner'
),

-- 2. Simple Volume Spike
(
  'Volume Spike Detector',
  'Alerts when volume exceeds 3x the average',
  true,
  'demo',
  jsonb_build_object(
    'code', 'const volumeMA = await indicators.sma(klines.map(k => parseFloat(k[5])), 20);
const currentVolume = parseFloat(klines[klines.length - 1][5]);
return currentVolume > volumeMA.value * 3;',
    'description', ARRAY['Current volume > 3x average volume(20)'],
    'refreshInterval', '1m',
    'requiredTimeframes', ARRAY['1m']
  ),
  jsonb_build_object(
    'instructions', 'High volume often precedes significant price movements',
    'riskManagement', jsonb_build_object(
      'stopLoss', 0.02,
      'takeProfit', 0.05,
      'maxPositions', 3,
      'positionSizePercent', 0.1
    ),
    'aiAnalysisLimit', 100,
    'modelTier', 'standard',
    'maxConcurrentAnalysis', 3
  ),
  '{}',
  null,
  'system',
  'anonymous',
  true,
  'volume',
  'beginner'
),

-- 3. Moving Average Cross
(
  'Golden Cross',
  'Detects when 50 MA crosses above 200 MA',
  true,
  'demo',
  jsonb_build_object(
    'code', 'const ma50 = await indicators.sma(klines, 50);
const ma200 = await indicators.sma(klines, 200);
const ma50Prev = await indicators.sma(klines.slice(0, -1), 50);
const ma200Prev = await indicators.sma(klines.slice(0, -1), 200);
return ma50Prev.value <= ma200Prev.value && ma50.value > ma200.value;',
    'description', ARRAY['50 MA crosses above 200 MA'],
    'refreshInterval', '15m',
    'requiredTimeframes', ARRAY['15m']
  ),
  jsonb_build_object(
    'instructions', 'Classic bullish signal when faster MA crosses above slower MA',
    'riskManagement', jsonb_build_object(
      'stopLoss', 0.03,
      'takeProfit', 0.10,
      'maxPositions', 2,
      'positionSizePercent', 0.15
    ),
    'aiAnalysisLimit', 250,
    'modelTier', 'standard',
    'maxConcurrentAnalysis', 3
  ),
  '{}',
  null,
  'system',
  'anonymous',
  true,
  'trend',
  'beginner'
),

-- Free tier signals (more sophisticated)
-- 4. MACD Divergence
(
  'MACD Bullish Divergence',
  'Detects bullish divergence between price and MACD',
  true,
  'demo',
  jsonb_build_object(
    'code', 'const macd = await indicators.macd(klines);
const prices = klines.map(k => parseFloat(k[4]));
const recentLows = [];
const macdLows = [];

// Find recent price lows and corresponding MACD values
for (let i = 20; i < prices.length - 1; i++) {
  if (prices[i] < prices[i-1] && prices[i] < prices[i+1]) {
    recentLows.push({ index: i, price: prices[i] });
    macdLows.push({ index: i, macd: macd.histogram[i] });
  }
}

if (recentLows.length >= 2) {
  const lastTwo = recentLows.slice(-2);
  const lastTwoMacd = macdLows.slice(-2);
  
  // Price making lower low, MACD making higher low = bullish divergence
  return lastTwo[1].price < lastTwo[0].price && 
         lastTwoMacd[1].macd > lastTwoMacd[0].macd;
}
return false;',
    'description', ARRAY['Price making lower lows', 'MACD making higher lows', 'Bullish divergence pattern'],
    'refreshInterval', '5m',
    'requiredTimeframes', ARRAY['5m']
  ),
  jsonb_build_object(
    'instructions', 'Look for reversal when MACD shows bullish divergence with price',
    'riskManagement', jsonb_build_object(
      'stopLoss', 0.02,
      'takeProfit', 0.06,
      'maxPositions', 3,
      'positionSizePercent', 0.1
    ),
    'aiAnalysisLimit', 200,
    'modelTier', 'standard',
    'maxConcurrentAnalysis', 3
  ),
  '{}',
  null,
  'system',
  'free',
  true,
  'reversal',
  'intermediate'
),

-- 5. Bollinger Band Squeeze
(
  'Bollinger Band Squeeze Exit',
  'Detects when price breaks out of Bollinger Band squeeze',
  true,
  'demo',
  jsonb_build_object(
    'code', 'const bb = await indicators.bollingerBands(klines, 20, 2);
const atr = await indicators.atr(klines, 14);

// Calculate band width
const bandwidth = (bb.upper - bb.lower) / bb.middle;
const avgBandwidth = 0.10; // 10% average

// Squeeze condition: bandwidth < average and now expanding
const inSqueeze = bandwidth < avgBandwidth * 0.5;
const wasInSqueeze = await (async () => {
  const prevBB = await indicators.bollingerBands(klines.slice(0, -5), 20, 2);
  const prevBandwidth = (prevBB.upper - prevBB.lower) / prevBB.middle;
  return prevBandwidth < avgBandwidth * 0.5;
})();

const currentPrice = parseFloat(klines[klines.length - 1][4]);
const breakout = currentPrice > bb.upper || currentPrice < bb.lower;

return wasInSqueeze && !inSqueeze && breakout;',
    'description', ARRAY['Bollinger Bands were in squeeze', 'Bands are now expanding', 'Price breaking out of bands'],
    'refreshInterval', '5m',
    'requiredTimeframes', ARRAY['5m']
  ),
  jsonb_build_object(
    'instructions', 'Trade breakouts when volatility expands after compression',
    'riskManagement', jsonb_build_object(
      'stopLoss', 0.015,
      'takeProfit', 0.05,
      'maxPositions', 3,
      'positionSizePercent', 0.1
    ),
    'aiAnalysisLimit', 150,
    'modelTier', 'standard',
    'maxConcurrentAnalysis', 3
  ),
  '{}',
  null,
  'system',
  'free',
  true,
  'volatility',
  'intermediate'
),

-- Pro tier signals (complex multi-timeframe)
-- 6. Multi-Timeframe Momentum
(
  'Multi-Timeframe Momentum Alignment',
  'Signals when momentum aligns across multiple timeframes',
  true,
  'demo',
  jsonb_build_object(
    'code', 'const tf1m = klines;
const tf5m = await indicators.convertTimeframe(klines, "5m");
const tf15m = await indicators.convertTimeframe(klines, "15m");

const rsi1m = await indicators.rsi(tf1m, 14);
const rsi5m = await indicators.rsi(tf5m, 14);
const rsi15m = await indicators.rsi(tf15m, 14);

const macd1m = await indicators.macd(tf1m);
const macd5m = await indicators.macd(tf5m);
const macd15m = await indicators.macd(tf15m);

// All timeframes bullish
const allRsiBullish = rsi1m.value > 50 && rsi5m.value > 50 && rsi15m.value > 50;
const allMacdBullish = macd1m.histogram[macd1m.histogram.length-1] > 0 &&
                       macd5m.histogram[macd5m.histogram.length-1] > 0 &&
                       macd15m.histogram[macd15m.histogram.length-1] > 0;

// Momentum increasing on lower timeframe
const momentumIncreasing = rsi1m.value > rsi1m.previous;

return allRsiBullish && allMacdBullish && momentumIncreasing;',
    'description', ARRAY['RSI > 50 on 1m, 5m, 15m', 'MACD positive on all timeframes', 'Momentum increasing on 1m'],
    'refreshInterval', '1m',
    'requiredTimeframes', ARRAY['1m', '5m', '15m']
  ),
  jsonb_build_object(
    'instructions', 'Enter when momentum aligns bullishly across multiple timeframes',
    'riskManagement', jsonb_build_object(
      'stopLoss', 0.015,
      'takeProfit', 0.045,
      'maxPositions', 4,
      'positionSizePercent', 0.15
    ),
    'aiAnalysisLimit', 200,
    'modelTier', 'pro',
    'maxConcurrentAnalysis', 5
  ),
  '{}',
  null,
  'system',
  'pro',
  true,
  'momentum',
  'advanced'
),

-- Elite tier signals (complex patterns with AI optimization)
-- 7. Market Structure Break with Volume Confirmation
(
  'Smart Money Market Structure Break',
  'Detects market structure breaks with volume and order flow confirmation',
  true,
  'demo',
  jsonb_build_object(
    'code', 'const highs = [];
const lows = [];
const prices = klines.map(k => ({ 
  high: parseFloat(k[2]), 
  low: parseFloat(k[3]), 
  close: parseFloat(k[4]),
  volume: parseFloat(k[5])
}));

// Find swing highs and lows
for (let i = 10; i < prices.length - 10; i++) {
  // Swing high
  if (prices[i].high > prices[i-1].high && prices[i].high > prices[i+1].high) {
    let isSwingHigh = true;
    for (let j = 1; j <= 5; j++) {
      if (prices[i].high <= prices[i-j].high || prices[i].high <= prices[i+j].high) {
        isSwingHigh = false;
        break;
      }
    }
    if (isSwingHigh) highs.push({ index: i, price: prices[i].high });
  }
  
  // Swing low
  if (prices[i].low < prices[i-1].low && prices[i].low < prices[i+1].low) {
    let isSwingLow = true;
    for (let j = 1; j <= 5; j++) {
      if (prices[i].low >= prices[i-j].low || prices[i].low >= prices[i+j].low) {
        isSwingLow = false;
        break;
      }
    }
    if (isSwingLow) lows.push({ index: i, price: prices[i].low });
  }
}

if (highs.length < 2 || lows.length < 2) return false;

// Check for bullish market structure break
const recentHighs = highs.slice(-2);
const recentLows = lows.slice(-2);
const currentPrice = prices[prices.length - 1].close;

// Higher high and higher low
const higherHigh = recentHighs[1].price > recentHighs[0].price;
const higherLow = recentLows[1].price > recentLows[0].price;

// Volume confirmation
const avgVolume = prices.slice(-20).reduce((sum, p) => sum + p.volume, 0) / 20;
const recentVolume = prices.slice(-5).reduce((sum, p) => sum + p.volume, 0) / 5;
const volumeIncreasing = recentVolume > avgVolume * 1.5;

// Price breaking above recent high with volume
const breakout = currentPrice > recentHighs[1].price;

return higherHigh && higherLow && volumeIncreasing && breakout;',
    'description', ARRAY[
      'Higher highs and higher lows detected',
      'Volume 50% above average',
      'Price breaking above recent swing high',
      'Bullish market structure confirmed'
    ],
    'refreshInterval', '5m',
    'requiredTimeframes', ARRAY['5m']
  ),
  jsonb_build_object(
    'instructions', 'This advanced signal identifies when smart money is likely accumulating based on market structure changes and volume analysis. Best used in trending markets.',
    'riskManagement', jsonb_build_object(
      'stopLoss', 0.01,
      'takeProfit', 0.04,
      'maxPositions', 5,
      'positionSizePercent', 0.2
    ),
    'aiAnalysisLimit', 500,
    'modelTier', 'pro',
    'maxConcurrentAnalysis', 10
  ),
  '{}',
  null,
  'system',
  'elite',
  true,
  'pattern',
  'advanced'
);

-- Grant necessary permissions
GRANT SELECT ON traders TO authenticated;
GRANT SELECT ON traders TO anon;