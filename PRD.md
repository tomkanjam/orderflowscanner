# Product Requirements Document
## AI-Powered Binance Crypto Screener

### Executive Summary
An innovative cryptocurrency screening application that leverages natural language processing to democratize technical analysis. Users can describe market conditions in plain English, and the system automatically translates these into executable screening filters for Binance Spot markets.

### Problem Statement
Traditional crypto screeners require users to:
- Understand complex technical indicators
- Navigate complicated filter interfaces
- Manually configure multiple parameters
- Have deep knowledge of technical analysis terminology

This creates a significant barrier for retail traders who understand market concepts but struggle with technical implementation.

### Solution
A natural language interface that allows users to express trading ideas conversationally:
- "Show me coins that are oversold and breaking out of a downtrend"
- "Find cryptocurrencies with increasing volume and price above 50-day moving average"
- "Which tokens have RSI below 30 and MACD crossing bullish?"

### Target Users

#### Primary Users
- **Retail Crypto Traders**: 1-5 years experience, basic understanding of indicators
- **Swing Traders**: Looking for entry/exit opportunities across multiple pairs
- **Technical Analysis Enthusiasts**: Want to test strategies without coding

#### Secondary Users
- **Crypto Newcomers**: Learning technical analysis through natural language
- **Professional Traders**: Quick screening for idea generation

### Core Features

#### 1. Natural Language Screening
- **Description**: Convert plain English queries into technical filters
- **AI Model**: Google Gemini 2.5 Flash/Pro via Firebase AI Logic
- **Examples**:
  - "Bullish momentum with volume surge"
  - "Oversold conditions near support"
  - "Breaking resistance with MACD confirmation"

#### 2. Real-Time Market Data
- **Data Source**: Binance Spot markets (USDT pairs)
- **Update Frequency**: Real-time via WebSocket
- **Coverage**: Top 100 pairs by 24h volume
- **Minimum Volume**: 100,000 USDT (configurable)

#### 3. Technical Indicators
Built-in support for:
- **Trend**: SMA, EMA, VWAP
- **Momentum**: RSI, MACD, Stochastic
- **Volume**: Volume analysis, OBV
- **Volatility**: Bollinger Bands, ATR
- **Price Action**: Support/Resistance, Patterns

#### 4. Interactive Charts
- **Library**: Lightweight Charts (TradingView)
- **Features**:
  - Candlestick charts
  - Volume overlays
  - Technical indicator overlays
  - Zoom and pan controls

#### 5. AI-Powered Analysis
- **Signal Generation**: Automated buy/sell signals
- **Market Context**: Explanations of current conditions
- **Confidence Scoring**: AI confidence in analysis

#### 6. Multi-Screener Mode
- **Parallel Screening**: Run multiple strategies simultaneously
- **Comparison View**: Side-by-side results
- **Portfolio Discovery**: Find diverse opportunities

### Technical Requirements

#### Frontend
- **Framework**: React 18+ with TypeScript
- **State Management**: React hooks with Map-based state
- **Styling**: Tailwind CSS
- **Charts**: Lightweight Charts library
- **Build Tool**: Vite

#### Backend Services
- **AI Integration**: Firebase AI Logic (Gemini API)
- **Market Data**: Binance REST API & WebSocket
- **Authentication**: Firebase Auth (future)
- **Hosting**: Firebase Hosting

#### Data Architecture
- **Historical Data**: 250 klines for screening
- **Real-time Updates**: WebSocket ticker + kline streams
- **Caching**: In-memory with 30-second cache
- **State Structure**: Map<symbol, MarketData>

### User Stories

#### As a Retail Trader
- I want to describe my trading idea in plain English
- So that I can find opportunities without learning complex filters

#### As a Technical Analyst
- I want to combine multiple indicators naturally
- So that I can implement sophisticated strategies quickly

#### As a Swing Trader
- I want real-time updates on my screens
- So that I can act on opportunities immediately

### Success Metrics

#### User Engagement
- **Daily Active Users**: Target 1,000 DAU within 6 months
- **Screening Sessions**: Average 5 screens per user per day
- **Result Click-through**: >30% chart interaction rate

#### Technical Performance
- **Query Processing**: <2 seconds for AI filter generation
- **Data Latency**: <100ms for WebSocket updates
- **Uptime**: 99.9% availability

#### Business Metrics
- **User Retention**: 40% 30-day retention
- **Feature Adoption**: 60% using advanced indicators
- **Conversion**: 10% to premium features (future)

### MVP Scope

#### Phase 1 (Current)
- ✅ Natural language to filter conversion
- ✅ Real-time Binance data integration
- ✅ Basic technical indicators
- ✅ Interactive charts
- ✅ Single screener mode

#### Phase 2 (Next)
- 🔄 Multi-screener capabilities
- 🔄 Enhanced AI analysis
- 🔄 Signal generation
- 🔄 Performance optimization

### Future Enhancements

#### Near Term (3-6 months)
- User authentication and saved screens
- Alert system for screen matches
- Backtesting capabilities
- Mobile responsive design
- Additional exchanges (KuCoin, Bybit)

#### Long Term (6-12 months)
- Strategy builder with visual interface
- Community screen sharing
- Premium indicators and data
- API access for developers
- Machine learning for pattern recognition

### Risks and Mitigations

#### Technical Risks
- **API Rate Limits**: Implement intelligent caching and batching
- **WebSocket Stability**: Auto-reconnection with exponential backoff
- **AI Hallucinations**: Strict JSON schema validation and error handling

#### Market Risks
- **Competition**: Differentiate through superior NLP interface
- **Regulatory**: Focus on spot markets, avoid derivatives
- **Data Costs**: Start with free tier, optimize as needed

### Success Criteria
- Users can go from idea to results in <30 seconds
- 90% of natural language queries produce valid filters
- System handles 100+ concurrent users without degradation
- User feedback rating >4.5/5 stars

### Competitive Advantages
1. **Natural Language Interface**: No other screener offers conversational filtering
2. **Real-time Processing**: Instant results vs batch processing
3. **AI Integration**: Intelligent interpretation of ambiguous queries
4. **Zero Learning Curve**: Accessible to non-technical users
5. **Free Tier**: Generous limits for retail traders