# Implementation Plan: Day Trading & Scalping Strategy Cards

## Overview
Display 6 powerful day trading and scalping strategies with specific timeframes that users can instantly run.

## Updated Strategy Data Structure
```typescript
interface PrebuiltStrategy {
  id: string;
  name: string;
  description: string;
  category: 'scalping' | 'daytrading' | 'momentum' | 'reversal';
  timeframe: '1m' | '5m' | '15m' | '1h'; // Candle interval
  holdTime: string; // e.g., "5-30 mins", "1-4 hours"
  winRate?: string; // e.g., "72%" - from backtesting
  avgGain?: string; // e.g., "+0.8%"
  tradesPerDay?: string; // e.g., "3-5"
  screenerCode: string; // Ready-to-execute filter function
  riskLevel: 'low' | 'medium' | 'high';
  icon?: string; // For visual appeal
}
```

## Six Day Trading & Scalping Strategies

### 1. **Quick Scalp** (1m candles)
- **Strategy**: VWAP bounce with momentum
- **Hold Time**: 5-15 minutes
- **Signals**: Price touches VWAP, RSI oversold on 1m, volume spike
- **Target**: 0.3-0.5% quick gains
- **Best Hours**: First 2 hours after market open

### 2. **5-Min Momentum** (5m candles)
- **Strategy**: MA crossover with volume confirmation
- **Hold Time**: 15-45 minutes  
- **Signals**: 9 EMA crosses 21 EMA, MACD bullish, volume > average
- **Target**: 0.5-1.5% moves
- **Best Hours**: High volume periods

### 3. **15-Min Reversal** (15m candles)
- **Strategy**: Oversold bounce at support
- **Hold Time**: 30 mins - 2 hours
- **Signals**: RSI < 30, Stoch oversold, near daily pivot
- **Target**: 1-2% reversal moves
- **Best Hours**: After sharp selloffs

### 4. **Breakout Scalp** (5m candles)
- **Strategy**: Range breakout with volume
- **Hold Time**: 10-30 minutes
- **Signals**: Break of 30-min high, volume 3x average, ADX rising
- **Target**: 0.5-1% continuation
- **Best Hours**: Range breakouts

### 5. **Bull Flag Micro** (1m candles)
- **Strategy**: Micro bull flags on strong movers
- **Hold Time**: 5-20 minutes
- **Signals**: Flag pattern, declining volume, RSI cooling
- **Target**: 0.3-0.8% pops
- **Best Hours**: During strong trends

### 6. **Hourly Swing** (1h candles)
- **Strategy**: Trend continuation for day trades
- **Hold Time**: 2-6 hours
- **Signals**: Higher low, 20MA support, MACD cross
- **Target**: 2-4% trend moves
- **Best Hours**: Trending days

## Screener Code Examples

### Quick Scalp (1m)
```javascript
(symbol, prices, volumes, interval) => {
  if (interval !== '1m' || prices.length < 60) return false;
  
  const vwap = calculateVWAP(prices.slice(-60), volumes.slice(-60));
  const currentPrice = prices[prices.length - 1].close;
  const rsi = calculateRSI(prices.slice(-14));
  const volumeSpike = volumes[volumes.length - 1] > volumes.slice(-10, -1).reduce((a,b) => a+b, 0) / 9 * 2;
  
  // Price near VWAP (within 0.1%), RSI oversold, volume spike
  return Math.abs(currentPrice - vwap) / vwap < 0.001 && 
         rsi < 35 && 
         volumeSpike;
}
```

### 5-Min Momentum
```javascript
(symbol, prices, volumes, interval) => {
  if (interval !== '5m' || prices.length < 50) return false;
  
  const ema9 = calculateEMA(prices.slice(-9), 9);
  const ema21 = calculateEMA(prices.slice(-21), 21);
  const ema9Prev = calculateEMA(prices.slice(-10, -1), 9);
  const ema21Prev = calculateEMA(prices.slice(-22, -1), 21);
  const avgVolume = volumes.slice(-20).reduce((a,b) => a+b, 0) / 20;
  
  // Fresh crossover with volume
  return ema9 > ema21 && 
         ema9Prev <= ema21Prev && 
         volumes[volumes.length - 1] > avgVolume * 1.5;
}
```

## Component Updates

### StrategyCard Component
```typescript
interface StrategyCardProps {
  strategy: PrebuiltStrategy;
  onSelect: (strategy: PrebuiltStrategy) => void;
  isLoading: boolean;
}

// Display:
// - Strategy name & timeframe badge
// - Hold time indicator
// - Win rate & avg gain
// - Trades per day estimate
// - Risk level color coding
```

### Visual Design
- **Timeframe badges**: Color-coded (1m: red, 5m: orange, 15m: blue, 1h: green)
- **Performance metrics**: Win rate prominent, avg gain below
- **Hold time**: Clock icon with duration
- **Active indicator**: Pulse animation when strategy is running

## Integration with Existing System

### 1. Modify App.tsx
```typescript
// Add timeframe to screener execution
const handleStrategySelect = async (strategy: PrebuiltStrategy) => {
  setIsLoadingStrategy(strategy.id);
  setSelectedTimeframe(strategy.timeframe); // Set appropriate candle interval
  setActivePrompt(strategy.name);
  
  // Execute the pre-built screener code
  const filter = new Function('symbol', 'prices', 'volumes', 'interval', strategy.screenerCode);
  // Run screening logic
};
```

### 2. Update WebSocket Subscriptions
- Ensure selected timeframe klines are subscribed
- May need multiple timeframe data for some strategies

## UI Flow

1. **Initial State**: 6 strategy cards in 3x2 grid
2. **Selection**: Click card → loading state on that card
3. **Execution**: Run strategy with correct timeframe
4. **Results**: Show filtered coins with strategy name header
5. **Return**: "Back to Strategies" button to try another

## Performance Considerations

- Pre-compile strategy functions on load
- Cache recent results for each strategy
- Show estimated execution time
- Limit results to top 10 for scalping strategies

## Testing Requirements

- Verify each strategy during different market conditions
- Test timeframe switching
- Ensure accurate indicator calculations
- Validate realistic win rates with paper trading

## Future Enhancements

- Strategy performance tracking
- Combine multiple timeframes
- Custom alerts when strategy triggers
- Backtesting visualization
- Risk management presets per strategy