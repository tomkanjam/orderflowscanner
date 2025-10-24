# Architecture Quick Reference - Binance AI Crypto Screener

## System Components at a Glance

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React + TypeScript)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│ TraderForm.tsx → Creates traders (AI or manual)                             │
│ TraderManager.ts → CRUD + subscriptions (singleton)                         │
│ SubscriptionContext.tsx → Tier-based access control                         │
└──────────┬────────────────────────────────────────────────────────────────┬─┘
           │                                                                  │
           │ HTTP                                                             │
           ↓                                                                  ↓
┌──────────────────────────────┐                    ┌──────────────────────────┐
│  EDGE FUNCTIONS (Deno)       │                    │ WEBSOCKET (Binance)      │
│                              │                    │                          │
│ /llm-proxy                   │                    │ Real-time klines         │
│ ├─ generate-trader           │                    │ Real-time tickers        │
│ ├─ generate-filter-code      │                    │ (via Go server)          │
│ └─ generate-trader-metadata  │                    │                          │
│                              │                    │                          │
│ /execute-trader              │                    │ ✅ WORKING NOW           │
│ └─ Sandbox filter execution  │                    │                          │
│                              │                    │                          │
│ /ai-analysis                 │                    │                          │
│ └─ Decision making (Gemini)  │                    │                          │
│                              │                    │                          │
│ /trigger-executions          │                    │                          │
│ └─ Cron orchestrator         │                    │                          │
└──────────┬───────────────────┘                    └──────────────────────────┘
           │
           │ SQL
           ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE (PostgreSQL)                               │
├──────────────────────────────────────────────────────────────────────────────┤
│ traders              - Trader definitions (filter code, strategy)             │
│ trader_signals       - Matched signals (symbol, timestamp)                   │
│ signal_analyses      - AI decisions (entry/bad_setup/wait, confidence)       │
│ execution_history    - Performance tracking                                  │
│ trades               - Completed trades (if live trading enabled)            │
│ positions            - Open positions (if live trading enabled)              │
│ exchange_credentials - API keys (encrypted)                                  │
│ trade_audit_log      - Trade audit trail                                     │
└──────────┬───────────────────────────────────────────────────────────────────┘
           │
           │ REST/gRPC
           ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES & OBSERVABILITY                        │
├──────────────────────────────────────────────────────────────────────────────┤
│ OpenRouter           - LLM gateway (Gemini 2.5 Flash/Pro)                     │
│ Braintrust          - Prompt mgmt + tracing/observability                    │
│ Langfuse            - Secondary observability (traces, evals)                │
│ Binance REST API    - Kline fetching, market data                            │
│ Supabase Auth       - User authentication                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Workflow Execution Paths

### 1. TRADER CREATION (5-10 seconds)
```
User enters NLP description
    ↓
POST /llm-proxy?operation=generate-trader (streaming)
    ├─→ Load 'generate-trader-metadata' prompt from Braintrust
    ├─→ Call Gemini 2.5 Pro via OpenRouter
    ├─→ Get: name, conditions, instructions, indicators
    ├─→ Load 'regenerate-filter-go' prompt from Braintrust
    ├─→ Call Gemini 2.5 Pro via OpenRouter
    └─→ Get: Go filter code + required timeframes
    ↓
TraderManager.createTrader()
    ├─→ Serialize to PostgreSQL JSONB format
    ├─→ INSERT into traders table
    └─→ Notify subscribers (UI updates)
```

### 2. SIGNAL DETECTION (< 1 second per trader)
```
Cron: trigger-executions (every minute)
    ↓
For each enabled trader:
    └─→ POST /execute-trader
        ├─→ Fetch 100 klines (1m, 5m, 1h, etc.) from Go server
        ├─→ Build context: {ticker, timeframes}
        ├─→ Execute: Function(ticker, timeframes, filter.code)
        └─→ Return matched symbols
    ↓
If matches found:
    ├─→ INSERT into trader_signals
    ├─→ Publish to Realtime: signals
    └─→ Frontend receives in real-time
```

### 3. SIGNAL ANALYSIS (2-5 seconds)
```
Signal detected in frontend
    ↓
POST /ai-analysis
    ├─→ Build prompt with:
    │   ├─ Strategy instructions
    │   ├─ Current price + indicators
    │   ├─ Recent klines (N bars)
    │   └─ Risk parameters
    ├─→ Call Gemini 2.5 Flash
    └─→ Get decision: enter_trade | bad_setup | wait
    ↓
Return:
    ├─ decision + confidence
    ├─ key_levels (entry, SL, TPs)
    ├─ trade_plan (setup, execution, invalidation, risk:reward)
    └─ technical_indicators
    ↓
INSERT into signal_analyses
    ├─→ Store all metadata
    └─→ Publish to Realtime: analyses
```

### 4. TRADE EXECUTION (Future - Go Backend)
```
Machine boots on Fly.io
    ↓
Load traders from Supabase
    ↓
Connect WebSocket to Binance
    ├─→ All required symbols
    └─→ All required timeframes
    ↓
Every 1 second:
    ├─→ Fetch klines from buffer
    ├─→ Execute filter code (Yaegi)
    ├─→ If triggered: check AI analysis
    └─→ If approved: execute trade
    ↓
Every 5 minutes:
    └─→ Re-analyze open positions
```

## API Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| /llm-proxy | POST | Generate traders & code | Yes |
| /execute-trader | POST | Run filter, detect signals | Yes |
| /ai-analysis | POST | AI decision making | Yes |
| /trigger-executions | GET/POST | Cron orchestrator | Yes |
| /ai-analysis (health) | GET | Health check | No |
| /trigger-executions (?) | POST | Manual trigger | Yes |

