# Complete Trader Workflow Architecture - Binance AI Crypto Screener

## Executive Summary

This document maps the complete end-to-end trader workflow from creation through signal generation and AI analysis. The system is built on a modern serverless/edge computing stack with a React frontend, Supabase backend, Deno Edge Functions for LLM operations, and a Go-based cloud execution engine (Fly.io machines).

---

## 1. TRADER CREATION FLOW

### 1.1 Frontend: Trader Creation Form
**File:** `/apps/app/src/components/TraderForm.tsx` (1000+ lines)

**Key Features:**
- **Two modes:** AI Generate (NLP to code) or Manual Entry
- **AI Mode Flow:**
  - User describes strategy in natural language
  - Calls `generateTrader()` from geminiService
  - Streams progress updates to UI
  - Returns: name, description, filterCode, strategyInstructions

- **Manual Mode Flow:**
  - Name, description, filter conditions
  - Strategy instructions for AI analysis
  - Candle interval selection (1m, 5m, 15m, etc.)
  - Advanced settings: AI analysis data limit, model tier, concurrent analysis limit
  - Admin fields for built-in signals (access tier, category, difficulty)

**Tier Gating:**
- Free users: Cannot create custom signals (UpgradePrompt shown)
- Pro/Elite users: Can create up to 10/unlimited custom signals

**Data Structure Created:**
```javascript
{
  name: string;
  description: string;
  enabled: boolean = true;
  mode: 'demo' | 'live' = 'demo';
  userId: UUID (if not built-in);
  filter: {
    code: string;           // Generated code
    description: string[];  // Conditions
    indicators: Indicator[];
    refreshInterval: KlineInterval;
    requiredTimeframes: string[];
    language: 'go';         // All new traders use Go backend
  };
  strategy: {
    instructions: string;   // For AI analysis
    riskManagement: RiskParams;
    aiAnalysisLimit: number (1-1000 bars);
    modelTier: 'standard' | 'fast';
    maxConcurrentAnalysis: number (1-10);
  };
  // Admin fields
  isBuiltIn?: boolean;
  ownershipType?: 'system' | 'user';
  accessTier?: AccessTier;
  category?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  adminNotes?: string;
  default_enabled?: boolean;
}
```

---

## 2. FILTER CODE GENERATION

### 2.1 LLM Proxy Edge Function
**File:** `/supabase/functions/llm-proxy/index.ts`

**Route Logic:**
```
/llm-proxy POST
├─ operation: 'generate-trader'
├─ operation: 'generate-trader-metadata'
└─ operation: 'generate-filter-code'
```

**Braintrust Integration:**
- Initializes logger via `initLogger()`
- All operations wrapped with `traced()` for observability
- Logs inputs/outputs + metrics to Braintrust project

**CORS & Security:**
- Allows `*` origin (frontend can call directly)
- Requires proper Supabase auth headers

### 2.2 Generate Trader Metadata Operation
**File:** `/supabase/functions/llm-proxy/operations/generateTraderMetadata.ts`

**Process:**
1. Load prompt template: `'generate-trader-metadata'` from Braintrust
2. Replace variables: `{{userPrompt}}`
3. Call OpenRouter via OpenRouterClient
4. Parse structured response:
   ```json
   {
     "suggestedName": "string",
     "description": "string",
     "conditions": ["condition1", "condition2", ...],
     "strategyInstructions": "string",
     "indicators": [...],
     "riskParameters": {...}
   }
   ```
5. Log to Braintrust with metadata

### 2.3 Generate Filter Code Operation
**File:** `/supabase/functions/llm-proxy/operations/generateFilterCode.ts`

**Process:**
1. Input: conditions array + klineInterval
2. Load prompt: `'regenerate-filter-go'` from Braintrust
3. Build prompt with variables:
   - `{{conditions}}` - numbered list of conditions
   - `{{klineInterval}}` - e.g., '1m', '5m', '1h'
4. Call OpenRouter (model configured in `config/operations.ts`)
5. Parse response:
   ```json
   {
     "filterCode": "package main; func checkSignal(...) bool { ... }",
     "requiredTimeframes": ["1m", "5m"],
     "language": "go"
   }
   ```
