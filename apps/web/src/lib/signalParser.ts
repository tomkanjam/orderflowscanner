// Simple client-side parser for demo purposes
// This mimics the AI parsing but runs locally

export interface ParsedCondition {
  type: 'indicator' | 'price' | 'volume' | 'pattern';
  indicator?: string;
  operator?: string;
  value?: number | string;
  description: string;
  icon: string;
}

export interface ParsedSignal {
  conditions: ParsedCondition[];
  originalPrompt: string;
  complexity: 'simple' | 'medium' | 'complex';
}

// Pattern matching for common trading terms
const patterns = {
  rsi: {
    regex: /RSI\s*(above|below|over|under|>|<)\s*(\d+)/i,
    type: 'indicator' as const,
    indicator: 'RSI',
    icon: '📊'
  },
  macd: {
    regex: /MACD\s*(crossover|cross|bullish|bearish|above|below)/i,
    type: 'indicator' as const,
    indicator: 'MACD',
    icon: '📈'
  },
  volume: {
    regex: /(volume|vol)\s*(spike|increase|above|high|surge)/i,
    type: 'volume' as const,
    icon: '📊'
  },
  price: {
    regex: /(price|breaking|breakout|above|below)\s*(resistance|support|high|low|\$?\d+)/i,
    type: 'price' as const,
    icon: '💹'
  },
  sma: {
    regex: /(SMA|MA|moving average)\s*(\d+)?\s*(above|below|cross)/i,
    type: 'indicator' as const,
    indicator: 'SMA',
    icon: '📉'
  },
  ema: {
    regex: /EMA\s*(\d+)?\s*(above|below|cross)/i,
    type: 'indicator' as const,
    indicator: 'EMA',
    icon: '📉'
  },
  bollinger: {
    regex: /(bollinger|BB)\s*(band|bands)?\s*(squeeze|breakout|above|below)/i,
    type: 'indicator' as const,
    indicator: 'Bollinger Bands',
    icon: '📊'
  },
  momentum: {
    regex: /(momentum|bullish|bearish)\s*(divergence|increasing|decreasing)?/i,
    type: 'pattern' as const,
    icon: '🚀'
  },
  consolidation: {
    regex: /(consolidation|consolidating|range|ranging)/i,
    type: 'pattern' as const,
    icon: '⏸️'
  }
};

export function parseSignal(prompt: string): ParsedSignal {
  const conditions: ParsedCondition[] = [];
  const normalizedPrompt = prompt.toLowerCase();

  // Check RSI conditions
  const rsiMatch = patterns.rsi.regex.exec(prompt);
  if (rsiMatch) {
    const operator = rsiMatch[1];
    const value = rsiMatch[2];
    conditions.push({
      type: patterns.rsi.type,
      indicator: patterns.rsi.indicator,
      operator: operator.replace(/over|above/, '>').replace(/under|below/, '<'),
      value: parseInt(value),
      description: `RSI ${operator} ${value}`,
      icon: patterns.rsi.icon
    });
  }

  // Check MACD conditions
  const macdMatch = patterns.macd.regex.exec(prompt);
  if (macdMatch) {
    const signal = macdMatch[1];
    conditions.push({
      type: patterns.macd.type,
      indicator: patterns.macd.indicator,
      description: `MACD ${signal}`,
      icon: patterns.macd.icon
    });
  }

  // Check volume conditions
  const volumeMatch = patterns.volume.regex.exec(prompt);
  if (volumeMatch) {
    const condition = volumeMatch[2] || 'increasing';
    conditions.push({
      type: patterns.volume.type,
      description: `Volume ${condition}`,
      icon: patterns.volume.icon
    });
  }

  // Check price action
  const priceMatch = patterns.price.regex.exec(prompt);
  if (priceMatch) {
    const action = priceMatch[1];
    const level = priceMatch[2];
    conditions.push({
      type: patterns.price.type,
      description: `Price ${action} ${level}`,
      icon: patterns.price.icon
    });
  }

  // Check moving averages
  const smaMatch = patterns.sma.regex.exec(prompt);
  if (smaMatch) {
    const period = smaMatch[2] || '50';
    const condition = smaMatch[3];
    conditions.push({
      type: patterns.sma.type,
      indicator: patterns.sma.indicator,
      description: `SMA ${period} ${condition}`,
      icon: patterns.sma.icon
    });
  }

  // Check Bollinger Bands
  const bollingerMatch = patterns.bollinger.regex.exec(prompt);
  if (bollingerMatch) {
    const condition = bollingerMatch[3];
    conditions.push({
      type: patterns.bollinger.type,
      indicator: patterns.bollinger.indicator,
      description: `Bollinger Bands ${condition}`,
      icon: patterns.bollinger.icon
    });
  }

  // Check patterns
  if (normalizedPrompt.includes('momentum') || normalizedPrompt.includes('bullish') || normalizedPrompt.includes('bearish')) {
    const isBullish = normalizedPrompt.includes('bullish');
    conditions.push({
      type: 'pattern',
      description: isBullish ? 'Bullish momentum' : normalizedPrompt.includes('bearish') ? 'Bearish momentum' : 'Momentum shift',
      icon: patterns.momentum.icon
    });
  }

  if (normalizedPrompt.includes('consolidat') || normalizedPrompt.includes('rang')) {
    conditions.push({
      type: 'pattern',
      description: 'Consolidation breakout',
      icon: patterns.consolidation.icon
    });
  }

  // If no specific conditions found, add a generic one
  if (conditions.length === 0) {
    conditions.push({
      type: 'pattern',
      description: 'Custom trading condition',
      icon: '🎯'
    });
  }

  // Determine complexity
  const complexity = conditions.length <= 2 ? 'simple' : conditions.length <= 4 ? 'medium' : 'complex';

  return {
    conditions,
    originalPrompt: prompt,
    complexity
  };
}

// Example prompts for suggestions
export const examplePrompts = [
  "RSI above 70 with increasing volume",
  "MACD crossover with price above 50 SMA",
  "Breaking out of consolidation with volume spike",
  "Bollinger band squeeze with bullish momentum",
  "Price above resistance with RSI below 30"
];