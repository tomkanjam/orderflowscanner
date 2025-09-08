# Product Context

## Vision

Transform technical analysis into conversational commands. This AI-powered cryptocurrency screener enables traders to describe complex technical conditions in natural language and instantly find matching opportunities across Binance Spot markets. Bridging the gap between trading expertise and technical implementation, making sophisticated market screening accessible to all traders.

## Target Users

### Primary: Active Cryptocurrency Traders
- **Profile:** Day traders and swing traders actively monitoring markets
- **Pain Points:** Manual chart scanning is time-consuming, miss opportunities
- **Value Prop:** Real-time alerts for custom conditions across 100+ pairs
- **Usage:** Create 5-10 custom signals, monitor throughout trading session

### Secondary: Technical Analysis Enthusiasts
- **Profile:** Retail investors learning technical analysis
- **Pain Points:** Complex indicator setup, coding requirements
- **Value Prop:** Natural language to working strategy in seconds
- **Usage:** Experiment with different strategies, learn by doing

### Tertiary: Algorithmic Traders
- **Profile:** Developers building automated trading systems
- **Pain Points:** Need reliable signal generation and backtesting
- **Value Prop:** AI-generated filters with real-time execution
- **Usage:** Generate and test multiple strategies rapidly

## Core Features

### 1. Natural Language Signal Creation
**Description:** Convert plain English trading ideas into executable screening filters
- AI-powered filter generation using Gemini 2.5
- Support for complex multi-indicator conditions
- Multi-timeframe analysis (1m to 1d)
- Automatic indicator calculation

### 2. Real-time Market Screening
**Description:** Continuous monitoring of 100+ cryptocurrency pairs
- WebSocket-based live data streaming
- Sub-second signal detection
- Parallel worker execution for performance
- SharedArrayBuffer optimization (zero-copy)

### 3. Interactive Charting
**Description:** Professional-grade financial charts with indicators
- Candlestick charts with volume
- 15+ technical indicators (MA, RSI, MACD, etc.)
- Multi-timeframe views
- Real-time price updates

### 4. AI-Powered Analysis (Elite)
**Description:** Automated market analysis and insights
- Signal quality assessment
- Entry/exit recommendations
- Risk evaluation
- Market context analysis

### 5. Tiered Access System
**Description:** Progressive feature unlocking based on subscription
- **Anonymous:** View signals and charts
- **Free:** History, favorites (no custom signals)
- **Pro:** Create up to 10 custom signals
- **Elite:** Unlimited signals, AI analysis, auto-trading

## User Journeys

### Creating First Custom Signal
1. **Discovery:** User lands on app, sees example signals triggering
2. **Interest:** Clicks "Create Custom Signal" button
3. **Input:** Types "Find coins breaking above 50-day moving average"
4. **Generation:** AI converts to executable filter code
5. **Results:** Sees matching symbols appear in real-time
6. **Engagement:** Explores charts, sets up notifications

### Professional Trading Workflow
1. **Morning Setup:** Trader creates 5-10 signals for day's strategy
2. **Monitoring:** Dashboard shows all active signals
3. **Alert:** Signal triggers, notification received
4. **Analysis:** Reviews chart with indicators
5. **Decision:** Elite tier gets AI recommendation
6. **Execution:** Places trade (manual or automated)
7. **Tracking:** Monitors position performance

### Strategy Discovery
1. **Browse:** User explores public signal library
2. **Learn:** Reads strategy descriptions
3. **Clone:** Copies interesting strategy
4. **Modify:** Adjusts parameters using natural language
5. **Test:** Runs against live market
6. **Iterate:** Refines based on results

## Business Logic

### Signal Generation Rules
- Minimum 1-minute refresh interval for screening
- Maximum 20 concurrent active traders per user
- Filters execute in isolated worker threads
- Results cached for 60 seconds minimum

### Subscription Enforcement
- Free tier blocked from custom signal creation
- Pro tier limited to 10 custom signals
- Elite tier gets priority processing
- API rate limits apply to all tiers

### Data Management
- Historical data limited to 250 candles for screening
- Real-time data for top 100 pairs by volume
- Automatic memory cleanup for old signals
- 24-hour signal history retention

### AI Integration Constraints
- Gemini Flash model for fast generation
- Maximum 5 retry attempts for filter generation
- JSON schema validation for all AI outputs
- Fallback to simpler prompts on failure

## Success Metrics

### User Engagement
- **Daily Active Users:** 1,000+ target
- **Signals Created:** 100+ per day
- **Average Session:** 15+ minutes
- **Signal Accuracy:** 70%+ match rate

### Technical Performance
- **Signal Detection:** <50ms latency
- **WebSocket Uptime:** 99.9%
- **Worker Execution:** <100ms per cycle
- **Memory Usage:** <500MB for 100 symbols

### Business Metrics
- **Free to Pro Conversion:** 5% target
- **Pro to Elite Upgrade:** 20% target
- **Monthly Recurring Revenue:** Growth 20% MoM
- **Churn Rate:** <10% monthly

## Competitive Landscape

### TradingView
**Differentiator:** Natural language input vs Pine Script coding
- Our advantage: No coding required
- Their advantage: Larger indicator library

### CryptoScreener
**Differentiator:** AI-powered vs manual filter setup
- Our advantage: Conversational interface
- Their advantage: More exchanges supported

### 3Commas
**Differentiator:** Signal generation vs full automation
- Our advantage: Simpler, focused on signals
- Their advantage: Complete trading bot platform

## Roadmap

### Current Sprint (Q1 2025)
- Stabilize shared memory implementation
- Improve AI prompt accuracy
- Add more technical indicators
- Enhance mobile responsiveness

### Next Quarter (Q2 2025)
- Backtesting capabilities
- Strategy performance analytics
- Social features (share signals)
- API for external integration
- Additional exchange support

### Future Vision (H2 2025)
- Machine learning signal optimization
- Automated portfolio management
- Cross-exchange arbitrage detection
- Sentiment analysis integration
- Copy trading functionality

## Product Principles

1. **Simplicity First:** Complex features should feel simple
2. **Real-time Everything:** No delays in critical paths
3. **Progressive Disclosure:** Advanced features when needed
4. **AI Assistance:** Guide users to success
5. **Performance Matters:** Speed is a feature