6. Braintrust logs include: tokens used, code length, timeframes count

### 2.4 Prompt Loading System
**File:** `/supabase/functions/llm-proxy/promptLoader.v2.ts`

**Architecture:**
- **Source:** Braintrust REST API (not SDK - more reliable)
- **Project ID:** Hardcoded in loader (5df22744-d29c-4b01-b18b-e3eccf2ddbba)
- **Cache:** 5-minute TTL in memory
- **Available Prompts:**
  - `generate-trader-metadata` - NLP to trader metadata
  - `regenerate-filter-go` - Conditions to Go filter code
  - Other analysis prompts stored in Braintrust

**Flow:**
```
1. Check in-memory cache (5min TTL)
2. If hit, return cached content
3. If miss, call Braintrust REST API
4. Parse response (handles completion/chat/string types)
5. Replace variables: {{variable}} → value
6. Return prompt content
```

### 2.5 OpenRouter Client
**File:** `/supabase/functions/llm-proxy/openRouterClient.ts`

**Features:**
- Model selection via parameter
- Streaming + structured responses
- Token counting
- Error handling with fallbacks
- Default model: `google/gemini-2.5-flash` (can override per operation)

---

## 3. TRADER PERSISTENCE

### 3.1 Frontend Trader Manager
**File:** `/apps/app/src/services/traderManager.ts` (550 lines)

**Class: TraderManager (Singleton)**

**Key Methods:**
- `createTrader()` - Creates new trader in DB + in-memory cache
- `updateTrader()` - Updates trader in DB + notifies subscribers
- `deleteTrader()` - Soft/hard delete from DB
- `getTraders()` - Retrieves with optional filters
- `subscribe()` - Pub/Sub pattern for UI updates

**Database Integration:**
```typescript
// Insert to Supabase
await supabase.from('traders').insert([serializedTrader]);

// Update
await supabase.from('traders').update(serialized).eq('id', id);

// Delete
await supabase.from('traders').delete().eq('id', id);
```

**Serialization:**
- Converts TypeScript Trader → PostgreSQL JSONB
- Handles nested filter/strategy objects
- Timestamps in ISO format
- Language field: 'go' or 'javascript'

**Validation:**
- Built-in traders MUST NOT have userId (system-owned)
- Auto-fixes contradictory ownership states
- Logs warnings for data integrity

### 3.2 Database Schema
**File:** `/supabase/migrations/001_create_traders_tables.sql`

```sql
CREATE TABLE traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  mode TEXT CHECK (mode IN ('demo', 'live')) DEFAULT 'demo',
  exchange_config JSONB,
  filter JSONB NOT NULL,           -- Contains code, description, indicators, etc.
  strategy JSONB NOT NULL,         -- Contains instructions, risk mgmt, AI settings
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscription & ownership fields (added in later migrations)
ALTER TABLE traders ADD COLUMN user_id UUID;
ALTER TABLE traders ADD COLUMN ownership_type TEXT;
ALTER TABLE traders ADD COLUMN access_tier TEXT;
ALTER TABLE traders ADD COLUMN is_built_in BOOLEAN;
ALTER TABLE traders ADD COLUMN default_enabled BOOLEAN;
ALTER TABLE traders ADD COLUMN category TEXT;
ALTER TABLE traders ADD COLUMN difficulty TEXT;
ALTER TABLE traders ADD COLUMN admin_notes TEXT;
```

**Indexes:**
- `idx_traders_enabled` - For filtering enabled traders
- `idx_traders_mode` - For mode-based queries
- Other indexes on user_id, access_tier, etc.

**Row Level Security (RLS):**
- Users can view/create/update/delete their own traders
- Authenticated access required

---

## 4. SIGNAL GENERATION & EXECUTION

### 4.1 Signal Execution Flow

**Triggering:**
```
Cron Job (every minute)
    ↓
Supabase Edge Function: /trigger-executions
    ↓
Fetches enabled traders
    ↓
For each trader:
    └─ POST /execute-trader edge function
        ├─ Fetch 100 klines per timeframe (Go server)
        ├─ Execute filter code (sandbox)
        ├─ Return matched symbols
        └─ Store signals in DB
```

