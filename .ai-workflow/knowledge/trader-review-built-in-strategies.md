# Built-in Strategies Review - Marcus Chen

## Initial Reaction

Good thinking on pre-built strategies. Most retail traders blow up trying to reinvent the wheel. Give them battle-tested setups that actually work in crypto's 24/7 volatility.

## Core Strategy Categories Needed

### 1. **Momentum Breakouts**
- **Bull Flag Momentum**: 20MA > 50MA, RSI 50-70, volume spike > 2x average
  - Trade Plan: 2% position, -1.5% stop, trail at 2 ATR
- **VWAP Breakout**: Price crosses VWAP with volume, RSI not overbought
  - Trade Plan: 1% position, stop below VWAP, 3:1 R/R minimum

### 2. **Mean Reversion**
- **Oversold Bounce**: RSI < 30, near support, volume declining
  - Trade Plan: 0.5% position (high risk), tight -1% stop, quick 2-3% target
- **Bollinger Band Squeeze**: Price at lower band, momentum divergence
  - Trade Plan: 1% position, stop below band, target middle band

### 3. **Trend Following**
- **MA Ribbon Trend**: 10/20/50 MA aligned, ADX > 25
  - Trade Plan: 3% position (strong trend), -2% stop, trail with 20MA
- **Higher Low Continuation**: Making HLs, volume on up moves
  - Trade Plan: 2% position, stop at previous low, pyramid on strength

### 4. **Range Trading**
- **Support/Resistance Ping Pong**: Clear range, RSI extremes
  - Trade Plan: 1% position, stops outside range, flip at boundaries
- **Accumulation Zone**: Tight range, declining volume, near major support
  - Trade Plan: Build 2-4% position gradually, wide stop, target breakout

### 5. **Volume Profile**
- **High Volume Node Retest**: Return to HVN after breakout
  - Trade Plan: 1.5% position, stop below node, continuation target
- **Low Volume Gap Fill**: Price entering low volume area
  - Trade Plan: 0.5% quick scalp, tight stop, exit at next HVN

## Crypto-Specific Strategies

### 6. **Altcoin Rotation**
- **BTC Dominance Shift**: BTC sideways, alts showing strength
  - Trade Plan: Diversify 5% across 5 alts, -10% portfolio stop
- **Layer 1 Momentum**: ETH/SOL/etc leading, catch laggards
  - Trade Plan: 2% per position, sector-based stops

### 7. **DeFi Yield Plays**
- **Stablecoin Premium**: USDT/USDC spreads widening
  - Trade Plan: Arb position sizing based on spread
- **Liquidity Mining Entry**: New pools with high APY
  - Trade Plan: Risk 1% for 7-day test, scale if profitable

## Risk-Adjusted Variations

Each strategy needs 3 versions:
- **Conservative**: Smaller size, tighter stops, lower targets
- **Standard**: Balanced risk/reward
- **Aggressive**: Larger size, wider stops, runner positions

## Critical Implementation Notes

1. **Backtesting Data**: Show 90-day performance for each strategy
2. **Market Condition Filters**: Some strategies only in trending/ranging markets
3. **Correlation Warnings**: Alert when running multiple correlated strategies
4. **Position Sizing Calculator**: Based on account size and risk tolerance
5. **Emergency Stops**: Global -5% daily loss kills all strategies

## Missing But Essential

- **News Fade Strategy**: Overreaction to headlines
- **Funding Rate Arbitrage**: Spot/perp spreads
- **Weekend Thin Liquidity**: Different rules for low volume periods
- **Liquidation Hunt**: Stops below obvious levels

## Real Experience Example

During May 2021 crash, only two strategies survived:
1. Mean reversion with tiny positions
2. Short-term oversold bounces

Everything else got destroyed. Build in market regime detection that automatically adjusts or disables strategies.

## Comparison to Professional Tools

Bloomberg's BTST (Back Test Strategy) has 200+ pre-built strategies. We don't need that many, but we need:
- Clear performance metrics
- Drawdown visualization
- Win rate vs profit factor trade-offs
- Correlation matrix between strategies

## Risk Factors

Biggest danger: Retail traders running all strategies at once thinking diversification = safety. In crypto, everything correlates in crashes. Need portfolio-level risk management, not just individual strategy stops.

**Bottom Line**: Start with 10-15 proven strategies. Make them stupid simple to understand. Show real performance. Build in safeguards for the inevitable black swan.