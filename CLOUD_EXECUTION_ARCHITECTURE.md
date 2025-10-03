# Cloud Execution Architecture 📋

**Date:** 2025-10-03
**Purpose:** Document how cloud execution works vs browser execution

---

## Question 1: Where does the machine get kline data from?

### Answer: Directly from Binance WebSocket Streams

The Fly machine connects **directly to Binance** using its own WebSocket client, completely independent of the browser.

### Data Flow

**Fly Machine:**
```
Fly Machine
    ↓
BinanceWebSocketClient (ws package)
    ↓
wss://stream.binance.com:9443
    ↓
Combined stream: ticker + kline data
```

**Browser (for comparison):**
```
Browser
    ↓
binanceService.ts (native WebSocket)
    ↓
wss://stream.binance.com:9443
    ↓
Combined stream: ticker + kline data
```

### Implementation Details

**File:** `server/fly-machine/services/BinanceWebSocketClient.ts`

**Connection:**
```typescript
const WS_BASE_URL = 'wss://stream.binance.com:9443';

async connect(symbols: string[], interval: KlineInterval = '5m'): Promise<void> {
  // Build combined stream URL
  const streams = this.buildStreamNames(this.symbols, this.interval);
  const url = `${WS_BASE_URL}/stream?streams=${streams.join('/')}`;

  this.ws = new WebSocket(url);
}
```

**Stream Building (Lines 108-120):**
```typescript
private buildStreamNames(symbols: string[], interval: KlineInterval): string[] {
  const streams: string[] = [];

  symbols.forEach(symbol => {
    const lowerSymbol = symbol.toLowerCase();
    // Add ticker stream for price/volume updates
    streams.push(`${lowerSymbol}@ticker`);
    // Add kline stream for candlestick data
    streams.push(`${lowerSymbol}@kline_${interval}`);
  });

  return streams;
}
```

**Example Stream URL:**
```
wss://stream.binance.com:9443/stream?streams=
  btcusdt@ticker/btcusdt@kline_5m/
  ethusdt@ticker/ethusdt@kline_5m/
  bnbusdt@ticker/bnbusdt@kline_5m
```

**Message Handling (Lines 122-133):**
```typescript
private handleMessage(message: any): void {
  if (!message.stream || !message.data) return;

  const stream = message.stream as string;
  const data = message.data;

  if (stream.endsWith('@ticker')) {
    this.handleTickerUpdate(data);    // Price, volume, 24h change
  } else if (stream.includes('@kline_')) {
    this.handleKlineUpdate(data);     // OHLCV candlestick data
  }
}
```

**Kline Data Structure (Lines 150-169):**
```typescript
private handleKlineUpdate(data: any): void {
  const kline = data.k;
  const symbol = kline.s;
  const interval = kline.i as KlineInterval;
  const isClosed = kline.x;  // Is this candle closed?

  const klineData: Kline = [
    kline.t,     // Open time (timestamp)
    kline.o,     // Open price
    kline.h,     // High price
    kline.l,     // Low price
    kline.c,     // Close price
    kline.v,     // Volume
    kline.T,     // Close time
    kline.q,     // Quote asset volume
    kline.n,     // Number of trades
    kline.V,     // Taker buy base asset volume
    kline.Q,     // Taker buy quote asset volume
    '0'          // Ignore (placeholder)
  ];

  // Store in Map<symbol, Map<interval, Kline[]>>
  this.klines.set(symbol, intervalMap);
}
```

### Key Points

1. **Independent Connection**: Fly machine has its own WebSocket connection to Binance
2. **Same Data Source**: Both browser and cloud use identical Binance streams
3. **Real-time Updates**: Kline data updates in real-time as candles form
4. **Multi-timeframe Support**: Can subscribe to 1m, 5m, 15m, 1h intervals
5. **Efficient Storage**: Uses Map structure for O(1) lookups by symbol/interval

---

## Question 2: Are there deploy settings for individual traders?

### Answer: No - All traders run in the same environment

**Current Architecture: All-or-Nothing**

```
Elite User
    ↓
Has 1 Fly Machine (per user)
    ↓
Machine runs ALL enabled traders
    ↓
Browser or Cloud (not per-trader)
```

### How It Works

**Trader Loading (Orchestrator.ts:245-259):**
```typescript
private async reloadTraders(): Promise<void> {
  console.log('[Orchestrator] Loading traders from database...');

  // Loads ALL enabled traders for this user
  const traders = await this.synchronizer.loadTraders();
  this.traders = traders as CloudTrader[];

  console.log(`[Orchestrator] Loaded ${this.traders.length} traders`);
}
```

**Database Query (StateSynchronizer.ts:279):**
```typescript
async loadTraders(): Promise<any[]> {
  const { data, error } = await this.supabase
    .from('traders')
    .select('*')
    .eq('user_id', this.userId)
    .eq('enabled', true)           // ✅ Only enabled traders
    .order('created_at', { ascending: false });

  console.log(`[StateSynchronizer] Loaded ${data?.length || 0} traders`);
  return data || [];
}
```

