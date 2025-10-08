import { DemoSignal } from './ExpandableSignalCard';

export const mockSignals: DemoSignal[] = [
  // MOMENTUM
  {
    id: '1',
    name: 'RSI Oversold',
    description: 'Detects oversold conditions using the RSI indicator. Triggers when RSI drops below 30 with volume confirmation.',
    category: 'MOMENTUM',
    isBuiltIn: true,
    enabled: true,
    lastTrigger: '2m ago',
    signalCount: 15,
    conditions: [
      'RSI < 30',
      'Volume > 1.5x average',
      'Price above 20-day MA'
    ],
    recentTriggers: [
      { symbol: 'BTCUSDT', time: '2m ago', price: '$67,234', change: '+2.4%' },
      { symbol: 'ETHUSDT', time: '5m ago', price: '$3,456', change: '+1.8%' }
    ]
  },
  {
    id: '2',
    name: 'MACD Crossover',
    description: 'Identifies bullish MACD crossovers with histogram confirmation.',
    category: 'MOMENTUM',
    isBuiltIn: true,
    enabled: false,
    lastTrigger: '1h ago',
    signalCount: 8,
    conditions: [
      'MACD line crosses above signal line',
      'Histogram turning positive',
      'Volume increasing'
    ]
  },
  {
    id: '3',
    name: 'Stochastic Extremes',
    description: 'Catches extreme stochastic readings for potential reversals.',
    category: 'MOMENTUM',
    isBuiltIn: true,
    enabled: true,
    lastTrigger: 'Never',
    signalCount: 0
  },

  // REVERSAL
  {
    id: '4',
    name: 'Support Bounce',
    description: 'Detects price bouncing off key support levels with volume confirmation.',
    category: 'REVERSAL',
    isBuiltIn: true,
    enabled: true,
    lastTrigger: '5m ago',
    signalCount: 12,
    conditions: [
      'Price touches support level (±1%)',
      'Strong bounce candle (>2% range)',
      'Volume > 1.3x average'
    ],
    recentTriggers: [
      { symbol: 'SOLUSDT', time: '5m ago', price: '$142.50', change: '+3.2%' }
    ]
  },
  {
    id: '5',
    name: 'Double Bottom',
    description: 'Identifies classic double bottom chart patterns with volume divergence.',
    category: 'REVERSAL',
    isBuiltIn: true,
    enabled: true,
    lastTrigger: '15m ago',
    signalCount: 6,
    conditions: [
      'Two lows within 2% of each other',
      'Volume decreases on second low',
      'RSI above 30'
    ]
  },
  {
    id: '6',
    name: 'Resistance Rejection',
    description: 'Spots price rejection at resistance levels for potential short entries.',
    category: 'REVERSAL',
    isBuiltIn: true,
    enabled: false,
    lastTrigger: '2h ago',
    signalCount: 4
  },

  // ORDER FLOW
  {
    id: '7',
    name: 'Volume Surge',
    description: 'Detects unusual volume spikes that often precede significant price moves.',
    category: 'ORDER FLOW',
    isBuiltIn: true,
    enabled: true,
    lastTrigger: 'Just now',
    signalCount: 23,
    conditions: [
      'Volume > 3x average',
      'Price moved > 1%',
      'Multiple consecutive high-volume candles'
    ],
    recentTriggers: [
      { symbol: 'BNBUSDT', time: 'Just now', price: '$615.80', change: '+4.2%' },
      { symbol: 'ADAUSDT', time: '1m ago', price: '$0.485', change: '+2.1%' },
      { symbol: 'DOGEUSDT', time: '3m ago', price: '$0.0892', change: '+1.5%' }
    ]
  },
  {
    id: '8',
    name: 'Unusual Volume',
    description: 'Tracks volume anomalies compared to historical patterns.',
    category: 'ORDER FLOW',
    isBuiltIn: true,
    enabled: true,
    lastTrigger: '8m ago',
    signalCount: 11
  },

  // BREAKOUT
  {
    id: '9',
    name: 'Range Breakout',
    description: 'Identifies when price breaks out of a consolidation range with conviction.',
    category: 'BREAKOUT',
    isBuiltIn: true,
    enabled: true,
    lastTrigger: '12m ago',
    signalCount: 9,
    conditions: [
      'Price consolidation for 4+ hours',
      'Breakout with >2% move',
      'Volume > 2x average'
    ]
  },
  {
    id: '10',
    name: 'ATH Breakout',
    description: 'Catches coins breaking to all-time highs with strong momentum.',
    category: 'BREAKOUT',
    isBuiltIn: true,
    enabled: false,
    lastTrigger: '1d ago',
    signalCount: 2
  },

  // VOLATILITY
  {
    id: '11',
    name: 'Bollinger Squeeze',
    description: 'Detects Bollinger Band squeezes indicating imminent volatility expansion.',
    category: 'VOLATILITY',
    isBuiltIn: true,
    enabled: true,
    lastTrigger: '25m ago',
    signalCount: 7,
    conditions: [
      'Bollinger Bands width < 20% of average',
      'Price consolidating within narrow range',
      'Volume decreasing'
    ]
  },
  {
    id: '12',
    name: 'ATR Expansion',
    description: 'Monitors Average True Range for volatility breakouts.',
    category: 'VOLATILITY',
    isBuiltIn: true,
    enabled: false,
    lastTrigger: 'Never',
    signalCount: 0
  },

  // PERSONAL (Custom Traders)
  {
    id: '13',
    name: 'My Momentum Scalper',
    description: 'Custom AI trader for quick momentum trades on 5m timeframe.',
    category: 'PERSONAL',
    isBuiltIn: false,
    enabled: true,
    cloudEnabled: true,
    lastTrigger: '3m ago',
    signalCount: 42,
    conditions: [
      'Custom multi-indicator confluence',
      'AI-powered entry timing',
      'Dynamic stop-loss placement'
    ]
  },
  {
    id: '14',
    name: 'Breakout Hunter',
    description: 'Scans for high-probability breakout setups with custom filters.',
    category: 'PERSONAL',
    isBuiltIn: false,
    enabled: true,
    cloudEnabled: false,
    lastTrigger: '14m ago',
    signalCount: 18
  },
  {
    id: '15',
    name: 'Mean Reversion Bot',
    description: 'Trades mean reversion setups on overextended moves.',
    category: 'PERSONAL',
    isBuiltIn: false,
    enabled: false,
    lastTrigger: '1h ago',
    signalCount: 31
  }
];

// Group signals by category
export function groupSignalsByCategory(signals: DemoSignal[]) {
  const groups: Record<string, DemoSignal[]> = {};

  signals.forEach(signal => {
    if (!groups[signal.category]) {
      groups[signal.category] = [];
    }
    groups[signal.category].push(signal);
  });

  return groups;
}

// Filter signals by search query
export function filterSignals(signals: DemoSignal[], query: string): DemoSignal[] {
  if (!query.trim()) return signals;

  const lowerQuery = query.toLowerCase();

  return signals.filter(signal => {
    // Search in name
    if (signal.name.toLowerCase().includes(lowerQuery)) return true;

    // Search in description
    if (signal.description.toLowerCase().includes(lowerQuery)) return true;

    // Search in category
    if (signal.category.toLowerCase().includes(lowerQuery)) return true;

    // Search in conditions
    if (signal.conditions?.some(c => c.toLowerCase().includes(lowerQuery))) return true;

    return false;
  });
}
