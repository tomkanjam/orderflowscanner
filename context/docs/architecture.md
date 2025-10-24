# AI Trader Architecture

**Last Updated:** 2025-10-24

## System Overview

AI-powered cryptocurrency screener with fully automated trading. Users describe strategies in natural language → LLM generates executable filter code → signals trigger AI analysis → automated trade execution.

**Stack:** React + Supabase + Deno Edge Functions + Go (Fly.io) + Gemini (via OpenRouter) + Braintrust

---

## Core Workflow

```
┌─────────────────┐
│ 1. Trader       │  TraderForm → LLM Proxy → Braintrust prompts
│    Creation     │  Output: Go filter code + strategy instructions
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 2. Filter Code  │  NLP conditions → Gemini 2.5 Pro via OpenRouter
│    Generation   │  Braintrust traced, 5-min prompt cache
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 3. Filter       │  Cron (1 min) → execute-trader Edge Function
│    Execution    │  Fetch klines from Go server → sandbox eval
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 4. Signal       │  trader_signals table → Realtime broadcast
│    Creation     │  Auto-trigger AI analysis (Elite tier)
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 5. AI Analysis  │  ai-analysis Edge Function → Gemini 2.5 Flash
│                 │  Output: decision, confidence, key levels, trade plan
└────────┬────────┘
         │
         v
┌─────────────────┐
│ 6. Trade        │  [PENDING] Go backend executor
│    Execution    │  Binance API, position management, SL/TP automation
└─────────────────┘
```

---

## 1. Trader Creation Flow

**Entry Point:** `TraderForm.tsx` (apps/app/src/components/)

### AI Mode (Default)
1. **User Input:** Natural language description
2. **LLM Proxy Call:** POST `/llm-proxy?operation=generate-trader`
3. **Two-Step Generation:**
   - `generate-trader-metadata` → name, conditions[], strategyInstructions
   - `generate-filter-code` → Go code + requiredTimeframes[]
4. **Prompts:** Loaded from Braintrust REST API (5-min cache)
   - Project ID: `5df22744-d29c-4b01-b18b-e3eccf2ddbba`
   - Slugs: `generate-trader-metadata`, `regenerate-filter-go`
5. **Storage:** TraderManager serializes → INSERT into `traders` table

### Manual Mode
- Direct form input with tier gating (Free=none, Pro=10, Elite=unlimited)
- Filter code regeneration available if conditions change

**Files:**
- `apps/app/src/components/TraderForm.tsx` (1000+ lines)
- `supabase/functions/llm-proxy/operations/generateTrader.ts`
- `supabase/functions/llm-proxy/operations/generateFilterCode.ts`

---

## 2. Filter Code Generation

**LLM Integration:** OpenRouter → Gemini 2.5 Pro

### Process (generateFilterCode.ts:16-92)
```typescript
traced(async (span) => {
  // 1. Load prompt from Braintrust
  const prompt = await promptLoader.loadPromptWithVariables('regenerate-filter-go', {
    conditions: conditionsList,
    klineInterval
  });

  // 2. Call OpenRouter with config
  const result = await openRouterClient.generateStructuredResponse(prompt, {
    temperature: config.temperature,
    modelName: config.modelId
  });

  // 3. Extract filter code + timeframes
  return {
    filterCode: result.data.filterCode,
    requiredTimeframes: result.data.requiredTimeframes,
    language: 'go'
  };
}, { name: "generate_filter_code", type: "task" });
```

**Output Example:**
```json
{
  "filterCode": "// Check RSI oversold on 1h\nrsi := helpers.RSI(timeframes[\"1h\"], 14)\nreturn rsi < 30",
  "requiredTimeframes": ["1h"],
  "language": "go"
}
```

**Braintrust Tracing:**
- Inputs: conditions, klineInterval, modelId
- Outputs: filterCode, requiredTimeframes
- Metrics: total_tokens, code_length, timeframes_count

**Files:**
- `supabase/functions/llm-proxy/operations/generateFilterCode.ts`
- `supabase/functions/llm-proxy/promptLoader.v2.ts`
- `supabase/functions/llm-proxy/openRouterClient.ts`

---

## 3. Filter Execution & Signal Creation

**Trigger:** Cron job every 1 minute → `/trigger-executions`

