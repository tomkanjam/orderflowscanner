# Implement Trade Execution Infrastructure

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-04 12:50:04

## Context

This project implements the complete trade execution infrastructure needed to enable automated AI trading. This is the missing foundation that blocks position management in the continuous monitoring system.

**Current state:**
- Signals are generated and analyzed by AI
- AI returns decisions (enter/wait/bad)
- No way to execute trades or track positions

**After this project:**
- Traders can execute trades automatically based on AI decisions
- Positions are tracked in database with full lifecycle
- CCXT integration enables real Binance Spot trading
- Position management can be implemented (monitoring project Phase 3)

**Vision Document:** `context/docs/automated-trading-workflows.md`
**Dependencies:** Requires completed signal monitoring (20251025-102927-000-PROJECT-continuous-monitoring-system.md)

### Why This Matters

**Without trade execution:**
- AI analysis is informational only
- Users must manually execute trades
- No position tracking or management
- Elite tier value proposition incomplete

**With trade execution:**
- Full automation from signal → analysis → trade → management
- Real-time position tracking and PnL
- AI manages entire trade lifecycle
- Elite users get complete hands-off trading

**Risk mitigation:**
- Paper trading mode for testing
- Per-trader risk limits (max position size, daily loss limit)
- Emergency stop-all mechanism
- Detailed audit logging

## Linked Items