### 4.2 Trigger Executions Edge Function
**File:** `/supabase/functions/trigger-executions/index.ts`

**Process:**
1. GET active symbols from Go server: `fetchAllTickers()`
2. Query all enabled traders from DB
3. For each trader, POST to `/execute-trader`:
   ```json
   {
     "traderId": "uuid",
     "symbols": ["BTCUSDT", "ETHUSDT", ...],
     "userId": "uuid"
   }
   ```
4. Aggregate results with timing metrics

### 4.3 Execute Trader Edge Function
**File:** `/supabase/functions/execute-trader/index.ts`

**Signal Execution:**
1. **Fetch Trader** from DB (with access control)
2. **For each symbol:**
   - Fetch ticker data (current price, volume)
   - Fetch 1m klines: 100 candles
   - Fetch other required timeframes from `trader.filter.requiredTimeframes`
   - Build execution context:
     ```javascript
     {
       ticker: { symbol, price, high, low, volume, ... },
       timeframes: {
         '1m': [[time, open, high, low, close, volume, ...], ...],
         '5m': [...],
         '1h': [...]
       }
     }
     ```
3. **Execute Filter Code:**
   ```javascript
   // Code from trader.filter.code
   const filterFunction = new Function('ticker', 'timeframes', helperFunctions + code);
   const matched = Boolean(filterFunction(ticker, timeframes));
   ```
4. **Helper Functions Injected:**
   - calculateMA, calculateRSI, calculateVolumeMA
   - getLatestBollingerBands, getLatestRSI
   - Supports indicators in filter code
5. **Store Results:**
   - If matches found: Insert into `trader_signals` table
   - Publish to Realtime channel: `signals`
   - Update execution history

**Response:**
```json
{
  "traderId": "uuid",
  "matches": ["BTCUSDT", "ETHUSDT"],
  "executedAt": "2024-10-24T10:30:00Z",
  "executionTimeMs": 245
}
```

### 4.4 Database Tables for Signals

**trader_signals:**
```sql
CREATE TABLE trader_signals (
  id UUID PRIMARY KEY,
  trader_id UUID REFERENCES traders(id),
  symbols TEXT[],           -- Array of matched symbols
  timestamp TIMESTAMPTZ,
  metadata JSONB            -- totalSymbols, matchCount, etc.
);
```

**execution_history:**
```sql
CREATE TABLE execution_history (
  id UUID PRIMARY KEY,
  trader_id UUID REFERENCES traders(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  symbols_checked INTEGER,
  matches_count INTEGER
);
```

---

## 5. SIGNAL ANALYSIS (AI DECISION MAKING)

### 5.1 AI Analysis Edge Function
**File:** `/supabase/functions/ai-analysis/index.ts`

**Trigger:** Whenever a signal is detected, frontend calls this for decision making

**Input:**
```json
{
  "signalId": "uuid",
  "symbol": "BTCUSDT",
  "price": 42500.50,
  "strategy": "...",              // From trader.strategy.instructions
  "klines": [[t, o, h, l, c, v, ...], ...],
  "calculatedIndicators": {
    "rsi": 65,
    "macd": {...},
    ...
  }
}
```

**Process:**
1. **Build Prompt** via PromptBuilder:
   - Strategy instructions
   - Current price + technical indicators
   - Recent price action (last N candles)
   - Market context

2. **Call Gemini 2.5 Flash** (fast model for low latency):
   - Model: `gemini-2.5-flash`
   - Max tokens: configured per operation
   - Temperature: typically 0.3 (deterministic)

3. **Parse Structured Response:**
   ```json
   {
     "decision": "enter_trade" | "bad_setup" | "wait",
     "confidence": 0-100,
     "reasoning": "...",
     "tradePlan": {
       "setup": "...",
       "execution": "...",
       "invalidation": "...",
       "riskReward": 1.5
     },
     "keyLevels": {
       "entry": 42500,
       "stopLoss": 42000,
       "takeProfit": [43000, 43500],
       "support": [...],
       "resistance": [...]
     },
     "technicalIndicators": {...}
   }
   ```