### Execution Flow (execute-trader/index.ts:115-203)
```typescript
// 1. Fetch ticker + klines from Go server
const tickerData = await fetchTicker(symbol);
const klinesData = await Promise.all(
  requiredTimeframes.map(tf => fetchKlines(symbol, tf, 100))
);

// 2. Build execution context
const ticker = { symbol, price, volume, priceChangePercent, ... };
const timeframes = { '1m': [...], '5m': [...], '1h': [...] };

// 3. Sandbox execution
const filterFunction = new Function(
  'ticker',
  'timeframes',
  helpers + '\n' + trader.filter.code
);
const matched = Boolean(filterFunction(ticker, timeframes));

// 4. Store signals + broadcast
if (matched) {
  await supabase.from('trader_signals').insert({
    trader_id, symbols: [symbol], timestamp, metadata
  });

  await supabase.channel('signals').send({
    type: 'broadcast',
    event: 'new-signal',
    payload: { traderId, symbols, timestamp }
  });
}
```

**Helper Functions Available:**
- `calculateMA(prices, period)`
- `calculateRSI(prices, period)`
- `getLatestBollingerBands(klines, period, stdDev)`
- `getLatestRSI(klines, period)`

**Performance:**
- Execution: Sub-1 second per trader
- Concurrency: All traders in parallel via `Promise.allSettled`

**Files:**
- `supabase/functions/execute-trader/index.ts`
- `supabase/functions/trigger-executions/index.ts`
- `supabase/functions/_shared/goServerClient.ts`

---

## 4. AI Signal Analysis

**Entry Point:** `/ai-analysis` Edge Function (Elite tier only)

### Analysis Process (ai-analysis/index.ts:37-94)
```typescript
// 1. Validate authentication
if (!authHeader?.startsWith('Bearer ')) throw new Error('Unauthorized');

// 2. Parse request (AnalysisRequest)
const { signalId, symbol, strategy, price, klines, calculatedIndicators } = req.json();

// 3. Build prompt with market context
const prompt = promptBuilder.buildAnalysisPrompt({
  symbol, strategy, price, klines, indicators
});

// 4. Call Gemini 2.5 Flash
const { analysis, tokensUsed } = await geminiClient.generateStructuredAnalysis(prompt);

// 5. Calculate key levels
const keyLevels = keyLevelCalculator.calculateKeyLevels(
  price, klines, calculatedIndicators, analysis.decision
);

// 6. Return structured response
return {
  decision: 'enter_trade' | 'bad_setup' | 'wait',
  confidence: 85.5,
  reasoning: "...",
  keyLevels: { entry, stopLoss, takeProfit[], support[], resistance[] },
  tradePlan: { setup, execution, invalidation, riskReward }
};
```

**Model:** Gemini 2.5 Flash (fast, low latency)

**Storage:** `signal_analyses` table (RLS-protected)
- decision, confidence, reasoning
- key_levels (JSONB), trade_plan (JSONB)
- raw_ai_response, analysis_latency_ms, gemini_tokens_used

**Performance:**
- Latency: 2-5 seconds
- Realtime broadcast: Enabled on `signal_analyses` table

**Files:**
- `supabase/functions/ai-analysis/index.ts`
- `supabase/functions/ai-analysis/geminiClient.ts`
- `supabase/functions/ai-analysis/promptBuilder.ts`
- `supabase/functions/ai-analysis/keyLevelCalculator.ts`

---

## 5. Braintrust Instrumentation

**Purpose:** LLM observability, prompt management, tracing, evaluations

### Integration Points

#### 1. Initialization (llm-proxy/index.ts:34-44)
```typescript
import { initLogger, traced } from "npm:braintrust@0.0.157";

initLogger({
  projectName: 'AI Trader',
  apiKey: BRAINTRUST_API_KEY
});
```

#### 2. Prompt Loading (promptLoader.v2.ts:77-132)
```typescript
// Direct REST API (no SDK - avoids SDK/REST disconnect)
const url = `https://api.braintrust.dev/v1/prompt?project_id=${projectId}&slug=${slug}`;
const response = await fetch(url, {
  headers: { 'Authorization': `Bearer ${apiKey}` }
});