- Part of: End-to-end trader workflow implementation initiative
- Blocks: `context/issues/open/20251025-102927-003-position-management-workflow.md` (can't manage positions without executing them)
- Related: `context/docs/automated-trading-workflows.md` (architecture vision)

## Sub-issues

**Phase 1: Paper Trading (Build & validate without risk)**
- [ ] `context/issues/open/20251104-125004-001-positions-schema-and-lifecycle.md` - Design positions table and lifecycle state machine
- [ ] `context/issues/open/20251104-125004-004-risk-management-system.md` - Implement risk limits and safety controls
- [ ] `context/issues/open/20251104-125004-006-paper-trading-mode.md` - Simulated trading execution engine
- [ ] `context/issues/open/20251104-125004-007-pnl-calculation-engine.md` - Real-time profit/loss tracking
- [ ] `context/issues/open/20251104-125004-009-paper-trading-testing.md` - Validate paper trading with 100+ trades

**Phase 2: Real Trading (Once paper trading proven)**
- [ ] `context/issues/open/20251104-125004-002-ccxt-binance-integration.md` - Integrate CCXT for Binance Spot trading
- [ ] `context/issues/open/20251104-125004-003-order-execution-engine.md` - Build real order execution and tracking
- [ ] `context/issues/open/20251104-125004-005-api-key-management.md` - Secure storage and encryption for API keys
- [ ] `context/issues/open/20251104-125004-008-trade-execution-testing.md` - Testnet and production rollout

## Progress

**Current Status: NOT STARTED**

**Implementation Strategy:**
1. **Phase 1: Paper Trading** - Build complete workflow using simulated execution
   - Validate entire system without risk
   - Test position management, PnL, risk limits
   - Prove the architecture works end-to-end
   - Estimate: 2-3 weeks

2. **Phase 2: Real Trading** - Add CCXT for actual exchange execution
   - Drop in CCXT replacement for paper executor
   - Add API key management
   - Gradual rollout with real money
   - Estimate: 3-4 weeks

This approach allows us to validate the complete trading workflow safely before touching real money.

## Spec

### High-Level Architecture

**Phase 1: Paper Trading (Simulated)**
```
Signal with decision="enter_trade"
            ↓
    Trade Execution Engine (Go)
            ↓
    Check risk limits (position size, daily loss, etc.)
            ↓ PASS
    Get current market price (real Binance data)
            ↓
    Simulate order fill (instant fill at market price + slippage)
            ↓
    Store position in database (is_paper_trade=true)
            ↓
    Update signal status → "in_position"
            ↓
    Monitor position (continuous monitoring Phase 3)
            ↓
    AI decides to close/adjust
            ↓
    Simulate close order
            ↓
    Calculate PnL, update position
            ↓
    Update paper balance
```

**Phase 2: Real Trading (CCXT)**
```
Signal with decision="enter_trade"
            ↓
    Trade Execution Engine (Go)
            ↓
    Check risk limits
            ↓ PASS
    Decrypt user API keys (Edge Function)
            ↓
    Execute REAL order via CCXT (Binance Spot)
            ↓
    Store position in database (is_paper_trade=false)
            ↓
    [Rest of flow identical to paper trading]
```

**Key insight:** Paper trading uses the same workflow as real trading, just swaps the execution mechanism.

### Core Components

**1. Database Schema:**
- `positions` table - Open and closed positions with full lifecycle
- `orders` table - All order attempts (submitted, filled, cancelled, failed)
- `trades` table - Individual trade executions (for partial fills)
- `user_api_keys` table - Encrypted Binance API credentials
- `risk_limits` table - Per-trader risk parameters

**2. Go Backend Services:**
- **OrderExecutor** - Manages order lifecycle from signal to fill
- **PositionTracker** - Tracks open positions and PnL
- **RiskManager** - Enforces position size, loss limits, etc.
- **CCXTClient** - Abstraction over CCXT library for Binance

**3. Edge Functions:**
- **decrypt-api-keys** - Securely decrypt user API keys for trading
- **manage-position** - New llm-proxy operation for position management decisions

**4. Safety Features:**
- Paper trading mode (simulate orders without real execution)
- Per-trader position size limits
- Daily loss limits (stop trading if exceeded)
- Emergency stop-all button (cancel all orders, close positions)
- Rate limiting on order submission
- Order validation (price bounds, quantity minimums)

### Position Lifecycle State Machine

```
CREATED → SUBMITTING → OPEN → CLOSING → CLOSED
              ↓           ↓        ↓
           FAILED    MONITORING  FAILED
```

**States:**
- `created` - Position record created, not yet submitted
- `submitting` - Order sent to exchange, awaiting confirmation
- `open` - Position active on exchange, being monitored
- `monitoring` - AI actively managing (adjust SL/TP, scale out, etc.)
- `closing` - Close order submitted, awaiting fill
- `closed` - Position fully closed, PnL finalized
- `failed` - Order submission or execution failed

### Risk Management Rules

**Position Sizing:**
- Max position size per signal (% of portfolio or absolute USDT)
- Max total exposure across all positions
- Min position size (avoid dust trades)

**Loss Protection:**
- Daily loss limit (stop trading if exceeded)
- Per-trade stop loss (mandatory for every position)
- Max drawdown from peak (pause if exceeded)

**Order Safety:**
- Max order size (prevent fat finger)
- Price deviation check (reject if too far from market)
- Minimum time between orders (rate limiting)

### Key Design Decisions

1. **Paper trading first, real trading second** - Validate complete workflow before touching real money
2. **Simulated execution uses real market data** - Paper trades reflect actual market conditions
3. **Identical architecture for paper and real** - Only execution mechanism differs (swap paper executor for CCXT)
4. **Go backend execution** - Low latency, type safety, easier error handling
5. **Separate tables for positions/orders/trades** - Full audit trail
6. **Mandatory risk limits** - Every trader must have limits configured
7. **PostgreSQL for state** - ACID guarantees for money operations
8. **Event-driven updates** - Position changes emit events for monitoring

**Phase-specific:**
- **Phase 1:** No API keys needed, instant fills, zero external dependencies
- **Phase 2:** Add CCXT + API key encryption as drop-in replacement

### Implementation Phases

**PHASE 1: PAPER TRADING (2-3 weeks)**

**Week 1: Foundation**
- Day 1-2: Positions/orders/trades schema and state machine (sub-issue 001)
- Day 3-4: Risk management system implementation (sub-issue 004)
- Day 5: Paper trading executor skeleton (sub-issue 006)

**Week 2: Paper Trading Core**
- Day 1-3: Complete paper trading execution engine (sub-issue 006)
  - Simulated order fills
  - Real market data integration
  - Paper balance tracking
- Day 4-5: PnL calculation engine (sub-issue 007)
  - Unrealized PnL updates
  - Realized PnL on close
  - Performance metrics

**Week 3: Testing & Validation**
- Day 1-3: Paper trading testing (sub-issue 009)
  - 100+ automated paper trades
  - Verify PnL accuracy
  - Test risk limits
  - Validate position lifecycle
- Day 4-5: Integration with monitoring workflow
  - Position opened → monitoring starts
  - AI management decisions
  - Position close workflow

**Phase 1 Deliverable:** Fully functional paper trading system that validates entire workflow

**PHASE 2: REAL TRADING (3-4 weeks)**

**Week 1: CCXT Integration**
- Day 1-3: CCXT service setup (sub-issue 002)
- Day 4-5: Real order execution engine (sub-issue 003)

**Week 2: Security & API Keys**
- Day 1-3: API key management (sub-issue 005)
- Day 4-5: Security audit and testing

**Week 3-4: Gradual Rollout**
- Testnet validation (sub-issue 008)
- Production micro-trades
- Limited beta
- Full rollout

**Phase 2 Deliverable:** Production-ready real money trading

### Success Criteria

**Execution:**
- [ ] Can execute market orders on Binance Spot via CCXT
- [ ] Can execute limit orders with proper fill tracking
- [ ] Orders stored in database with full lifecycle
- [ ] Positions tracked from open to close
- [ ] Failed orders logged and handled gracefully

**Risk Management:**
- [ ] Position size limits enforced before order submission
- [ ] Daily loss limits stop trading when exceeded
- [ ] Emergency stop-all works instantly
- [ ] Price validation prevents unreasonable orders
- [ ] Rate limiting prevents exchange bans

**Security:**
- [ ] API keys encrypted at rest
- [ ] Keys only decrypted in Edge Function (never in logs)
- [ ] Paper trading works without real API keys
- [ ] Audit log captures all trade decisions and executions
- [ ] No API keys leaked in error messages or traces

**Integration:**
- [ ] Signal with decision="enter_trade" triggers position creation
- [ ] Position creation triggers order execution
- [ ] Order fill triggers position monitoring (Phase 3 of monitoring project)
- [ ] Position close updates signal status
- [ ] Frontend displays positions and PnL in real-time

**Testing:**
- [ ] 100+ paper trades executed successfully
- [ ] 10+ testnet trades (real exchange, fake money)
- [ ] 5+ production trades (real money, small amounts)
- [ ] Zero security vulnerabilities in audit
- [ ] Error rate < 0.1% of executions

### Non-Goals (For This Project)

- ❌ Margin/futures trading (Spot only for MVP)
- ❌ Multi-exchange support (Binance only initially)
- ❌ Advanced order types (iceberg, TWAPs, etc.)
- ❌ Portfolio rebalancing
- ❌ Tax reporting
- ❌ Social trading / copy trading

### Rollout Strategy

1. **Development** - Paper trading only, extensive testing
2. **Testnet** - Binance testnet with test funds
3. **Internal alpha** - 1 developer account, real money, $50 max position
4. **Limited beta** - 3-5 Elite users, $100 max position, daily monitoring
5. **Gradual rollout** - Increase position limits and user count over 4 weeks
6. **Full release** - All Elite users, normal position limits

### Risk Assessment

**High Risk:**
- API key leakage → Immediate security breach
- Order execution bugs → Financial loss
- Risk limit bypass → Catastrophic losses

**Mitigation:**
- Extensive security review and penetration testing
- Paper trading phase catches 90%+ of bugs
- Testnet phase validates real exchange integration
- Small position limits during rollout
- 24/7 monitoring in early phases
- Emergency stop mechanism always available

**Medium Risk:**
- CCXT library bugs or API changes
- Exchange downtime during critical trades
- Network latency causing missed fills

**Mitigation:**
- Pin CCXT version, test upgrades thoroughly
- Retry logic and graceful degradation
- Timeout handling and order cancellation
- Multiple fallback strategies

### Estimated Timeline

**Total: 6-8 weeks**

- Weeks 1-2: Schema, lifecycle, CCXT integration
- Weeks 3-4: Order execution, risk management
- Weeks 5-6: API keys, paper trading, PnL tracking
- Weeks 7-8: Testing, security review, gradual rollout

**Critical path dependencies:**
- Schema must be complete before execution engine
- CCXT must work before paper trading
- Paper trading must pass before testnet
- Testnet must succeed before production

### Monitoring & Observability

**Metrics to track:**
- Order submission success rate
- Average time to fill
- Slippage (executed price vs expected)
- Position open duration
- Win rate and average PnL
- Risk limit violations
- API key decryption latency
- CCXT error rates

**Alerts:**
- Order execution failure (immediate)
- Risk limit exceeded (immediate)
- Daily loss limit hit (immediate)
- Unusual slippage (warning)
- High API error rate (warning)
- Position stuck in "submitting" state (warning)

**Logging:**
- Every order submission with parameters
- Every risk check result
- Every API key decryption (without key contents)
- Every CCXT API call and response
- Every state transition in position lifecycle