4. **Calculate Key Levels** via KeyLevelCalculator:
   - Support/resistance from recent swings
   - Pivot points
   - ATR-based stops

5. **Store Analysis** in signal_analyses table
6. **Return to Frontend** for display

### 5.2 Signal Analysis Database
**File:** `/supabase/migrations/014_create_signal_analyses_table.sql`

```sql
CREATE TABLE signal_analyses (
  id UUID PRIMARY KEY,
  signal_id UUID NOT NULL REFERENCES signals(id),
  trader_id UUID NOT NULL REFERENCES traders(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Analysis results
  decision TEXT CHECK (decision IN ('enter_trade', 'bad_setup', 'wait')),
  confidence DECIMAL(5,2),
  reasoning TEXT,
  
  -- Trade details
  key_levels JSONB,           -- {entry, stopLoss, takeProfit[], support[], resistance[]}
  trade_plan JSONB,           -- {setup, execution, invalidation, riskReward}
  technical_indicators JSONB,
  
  -- Metadata
  raw_ai_response TEXT,
  analysis_latency_ms INTEGER,
  gemini_tokens_used INTEGER,
  model_name TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can read their own analyses
CREATE POLICY "Users can read their own signal analyses"
  ON signal_analyses FOR SELECT
  USING (auth.uid() = user_id);
```

---

## 6. TRADE EXECUTION (Cloud Execution)

### 6.1 Cloud Machine Architecture
**Directory:** `/fly-machine/`

**Status:** Partially implemented (core types + indicators complete)

**Purpose:**
- Per-user dedicated Go instances on Fly.io
- Real-time filter execution
- Position management
- Trade execution against Binance

**Components:**

**a) Types** (`internal/types/types.go`) - COMPLETE
```go
type Trader struct {
  ID string
  Name string
  Filter TraderFilter
  Strategy TraderStrategy
  Enabled bool
  Mode string  // 'demo' or 'live'
}

type TraderFilter struct {
  Code string        // Go filter code
  Description []string
  RequiredTimeframes []string
}

type Signal struct {
  ID string
  TraderID string
  Symbol string
  Decision string  // 'enter', 'wait', 'bad_setup'
  Confidence float64
  KeyLevels KeyLevels
}

type Position struct {
  ID string
  Symbol string
  EntryPrice float64
  Quantity float64
  StopLoss float64
  TakeProfits []float64
  Status string  // 'open', 'closed'
  Mode string    // 'demo', 'live'
}
```

**b) Technical Indicators** (`internal/indicators/helpers.go`) - COMPLETE
- 30+ indicators ported from TypeScript
- Trend: SMA, EMA, WMA, VWAP
- Momentum: RSI, MACD, Stochastic, CCI, Williams%R, ROC
- Volatility: Bollinger Bands, ATR, Keltner Channels, Donchian
- Volume: OBV, Volume MA, Volume Change
- Trend Strength: ADX, Aroon

**c) Kline Storage** (`internal/storage/kline_store.go`) - COMPLETE
- Thread-safe in-memory storage
- Auto-trim to max length
- Symbol/timeframe indexing

**d) Binance WebSocket** (`internal/binance/websocket.go`) - COMPLETE
- Real-time kline + ticker streams
- Auto-reconnect with exponential backoff
- Dynamic symbol/timeframe updates

**e) Still To Implement:**
- Database client (Supabase Postgres via pgx)
- Binance REST client (order execution)
- Yaegi code executor (compile + run user filter code)
- Timer manager (fixed interval + candle close timers)
- Trade executor (all trade operations)
- Position monitor (SL/TP triggers, PNL)
- Re-analysis manager (periodic AI re-analysis)
- HTTP server (health, metrics, reload)
- Machine orchestrator (main entry point)

