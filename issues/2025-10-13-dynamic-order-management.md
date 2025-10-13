# AI-Powered Trade Execution & Dynamic Order Management

**Created**: 2025-10-13
**Updated**: 2025-10-13
**Status**: 📋 Specification
**Stage**: 2/9 - Product Requirements

---

## Original Feature Request

Build a complete AI-powered trade execution system where the AI makes all trading decisions at every analysis cycle, including:

### Core Trading Decisions (5 Decision Types)
1. **NO TRADE**: No action, continue monitoring
2. **LONG**: Enter long position with initial SL/TP
3. **SHORT**: Enter short position with initial SL/TP
4. **WATCH**: Monitor symbol closely but don't enter yet
5. **CLOSE**: Exit current position (full or partial)
6. **PARTIAL_TP**: Take partial profits while keeping position open

### Dynamic Order Management (New)
When a position is already open, the AI can also make dynamic stop loss (SL) and take profit (TP) modifications:

**Examples of dynamic management**:
- Move stop loss to breakeven when position reaches profit threshold
- Take partial profits at predetermined levels
- Create or adjust take profit orders at specific price levels
- Trail stop loss as position moves in favorable direction
- Tighten stops as position ages or volatility increases

### Paper Trading Support (Critical)
- Users without exchange API keys must be able to use paper trading
- Paper trading should simulate realistic order execution and fills
- State must persist across restarts
- Performance tracking identical between paper and real trading

### Full Position Management
- Track open positions with entry price, quantity, current P&L
- Maintain order references (entry, SL, multiple TPs)
- Audit trail of all modifications and decisions
- Handle position lifecycle from entry through multiple modifications to exit

---

## Idea Review & Domain Analysis

### Complete Trading System Scope

This is a **full-featured AI trading system** that encompasses:

1. **Signal Detection** (Already Exists): Trader filters identify setups
2. **AI Analysis** (Already Exists): LLM analyzes setups and provides reasoning
3. **Trade Execution** (NEW): AI decides whether to enter positions
4. **Position Management** (NEW): Track open positions and P&L
5. **Dynamic Risk Management** (NEW): AI modifies SL/TP based on market conditions
6. **Paper Trading Engine** (NEW): Simulate trading for users without exchange keys
7. **Performance Tracking** (NEW): Track P&L, win rate, drawdowns

This represents a **complete algorithmic trading platform** - moving from "signal detection" to "autonomous trading."

### Trading System Architecture Context

In professional algorithmic trading systems, this is a **multi-layered decision framework**:

- **Layer 1: Signal Generation** - Identify potential setups (already implemented)
- **Layer 2: Trade Decision** - Should we act on this signal? (NEW)
- **Layer 3: Position Entry** - Execute entry with initial risk parameters (NEW)
- **Layer 4: Active Management** - Dynamically adjust risk based on conditions (NEW)
- **Layer 5: Position Exit** - Close positions based on targets or conditions (NEW)

**Industry Standard Approaches**:

1. **Risk Management Levels**:
   - **Entry Management**: Initial SL/TP placement at position open
   - **Active Management**: Dynamic adjustments based on market conditions
   - **Exit Management**: Final profit-taking or loss-cutting decisions

2. **Common Dynamic Strategies**:
   - **Breakeven Protection**: Move SL to entry price after X% profit
   - **Trailing Stops**: Adjust SL as price moves favorably
   - **Scaled Exits**: Take profits in portions (e.g., 50% at +2%, 50% at +5%)
   - **Risk Reduction**: Tighten SL as position ages or volatility increases
   - **Profit Protection**: Create new TP orders as milestones hit

3. **Order Management Complexity**:
   - **OCO Orders** (One-Cancels-Other): SL and TP linked
   - **Bracket Orders**: Entry with automatic SL/TP
   - **Modify vs Cancel/Replace**: Different exchange implementations
   - **Order State Synchronization**: Critical for paper vs real trading

### Key Architectural Considerations

#### 1. **Decision Making Authority**
**Question**: Who decides when to modify orders?
- **AI-Driven**: LLM analyzes current position P&L, market conditions, decides modifications
- **Rule-Based**: Predefined rules (e.g., "move SL to breakeven at +2%")
- **Hybrid**: AI suggests, rules validate/constrain

**Implication**: AI-driven provides flexibility but needs careful prompt engineering and testing. Rule-based is predictable but less adaptive.

#### 2. **Order Execution Timing**
**Question**: When do modifications execute?
- **Immediate**: On every analysis cycle when conditions met
- **Debounced**: Wait X seconds to avoid excessive order updates
- **Event-Based**: Only on significant price movements or time intervals

**Implication**: Excessive order modifications can:
- Trigger rate limits on exchanges
- Generate unnecessary fees (some exchanges charge for modifications)
- Create race conditions with fills