// 5-minute cache
this.cache.set(slug, { content, cachedAt: Date.now() });
```

#### 3. Operation Tracing (generateFilterCode.ts:16-92)
```typescript
return await traced(async (span) => {
  // Log inputs
  span.log({
    input: { conditions, klineInterval },
    metadata: { operation, modelId, promptVersion }
  });

  // Execute operation
  const result = await openRouterClient.generateStructuredResponse(...);

  // Log outputs
  span.log({
    output: filterResult,
    metrics: { total_tokens, code_length, timeframes_count }
  });

  return result;
}, { name: "generate_filter_code", type: "task" });
```

**Traced Operations:**
- `generate_trader` (parent span)
- `generate_trader_metadata` (child span)
- `generate_filter_code` (child span)
- `openrouter_chat` (LLM span)

**Metrics Logged:**
- Input/output content
- Token usage (prompt, completion, total)
- Latency per operation
- Model configuration
- Error messages

**Alternative:** Langfuse integration available (secondary observability)

**Files:**
- `supabase/functions/llm-proxy/promptLoader.v2.ts`
- `supabase/functions/llm-proxy/openRouterClient.ts`
- All operation handlers in `supabase/functions/llm-proxy/operations/`

---

## 6. Trade Execution (Pending Implementation)

**Platform:** Go backend on Fly.io (partially implemented)

### Current Status

#### ✅ Completed
- 30+ technical indicators (Trend, Momentum, Volatility, Volume, Aroon)
- Thread-safe kline storage with auto-trimming
- Binance WebSocket with auto-reconnect
- Type system: Trader, Signal, Position, Trade

#### ⏳ In Progress
- Yaegi code executor (run user filter code in Go)
- Trade executor + position manager
- SL/TP automation with re-entry logic
- Re-analysis system for position monitoring

### Architecture (Planned)

```
┌──────────────────────┐
│ Signal Analysis      │ → decision: enter_trade, confidence: 85%
└──────────┬───────────┘
           │
           v
┌──────────────────────┐
│ Trade Executor       │ → Submit market order to Binance
│                      │ → Set SL/TP orders
└──────────┬───────────┘
           │
           v
┌──────────────────────┐
│ Position Monitor     │ → Track P&L, re-analyze on price movement
│                      │ → Auto-adjust SL (trailing stop)
└──────────┬───────────┘
           │
           v