### 6.2 Execution Flow (Future)
```
1. Machine boots, loads traders from Supabase
2. WebSocket connects to Binance (all required symbols/timeframes)
3. Timers tick every second
4. On each tick:
   - Fetch latest klines from buffer
   - Execute filter code
   - If signal triggered:
     └─ Store in DB
     └─ Call AI analysis
     └─ Execute trade if decision = 'enter_trade'
5. Position monitor checks SL/TP every second
6. Periodic re-analysis of open positions (every 5 min)
```

---

## 7. BRAINTRUST OBSERVABILITY INTEGRATION

### 7.1 Braintrust Configuration
**Files:**
- `/supabase/functions/llm-proxy/index.ts` - Initializes logger
- `/supabase/functions/llm-proxy/operations/*.ts` - Trace all operations
- `/supabase/functions/test-braintrust/index.ts` - Test endpoint

**Setup:**
```javascript
import { initLogger, traced } from "npm:braintrust@0.0.157";

// Initialize
initLogger({
  projectName: 'AI Trader',  // From BRAINTRUST_PROJECT_NAME env
  apiKey: BRAINTRUST_API_KEY
});

// Wrap operations
await traced(async (span) => {
  span.log({
    input: params,
    metadata: { operation, model, version }
  });
  
  // Do work...
  
  span.log({
    output: result,
    metrics: { tokens, latency, etc }
  });
}, { name: "operation_name", type: "task" });
```

### 7.2 What Gets Traced

**LLM Operations:**
- `generate-trader` - Full trader generation
- `generate-trader-metadata` - NLP to metadata
- `generate-filter-code` - Conditions to code

**Each trace logs:**
- Input: User prompt, conditions, parameters
- Output: Generated content, code, metadata
- Metrics: Token usage, latency, conditions count
- Model info: Model ID, prompt version

**Alternative: Langfuse**
- `/supabase/functions/langfuse-proxy/index.ts` - Langfuse integration
- Used for secondary observability
- Traces generations, stream events, analyses
- Session-based grouping

---

## 8. DATA FLOW DIAGRAMS

### 8.1 Trader Creation Flow
```
┌─────────────────┐
│   TraderForm    │ (React Component)
└────────┬────────┘
         │ User enters NLP or manual fields
         ↓
┌─────────────────────────┐
│  Generate Trader        │ (generateTrader service)
│  or Save Manually       │
└────────┬────────────────┘
         │
         ├─→ POST /llm-proxy (operation: 'generate-trader')
         │   ├─→ Load prompt from Braintrust
         │   ├─→ generate-trader-metadata
         │   │   └─→ Call OpenRouter (Gemini 2.5 Pro)
         │   ├─→ generate-filter-code
         │   │   └─→ Call OpenRouter (Gemini 2.5 Pro)
         │   └─→ Return metadata + code
         │
         ↓
┌─────────────────────────┐
│  TraderManager          │
│  .createTrader()        │
└────────┬────────────────┘
         │
         ↓
┌─────────────────────────┐
│  Supabase               │
│  traders table          │
└─────────────────────────┘
```

### 8.2 Signal Generation & Analysis Flow
```
┌──────────────────────┐
│  Cron: trigger-      │ (Every minute)
│  executions          │
└──────────┬───────────┘
           │
           ↓
┌──────────────────────────────────┐
│  Fetch active symbols from       │
│  Go server (Binance data)        │
└──────────┬───────────────────────┘
           │
           ↓ For each enabled trader
┌──────────────────────────────────┐
│  POST /execute-trader            │
│  - Fetch klines (Go server)      │
│  - Execute filter code           │
│  - Return matched symbols        │
└──────────┬───────────────────────┘
           │
           ↓ If matches found
┌──────────────────────────────────┐
│  Insert into trader_signals      │
│  Publish to Realtime channel     │
└──────────┬───────────────────────┘
           │
           ↓ Frontend receives signal
┌──────────────────────────────────┐
│  Frontend calls POST /ai-analysis│
│  - Pass signal + market data     │
│  - Call Gemini 2.5 Flash        │
│  - Get decision + key levels     │
└──────────┬───────────────────────┘
           │
           ↓
┌──────────────────────────────────┐
│  Insert into signal_analyses     │
│  Display in frontend             │
└──────────────────────────────────┘
```

