# TradeMind Implementation Plan

## Overview
Transform the current screener into a full AI-powered trading assistant with the workflow:
**Filter → Analyze → Monitor → Trade**

All features will be browser-based initially with Supabase persistence, designed for easy cloud migration.

## Phase 1: Foundation & Persistence Layer (Week 1-2)

### 1.1 Supabase Setup
```sql
-- Core tables
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  tier TEXT DEFAULT 'free', -- free, pro, premium
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL, -- Natural language strategy
  filter_code TEXT NOT NULL, -- Generated filter code
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  strategy_id UUID REFERENCES strategies(id),
  symbol TEXT NOT NULL,
  decision TEXT NOT NULL, -- 'good_setup', 'monitoring', 'entered'
  reasoning TEXT NOT NULL,
  analysis JSONB NOT NULL, -- Full AI analysis
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  strategy_id UUID REFERENCES strategies(id),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL, -- 'long', 'short'
  entry_price DECIMAL,
  current_price DECIMAL,
  stop_loss DECIMAL,
  take_profit DECIMAL,
  trade_plan TEXT NOT NULL,
  status TEXT DEFAULT 'planned', -- planned, active, closed
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1.2 Abstraction Layer
```typescript
// src/abstractions/interfaces.ts
interface IPersistenceService {
  saveStrategy(strategy: Strategy): Promise<void>
  getStrategies(userId: string): Promise<Strategy[]>
  addToWatchlist(item: WatchlistItem): Promise<void>
  getWatchlist(userId: string): Promise<WatchlistItem[]>
}

interface IScreenerEngine {
  executeFilter(filter: string, marketData: MarketData): Promise<FilterResult[]>
  subscribeToUpdates(callback: UpdateCallback): void
}

interface IAnalysisEngine {
  analyzeSetup(symbol: string, strategy: Strategy): Promise<AnalysisResult>
  generateTradeDecision(analysis: AnalysisResult): TradeDecision
}

// src/implementations/browser/index.ts
export class BrowserPersistenceService implements IPersistenceService { }
export class BrowserScreenerEngine implements IScreenerEngine { }
export class BrowserAnalysisEngine implements IAnalysisEngine { }
```

### 1.3 Service Factory
```typescript
// src/services/serviceFactory.ts
class ServiceFactory {
  static getPersistence(userTier: string): IPersistenceService {
    // Future: return CloudPersistence for premium users
    return new BrowserPersistenceService()
  }
  
  static getScreener(userTier: string): IScreenerEngine {
    // Future: return CloudScreener for premium users
    return new BrowserScreenerEngine()
  }
}
```

## Phase 2: Enhanced Analysis (Week 3-4)

### 2.1 Strategy Context Management
```typescript
// src/components/StrategyManager.tsx
interface StrategyManagerProps {
  onStrategySelect: (strategy: Strategy) => void
}

// Persist strategy context across entire workflow
```

### 2.2 Structured Analysis Output
```typescript
interface AnalysisResult {
  decision: 'bad_setup' | 'good_setup' | 'enter_trade'
  direction?: 'long' | 'short'
  confidence: number
  reasoning: string
  keyLevels: {
    entry?: number
    stopLoss?: number
    takeProfit?: number[]
  }
  chartAnalysis?: string // Multi-modal chart interpretation
}
```

### 2.3 Enhanced Gemini Prompts
```typescript
const analyzeWithStrategy = async (symbol: string, strategy: string) => {
  const prompt = `
    Strategy: ${strategy}
    Symbol: ${symbol}
    
    Analyze this setup and provide:
    1. Decision (bad_setup/good_setup/enter_trade)
    2. If enter_trade, specify direction
    3. Key levels and trade plan
    4. Reasoning based on the strategy
    
    [Include chart image for multi-modal analysis]
  `
}
```

## Phase 3: Monitoring System (Week 5-6)

### 3.1 Browser-Based Monitoring
```typescript
// src/services/monitoringService.ts
class BrowserMonitoringService {
  private intervals: Map<string, NodeJS.Timer> = new Map()
  
  async startMonitoring(userId: string) {
    const watchlist = await supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .eq('decision', 'good_setup')
    
    watchlist.data?.forEach(item => {
      this.monitorSymbol(item)
    })
  }
  
  private monitorSymbol(item: WatchlistItem) {
    const interval = setInterval(async () => {
      // Re-analyze with current data
      const analysis = await analyzeSetup(item.symbol, item.strategy)
      
      if (analysis.decision === 'enter_trade') {
        await this.createTradeAlert(item, analysis)
      }
    }, 60000) // Check every minute
    
    this.intervals.set(item.id, interval)
  }
}
```

### 3.2 Alert System
```typescript
// src/components/AlertCenter.tsx
// Real-time notifications for trade opportunities
// Browser notifications API + in-app alerts
```

## Phase 4: Trade Management (Week 7-8)

### 4.1 Trade Execution Interface
```typescript
// src/components/TradePanel.tsx
interface TradePanelProps {
  analysis: AnalysisResult
  onExecute: (trade: TradeOrder) => void
}

// Manual execution initially
// Future: Binance API integration for premium users
```

### 4.2 Position Tracking
```typescript
// src/components/PositionManager.tsx
// Track open positions
// Monitor against trade plan
// Alert on key levels
```

## Phase 5: Premium Features (Future)

### 5.1 Cloud Migration
- Move filter execution to Cloud Run
- Continuous WebSocket monitoring
- Multi-user efficiency

### 5.2 Advanced Features
- Backtesting
- Risk management rules
- Portfolio analytics
- API trading execution

## Technical Considerations

### State Management
```typescript
// Consider Zustand for complex state
interface TradeMindStore {
  activeStrategy: Strategy | null
  watchlist: WatchlistItem[]
  positions: Trade[]
  setActiveStrategy: (strategy: Strategy) => void
  addToWatchlist: (item: WatchlistItem) => void
}
```

### Error Handling
- Graceful degradation if AI fails
- Offline support with sync
- Rate limit management

### Performance
- Virtualized lists for large watchlists
- Efficient WebSocket management
- Lazy loading of historical data

## Migration Readiness Checklist
- [ ] All business logic in pure functions
- [ ] Clear service interfaces
- [ ] Persistence abstraction
- [ ] API-ready data structures
- [ ] Modular component design

## Success Metrics
- Filter → Analysis conversion rate
- Analysis → Trade conversion rate
- User engagement with monitoring
- Performance under load