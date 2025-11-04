# Supabase Edge Functions

## Architecture

The application uses **Go backend for filter execution** with event-driven architecture:

- **Production execution**: `backend/go-screener/internal/trader/executor.go`
- **Event-driven**: Triggered by WebSocket candle close events
- **Filter language**: Go code executed via Yaegi interpreter
- **Real-time**: Signals generated instantly on candle close

### Edge Functions

Edge Functions in this directory provide auxiliary services:

1. **llm-proxy**: LLM API proxy for AI analysis and signal generation
2. **start-trader**: Start/stop trader execution via Go backend API
3. **Other functions**: Authentication, webhooks, etc.

## Filter Execution Architecture

**Event-Driven Go Backend (Production):**

```
Binance WebSocket → Candle Close Event
          ↓
    EventBus Broadcast
          ↓
  Go Backend Executor
          ↓
  Yaegi Interpreter (Go filter code)
          ↓
  Save signals to database
          ↓
  Trigger AI analysis (Elite tier)
```

**Key features:**
- Event-driven via WebSocket candle closes
- Go filters with type safety
- WebSocket-fed cache (no REST polling)
- Efficient, scalable, real-time
- ~1 second execution per 100 symbols

**Location:** `backend/go-screener/internal/trader/executor.go:188-360`

## Setup

### 1. Install Supabase CLI

```bash
brew install supabase/tap/supabase
```

### 2. Link to your project

```bash
supabase link --project-ref your-project-ref
```

### 3. Set environment secrets

```bash
# LLM API keys for AI analysis
supabase secrets set OPENROUTER_API_KEY="your-key"
supabase secrets set BRAINTRUST_API_KEY="your-key"

# Go backend API URL
supabase secrets set GO_BACKEND_URL="https://your-backend.fly.dev"
```

### 4. Deploy functions

```bash
# Deploy all functions
supabase functions deploy

# Or deploy individually
supabase functions deploy llm-proxy
supabase functions deploy start-trader
```

## Testing

### Test Edge Functions locally

```bash
# Start local Supabase stack
supabase start

# Serve functions
supabase functions serve --env-file ./supabase/.env.local

# Test in another terminal
curl -i --location --request POST 'http://localhost:54321/functions/v1/llm-proxy' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"operation":"analyzeSignal","data":{...}}'
```

## Monitoring

View function logs:

```bash
supabase functions logs llm-proxy
supabase functions logs start-trader
```

Or use the Supabase Dashboard:
- Functions → Select function → Logs tab

## Performance

**Go Backend Execution:**
- Real-time candle close triggers (no polling)
- ~1 second per 100 symbols
- WebSocket cache (99%+ hit rate)
- Parallel processing with worker pools

**Edge Functions:**
- Used for AI operations and API proxying
- 10s timeout (increase if needed)
- 256MB memory limit (increase if needed)

## Cost Optimization

**Event-driven execution is extremely efficient:**
- Only executes on actual candle closes (not polling)
- 1m candles: 60x reduction vs per-second polling
- 5m candles: 300x reduction
- 15m candles: 900x reduction
- 1h candles: 3600x reduction

**Average reduction:** ~460x fewer executions compared to constant polling

## Migration Notes

**Legacy System (Sept 2025 - Removed Nov 2025):**
- Timer-based Edge Functions (`execute-trader`, `trigger-executions`)
- JavaScript filter execution
- REST API polling

**Current System (Oct 2025+):**
- Event-driven Go backend
- Go filter execution via Yaegi
- WebSocket real-time updates
- Significantly better performance and reliability