### 8.3 Go Cloud Execution (Future)
```
┌─────────────────────────────────┐
│  Trader Machine Boot (Fly.io)   │
└────────┬────────────────────────┘
         │
         ├─→ Load traders from Supabase
         ├─→ Connect WebSocket to Binance
         │   (all required symbols/timeframes)
         └─→ Start timers + monitors
                │
                ├─→ Every 1 second:
                │   ├─ Fetch klines from buffer
                │   ├─ Execute filter code (Yaegi)
                │   ├─ If signal: call AI analysis
                │   └─ Execute trade if approved
                │
                └─→ Every 5 minutes:
                    └─ Re-analyze open positions
```

---

## 9. KEY FILES REFERENCE

### Frontend Components
- `/apps/app/src/components/TraderForm.tsx` - Signal creation UI
- `/apps/app/src/components/TraderList.tsx` - List of traders
- `/apps/app/src/components/SignalCard.tsx` - Signal display
- `/apps/app/src/components/EnhancedAnalysis.tsx` - Analysis details

### Services & Utilities
- `/apps/app/src/services/traderManager.ts` - Trader CRUD + subscriptions
- `/apps/app/services/geminiService.ts` - LLM integration (streaming)
- `/apps/app/src/contexts/SubscriptionContext.tsx` - Tier-based access control

### Edge Functions
- `/supabase/functions/llm-proxy/index.ts` - Main LLM proxy router
- `/supabase/functions/llm-proxy/operations/generateTrader.ts`
- `/supabase/functions/llm-proxy/operations/generateFilterCode.ts`
- `/supabase/functions/execute-trader/index.ts` - Filter execution
- `/supabase/functions/ai-analysis/index.ts` - Decision making
- `/supabase/functions/trigger-executions/index.ts` - Cron trigger

### Database
- `/supabase/migrations/001_create_traders_tables.sql` - Core schema
- `/supabase/migrations/014_create_signal_analyses_table.sql` - Analysis storage
- `/supabase/migrations/011_create_cloud_execution_tables.sql` - Cloud execution

### Go Backend
- `/fly-machine/internal/types/types.go` - Data structures
- `/fly-machine/internal/indicators/helpers.go` - 30+ indicators
- `/fly-machine/internal/storage/kline_store.go` - Kline caching
- `/fly-machine/internal/binance/websocket.go` - Real-time data

### Configuration
- `/supabase/functions/llm-proxy/config/operations.ts` - LLM operation configs
- `/supabase/functions/llm-proxy/promptLoader.v2.ts` - Braintrust prompt loading

---

## 10. TECHNOLOGY STACK SUMMARY

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19, TypeScript, Vite | Signal creation, monitoring, analysis |
| **LLM** | Gemini 2.5 Flash/Pro via OpenRouter | NLP→Code, AI analysis |
| **Backend** | Supabase (PostgreSQL + Edge Fn) | Data persistence, signal orchestration |
| **Observability** | Braintrust + Langfuse | Tracing, evals, prompt management |
| **Cloud Execution** | Go + Fly.io machines | Real-time filter execution |
| **Real-time** | Binance WebSocket, Supabase Realtime | Market data, signal notifications |
| **Infrastructure** | Deno Edge Functions, Fly.io | Serverless execution |

---

## 11. CURRENT STATE & FUTURE WORK

### Completed
- Trader creation form + LLM generation
- Filter code generation (Go output)
- Signal execution (edge function)
- Signal analysis (Gemini-powered)
- Database schema + persistence
- Braintrust tracing for LLM ops
- TypeScript types + serialization
- Prompt management via Braintrust

### In Progress / TODO
- Go cloud machine implementation (90% core, 10% integration)
- Real trade execution against Binance
- Position management + SL/TP triggers
- Multi-timeframe candle management
- Yaegi filter code execution in Go
- Re-analysis system
- Performance optimization
- Load testing

### Architecture Quality
- Well-separated concerns (creation → execution → analysis)
- Proper type safety throughout stack
- Observability baked in (Braintrust tracing)
- RLS-based security model
- Graceful degradation (works without observability)
- State persistence at every step

