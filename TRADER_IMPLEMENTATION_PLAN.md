# Trader Implementation Plan

## Overview

Transform the current filter + strategy system into a unified "Trader" concept where each trader is an autonomous agent that encapsulates the complete trading workflow: Filter → Analyze → Monitor → Trade.

**Implementation Approach**:
1. **Phase 1-6**: Build complete system with demo trading (paper trading)
2. **Phase 7**: Add real exchange integration via CCXT
3. Use abstraction pattern (consistent with existing IAnalysisEngine, ISignalManager) to allow seamless transition from demo to live trading

## Core Concept

A **Trader** is a self-contained trading system that:
- Continuously scans the market using its filter
- Analyzes opportunities using its strategy
- Monitors positions according to its rules
- Executes trades based on its decisions
- Tracks its own performance

## Implementation Phases

### Phase 1: Core Trader Model & Infrastructure
**Goal**: Establish the foundational data model and service layer

#### 1.1 Data Model
```typescript
interface Trader {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  
  // Trading configuration
  mode: 'demo' | 'live';
  exchangeConfig?: {
    exchange: 'binance' | 'binance-us' | 'coinbase' | etc;
    apiKey?: string; // Encrypted
    apiSecret?: string; // Encrypted
    testnet?: boolean;
  };
  
  // Core configuration
  filter: {
    code: string;
    description: string[];
    indicators?: CustomIndicatorConfig[];
  };
  
  strategy: {
    instructions: string;
    riskManagement: {
      stopLoss?: number;
      takeProfit?: number;
      maxPositions?: number;
      positionSizePercent?: number;
      maxDrawdown?: number;
    };
  };
  
  // Performance metrics
  metrics: {
    totalSignals: number;
    activePositions: number;
    closedPositions: number;
    totalPnL: number;
    totalPnLPercent: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    lastSignalAt?: Date;
    // Separate demo vs live metrics
    demoMetrics?: PerformanceMetrics;
    liveMetrics?: PerformanceMetrics;
  };
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}
```

#### 1.2 Service Layer
- [ ] Create `TraderManager` service
  - [ ] CRUD operations for traders
  - [ ] Enable/disable traders
  - [ ] Performance tracking
  - [ ] Demo/live mode management
- [ ] Extend `SignalManager` to track trader ownership
- [ ] Update `ScreenerEngine` to run multiple filters
- [ ] Create `ITradeExecutor` interface
  - [ ] `DemoTradeExecutor` for paper trading
  - [ ] `CCXTTradeExecutor` placeholder for future

#### 1.3 Database Schema
- [ ] Create Supabase tables:
  - [ ] `traders` table (includes mode, exchange_config)
  - [ ] Update `signals` table to include `trader_id`
  - [ ] Update `trades` table to include `trader_id`, `mode`
  - [ ] `exchange_credentials` table (encrypted storage)
  - [ ] `trade_audit_log` table for compliance

### Phase 2: Unified AI Generation
**Goal**: Single prompt generates complete trader configuration

#### 2.1 Gemini Service Enhancement
- [ ] Create `generateTrader` function that returns:
  ```typescript
  interface TraderGeneration {
    suggestedName: string;
    description: string;
    filterCode: string;
    filterDescription: string[];
    strategyInstructions: string;
    indicators: CustomIndicatorConfig[];
    riskParameters: RiskManagement;
  }
  ```

#### 2.2 Prompt Engineering
- [ ] Design prompts that generate cohesive filter + strategy
- [ ] Include risk management in generation
- [ ] Validate generated code before saving

### Phase 3: UI Components
**Goal**: Minimal, elegant interface for trader management

#### 3.1 Sidebar Trader Section
- [ ] Create `TraderList` component
  - [ ] Show active/paused traders
  - [ ] Display key metrics (signals, P&L)
  - [ ] Quick enable/disable toggles
  - [ ] Click to filter signals by trader

#### 3.2 Create Trader Flow
- [ ] Create `CreateTraderModal` component
  - [ ] Strategy description input
  - [ ] Pre-built strategy selection
  - [ ] Advanced mode for direct input
  - [ ] Preview generated configuration
  - [ ] Name and activate trader

#### 3.3 Trader Management
- [ ] Create `TraderManager` component (minimal version)
  - [ ] Edit trader settings
  - [ ] View detailed performance
  - [ ] Delete trader (with confirmation)

### Phase 4: Multi-Trader Screening
**Goal**: Run multiple trader filters concurrently

#### 4.1 Screener Enhancement
- [ ] Modify screener worker to accept multiple filters
- [ ] Tag results with trader ID
- [ ] Optimize for performance (batch processing)

#### 4.2 Signal Attribution
- [ ] Update signal creation to include trader reference
- [ ] Show trader name in signals table
- [ ] Filter signals by trader