┌──────────────────────┐
│ Exit Manager         │ → TP hit, SL hit, or re-analysis exit signal
│                      │ → Record trade in audit log
└──────────────────────┘
```

**Files (Go Backend):**
- `backend/go-screener/internal/trader/executor.go` (pending)
- `backend/go-screener/internal/monitoring/engine.go`
- `fly-machine/internal/executor/trade.go`
- `fly-machine/internal/monitor/position.go`

---

## Database Schema

### Core Tables

**traders**
- `id`, `name`, `description`, `enabled`, `mode` (demo/live)
- `filter` (JSONB): code, description[], interval, requiredTimeframes[], language
- `strategy` (JSONB): instructions, aiAnalysisLimit, modelTier, maxConcurrentAnalysis
- `metrics` (JSONB): executions, signals, trades
- `user_id`, `tier`, `isBuiltIn`, `accessTier`, `default_enabled`

**trader_signals**
- `id`, `trader_id`, `symbols[]`, `timestamp`, `metadata` (JSONB)
- Auto-triggers AI analysis for Elite users

**signal_analyses**
- `id`, `signal_id`, `trader_id`, `user_id`
- `decision` (enter_trade|bad_setup|wait), `confidence`, `reasoning`
- `key_levels` (JSONB): entry, stopLoss, takeProfit[], support[], resistance[]
- `trade_plan` (JSONB): setup, execution, invalidation, riskReward
- `raw_ai_response`, `analysis_latency_ms`, `gemini_tokens_used`, `model_name`
- Realtime enabled

**execution_history**
- `id`, `trader_id`, `started_at`, `completed_at`
- `symbols_checked`, `symbols_matched`, `execution_time_ms`, `error`

**exchange_credentials** (encrypted)
- `id`, `trader_id`, `exchange`, `encrypted_api_key`, `encrypted_api_secret`
- `testnet`, `created_at`, `updated_at`

**RLS Policies:** All tables have Row-Level Security enabled
- Users can only access their own data
- Service role bypasses RLS for Edge Functions

**Files:**
- `supabase/migrations/001_create_traders_tables.sql`
- `supabase/migrations/014_create_signal_analyses_table.sql`

---

## Technology Stack

### Frontend
- React 19 + TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui
- Chart.js + chartjs-chart-financial

### Backend Services
- **Supabase:**
  - PostgreSQL (data storage)
  - Deno Edge Functions (LLM operations, filter execution)
  - Realtime (WebSocket broadcasts)
  - Auth (email/password)
  - RLS (Row-Level Security)

- **Go Backend (Fly.io):**
  - Kline data streaming (Binance WebSocket)
  - Technical indicator calculations
  - [Pending] Trade execution
  - [Pending] Position monitoring

### LLM Stack
- **OpenRouter:** API gateway (multi-model access)
- **Gemini 2.5 Flash:** Fast model for signal analysis
- **Gemini 2.5 Pro:** Smarter model for code generation
- **Braintrust:** Prompt management, tracing, evaluations
- **Alternative:** Langfuse (secondary observability)

### Deployment
- Frontend: Vercel
- Edge Functions: Supabase (Deno Deploy)
- Go Backend: Fly.io machines
- Database: Supabase (PostgreSQL)

---

## Performance Characteristics

- **Trader Creation:** 5-10s (2 LLM calls: metadata + filter code)
- **Filter Execution:** <1s per trader (all symbols in parallel)
- **Signal Detection:** Real-time (1-min cron trigger)
- **AI Analysis:** 2-5s (Gemini 2.5 Flash)
- **Database Queries:** <100ms (indexed, RLS-optimized)

---

## Critical Dependencies

### Environment Variables
```bash
# LLM
OPENROUTER_API_KEY=sk-or-...
BRAINTRUST_API_KEY=...
GEMINI_API_KEY=...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Go Backend
GO_SERVER_URL=https://xxx.fly.dev
```

### External APIs
- **OpenRouter:** LLM gateway (Gemini access)
- **Braintrust REST API:** Prompt management + tracing
- **Binance API:** Market data (klines, tickers)
- **Supabase:** Database + Edge Functions + Auth

---

## Launch Readiness

### ✅ Production Ready
- Trader creation (AI + manual modes)
- Filter code generation (Go language)
- Filter execution (Edge Functions)
- Signal creation + Realtime broadcast
- AI analysis (Elite tier)
- Braintrust instrumentation (all LLM operations)
- Database schema with RLS
- Authentication + subscription tiers

### ⏳ Pending for Launch
- Trade execution (Go backend integration)
- Position monitoring + re-analysis
- SL/TP automation
- Exchange credentials encryption
- Live trading mode (currently demo only)

**Estimated Completion:** 70% of core workflow functional

---

## Key Files Reference

### Trader Creation
- `apps/app/src/components/TraderForm.tsx` (1000+ lines)
- `apps/app/src/services/geminiService.ts`
- `apps/app/src/services/traderManager.ts`

### LLM Proxy (Edge Function)
- `supabase/functions/llm-proxy/index.ts`
- `supabase/functions/llm-proxy/operations/generateTrader.ts`
- `supabase/functions/llm-proxy/operations/generateFilterCode.ts`
- `supabase/functions/llm-proxy/operations/generateTraderMetadata.ts`
- `supabase/functions/llm-proxy/promptLoader.v2.ts`
- `supabase/functions/llm-proxy/openRouterClient.ts`

### Filter Execution
- `supabase/functions/execute-trader/index.ts`
- `supabase/functions/trigger-executions/index.ts`
- `supabase/functions/_shared/goServerClient.ts`

### AI Analysis
- `supabase/functions/ai-analysis/index.ts`
- `supabase/functions/ai-analysis/geminiClient.ts`
- `supabase/functions/ai-analysis/promptBuilder.ts`
- `supabase/functions/ai-analysis/keyLevelCalculator.ts`

### Database
- `supabase/migrations/001_create_traders_tables.sql`
- `supabase/migrations/014_create_signal_analyses_table.sql`

### Go Backend (Pending Integration)
- `backend/go-screener/cmd/server/main.go`
- `backend/go-screener/internal/trader/executor.go`
- `backend/go-screener/internal/analysis/engine.go`
- `backend/go-screener/pkg/indicators/` (30+ indicators)

---

## Notes

- All filter code now generates **Go language** (backend will execute via Yaegi interpreter)
- Braintrust uses **REST API directly** (not SDK) to avoid SDK/REST disconnect
- Signal analysis auto-triggers for **Elite tier only** (tier gating enforced)
- Prompts cached for **5 minutes** to reduce Braintrust API calls
- All LLM operations wrapped with `traced()` for **full observability**
- **No production users yet** - launching in ~1 week
