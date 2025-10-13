# AI-Powered Trade Execution & Dynamic Order Management

**Created**: 2025-10-13
**Status**: Idea Review
**Stage**: 1/9 - Initial Concept

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