#### 3. **Paper Trading Parity**
**Question**: How do we ensure paper trading behaves identically to real trading?
- **Simulated Order Book**: Track pending orders, simulate fills
- **Slippage Modeling**: Account for market impact in paper trading
- **Fill Simulation**: Realistic fill logic (limit orders don't fill instantly)
- **State Persistence**: Paper positions/orders survive restarts

**Implication**: Paper trading must be realistic enough to provide meaningful backtesting, but simple enough to maintain.

#### 4. **Risk Management Constraints**
**Question**: What guardrails prevent dangerous modifications?
- **Maximum SL Distance**: Don't allow SL to move too far from current price
- **Minimum TP Distance**: Ensure TP orders make sense given fees
- **Modification Frequency**: Rate limit how often orders can change
- **Profit Lock-In**: Never move SL further from breakeven once in profit

**Implication**: AI can hallucinate bad decisions - need validation layer.

#### 5. **Exchange Integration**
**Question**: How do we handle exchange-specific order management?
- **Binance**: Supports order modification, OCO orders
- **Other Exchanges**: May require cancel/replace pattern
- **Unified Interface**: Abstract exchange differences
- **Failure Handling**: What if modification request fails?

**Implication**: Need exchange abstraction layer with retry logic and fallback strategies.

### Data Model Requirements

#### AI Trade Decision
```
TradeDecision {
  // Core decision
  decision: "NO_TRADE" | "LONG" | "SHORT" | "WATCH" | "CLOSE" | "PARTIAL_TP"
  confidence: float  // 0.0 to 1.0
  reasoning: string

  // Entry parameters (for LONG/SHORT)
  entryPrice?: float64
  quantity?: float64
  stopLoss?: float64
  takeProfits?: TPLevel[]

  // Exit parameters (for CLOSE/PARTIAL_TP)
  exitPrice?: float64
  partialQuantity?: float64  // For PARTIAL_TP

  // Dynamic modifications (for open positions)
  modifications?: OrderModification[]

  // Risk assessment
  riskRewardRatio?: float64
  maxRiskPercent?: float64
  expectedHoldingTime?: duration
}
```

#### Position State
```
Position {
  id: string
  traderID: string
  userID: string
  symbol: string
  side: "LONG" | "SHORT"
  status: "OPEN" | "CLOSED" | "CLOSING"

  // Entry details
  entryPrice: float64
  entryQuantity: float64
  entryOrderID: string
  entryTime: timestamp

  // Current state
  currentPrice: float64
  remainingQuantity: float64
  unrealizedPnL: float64
  unrealizedPnLPercent: float64
  realizedPnL: float64  // From partial closes

  // Order references
  stopLossOrderID?: string
  takeProfitOrderIDs: string[]

  // Risk management
  initialStopLoss: float64
  currentStopLoss: float64
  takeProfitLevels: TPLevel[]

  // Lifecycle tracking
  openedAt: timestamp
  closedAt?: timestamp
  lastModifiedAt: timestamp
  modificationCount: int
  analysisCount: int  // How many times analyzed

  // Paper trading
  isPaperTrade: bool
  simulatedFills: Fill[]

  // Performance
  maxUnrealizedPnL: float64  // Highest profit seen
  maxDrawdown: float64  // Worst drawdown from peak
  holdingDuration: duration
}

TPLevel {
  price: float64
  quantity: float64  // Portion of position
  orderID?: string
  filled: bool
  filledAt?: timestamp
}

Fill {
  id: string
  orderID: string
  price: float64
  quantity: float64
  side: "BUY" | "SELL"
  timestamp: timestamp
  fee: float64
  feeAsset: string
}
```

#### Order Modification Event
```
OrderModification {
  id: string
  positionID: string
  modificationType: "MOVE_SL" | "ADD_TP" | "MODIFY_TP" | "CANCEL_TP" | "TRAIL_SL"

  // Previous state
  previousStopLoss?: float64
  previousTakeProfits?: TPLevel[]

  // New state
  newStopLoss?: float64
  newTakeProfits?: TPLevel[]

  // Metadata
  reason: string  // AI's reasoning
  triggeredBy: "AI_ANALYSIS" | "RULE_ENGINE" | "USER_MANUAL"
  timestamp: timestamp
  success: bool
  error?: string

  // Validation
  validationResult: ValidationResult
}

ValidationResult {
  isValid: bool
  errors: string[]
  warnings: string[]
  constraints: Constraint[]
}

Constraint {
  name: string  // e.g., "MIN_SL_DISTANCE"
  satisfied: bool
  currentValue: float64
  requiredValue: float64
}
```

#### Trader Configuration (Extended)
```
Trader {
  // Existing fields...
  id: string
  userID: string
  name: string
  filter: FilterConfig

  // NEW: Trading configuration
  trading: TradingConfig {
    enabled: bool  // Master switch
    isPaperTrading: bool

    // Position sizing
    positionSizeUSD: float64  // Fixed USD size per trade
    positionSizePercent?: float64  // Percent of portfolio
    maxPositions: int  // Max concurrent positions

    // Risk parameters
    maxRiskPercentPerTrade: float64  // e.g., 2%
    maxDailyDrawdown: float64  // e.g., 5%
    maxTotalDrawdown: float64  // e.g., 20%

    // Entry rules
    requireConfirmation: bool  // Wait for user approval
    minConfidence: float64  // Minimum AI confidence to trade

    // Dynamic management rules
    enableDynamicSL: bool
    enableDynamicTP: bool
    moveToBreakevenAt: float64  // e.g., 2% profit
    trailingStopPercent?: float64

    // Exchange connection
    exchangeType: "BINANCE" | "PAPER"
    apiKey?: string (encrypted)
    apiSecret?: string (encrypted)
  }
}
```

### Critical Questions Before Implementation

#### Business Logic & Product
1. **Is this feature Elite-tier only or available to Pro tier?** (major monetization decision)
2. **Should paper trading be free or paid?** (compute costs for simulated fills)
3. **Do users need to opt-in explicitly to real trading?** (legal liability, terms of service)
4. **What happens if user's exchange API keys expire mid-trade?** (emergency close, notify, pause?)
5. **Should we support partial position closes?** (close 50% of position, keep 50% running)
6. **Can users override AI decisions manually?** (pause AI, manual close, force modification)
7. **How do we handle margin/leverage?** (support leveraged positions or spot only?)

#### Trade Entry & Execution
8. **Position sizing strategy?** (fixed USD, % of portfolio, Kelly criterion, custom?)
9. **Market or limit orders for entry?** (market = guaranteed fill but slippage, limit = better price but may miss)
10. **How do we handle failed entries?** (retry, cancel signal, notify user?)
11. **Should AI wait for confirmation before entering?** (require user approval for each trade?)
12. **Minimum confidence threshold to trade?** (AI must be X% confident to enter)

#### Position Management
13. **Max concurrent positions per trader?** (prevent overexposure)
14. **Max total positions across all traders per user?** (account-wide risk limit)
15. **How do we track positions across restarts?** (state persistence critical)
16. **What happens if position is filled but database update fails?** (consistency critical)
17. **Should we support scaling in?** (add to existing position)

#### Risk Management & Safety
18. **Max risk per trade?** (e.g., can't risk more than 2% of portfolio)
19. **Max daily drawdown?** (pause trading if lose X% in a day)
20. **Max total drawdown?** (kill switch if portfolio down X%)
21. **Validation rules for SL/TP modifications?** (never move SL away from breakeven, min distance from price, etc.)
22. **How do we prevent AI from making irrational decisions?** (validation layer, confidence thresholds, sanity checks)
23. **Rate limiting for order modifications?** (don't spam exchange with constant updates)

#### Technical Architecture
24. **Where does trading logic live?** (Go backend = low latency, Edge function = serverless but slower)
25. **How do we handle concurrent modifications?** (AI wants to modify, user wants to modify, lock position state?)
26. **Do we need an order management queue?** (for retries, rate limiting, priority)
27. **How do we synchronize state between paper and real trading?** (same code paths, just different connectors?)
28. **Database transactions for position updates?** (critical for consistency)

#### Paper Trading Specifics
29. **How realistic should fill simulation be?** (instant fill vs order book depth simulation?)
30. **Should we simulate slippage?** (more realistic but harder to implement)
31. **Do paper trades persist across server restarts?** (need to load state on startup)
32. **Should paper trading use real-time prices or delayed?** (real-time = accurate, delayed = cheaper)

#### AI Integration
33. **What context does AI need for trade decisions?** (current P&L, time in trade, volatility, recent fills?)
34. **How do we prompt AI differently for entry vs modification?** (different decision contexts)
35. **Should modifications be part of existing analysis or separate call?** (latency vs context)
36. **How do we handle AI hallucinations?** (AI suggests impossible SL price, validation catches it?)
37. **Confidence scoring for AI decisions?** (low confidence = don't trade, high confidence = trade)

#### Exchange Integration (Real Trading)
38. **Which order types to support?** (market, limit, stop-loss, take-profit, OCO?)
39. **How do we handle Binance rate limits?** (queue, backoff, burst allowance?)
40. **What if order modification fails on exchange?** (retry, revert to previous, notify user?)
41. **How do we sync order state with exchange?** (poll order status, webhooks?)
42. **Do we need testnet mode?** (Binance testnet before going live?)

#### Monitoring & Notifications
43. **What events should trigger notifications?** (position opened, SL moved, profit taken, stopped out?)
44. **How do users monitor active positions?** (dashboard, real-time updates, historical view?)
45. **Performance tracking metrics?** (win rate, avg profit, max drawdown, Sharpe ratio?)
46. **Audit trail requirements?** (every order, every modification, every decision logged?)

#### Error Handling & Recovery
47. **What if server crashes with open positions?** (reload state, reconnect to exchange, verify orders still exist?)
48. **How do we handle exchange outages?** (can't modify orders, positions stuck open?)
49. **What if AI API fails mid-trade?** (fall back to rule-based decisions, close positions?)
50. **Should we have emergency "close all" functionality?** (panic button to exit everything?)

#### Compliance & Legal
51. **Do we need disclaimers about trading risks?** (not financial advice, can lose money?)
52. **Is there regulatory compliance for automated trading?** (varies by jurisdiction)
53. **Do we need to log trades for tax reporting?** (realized P&L, wash sales?)
54. **What data retention policies?** (keep trade history for 7 years?)

### Proposed High-Level Architecture

#### Complete Event-Driven Flow

```
1. SIGNAL GENERATION (Already Exists)
   └─> Trader filter identifies setup
   └─> Signal created in database
   └─> EventBus publishes SignalEvent

2. AI ANALYSIS (Already Exists)
   └─> Analysis Engine receives SignalEvent
   └─> Fetches market data (klines, ticker, volume)
   └─> Calls LLM with market context
   └─> Returns initial analysis + reasoning

3. TRADE DECISION (NEW)
   └─> Check if trader has open position for this symbol

   IF NO POSITION:
     └─> AI decides: NO_TRADE, LONG, SHORT, or WATCH
     └─> If LONG/SHORT:
         ├─> Calculate position size based on risk parameters
         ├─> Determine entry price (market or limit)
         ├─> Calculate initial SL/TP levels
         └─> Pass to Execution Engine

   IF POSITION OPEN:
     └─> AI analyzes position state (P&L, time in trade, market conditions)
     └─> Decides: HOLD, CLOSE, PARTIAL_TP, or MODIFY_RISK
     └─> If MODIFY_RISK:
         ├─> Suggest SL modifications (breakeven, trailing, tightening)
         ├─> Suggest TP modifications (add levels, adjust targets)
         └─> Pass to Validation Layer

4. VALIDATION LAYER (NEW)
   └─> Order Modification Validator checks:
       ├─> SL not too far from current price
       ├─> TP targets make sense given fees
       ├─> Not moving SL away from breakeven
       ├─> Respects rate limits for modifications
       ├─> User-defined risk constraints
       └─> Returns ValidationResult

5. POSITION MANAGER (NEW)
   └─> Central state machine for position lifecycle
   └─> Tracks all open positions per trader
   └─> Updates position state (P&L, fills, modifications)
   └─> Enforces max positions per trader
   └─> Handles concurrent access safely

6. EXECUTION ENGINE (NEW)
   IF PAPER TRADING:
     └─> Paper Trading Engine
         ├─> Simulate order placement (no real exchange)
         ├─> Simulate fills based on current price
         ├─> Track simulated orders and fills
         ├─> Calculate realistic slippage
         └─> Update position state

   IF REAL TRADING:
     └─> Exchange Connector (Binance)
         ├─> Place market/limit orders via API
         ├─> Handle OCO orders for SL/TP
         ├─> Modify existing orders
         ├─> Handle API errors and retries
         ├─> Rate limit management
         └─> Sync order state with exchange

7. STATE PERSISTENCE (NEW)
   └─> Update database:
       ├─> Position records (entry, SL, TP, P&L)
       ├─> Fill records (for audit trail)
       ├─> Modification history
       ├─> Performance metrics
       └─> Trade journal entries

8. MONITORING & NOTIFICATIONS (Extends Existing)
   └─> EventBus publishes events:
       ├─> PositionOpenedEvent
       ├─> PositionModifiedEvent
       ├─> PositionClosedEvent
       ├─> RiskLimitBreachedEvent
       └─> ErrorEvent
   └─> Monitoring Engine tracks:
       ├─> Active positions per trader
       ├─> Total P&L across all positions
       ├─> Drawdown levels
       ├─> Daily risk usage
       └─> Sends notifications to user
```

#### Key Components Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      EVENT BUS (Existing)                    │
└─────────────────────────────────────────────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
    ┌────────────┐      ┌──────────────┐    ┌──────────────┐
    │   Signal   │      │   Analysis   │    │  Monitoring  │
    │ Generator  │      │    Engine    │    │    Engine    │
    │ (Exists)   │      │  (Exists)    │    │  (Exists)    │
    └────────────┘      └──────────────┘    └──────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │  Trade Decision    │ ◄─── NEW
                    │     Engine         │
                    └────────────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │    Validation      │ ◄─── NEW
                    │      Layer         │
                    └────────────────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │    Position        │ ◄─── NEW
                    │     Manager        │
                    └────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
    ┌────────────────────┐        ┌────────────────────┐
    │  Paper Trading     │        │    Exchange        │
    │     Engine         │ ◄─ OR ─→    Connector       │
    │      (NEW)         │        │   (Binance)        │
    └────────────────────┘        └────────────────────┘
                │                             │
                └──────────────┬──────────────┘
                               ▼
                    ┌────────────────────┐
                    │    Database        │
                    │  (Supabase)        │
                    └────────────────────┘
```

**Key Components to Build**:

1. **Trade Decision Engine**:
   - Extends analysis engine to return TradeDecision
   - Checks position state before deciding
   - Calculates risk parameters

2. **Validation Layer**:
   - Validates all order modifications
   - Enforces risk constraints
   - Prevents dangerous AI decisions

3. **Position Manager**:
   - Central state machine for all positions
   - Thread-safe position tracking
   - Enforces trader-level limits

4. **Paper Trading Engine**:
   - Simulates realistic order execution
   - No real exchange API calls
   - Tracks simulated fills and state

5. **Exchange Connector**:
   - Abstracts Binance API
   - Handles order placement/modification
   - Rate limiting and error handling

6. **Database Schema Extensions**:
   - `positions` table
   - `fills` table
   - `order_modifications` table
   - `trading_performance` table

### Success Criteria

#### Phase 1: Paper Trading MVP
1. **Trade Entry**:
   - AI can decide to enter LONG/SHORT positions based on signals
   - Position sizing calculates correctly based on risk parameters
   - Initial SL/TP orders placed with entry
   - Simulated fills happen at realistic prices

2. **Position Management**:
   - All open positions tracked correctly
   - P&L updates in real-time as price changes
   - Position state persists across server restarts
   - Max position limits enforced

3. **Dynamic Risk Management**:
   - AI can suggest SL/TP modifications for open positions
   - Validation layer prevents dangerous modifications
   - Modifications execute correctly in paper trading
   - Modification history logged with AI reasoning

4. **Position Exit**:
   - AI can decide to close positions (full or partial)
   - Take profit orders simulate correctly
   - Stop loss orders simulate correctly
   - Realized P&L calculated accurately

5. **Performance Tracking**:
   - Win rate, avg profit, max drawdown tracked
   - Trade journal with entry/exit reasoning
   - Performance dashboard shows key metrics

#### Phase 2: Real Trading (After Paper Trading Proven)
1. **Exchange Integration**:
   - Binance API connection secure and stable
   - Order placement works for market/limit orders
   - OCO orders (SL + TP) execute correctly
   - Order modification via exchange API

2. **Risk Controls**:
   - Daily drawdown limits enforced
   - Total drawdown kill switch works
   - Max risk per trade validated
   - Rate limiting prevents exchange issues

3. **Error Handling**:
   - Failed orders retry with backoff
   - Exchange outages handled gracefully
   - State inconsistencies detected and corrected
   - Emergency "close all" works

4. **User Safety**:
   - Explicit opt-in required for real trading
   - User can pause/resume AI trading
   - Manual overrides always possible
   - Clear risk disclaimers shown

#### Phase 3: Advanced Features
1. **Multi-Timeframe Analysis**:
   - AI considers multiple timeframes for decisions
   - Entry timing optimized across timeframes

2. **Portfolio Management**:
   - Correlation-aware position sizing
   - Sector exposure limits
   - Portfolio-level risk management

3. **Advanced Order Types**:
   - Trailing stops
   - Scaled entries/exits
   - Time-based exits

4. **Performance Optimization**:
   - ML-based confidence scoring
   - Strategy parameter optimization
   - Adaptive position sizing

### Minimum Viable Product (MVP) Scope

**What to build first** (Paper Trading MVP):

✅ **Core Components**:
- Trade Decision Engine (extends analysis engine)
- Position Manager (track positions in memory + DB)
- Paper Trading Engine (simulated fills)
- Validation Layer (prevent bad decisions)
- Database schema (positions, fills, modifications tables)

✅ **Essential Features**:
- AI decides LONG/SHORT/NO_TRADE on signals
- Position entry with initial SL/TP
- Real-time P&L tracking
- Basic position close (full only, no partial)
- Simple SL modification (move to breakeven)
- Performance metrics (win rate, avg profit)

❌ **Defer to Later**:
- Real trading with exchange API
- Partial position closes
- Advanced order types (trailing stops, etc.)
- Portfolio-level risk management
- ML-based confidence optimization
- Multi-trader position coordination

---

## Next Steps

To move this to specification phase (`/spec`), we need to:

### 1. Answer Priority Critical Questions
Must answer before spec:
- **Q1**: Is this Elite-tier only? (affects architecture - multi-tenant position tracking)
- **Q8**: Position sizing strategy? (affects risk calculations)
- **Q9**: Market vs limit orders? (affects execution engine design)
- **Q24**: Where does trading logic live? (Go backend recommended for low latency)
- **Q29**: Fill simulation realism? (affects paper trading engine complexity)
- **Q33**: What context for AI decisions? (affects prompt engineering and data fetching)

### 2. Define Technical Specification
Need to document:
- Database schema for positions, fills, modifications tables
- API endpoints for position management
- Event types for EventBus (PositionOpened, PositionModified, PositionClosed)
- Validation rules (specific constraints with values)
- AI prompt templates for trade decisions
- State machine diagram for position lifecycle

### 3. Identify Dependencies
Existing systems that need updates:
- **Analysis Engine**: Extend to return TradeDecision instead of just analysis
- **Monitoring Engine**: Subscribe to position events, track trader performance
- **Database**: New tables and migrations
- **Frontend**: Position dashboard, performance metrics UI
- **Trader Config**: Add trading configuration section

New systems to build:
- Trade Decision Engine
- Position Manager
- Paper Trading Engine
- Validation Layer
- Exchange Connector (later, for real trading)

### 4. Estimate Complexity
**Backend (Go)**: ~3-4 weeks
- Trade Decision Engine: 3-4 days
- Position Manager: 4-5 days
- Paper Trading Engine: 3-4 days
- Validation Layer: 2-3 days
- Database migrations: 1-2 days
- Testing & integration: 5-7 days

**Frontend**: ~2-3 weeks
- Position dashboard: 3-4 days
- Trading configuration UI: 2-3 days
- Performance metrics: 2-3 days
- Real-time position updates: 2-3 days
- Testing & polish: 3-4 days

**AI Prompting**: ~1 week
- Trade decision prompts: 2-3 days
- Modification decision prompts: 2-3 days
- Testing & refinement: 2-3 days

**Total MVP Estimate**: 6-8 weeks

### 5. Risk Assessment
**High Risk**:
- AI hallucinations causing bad trades (mitigation: strong validation layer)
- State consistency between DB and memory (mitigation: database transactions)
- Paper trading diverging from real trading (mitigation: realistic simulation)

**Medium Risk**:
- Performance with many concurrent positions (mitigation: Go's concurrency)
- Prompt engineering for reliable decisions (mitigation: extensive testing)

**Low Risk**:
- Database schema changes (well understood)
- Event-driven architecture integration (already proven)

### Recommended Approach

**Phase 1: Paper Trading MVP** (6-8 weeks)
Start with paper trading only, core features:
1. AI trade decisions (LONG/SHORT/NO_TRADE)
2. Position entry with initial SL/TP
3. Position tracking and P&L
4. Simple SL modification (breakeven rule)
5. Basic performance metrics

**Phase 2: Enhanced Paper Trading** (2-3 weeks)
Add sophistication:
1. Partial position closes
2. Dynamic TP modifications
3. Advanced validation rules
4. Detailed trade journal

**Phase 3: Real Trading** (4-6 weeks)
Extend to real exchange:
1. Binance API integration
2. Real order execution
3. Enhanced error handling
4. Production hardening

**Total Timeline**: 12-17 weeks for full system

---

**Stage Complete**: Idea Review ✅
**Ready for**: Specification (`/spec`)

**Recommendation**: Proceed with Paper Trading MVP first. This provides immediate value (users can test strategies risk-free) while building confidence in the AI decision-making before real money is involved.

---

## Product Requirements Document
*Stage: spec | Date: 2025-10-13*

### Executive Summary

**What:** AI-powered autonomous trading system that extends the existing signal detection platform with full trade execution, position management, and dynamic risk adjustment capabilities.

**Why:** Retail crypto traders need algorithmic trading capabilities previously only available to institutional players. Current platform identifies opportunities but requires manual execution. This bridges the gap from "signal" to "profit" with AI-driven position management and paper trading for risk-free strategy validation.

**Who:**
- **Primary**: Elite tier subscribers seeking autonomous trading with AI decision-making
- **Secondary**: Pro tier users wanting paper trading to validate strategies before risking capital
- **Tertiary**: Free tier users exploring platform capabilities through limited paper trading demo

**When:**
- Phase 1 (Paper Trading MVP): 6-8 weeks
- Phase 2 (Enhanced Paper Trading): 2-3 weeks
- Phase 3 (Live Trading): 4-6 weeks
- **Total**: 12-17 weeks to full production

### Problem Statement

#### Current State
The platform successfully identifies trading opportunities through:
1. User-defined filters that scan 100+ crypto pairs
2. AI analysis that evaluates technical setups and provides reasoning
3. Real-time monitoring of active signals

However, traders must **manually execute** every trade:
- Open positions on Binance manually
- Set stop loss and take profit orders themselves
- Monitor positions constantly for exit opportunities
- Adjust risk parameters as market conditions change
- Track performance across multiple strategies manually

This creates **execution lag** (seconds to minutes between signal and order), **emotional decision-making** (fear/greed override strategy), and **opportunity loss** (missed trades during sleep/work hours).

#### Pain Points

**For Active Traders**:
- **Execution Delay**: 30-120 seconds from signal to manual order placement causes slippage
- **24/7 Coverage Gap**: Sleep, work, and personal time mean missed opportunities
- **Emotional Override**: Manual execution invites fear (exit winners early) and greed (hold losers too long)
- **Risk Management Fatigue**: Manually moving stops to breakeven, taking partial profits, and adjusting TPs is exhausting
- **Multi-Strategy Chaos**: Managing 3+ different trading strategies manually is overwhelming

**For Strategy Developers**:
- **Backtesting ≠ Reality**: No way to validate if strategy translates from theory to live execution
- **Paper Trading Gap**: Current platform has no paper trading - must risk real capital or use separate tools
- **Performance Blind Spots**: Tracking win rate, average R:R, and drawdowns manually is error-prone
- **Parameter Optimization**: No systematic way to test if "move SL to breakeven at +2%" outperforms "+3%"

**For Risk-Averse Users**:
- **Capital Risk**: Must commit real money immediately to test if AI analysis quality justifies trust
- **Strategy Validation**: No safe way to prove a trading idea works before deployment
- **Confidence Gap**: Fear of AI making bad decisions with real money prevents adoption

#### Opportunity

**Market Context**:
- Algorithmic trading represents 60-73% of US equity market volume (Source: NYSE)
- Retail algo trading in crypto grew 340% from 2020-2023 (Source: Industry reports)
- Paper trading is standard practice - TradeStation, ThinkerSwim, TradingView all offer it
- Competitors (3Commas, Cryptohopper) offer basic bot trading but lack AI-driven adaptation

**Business Value**:
1. **Differentiation**: AI that actively manages risk (not just entry signals) is unique
2. **Monetization**: Elite-tier exclusive feature justifies premium pricing ($99-199/mo)
3. **Conversion Funnel**: Paper trading → confidence → paid upgrade → live trading
4. **Retention**: Autonomous trading = sticky users (can't easily port strategies to competitors)
5. **Data Moat**: Millions of AI trading decisions create training data for future ML improvements

**User Value**:
- **Time Savings**: 20-40 hours/week reclaimed from manual monitoring
- **Execution Quality**: Sub-second entry/exit vs 30-120 second manual delay
- **Emotional Control**: AI follows rules perfectly, no fear/greed override
- **Risk-Free Testing**: Paper trading validates strategies before capital deployment
- **Performance Clarity**: Automated tracking of all metrics (win rate, Sharpe ratio, max DD)

### Solution Overview

Transform the platform from **signal detection** to **autonomous trading** through a three-layer enhancement:

**Layer 1: Trade Decision Engine**
- Extends existing AI analysis to return actionable trade decisions (LONG/SHORT/NO_TRADE/CLOSE)
- Calculates position sizing based on user-defined risk parameters (e.g., "risk 2% per trade")
- Determines entry prices, initial stop loss, and take profit targets
- Confidence scoring ensures AI only trades when conviction is high

**Layer 2: Position Management System**
- Tracks all open positions with real-time P&L calculation
- Enforces risk limits (max positions per trader, daily drawdown limits, total drawdown kill switch)
- Maintains audit trail of every order, fill, and modification for compliance and debugging
- Thread-safe state management handles concurrent position updates

**Layer 3: Dynamic Risk Adjustment**
- AI analyzes open positions at every candle close (5m/15m/1h based on strategy)
- Suggests stop loss modifications (move to breakeven, trail, tighten)
- Proposes take profit adjustments (add levels, scale out portions)
- Validation layer prevents dangerous modifications (never move SL away from breakeven, respect min distances)

**Dual Execution Modes**:
- **Paper Trading**: Simulated fills using real-time prices, no exchange API required, perfect for strategy validation
- **Live Trading**: Real order execution via Binance API with OCO orders (One-Cancels-Other) for SL/TP

#### Core Functionality

### 1. **AI Trade Decision Making**

**User can**: Review AI trading decisions with full transparency before (or after) execution

**System will**:
- Analyze every signal generated by user's traders
- Return structured TradeDecision containing:
  - Decision type (NO_TRADE, LONG, SHORT, WATCH, CLOSE, PARTIAL_TP)
  - Confidence score (0.0-1.0)
  - Reasoning (why this decision in plain English)
  - Entry/exit parameters (prices, quantities, SL/TP levels)
- Calculate position size based on trader configuration (fixed USD amount or % of portfolio)
- Only execute if confidence > user-defined threshold (default: 0.7)

**Result**: Every trade has AI justification, confidence score, and risk parameters logged for review

**Example Flow**:
```
1. Signal: "BTCUSDT bullish breakout" (generated by user's trader filter)
2. AI Analysis: Market conditions, momentum, volume analysis
3. Trade Decision:
   - Decision: LONG
   - Confidence: 0.85
   - Entry: $67,250 (market order)
   - Position Size: $500 (2% of $25k portfolio)
   - Stop Loss: $66,580 (1% risk)
   - Take Profit 1: $68,590 (2% gain, 50% of position)
   - Take Profit 2: $69,930 (4% gain, remaining 50%)
   - Reasoning: "Strong momentum breakout above 4H resistance with increasing volume..."
```

### 2. **Paper Trading Environment**

**User can**: Test strategies risk-free with simulated trading that mimics real execution

**System will**:
- Simulate order fills using real-time Binance prices
- Apply realistic slippage (0.05-0.1% for market orders based on volatility)
- Track simulated orders, fills, and positions in separate database tables
- Calculate P&L identically to live trading (fees, slippage included)
- Persist paper positions across server restarts (load state on startup)
- Display paper vs live mode prominently in UI (cannot confuse simulation with real money)

**Result**: Users validate strategy profitability, AI decision quality, and risk management before committing capital

**Paper Trading Limitations** (intentional for MVP):
- No order book depth simulation (assumes infinite liquidity)
- Market orders fill instantly at current price + slippage
- Stop loss orders trigger exactly at stop price (no gap risk simulation)
- Take profit orders fill exactly at target price

### 3. **Position Lifecycle Management**

**User can**: View all open positions with real-time P&L, modification history, and AI reasoning

**System will**:
- Track position from entry → risk adjustments → exit
- Update P&L every second using WebSocket price feeds
- Calculate metrics:
  - Unrealized P&L (current profit/loss)
  - Realized P&L (from partial closes)
  - Max unrealized P&L (highest profit seen)
  - Max drawdown (worst loss from peak)
  - Holding duration
  - R:R ratio achieved vs target
- Store all position state in database (survives restarts)
- Handle concurrent updates safely (mutex locks prevent race conditions)

**Result**: Complete visibility into every position with historical context

**Position Dashboard Shows**:
```
Position #12345 - ETHUSDT LONG
Entry: $3,250.00 @ 10:15:22 UTC (0.1538 ETH)
Current: $3,287.50 (+1.15% / +$5.77)
Peak P&L: +$12.30 (+2.46%)
Max Drawdown: -$3.20 (-0.64%)
Time in Trade: 2h 34m

Stop Loss: $3,217.50 (was $3,200.00, moved to breakeven 45m ago)
Take Profit 1: $3,315.00 (50% @ 2%) - Pending
Take Profit 2: $3,380.00 (50% @ 4%) - Pending

Modifications (2):
  1. [45m ago] Moved SL from $3,200 → $3,217.50 (breakeven protection)
     Reason: "Position reached +2% profit, protecting capital by moving stop to entry"
  2. [12m ago] Added TP3 at $3,445 for 25% of position
     Reason: "Strong momentum continuation, extending profit target"
```

### 4. **Dynamic Risk Management**

**User can**: Configure rules for automated stop loss and take profit adjustments

**System will**:
- Re-analyze open positions at every candle close (trader's timeframe)
- AI suggests modifications based on:
  - Current P&L (unrealized profit/loss %)
  - Time in trade (how long position open)
  - Market conditions (volatility, momentum, support/resistance)
  - Historical performance (what worked for similar setups)
- Validate modifications against safety rules:
  - ✅ Can move SL toward entry (tightening risk)
  - ✅ Can move SL past entry toward profit (locking in gains)
  - ❌ Cannot move SL away from breakeven (never increase risk)
  - ✅ Can add new TP levels
  - ✅ Can adjust TP prices higher (extending targets)
  - ❌ Cannot move TP below current price (prevent instant fill)
- Execute modifications in paper/live mode
- Log every modification with AI reasoning

**Result**: Positions adapt to market conditions without manual intervention, maximizing profit while protecting capital

**Modification Examples**:
```
Scenario 1: Breakeven Protection (Rule-Based)
  Trigger: Position reaches +2% profit
  Action: Move SL from entry -1% → entry +0% (breakeven)
  Result: Cannot lose money even if trade reverses

Scenario 2: Profit Extension (AI-Driven)
  Observation: BTCUSDT broke through TP1 with strong volume
  AI Decision: Price likely to reach $70k (initial target was $68.5k)
  Action: Add TP3 at $69,850 for 25% of position
  Result: Capture additional upside if momentum continues

Scenario 3: Risk Tightening (AI-Driven)
  Observation: Position in profit but momentum weakening
  AI Decision: Move SL from breakeven → +0.5% (lock in small profit)
  Action: Tighten SL by $350
  Result: Exit with guaranteed profit if reversal occurs
```

### 5. **Risk Limits & Safety**

**User can**: Set hard limits that override AI decisions (maximum risk tolerance)

**System will**:
- Enforce trader-level limits:
  - Max concurrent positions (default: 3, prevents overexposure)
  - Max risk per trade (default: 2% of portfolio)
  - Min confidence to trade (default: 0.7)
- Enforce account-level limits:
  - Max daily drawdown (default: 5% - pause trading if hit)
  - Max total drawdown (default: 20% - kill switch, close all positions)
  - Max total positions across all traders (default: 10)
- Validate every order before execution:
  - Position size doesn't exceed balance
  - Stop loss is within max risk tolerance
  - Take profit targets are realistic given volatility
  - No more than 1 modification per position per 5 minutes (prevent spam)

**Result**: AI cannot risk more than user allows, hard stops prevent catastrophic losses

**Safety Example**:
```
AI Decision: LONG ETHUSDT, $1,000 position size
Validation Checks:
  ✅ User balance: $10,000 (sufficient)
  ✅ Position size: 10% of portfolio (within 20% max)
  ✅ Risk amount: $20 (2% of portfolio, within limit)
  ✅ Stop loss distance: 2% from entry (realistic)
  ✅ Confidence: 0.83 (above 0.7 threshold)
  ✅ Open positions: 2/3 (within limit)
  ✅ Daily P&L: -$120 (within -$500 daily DD limit)

Action: EXECUTE TRADE

---

AI Decision: SHORT BTCUSDT, $2,000 position size
Validation Checks:
  ✅ User balance: $5,000 remaining
  ❌ Position size: 40% of total portfolio (exceeds 20% max per position)

Action: REJECT TRADE
Reason: "Position size exceeds maximum allowed risk per trade"
Alternative: Suggest $1,000 position (20% limit)
```

### User Stories

#### Primary Flow: Paper Trading Entry & Management

**As an** Elite tier subscriber exploring AI trading for the first time
**I want to** enable paper trading on one of my existing traders and watch the AI make trading decisions
**So that** I can validate the AI's performance before risking real capital

**Acceptance Criteria:**

- [ ] **Given** I have an existing trader with working filter code
  **When** I navigate to trader settings and toggle "Enable Trading" + "Paper Trading Mode"
  **Then** the system saves my configuration and begins analyzing signals from this trader

- [ ] **Given** my trader generates a new signal
  **When** the AI analysis completes
  **Then** I see a TradeDecision card showing:
  - Decision type (LONG/SHORT/NO_TRADE) with confidence score
  - Entry price, position size, SL, and TP levels
  - AI reasoning in plain English
  - Timestamp of decision

- [ ] **Given** the AI decided to enter a LONG position
  **When** the paper trading engine simulates the order
  **Then**
  - Position appears in "Active Positions" dashboard within 2 seconds
  - Entry order shows "FILLED" status at simulated price
  - Stop loss and take profit orders show "PLACED" status
  - Position P&L initializes at $0.00 (entry price = current price)

- [ ] **Given** I have an open paper position
  **When** price updates via WebSocket
  **Then**
  - Position P&L updates within 1 second
  - Unrealized P&L % displayed prominently
  - Max P&L and max drawdown update if exceeded

- [ ] **Given** my position has been open for 2 hours and reached +2% profit
  **When** the AI re-analyzes the position
  **Then**
  - AI suggests moving SL to breakeven
  - Modification shows in "Pending Modifications" for 5 seconds (user can cancel)
  - After 5 seconds, SL updates automatically
  - Modification logged in position history with reasoning

- [ ] **Given** price hits my take profit target
  **When** the paper trading engine processes the TP order
  **Then**
  - Position quantity reduces by TP amount (e.g., 50% closed)
  - Realized P&L shows profit from closed portion
  - Unrealized P&L recalculates for remaining position
  - Position remains open with updated SL/TP levels

- [ ] **Given** price hits my stop loss
  **When** the paper trading engine processes the SL order
  **Then**
  - Position closes completely
  - Final realized P&L shows loss amount
  - Position moves to "Closed Positions" tab
  - Trade journal entry created with full history

- [ ] **Performance**: System handles 10 concurrent paper positions per user without lag
- [ ] **Performance**: P&L updates complete within 1 second of price change
- [ ] **Reliability**: Paper positions persist across server restarts (load from database)

#### Secondary Flow: Manual Override & Pause

**As an** Elite user with active paper positions
**I want to** manually close a position or pause the AI if I disagree with its decisions
**So that** I maintain control over my trading even when AI is enabled

**Acceptance Criteria:**

- [ ] **Given** I have an open paper position
  **When** I click "Close Position" button
  **Then**
  - System prompts: "Are you sure? This will close position at market price."
  - On confirm, position closes immediately at current simulated price
  - Realized P&L recorded with "MANUAL_CLOSE" tag
  - AI stops analyzing this symbol for this trader

- [ ] **Given** I want to stop AI trading temporarily
  **When** I toggle "Pause Trading" on trader settings
  **Then**
  - AI stops making new trade decisions
  - Existing positions remain open (no forced closes)
  - UI shows "⏸ PAUSED" badge on trader card
  - AI continues analyzing signals but doesn't execute trades

- [ ] **Given** I want to override an AI decision
  **When** I click "Reject Decision" on a pending trade
  **Then**
  - Trade does not execute
  - Decision logged as "USER_REJECTED" with timestamp
  - AI reasoning still visible for learning

- [ ] **Given** I manually modified a stop loss
  **When** the AI later suggests a different SL modification
  **Then**
  - System detects manual override
  - Shows warning: "Manual SL detected. AI suggestion: [new SL]. Override?"
  - User can choose to apply AI suggestion or keep manual SL

#### Edge Cases

**1. AI Confidence Below Threshold**:
- **Scenario**: Signal generated, AI analyzes, returns confidence 0.55 (below 0.7 threshold)
- **Behavior**:
  - Decision: NO_TRADE
  - Reasoning: "Confidence too low - market conditions unclear"
  - Decision logged but no position opened
  - User can see decision in "Rejected Trades" log with confidence score

**2. Insufficient Balance for Position Size**:
- **Scenario**: AI wants $1,000 position but user has $800 paper balance
- **Behavior**:
  - Validation fails: "Insufficient balance"
  - System calculates maximum allowed position ($750 to keep 10% buffer)
  - Offers alternative: "Reduce position to $750?"
  - User can approve reduced size or reject trade

**3. Max Positions Limit Reached**:
- **Scenario**: User has 3/3 positions open, new signal triggers LONG decision
- **Behavior**:
  - Decision: NO_TRADE (reason: "Max positions limit reached")
  - Signal queued with priority score (based on confidence + setup quality)
  - When a position closes, highest priority queued signal gets re-evaluated
  - User notified: "Trade queued - will execute when position slot available"

**4. Position Stuck Open During Server Restart**:
- **Scenario**: Server crashes while 5 paper positions are open
- **Behavior**:
  - On restart, Position Manager loads all OPEN positions from database
  - Reconnects to WebSocket price feeds for affected symbols
  - Recalculates current P&L based on latest prices
  - Checks if any SL/TP orders would have triggered during downtime
  - If yes, simulates the fill and updates position status
  - Logs downtime event: "Server offline 10m 34s - positions restored, no fills missed"

**5. Rapid Price Movement Gaps Through Stop Loss**:
- **Scenario**: SL at $100, price drops from $101 → $98 in one candle (no $100 trade)
- **Behavior** (MVP - simple):
  - SL fills at $100 (no slippage simulation for gaps)
  - **Future enhancement**: Simulate gap fill at next available price ($98) for realism

**6. AI Suggests Invalid Stop Loss** (Hallucination):
- **Scenario**: AI proposes SL at $50 when current price is $100 (50% risk)
- **Behavior**:
  - Validation layer detects risk > max allowed (2%)
  - Rejects modification: "SL distance exceeds maximum risk tolerance"
  - AI decision logged with "VALIDATION_FAILED" flag
  - User notified: "AI suggested risky SL modification - blocked by safety system"
  - Position keeps current SL unchanged

**7. Concurrent Modification Conflict**:
- **Scenario**: AI suggests SL modification while user is manually updating same SL
- **Behavior**:
  - Position Manager uses mutex lock
  - First update (user or AI) wins
  - Second update detects conflict: "Position modified elsewhere"
  - Retry with latest position state
  - User sees notification: "AI suggestion updated based on your manual change"

**8. Exchange API Fails During Live Trading** (Future Phase 3):
- **Scenario**: Binance API returns 503 Service Unavailable for 2 minutes
- **Behavior**:
  - Order execution paused
  - Retry with exponential backoff (2s, 4s, 8s, 16s...)
  - After 5 failed retries, user notified: "Exchange connectivity issues - trading paused"
  - System continues monitoring positions using backup price feed (CoinGecko/CoinMarketCap)
  - When API recovers, verifies position state with exchange (reconciliation)
  - Resumes trading once confirmed consistent

### Technical Requirements

#### Performance

**Latency** (P95 targets):
- Trade decision generation: < 3 seconds (LLM call + risk calculations)
- Paper order execution: < 200ms (database write + state update)
- P&L update after price change: < 1 second (WebSocket → calculation → UI update)
- Position modification: < 500ms (validation + execution)
- Dashboard load (10 positions): < 2 seconds (database query + formatting)

**Throughput**:
- 100 concurrent users with 5 positions each = 500 positions tracked
- 10 signals/minute system-wide during high volatility
- 100 P&L updates/second during major price movements
- 1,000 candle events/minute across all timeframes (1m, 5m, 15m, 1h, 4h, 1d)

**Availability**:
- 99.5% uptime (43.8 hours downtime/year acceptable for MVP)
- Graceful degradation: If AI API fails, fall back to rule-based decisions
- Position state must survive all server restarts (zero data loss)

**Scalability** (Future):
- Paper trading: 10,000 concurrent users (stateful, higher memory)
- Live trading: 1,000 concurrent users (lower volume, higher stakes)

#### Data Requirements

**Sources**:
- **Primary**: Binance WebSocket for real-time prices (already integrated)
- **Backup**: Binance REST API for price verification if WebSocket disconnects
- **AI**: OpenRouter API (Gemini/Claude) for trade decisions
- **State**: Supabase PostgreSQL for position/fill/modification history

**Refresh Rate**:
- Real-time prices: WebSocket updates (1-2 per second per symbol)
- P&L calculations: Every price update (1-2 per second)
- AI re-analysis of positions: Every candle close (5m, 15m, 1h based on strategy)
- Position dashboard: Real-time via WebSocket subscription

**Retention**:
- Paper positions: 90 days after close (free tier), unlimited (paid tiers)
- Live positions: Unlimited (regulatory requirement)
- Modification history: Unlimited (audit trail)
- AI decisions: 30 days for rejected trades, unlimited for executed
- Performance metrics: Daily aggregates for 2 years

**Data Volume Estimates**:
- Position record: ~2 KB (with all metadata)
- Fill record: ~500 bytes
- Modification record: ~1 KB
- Per user with 10 traders, 100 trades/month: ~250 KB/month
- 1,000 users: 250 MB/month (~3 GB/year)

#### Security

**Authentication**:
- Supabase JWT tokens (already implemented)
- Row-level security ensures users only see their positions
- API keys for live trading stored encrypted (AES-256) in database
- API keys never sent to frontend (backend-only decryption)

**Authorization**:
- **Free Tier**: No trading access (view-only demo mode)
- **Pro Tier**: Paper trading only, max 3 concurrent positions
- **Elite Tier**: Unlimited paper trading + live trading access
- Tier enforcement via database checks on every trade decision

**Data Protection**:
- Position P&L is sensitive financial data (user's money)
- Encrypted at rest (Supabase encryption)
- Encrypted in transit (TLS 1.3)
- No P&L data in client-side logs
- Rate limiting: 100 API requests/minute per user (prevent scraping)

**Compliance** (Future):
- GDPR: User can export all trade history (CSV)
- Right to deletion: Close all positions, delete history after 90 days
- Audit trail: Every order/modification logged with timestamp + reason
- No insider trading: Platform doesn't have non-public information
- Disclaimer: "Not financial advice, trading involves risk of loss"

### UI/UX Requirements

#### Desktop (Primary Interface)

**Location & Navigation**:
- New top-level tab: "**Trading**" (between "Screener" and "Settings")
- Sub-tabs:
  - "Active Positions" (default view)
  - "Closed Positions" (history)
  - "Trade Journal" (AI decisions log)
  - "Performance" (metrics dashboard)

**Active Positions View**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Active Positions (3)          Paper: $24,750 (-$250 / -1.0%)   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Position #12345 - BTCUSDT LONG                      [Close] [Edit]
│ Entry: $67,250.00 @ 10:15 UTC (0.0074 BTC)                     │
│ Current: $67,890.50 (+0.95% / +$4.74) ● Real-time             │
│                                                                 │
│ ├─ Stop Loss: $66,580.00 (-1.0%)  📍 Moved to BE 45m ago      │
│ ├─ Take Profit 1: $68,590.00 (50% @ +2.0%) ⏳ Pending         │
│ └─ Take Profit 2: $69,930.00 (50% @ +4.0%) ⏳ Pending         │
│                                                                 │
│ Time in Trade: 2h 34m | Max P&L: +$12.30 | Max DD: -$3.20    │
│ Modifications: 2 | Analysis Cycles: 31                         │
│                                                                 │
│ ▼ AI Reasoning (Last Analysis: 2m ago)                         │
│ "Momentum remains strong above $67,500 support. Breakout      │
│  volume confirms continuation. Maintaining full position       │
│  with current targets. If price reaches $68,500, consider     │
│  moving SL to +1% to lock in profits."                         │
│                                                                 │
│ [View Chart] [Modification History] [Close Position]           │
└─────────────────────────────────────────────────────────────────┘
```

**Trade Decision Card** (appears when AI makes decision):

```
┌─────────────────────────────────────────────────────────────────┐
│ 🤖 New Trade Decision - LONG ETHUSDT                            │
│ Confidence: 85% ████████████████▓▓▓▓ High                      │
│ Generated: Just now from "ETH Breakout Trader"                 │
├─────────────────────────────────────────────────────────────────┤
│ Entry: $3,250.00 (Market Order)                                 │
│ Position Size: $500 (2% of portfolio)                          │
│ Risk: $10.00 (1% of portfolio)                                 │
│                                                                 │
│ Stop Loss: $3,217.50 (-1.0%)                                   │
│ Take Profit 1: $3,315.00 (+2.0%, 50% of position)             │
│ Take Profit 2: $3,380.00 (+4.0%, 50% of position)             │
│                                                                 │
│ Risk:Reward Ratio: 1:3.0                                       │
│                                                                 │
│ ▼ AI Reasoning                                                  │
│ "Strong bullish breakout above $3,200 resistance with 240%    │
│  volume increase. 4H candle closed above key level. MACD       │
│  golden cross confirms momentum shift. Entry at current        │
│  market price recommended. Initial target at previous high     │
│  ($3,315), extended target at 1.618 Fibonacci extension       │
│  ($3,380). Stop below breakout level protects against false   │
│  breakout."                                                     │
│                                                                 │
│ [Execute Trade] [Reject] [Adjust Parameters]                   │
│                                                                 │
│ ⚠️ Paper Trading Mode - No real money will be used             │
└─────────────────────────────────────────────────────────────────┘
```

**Performance Dashboard**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Performance Metrics - Last 30 Days                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Total P&L: -$250.00 (-1.0%)   [Chart: Equity Curve]           │
│ Win Rate: 62.5% (15W / 9L)                                      │
│ Avg Win: +$45.00 (+2.1%)                                        │
│ Avg Loss: -$38.00 (-1.8%)                                       │
│ Best Trade: +$125.00 (+5.8% on SOLUSDT)                        │
│ Worst Trade: -$92.00 (-4.2% on ADAUSDT)                        │
│                                                                 │
│ Max Drawdown: -$320.00 (-3.2%)                                 │
│ Recovery Time: 4 days                                           │
│ Sharpe Ratio: 1.45                                             │
│ Profit Factor: 1.85                                             │
│                                                                 │
│ ├─ Long Positions: 12 trades, 58% win rate                    │
│ └─ Short Positions: 12 trades, 67% win rate                   │
│                                                                 │
│ By Trader:                                                      │
│ ├─ "BTC Momentum": 8 trades, $125 profit, 75% win rate        │
│ ├─ "ETH Breakout": 10 trades, -$85 loss, 40% win rate         │
│ └─ "Altcoin Scalper": 6 trades, $60 profit, 83% win rate      │
│                                                                 │
│ [Export CSV] [View Detailed Stats] [Compare to Backtest]       │
└─────────────────────────────────────────────────────────────────┘
```

**Trader Configuration** (new "Trading" section):

```
┌─────────────────────────────────────────────────────────────────┐
│ Trader Settings - "BTC Momentum Trader"                         │
├─────────────────────────────────────────────────────────────────┤
│ Filter Setup        Analysis        Trading ◄ NEW SECTION       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ◉ Trading Enabled    ○ Trading Disabled                        │
│                                                                 │
│ Mode: ◉ Paper Trading    ○ Live Trading (Elite Only)           │
│                                                                 │
│ Position Sizing:                                                │
│ ◉ Fixed USD Amount: [$500______] per trade                     │
│ ○ Portfolio Percentage: [2_____]% per trade                    │
│                                                                 │
│ Risk Management:                                                │
│ Max Risk Per Trade: [2_____]% of portfolio                     │
│ Max Concurrent Positions: [3_____]                             │
│ Min AI Confidence: [70____]% (slider)                          │
│                                                                 │
│ Dynamic Risk:                                                   │
│ ☑ Enable AI Stop Loss Modifications                            │
│ ☑ Enable AI Take Profit Modifications                          │
│ Move SL to Breakeven at: [+2____]% profit                      │
│ ☐ Enable Trailing Stop: [____]% trail distance                │
│                                                                 │
│ Entry Rules:                                                    │
│ ☑ Require my approval before each trade                        │
│ ☐ Only trade during market hours (9:30-16:00 EST)             │
│                                                                 │
│ Safety Limits:                                                  │
│ Max Daily Drawdown: [5_____]% (pause trading if hit)          │
│ Max Total Drawdown: [20____]% (emergency close all)           │
│                                                                 │
│ [Save Changes] [Test Configuration]                             │
│                                                                 │
│ ⚠️ Warning: Live trading risks real capital. Start with paper   │
│    trading to validate strategy performance.                   │
└─────────────────────────────────────────────────────────────────┘
```

**Interactions**:
- Hover over position → Real-time price updates with sparkline chart
- Click position → Expand to show full modification history
- Click "View Chart" → Opens TradingView-style chart with entry/SL/TP levels marked
- Drag SL/TP levels on chart → Manual override with confirmation dialog
- Right-click position → Context menu (Close, Edit SL/TP, Pause AI, View Signal)

#### Mobile (Responsive Behavior)

**Priorities for Mobile**:
1. Monitor active positions and P&L (read-only)
2. Close positions manually (emergency override)
3. View AI trade decisions and reasoning
4. Enable/disable trading on traders

**Not on Mobile** (desktop only):
- Detailed configuration (use desktop for setup)
- Advanced charts and analysis
- Bulk actions on multiple positions

**Mobile Position Card**:
```
┌───────────────────────────┐
│ BTCUSDT LONG              │
│ +0.95% • $4.74 ▲          │
├───────────────────────────┤
│ Entry: $67,250            │
│ Current: $67,890          │
│                           │
│ SL: $66,580 (-1.0%)       │
│ TP1: $68,590 (50%)        │
│ TP2: $69,930 (50%)        │
│                           │
│ 2h 34m in trade           │
│                           │
│ [View Details] [Close]    │
└───────────────────────────┘
```

### Success Metrics

| Metric | Target (3 months post-launch) | Measurement |
|--------|-------------------------------|-------------|
| **Adoption** | 40% of Elite users enable paper trading on ≥1 trader | Supabase query: `SELECT COUNT(DISTINCT user_id) FROM traders WHERE trading.enabled = true` |
| **Conversion** | 25% of paper trading users upgrade to live trading | Track users with `trading.isPaperTrading = false` who previously had `true` |
| **Engagement** | Users check positions 5x/day on average | Track unique sessions with position dashboard views |
| **Performance** | 55%+ win rate across all paper trading users | Aggregate `closed_positions` with `realizedPnL > 0` |
| **Trust** | 70%+ of users approve AI decisions without modification | Track `ai_decisions` with `user_approved = true` vs `user_modified = true` |
| **Execution Quality** | Paper trades execute within 2 seconds of decision | Track `position.openedAt - trade_decision.createdAt` |
| **Position Lifecycle** | Avg holding time 4-24 hours (swing trading range) | Calculate `position.closedAt - position.openedAt` median |
| **Risk Management** | 90%+ of SL modifications move toward profit (not risk increase) | Track `order_modifications` where `newStopLoss` closer to entry than `previousStopLoss` |
| **Support Load** | <5% of users contact support about trading issues | Track support tickets tagged "trading" |
| **System Reliability** | 99.5% uptime, zero position data loss | Monitor with health checks, verify position count matches DB |

**North Star Metric**: **Monthly Realized P&L across all users** (both paper and live)
- Success = Growing positive P&L indicates AI decisions are profitable
- Target: $50,000 aggregate monthly profit across all users by Month 6

### Rollout Strategy

#### Phase 1: Internal Alpha (Week 1-2)
- **Audience**: 3-5 internal testers + founder
- **Scope**: Paper trading only, single trader per user, no UI polish
- **Goal**: Prove core loop works (signal → decision → position → modification → close)
- **Success**: Complete 50 paper trades end-to-end with zero crashes

#### Phase 2: Private Beta (Week 3-4)
- **Audience**: 20 Elite users (handpicked, active on Discord)
- **Scope**: Full paper trading, up to 3 traders, basic dashboard
- **Goal**: Validate AI decision quality, find UX pain points
- **Feedback Loop**: Weekly survey + Discord channel for feedback
- **Success**: 70%+ beta users say "would use this regularly"

#### Phase 3: Public Beta (Week 5-6)
- **Audience**: All Elite users (opt-in via announcement)
- **Scope**: Paper trading fully featured, performance dashboard
- **Goal**: Scale testing, measure engagement, refine UI
- **Announcement**: Email + in-app banner "Try AI Trading (Beta)"
- **Success**: 100+ active users, 500+ paper trades executed

#### Phase 4: General Availability - Paper Trading (Week 7-8)
- **Audience**: All users (Free: demo mode, Pro: limited, Elite: unlimited)
- **Scope**: Paper trading marked as "stable", no longer beta
- **Marketing**: Blog post "Introducing AI-Powered Trading", social media campaign
- **Success**: 30% Elite, 15% Pro users enable paper trading

#### Phase 5: Live Trading Private Alpha (Week 9-12)
- **Audience**: 10 Elite users with proven paper trading success
- **Scope**: Binance API integration, real order execution, small position sizes
- **Safety**: Max $100 per position, max 2 positions, extensive monitoring
- **Goal**: Prove live execution reliability before wider release
- **Success**: 100 live trades executed with zero critical bugs

#### Phase 6: Live Trading Public Beta (Week 13-16)
- **Audience**: All Elite users (explicit opt-in + disclaimer)
- **Scope**: Full live trading with all features
- **Legal**: Updated ToS with risk disclosure, no liability claims
- **Success**: 50+ Elite users trading live, positive feedback

**Rollback Plan at Each Phase**:
- If critical bugs: Disable new position creation, keep existing positions open, notify users
- If data loss: Restore from hourly DB backups, reconcile with exchange if live trading
- If AI hallucinations: Add more validation rules, lower confidence threshold, fall back to rule-based

### Dependencies

**Technical**:
- [ ] **Go Backend** (already exists): Houses trade decision engine, position manager, execution engine
- [ ] **Event-Driven Architecture** (already exists): EventBus handles signals → analysis → decisions
- [ ] **Supabase PostgreSQL**: Need 4 new tables (positions, fills, order_modifications, trading_performance)
- [ ] **OpenRouter API**: Already integrated for analysis, extend prompts for trade decisions
- [ ] **Binance WebSocket**: Already integrated for real-time prices, no changes needed
- [ ] **Binance REST API** (Phase 3): For live order placement/modification

**Domain-Specific**:
- [ ] **Risk Calculation Library**: Kelly Criterion, fixed fractional, volatility-based sizing
- [ ] **Order Book Simulator** (optional for MVP): Makes paper trading more realistic
- [ ] **Performance Analytics**: Sharpe ratio, Sortino ratio, max drawdown calculations
- [ ] **Tax Reporting** (Phase 3): FIFO/LIFO cost basis tracking for realized P&L

**Third-Party**:
- [ ] **Binance API Keys** (user-provided for live trading): Stored encrypted
- [ ] **TradingView Widget** (optional): Embed charts with position markers
- [ ] **Notification Service** (Supabase Realtime or push notifications): Alert users on fills/stops

**Data**:
- [ ] **Historical Backtest Data**: Load past klines to test AI decisions offline
- [ ] **Paper Trading Balance**: Default $10,000 starting balance for all users

### Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **AI Hallucinations** - AI suggests impossible SL prices or huge position sizes | High | Critical | • Strong validation layer with hard constraints<br>• Confidence threshold minimum (0.7)<br>• Max position size caps (20% of portfolio)<br>• Log all rejections for prompt tuning |
| **State Consistency** - Position filled but DB write fails, state mismatch | Medium | Critical | • Database transactions for position updates<br>• Reconciliation checks (compare memory vs DB)<br>• Event sourcing pattern (log all state changes)<br>• Automatic recovery on restart |
| **Paper Trading ≠ Reality** - Users succeed in paper but fail in live trading | High | High | • Add realistic slippage simulation (0.05-0.1%)<br>• Simulate order book depth (reject if low liquidity)<br>• Show disclaimer: "Paper trading results may differ from live"<br>• Require X paper trades before enabling live |
| **Prompt Drift** - LLM updates change AI behavior unexpectedly | Medium | High | • Pin specific model versions (e.g., Claude 3.5 Sonnet)<br>• Extensive prompt testing in CI/CD<br>• Monitor decision distribution (flag if >20% change)<br>• Version control prompts with rollback capability |
| **Rate Limits** - Binance API rate limits hit during high volatility | Low (paper), Medium (live) | Medium | • Order queue with priority system<br>• Batch requests where possible<br>• Fallback to slower polling if WebSocket fails<br>• Display "Trading paused - rate limit" message |
| **Legal Liability** - User loses money on AI trades, blames platform | Medium | High | • Explicit disclaimer: "Not financial advice, risk of loss"<br>• Updated ToS: User responsible for all trades<br>• Audit trail: Log every decision with reasoning<br>• User must approve each trade (optional setting) |
| **Performance Degradation** - 1,000 concurrent users overwhelm Go backend | Low | High | • Load testing before public beta (simulate 10k users)<br>• Horizontal scaling (multiple Go instances)<br>• Database connection pooling<br>• Cache hot data (position counts, P&L aggregates) |
| **Exchange Outage** (Phase 3) - Binance API down, can't execute/modify orders | Medium | Critical | • Detect API failures within 30 seconds<br>• Fallback price feed (CoinGecko, CoinMarketCap)<br>• Pause trading during outage<br>• Reconcile state when API recovers<br>• Emergency close via backup exchange if stuck |

**Risk Acceptance** (for MVP):
- **No multi-exchange support**: Binance only, accept user churn if they want Coinbase/Kraken
- **No machine learning**: Rule-based + LLM prompts sufficient, defer ML optimization to Phase 4
- **Basic paper trading**: No order book simulation, accept some divergence from live execution

### Out of Scope (Future Enhancements)

**Explicitly Deferred to Post-MVP**:
- Multi-exchange support (Coinbase, Kraken, Bybit)
- Margin trading and leverage (spot only in MVP)
- Shorting in live trading (paper shorting OK, real shorting Phase 4)
- Options and futures trading (spot only)
- Social trading (copy other users' traders)
- Strategy marketplace (buy/sell trading strategies)
- Mobile app (responsive web only in MVP)
- Automated portfolio rebalancing
- Tax loss harvesting
- Advanced order types (iceberg orders, TWAP/VWAP execution)
- Basket trading (trade multiple pairs as one position)
- Grid trading and DCA bots
- Sentiment analysis integration (Twitter, news, on-chain data)
- Machine learning model training on user's historical trades
- Hardware wallet integration (MetaMask, Ledger)

### Open Questions

**Product Decisions** (need answer before Phase 2):
- [ ] **Q1**: Should Pro tier have paper trading? (Recommendation: Yes, limited to 3 positions to encourage Elite upgrade)
- [ ] **Q2**: Allow users to manually override AI decisions before execution? (Recommendation: Yes, with 5-second approval window)
- [ ] **Q3**: Default position size for new traders? (Recommendation: $100 or 1% of portfolio, whichever is smaller)
- [ ] **Q4**: Should paper trading have starting balance limit? (Recommendation: $10,000 fixed, realistic for target users)
- [ ] **Q5**: Notify users when AI makes decision? (Recommendation: Yes, push notification for new positions, email digest for modifications)

**Technical Decisions** (need answer before implementation):
- [ ] **Q6**: Use mutex locks or database transactions for position updates? (Recommendation: Database transactions for durability, mutex for in-memory speed)
- [ ] **Q7**: Store AI decisions in same database as positions? (Recommendation: Yes, single source of truth simplifies querying)
- [ ] **Q8**: How to handle LLM API failures? (Recommendation: Retry 3x with backoff, then fall back to simple rule-based decision)
- [ ] **Q9**: Real-time P&L updates via WebSocket or polling? (Recommendation: WebSocket for sub-second latency)
- [ ] **Q10**: Position ID format? (Recommendation: UUID for uniqueness, not sequential integers)

**AI/Prompt Engineering** (need answer during Phase 1):
- [ ] **Q11**: Single LLM call for entry + SL/TP, or separate calls? (Recommendation: Single call to maintain context)
- [ ] **Q12**: Include historical performance in prompt? (Recommendation: Yes, "Past 10 trades: 6W/4L, avg profit +2.5%")
- [ ] **Q13**: Max prompt tokens for decision? (Recommendation: 4,000 input, 1,000 output - balance cost vs quality)
- [ ] **Q14**: How to structure JSON schema for TradeDecision? (Recommendation: Strict JSON with required fields, validate on backend)

**Compliance/Legal** (need answer before Phase 6 - Live Trading):
- [ ] **Q15**: Do we need regulatory approval for automated trading? (Recommendation: Consult fintech lawyer before live launch)
- [ ] **Q16**: Must we be a registered investment advisor (RIA)? (Recommendation: Likely no if "AI suggestions" not "advice," but verify)
- [ ] **Q17**: Tax reporting requirements? (Recommendation: Provide CSV export, user responsible for tax filing)
- [ ] **Q18**: Data retention for audit trail? (Recommendation: 7 years per SEC guidelines, even if not technically required)

---

**Stage Complete**: Specification ✅
**Next**: `/design issues/2025-10-13-dynamic-order-management.md`