### Phase 5: Enhanced Signal Table
**Goal**: Clear visualization of which trader generated each signal

#### 5.1 Table Updates
- [ ] Add "Trader" column to signal table
- [ ] Add trader filter/search
- [ ] Show trader-specific metrics

#### 5.2 Trader Performance View
- [ ] Click trader name to see all its signals
- [ ] Show trader P&L summary
- [ ] Historical performance chart

### Phase 6: Integration & Polish
**Goal**: Seamless integration with existing features

#### 6.1 Migration Path
- [ ] Convert existing strategies to traders
- [ ] Maintain backward compatibility
- [ ] Smooth upgrade experience

#### 6.2 Performance Optimization
- [ ] Efficient multi-filter execution
- [ ] Smart caching for trader metrics
- [ ] Real-time performance updates

### Phase 7: Exchange Integration (CCXT)
**Goal**: Enable real trading with crypto exchanges

#### 7.1 Trade Execution Abstraction
- [ ] Create `ITradeExecutor` interface
  - [ ] `DemoTradeExecutor` for paper trading
  - [ ] `CCXTTradeExecutor` for live trading
- [ ] Add exchange credential management (encrypted)
- [ ] Implement order types (market, limit, stop)

#### 7.2 Exchange Data Sync
- [ ] Sync positions from exchange
- [ ] Reconcile local vs exchange P&L
- [ ] Handle partial fills and slippage
- [ ] Real-time balance updates

#### 7.3 Risk Management
- [ ] Pre-trade validation (balance, margin)
- [ ] Position size calculations
- [ ] Emergency stop functionality
- [ ] Rate limit management

#### 7.4 Transition Features
- [ ] Demo → Live migration tools
- [ ] Side-by-side demo/live comparison
- [ ] Exchange-specific error handling
- [ ] Audit trail for all trades

## UI/UX Principles

1. **Simplicity First**: Don't overwhelm with options
2. **Progressive Disclosure**: Advanced features hidden by default
3. **Clear Mental Model**: "Traders work for you"
4. **Instant Feedback**: Show what traders are doing
5. **Performance Focus**: Always visible P&L and metrics

## Technical Considerations

### State Management
- Extend existing React Context for trader state
- Real-time updates via subscription pattern
- Efficient re-renders with proper memoization
- Separate state management for demo vs live trades

### Performance
- Web Workers for parallel filter execution
- Debounced metric calculations
- Lazy loading for historical data
- Exchange WebSocket management

### Persistence
- Traders stored in Supabase
- Trade history separated by mode (demo/live)
- Encrypted storage for exchange credentials
- Local caching for performance
- Sync state across tabs

### Security
- Exchange credentials encrypted at rest
- API key permissions validation
- IP whitelist support where available
- Audit logging for all live trades

## Migration Strategy

1. **Soft Launch**: Add trader concept alongside existing
2. **Gradual Migration**: Convert strategies to traders
3. **Feature Parity**: Ensure nothing is lost
4. **Deprecation**: Remove old strategy system

## Success Metrics

- Users can create a trader in < 30 seconds
- Multiple traders run without performance impact
- Clear understanding of each trader's performance
- Reduced complexity vs current system

## Risk Mitigation

- **Complexity**: Keep UI minimal, hide advanced features
- **Performance**: Limit number of active traders initially
- **Confusion**: Clear onboarding and documentation
- **Breaking Changes**: Careful migration path

## Next Steps

1. Review and refine this plan
2. Create detailed technical design for Phase 1
3. Set up database schema (with demo/live support)
4. Begin implementation with TraderManager service
5. Implement DemoTradeExecutor first
6. Plan CCXT integration architecture for Phase 7

---

## Progress Tracking

### Phase 1: Core Model ⏳
- [ ] Define TypeScript interfaces
- [ ] Create TraderManager service
- [ ] Set up Supabase tables
- [ ] Basic CRUD operations
- [ ] Add demo/live mode support

### Phase 2: AI Generation ⏳
- [ ] Enhance Gemini service
- [ ] Create generation prompts
- [ ] Test trader generation
- [ ] Validation logic

### Phase 3: UI Components ⏳
- [ ] TraderList component
- [ ] CreateTraderModal
- [ ] Basic trader management

### Phase 4: Multi-Trader ⏳
- [ ] Update screener worker
- [ ] Concurrent filter execution
- [ ] Performance optimization

### Phase 5: Signal Enhancement ⏳
- [ ] Update signal table
- [ ] Trader attribution
- [ ] Performance views

### Phase 6: Polish ⏳
- [ ] Migration tools
- [ ] Performance tuning
- [ ] Documentation

### Phase 7: Exchange Integration ⏳
- [ ] CCXT integration
- [ ] Trade executor abstraction
- [ ] Exchange credential management
- [ ] Demo to live transition
- [ ] P&L reconciliation