**Screening Loop (Orchestrator.ts:272-284):**
```typescript
private async runScreening(): Promise<void> {
  if (this.traders.length === 0) {
    return; // No traders to screen
  }

  // Get current market data (same for all traders)
  const marketData = this.binance.getMarketData();

  // Execute ALL trader filters in parallel
  const results = await this.screener.screen(
    this.traders,      // All enabled traders
    marketData
  );
}
```

### Traders Table Schema

```sql
CREATE TABLE traders (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,        -- ✅ Controls if trader runs
  mode TEXT CHECK (mode IN ('demo', 'live')) DEFAULT 'demo',
  exchange_config JSONB,
  filter JSONB NOT NULL,               -- Filter code and config
  strategy JSONB NOT NULL,             -- Strategy metadata
  metrics JSONB NOT NULL DEFAULT '{}',
  user_id UUID REFERENCES auth.users(id),  -- ✅ User ownership
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Fields:**
- `enabled`: If false, trader is skipped (both browser and cloud)
- `user_id`: Determines which Fly machine loads this trader
- `mode`: 'demo' or 'live' (not related to cloud vs browser)

**No Cloud-Specific Fields:**
- ❌ No `run_on_cloud` column
- ❌ No `execution_mode` column
- ❌ No `deployment_target` column

### Where Execution Happens

**Browser Execution:**
- Runs in user's browser tab
- Uses local WebSocket connection to Binance
- Filtered by: `enabled = true`

**Cloud Execution (Fly):**
- Runs on dedicated Fly machine
- Uses machine's WebSocket connection to Binance
- Filtered by: `user_id = USER_ID AND enabled = true`

**Both run THE SAME traders** (all enabled ones for that user)

### Current Limitations

1. **No Per-Trader Deployment Control**
   - Cannot specify "run trader A in cloud, trader B in browser"
   - It's all or nothing based on which environment is active

2. **Single Machine Per User**
   - Elite user gets 1 Fly machine
   - Machine runs all their enabled traders
   - No way to split traders across multiple machines

3. **No Selective Cloud Execution**
   - If cloud machine is running, it screens ALL enabled traders
   - If browser is open, it screens ALL enabled traders
   - They could run simultaneously (duplicate signals)

### Potential Future Enhancement

If you wanted per-trader deployment control, you'd need:

```sql
-- Hypothetical schema addition
ALTER TABLE traders
ADD COLUMN execution_mode TEXT
CHECK (execution_mode IN ('browser', 'cloud', 'both'))
DEFAULT 'both';

CREATE INDEX idx_traders_execution_mode ON traders(execution_mode);
```

Then modify queries:
```typescript
// Browser would filter:
.eq('enabled', true)
.in('execution_mode', ['browser', 'both'])

// Cloud would filter:
.eq('enabled', true)
.in('execution_mode', ['cloud', 'both'])
```

But this is **NOT currently implemented**.

---

## Summary

### Question 1: Where does Fly machine get kline data?
**Answer:** Directly from Binance WebSocket streams (`wss://stream.binance.com:9443`), completely independent of the browser. Same data source, separate connection.

### Question 2: Per-trader deployment settings?
**Answer:** No. All enabled traders run in whichever environment is active (browser or cloud). No way to specify "trader A runs in cloud, trader B runs in browser" - it's all-or-nothing per environment.

**Current Model:**
```
User Environment:
  Browser Open → Runs all enabled traders in browser
  Cloud Machine → Runs all enabled traders on Fly
  Both Active → Duplicates (both environments run all traders)
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         ELITE USER                               │
└────────────┬───────────────────────────────────┬─────────────────┘
             │                                   │
    ┌────────▼────────┐                 ┌────────▼────────┐
    │  BROWSER ENV    │                 │   FLY MACHINE   │
    │                 │                 │                 │
    │  • Local WS     │                 │  • Server WS    │
    │  • UI Active    │                 │  • Headless     │
    └────────┬────────┘                 └────────┬────────┘
             │                                   │
             └──────────────┬────────────────────┘
                            │
                   ┌────────▼────────┐
                   │   SUPABASE DB   │
                   │                 │
                   │  SELECT *       │
                   │  FROM traders   │
                   │  WHERE:         │
                   │    user_id=X    │
                   │    enabled=true │
                   └────────┬────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
         ┌────▼────┐                 ┌────▼────┐
         │ Trader 1│                 │ Trader 2│
         │ enabled │                 │ enabled │
         └─────────┘                 └─────────┘
              │                           │
              └──────────┬────────────────┘
                         │
                    ┌────▼────┐
                    │ Binance │
                    │   WS    │
                    └─────────┘

Both environments:
- Connect to same Binance WS
- Load same enabled traders
- Run in parallel (if both active)
```

---

## Related Files

**Fly Machine:**
- `server/fly-machine/index.ts` - Entry point, environment setup
- `server/fly-machine/Orchestrator.ts` - Main coordinator
- `server/fly-machine/services/BinanceWebSocketClient.ts` - Binance connection
- `server/fly-machine/services/StateSynchronizer.ts` - Database sync, trader loading

**Database:**
- `supabase/migrations/001_create_traders_tables.sql` - Traders schema

**Browser:**
- `apps/app/src/services/binanceService.ts` - Browser Binance connection
- `apps/app/src/hooks/useSignalLifecycle.ts` - Browser trader execution
