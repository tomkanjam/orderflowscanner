# Implementation Plan: Strategy Cards Feature

## Overview
Replace empty signals table with 6 powerful pre-built strategy cards that users can instantly run.

## Phase 1: Strategy Definitions & Screener Code

### 1. Create Strategy Data Structure
```typescript
interface PrebuiltStrategy {
  id: string;
  name: string;
  description: string;
  category: 'momentum' | 'reversal' | 'trend' | 'breakout';
  winRate?: string; // e.g., "68%" - from backtesting
  avgGain?: string; // e.g., "+3.2%"
  screenerCode: string; // Ready-to-execute filter function
  riskLevel: 'low' | 'medium' | 'high';
  idealMarket: string; // e.g., "Trending", "Ranging"
  icon?: string; // For visual appeal
}
```

### 2. Six Core Strategies to Implement

1. **Momentum Surge** (High Win Rate)
   - 20MA > 50MA, RSI 50-70, Volume > 2x average
   - Best in: Trending markets

2. **Oversold Bounce** (Quick Gains)
   - RSI < 30, Near support, Bullish divergence
   - Best in: Any market

3. **Breakout Hunter** (Big Moves)
   - Breaking 24h high, Volume spike, ADX > 25
   - Best in: Volatile markets

4. **MA Golden Cross** (Classic Trend)
   - 50MA crosses above 200MA, Rising volume
   - Best in: Bull markets

5. **Bull Flag Pattern** (Continuation)
   - Consolidation after surge, Declining volume
   - Best in: Strong trends

6. **VWAP Reclaim** (Intraday)
   - Price reclaims VWAP, RSI turning up
   - Best in: Range-bound markets

## Phase 2: Component Structure

### 1. StrategyCard Component
```typescript
components/StrategyCard.tsx
- Display strategy info (name, description, metrics)
- Risk level indicator
- Performance badges (win rate, avg gain)
- "Run Strategy" button
- Hover effects for details
```

### 2. StrategyGrid Component
```typescript
components/StrategyGrid.tsx
- 3x2 grid layout (responsive to 2x3 on mobile)
- Fade-in animation
- Loading states during execution
```

## Phase 3: Integration Flow

### 1. Update App.tsx
- Add `prebuiltStrategies` state
- Create `handleStrategySelect` function
- Modify render logic to show strategy cards when no active screener

### 2. Execution Flow
1. User clicks strategy card
2. Set loading state on that card
3. Extract screenerCode and set as active filter
4. Run screener immediately
5. Transition to results view
6. Show "Using: [Strategy Name]" indicator

## Phase 4: Screener Code Templates

### Example: Momentum Surge
```javascript
// This will be the actual screenerCode string
(symbol, prices, volumes) => {
  if (prices.length < 50) return false;
  
  const ma20 = prices.slice(-20).reduce((a, b) => a + b.close, 0) / 20;
  const ma50 = prices.slice(-50).reduce((a, b) => a + b.close, 0) / 50;
  const rsi = calculateRSI(prices.slice(-14));
  const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVolume = volumes[volumes.length - 1];
  
  return ma20 > ma50 && 
         rsi >= 50 && rsi <= 70 && 
         currentVolume > avgVolume * 2;
}
```

## Phase 5: UI/UX Enhancements

### 1. Visual Design
- Card gradient backgrounds based on risk level
- Performance metric badges (green for good stats)
- Subtle animations on hover
- "LIVE" indicator when strategy is running

### 2. User Feedback
- Success toast: "Running Momentum Surge strategy..."
- Results summary: "Found 5 opportunities"
- Easy "Back to Strategies" option

## Phase 6: State Management

### 1. Add to App State
```typescript
const [selectedStrategy, setSelectedStrategy] = useState<PrebuiltStrategy | null>(null);
const [isLoadingStrategy, setIsLoadingStrategy] = useState<string | null>(null);
```

### 2. Modify Existing Logic
- Update `activeScreeners` check to include strategy cards display
- Add strategy name to results header
- Allow clearing strategy to return to cards

## Implementation Order

1. **Day 1**: Create strategy definitions with working screener code
2. **Day 2**: Build StrategyCard and StrategyGrid components
3. **Day 3**: Integrate with App.tsx and test execution flow
4. **Day 4**: Add animations, loading states, and polish
5. **Day 5**: Test all strategies with live data and refine

## Success Metrics

- Users can run a strategy with one click
- Results appear within 2-3 seconds
- Clear visual feedback throughout the process
- Strategies produce meaningful results
- Easy to return and try different strategies

## Future Enhancements

- A/B test different strategies
- Show historical performance charts
- Allow customizing strategy parameters
- Save favorite strategies
- Strategy combination mode