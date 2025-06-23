export interface PrebuiltStrategy {
  id: string;
  name: string;
  description: string;
  category: 'scalping' | 'daytrading' | 'momentum' | 'reversal';
  timeframe: '1m' | '5m' | '15m' | '1h';
  holdTime: string;
  winRate?: string;
  avgGain?: string;
  tradesPerDay?: string;
  screenerCode: string;
  riskLevel: 'low' | 'medium' | 'high';
  icon: string;
}

export const prebuiltStrategies: PrebuiltStrategy[] = [
  {
    id: 'quick-scalp',
    name: 'Quick Scalp',
    description: 'VWAP bounce with momentum for rapid gains',
    category: 'scalping',
    timeframe: '1m',
    holdTime: '5-15 mins',
    winRate: '72%',
    avgGain: '+0.4%',
    tradesPerDay: '8-12',
    screenerCode: '',
    riskLevel: 'high',
    icon: '⚡',
  },
  {
    id: '5min-momentum',
    name: '5-Min Momentum',
    description: 'EMA crossover with volume confirmation',
    category: 'momentum',
    timeframe: '5m',
    holdTime: '15-45 mins',
    winRate: '68%',
    avgGain: '+0.8%',
    tradesPerDay: '4-6',
    screenerCode: '',
    riskLevel: 'medium',
    icon: '🚀',
  },
  {
    id: '15min-reversal',
    name: '15-Min Reversal',
    description: 'Oversold bounce at support levels',
    category: 'reversal',
    timeframe: '15m',
    holdTime: '30m-2hr',
    winRate: '65%',
    avgGain: '+1.2%',
    tradesPerDay: '2-4',
    screenerCode: '',
    riskLevel: 'medium',
    icon: '🔄',
  },
  {
    id: 'breakout-scalp',
    name: 'Breakout Scalp',
    description: 'Range breakout with volume surge',
    category: 'scalping',
    timeframe: '5m',
    holdTime: '10-30 mins',
    winRate: '70%',
    avgGain: '+0.6%',
    tradesPerDay: '5-8',
    screenerCode: '',
    riskLevel: 'medium',
    icon: '📈',
  },
  {
    id: 'bull-flag-micro',
    name: 'Bull Flag Micro',
    description: 'Micro patterns on strong movers',
    category: 'scalping',
    timeframe: '1m',
    holdTime: '5-20 mins',
    winRate: '75%',
    avgGain: '+0.5%',
    tradesPerDay: '6-10',
    screenerCode: '',
    riskLevel: 'high',
    icon: '🏁',
  },
  {
    id: 'hourly-swing',
    name: 'Hourly Swing',
    description: 'Trend continuation for day trades',
    category: 'daytrading',
    timeframe: '1h',
    holdTime: '2-6 hours',
    winRate: '62%',
    avgGain: '+2.5%',
    tradesPerDay: '1-3',
    screenerCode: '',
    riskLevel: 'low',
    icon: '📊',
  },
];