## Database Schema (Core Tables)

### traders
```sql
id, name, description, enabled, mode (demo/live)
filter (JSONB: {code, description[], indicators[], requiredTimeframes[], language})
strategy (JSONB: {instructions, riskManagement, aiAnalysisLimit, modelTier, maxConcurrentAnalysis})
metrics, user_id, is_built_in, access_tier, category, difficulty, admin_notes
created_at, updated_at
```

### trader_signals
```sql
id, trader_id, symbols (TEXT[]), timestamp, metadata (JSONB)
```

### signal_analyses
```sql
id, signal_id, trader_id, user_id
decision (enter_trade/bad_setup/wait), confidence (0-100), reasoning
key_levels (JSONB), trade_plan (JSONB), technical_indicators (JSONB)
analysis_latency_ms, gemini_tokens_used, model_name, raw_ai_response
created_at, updated_at
```

## LLM Integration Points

### Prompt Management (Braintrust)
- **Source:** Braintrust REST API
- **Project ID:** 5df22744-d29c-4b01-b18b-e3eccf2ddbba
- **Cache:** 5-minute TTL
- **Prompts:**
  - `generate-trader-metadata` - NLP → {name, conditions, instructions}
  - `regenerate-filter-go` - Conditions → Go code

### Model Selection (OpenRouter)
- **Trader Generation:** Gemini 2.5 Pro (higher accuracy)
- **Analysis:** Gemini 2.5 Flash (low latency)
- **Temperature:** 0.3 (deterministic)
- **Token Counting:** Tracked per operation

### Braintrust Tracing
- **Initialization:** initLogger({projectName, apiKey})
- **Operation Wrapping:** traced(async (span) => {...})
- **Logged Metrics:**
  - Input/output for each operation
  - Token usage
  - Latency
  - Error messages

## Data Flow & Serialization

### Frontend → Database
```typescript
Trader (TS interface)
    ↓ serialize()
{
  id, name, description, enabled, mode,
  filter: {...},              // JSONB
  strategy: {...},            // JSONB
  metrics: {...},             // JSONB
  user_id, created_at, updated_at, ...
}
    ↓
INSERT into traders table
```

### Database → Frontend
```sql
SELECT * FROM traders
    ↓
{...JSONB columns...}
    ↓
deserialize()
    ↓
Trader (TS interface with full type safety)
```

## Tier-Based Access Control

| Tier | Custom Signals | Built-in Signals | Features |
|------|-----------------|------------------|----------|
| Anonymous | ❌ 0 | View | Basic signals, charts |
| Free | ❌ 0 | View | More signals, history, favorites |
| Pro | ✅ 10 | View + Create | Custom signals, notifications |
| Elite | ✅ Unlimited | View + Create | All features, AI trading ready |

## Performance Characteristics

| Operation | Latency | Bottleneck |
|-----------|---------|-----------|
| Trader Creation | 5-10s | LLM API calls (sequential) |
| Signal Detection | < 1s | Kline fetch + filter execution |
| AI Analysis | 2-5s | Gemini API |
| DB Insert | < 100ms | Network |
| Realtime Broadcast | < 500ms | Supabase channel |

## Error Handling & Resilience

- **LLM Failures:** Return safe defaults, log to Braintrust
- **Database Failures:** Retry with exponential backoff
- **API Failures:** Graceful degradation, continue operation
- **State Persistence:** Save at every step for recovery

## Security & RLS

- **Row Level Security (RLS):** All tables have RLS policies
- **User Isolation:** Users can only see their own traders/signals
- **Built-in Signals:** System-owned, no userId, available to all matching tiers
- **API Key Encryption:** Exchange credentials stored encrypted

## Observability Stack

### Braintrust (Primary)
- Prompt management
- LLM operation tracing
- Token usage tracking
- Error logging

### Langfuse (Secondary)
- Generation events
- Stream events
- Analysis events
- Session grouping

### Native Logging
- Edge Function logs → Deno console
- Go logs → Fly.io logs
- Frontend logs → Browser console

## Current Implementation Status

### Fully Working (Launch Ready)
- ✅ Trader creation (AI + manual)
- ✅ Filter code generation (Go format)
- ✅ Signal detection (edge function)
- ✅ AI analysis (Gemini-powered)
- ✅ Database persistence
- ✅ Tier-based access control
- ✅ Braintrust tracing

### In Progress (90%+)
- 🔄 Go cloud machine (core: 100%, integration: 10%)
- 🔄 Real trade execution

### Future
- ⏳ Position management
- ⏳ SL/TP automation
- ⏳ Re-analysis system
- ⏳ Live trading

## Key Files to Know

**Frontend:**
- TraderForm.tsx (1000+ lines) - Signal creation UI
- TraderManager.ts (550 lines) - CRUD + subscriptions
- geminiService.ts - LLM integration

**Edge Functions:**
- llm-proxy/index.ts - Main router
- llm-proxy/operations/generateTrader.ts
- execute-trader/index.ts - Filter execution
- ai-analysis/index.ts - Decision making

**Database:**
- 001_create_traders_tables.sql
- 014_create_signal_analyses_table.sql

**Go Backend:**
- internal/types/types.go
- internal/indicators/helpers.go
- internal/storage/kline_store.go
- internal/binance/websocket.go

## Deployment Notes

- Frontend: Vercel
- Edge Functions: Supabase
- Go Backend: Fly.io (per-user machines)
- Database: Supabase PostgreSQL (production)
- Observability: Braintrust + Langfuse (optional)

