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
    screenerCode: '',
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
    screenerCode: '',
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
    screenerCode: '',
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
    screenerCode: '',
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
    screenerCode: '',
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
    screenerCode: '',
  },
];