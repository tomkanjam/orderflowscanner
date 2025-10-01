# Fly Machine Implementation Plan

## Already Completed (4/16 components)

✅ **go.mod** - All dependencies defined
✅ **internal/types/types.go** - All data structures
✅ **internal/indicators/helpers.go** - 30+ technical indicators
✅ **internal/storage/kline_store.go** - In-memory kline storage
✅ **internal/binance/websocket.go** - Real-time WebSocket manager

## Implementation Order

The remaining files should be implemented in this specific order due to dependencies:

### Phase 1: Foundation (Priority 1)

**1. internal/config/config.go**
- Load environment variables
- Validate configuration
- Provide defaults

**2. internal/logger/logger.go**
- Setup zerolog with timestamps
- Configure log levels
- Structured logging helpers

**3. internal/database/client.go**
- PostgreSQL connection via pgx
- Connection pooling
- CRUD operations for all tables:
  - traders: GetActiveTraders, UpdateTraderStatus, UpdateTraderError
  - signals: CreateSignal, UpdateSignal, GetWatchingSignals
  - positions: CreatePosition, UpdatePosition, GetOpenPositions
  - trades: CreateTrade, GetTrades
  - analysis_history: CreateAnalysis
- Transaction support

### Phase 2: External Integrations (Priority 2)

**4. internal/binance/client.go**
- go-binance SDK integration
- Market orders: NewOrder(symbol, side, orderType, quantity)
- Limit orders: NewLimitOrder(symbol, side, quantity, price)
- Stop orders: NewStopLossOrder, NewStopLimitOrder
- Order management: CancelOrder, GetOrder
- Account info: GetAccount, GetBalance
- Rate limiting with uber-go/ratelimit

**5. internal/events/bus.go**
- EventBus integration
- Event types:
  - "signal.triggered"
  - "analysis.completed"
  - "position.opened"
  - "position.closed"
  - "trade.executed"
- Publisher/subscriber pattern

### Phase 3: Core Trading Logic (Priority 3)

**6. internal/executor/yaegi.go**
- Load Yaegi interpreter
- Import stdlib + custom indicators
- Compile user signal code (5-20ms)
- Execute checkSignal(symbol, ticker, klines) -> bool
- Error handling and reporting
- Sandboxing (no filesystem/network access)

**7. internal/executor/trade.go**
- ExecuteTrade(position, decision) -> handles all trade types:
  - open_long, open_short
  - close, partial_close
  - scale_in, scale_out
  - flip_position
- UpdateStopLoss(position, newSL)
- UpdateTakeProfit(position, newTP)
- ReplaceOrder(position, oldOrderID, newPrice, newQty)
- Paper trading mode
- Real trading mode
- Position size calculations
- PNL calculations

**8. internal/timer/manager.go**
- TraderTimer struct with interval parsing
- Fixed interval timers (1s, 5s, 1m, etc.)
- Candle close timers (aligned to timeframes)
- AddTrader, RemoveTrader, PauseAll, ResumeAll
- executeSignalCheck(trader) - runs Yaegi code for all symbols
- Parallel symbol execution with errgroup

**9. internal/monitor/position.go**
- PositionMonitor checks every 1s
- Check SL/TP triggers
- Calculate PNL
- Auto-close on trigger
- Support trailing stops
- Update database

**10. internal/reanalysis/manager.go**
- ReanalysisManager with per-trader timers
- Fetch signals with status: watching or position_open
- Get latest market data
- Calculate indicators
- Call Supabase Edge Function (analyze-signal)
- Process decision
- Update signal/position status

### Phase 4: HTTP API (Priority 4)

**11. internal/server/http.go**
- GET /health -> HealthStatus
- GET /metrics -> operational metrics
- POST /reload-traders -> reload from database
- POST /shutdown -> graceful shutdown
- POST /prepare-shutdown -> save state, pause timers
- Middleware: logging, recovery, CORS

### Phase 5: Machine Orchestrator (Priority 5)

**12. cmd/machine/main.go**
- Load config from env
- Setup logger
- Connect to database
- Initialize kline store
- Fetch user's traders from database
- Collect unique symbols and timeframes
- Create Binance WebSocket manager
- Connect to Binance
- Start reconnect loop
- Create signal executor for each trader
- Create timer manager and start timers
- Create position monitor and start
- Create re-analysis manager and start
- Start HTTP server
- Start heartbeat (update fly_machines.last_heartbeat every 30s)
- Handle graceful shutdown (SIGTERM, SIGINT):
  - Stop timers
  - Save state
  - Close WebSocket
  - Close database
- Crash recovery: RecoverState() on startup

### Phase 6: Deployment (Priority 6)

**13. Dockerfile**
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /trader-machine ./cmd/machine

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /trader-machine .
EXPOSE 8080
CMD ["./trader-machine"]
```

**14. fly.toml**
```toml
app = "trader-machines"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[env]
  LOG_LEVEL = "info"

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1
```

**15. .dockerignore**
```
.git
*.md
.gitignore
```

**16. Makefile**
```makefile
.PHONY: build run test docker-build

build:
	go build -o trader-machine ./cmd/machine

run:
	go run ./cmd/machine

test:
	go test ./...

docker-build:
	docker build -t trader-machine:latest .

docker-run:
	docker run --env-file .env -p 8080:8080 trader-machine:latest
```

## Key Implementation Details

### Signal Detection Flow
```
Timer fires → executeSignalCheck(trader)
  ├─> Load Yaegi signal code
  ├─> Get symbols for trader
  ├─> For each symbol in parallel:
  │     ├─> Get ticker
  │     ├─> Get klines for all timeframes
  │     ├─> Run checkSignal(symbol, ticker, klines)
  │     └─> If matches:
  │           ├─> Save signal to DB (status: "new")
  │           ├─> Calculate indicators
  │           ├─> Call analyze-signal Edge Function
  │           ├─> Save analysis to DB
  │           └─> Process decision (trade executor)
  └─> Log completion time
```

### Decision Processing Flow
```
Process decision from Gemini:
  ├─> no_trade: Update signal status to "closed"
  ├─> watch: Update signal status to "watching"
  ├─> open_long/short:
  │     ├─> Execute trade (paper or real)
  │     ├─> Create position record
  │     ├─> Update signal status to "position_open"
  │     └─> Add to position monitor
  ├─> close: Execute close trade
  ├─> partial_close: Execute partial trade
  ├─> scale_in/out: Execute scaling trade
  ├─> update_stop_loss: Update SL order
  ├─> update_take_profit: Update TP order
  └─> flip_position: Close + open opposite
```

### State Recovery Flow
```
On startup:
  ├─> Check schema version compatibility
  ├─> Load active traders for user
  ├─> For each trader:
  │     ├─> Create signal executor
  │     ├─> Start signal detection timer
  │     └─> Start re-analysis timer
  ├─> Load open positions
  ├─> Add to position monitor
  ├─> Load watching signals
  └─> Resume operations
```

## Testing Strategy

1. **Unit Tests**: Test each component independently
   - Indicators: Test calculations against known values
   - Kline Store: Test CRUD operations
   - Timer: Test interval calculations
   - Trade Executor: Test position size calculations

2. **Integration Tests**: Test component interactions
   - Database: Test with real Supabase instance
   - Binance: Test with testnet
   - Event Bus: Test event flow

3. **Load Tests**: Test scalability
   - 100 traders checking 100 symbols every second
   - Memory usage monitoring
   - Database connection pool

4. **End-to-End Tests**: Full workflow
   - Signal triggers → analysis → trade execution
   - Position monitoring → SL/TP trigger
   - Re-analysis → position update

## Performance Targets

- Signal check: < 500ms for 100 symbols
- Trade execution: < 100ms
- Position monitor: Check all positions in < 100ms
- Memory: < 256MB for 20 traders
- CPU: < 50% average usage
- Database queries: < 50ms p95

## Monitoring

- Prometheus metrics export
- Key metrics:
  - Signals checked per minute
  - Signals triggered per hour
  - Trade execution success rate
  - WebSocket uptime
  - Database query latency
  - Memory/CPU usage

## Security

- API keys encrypted in database
- Read-only access to user's data (RLS)
- Yaegi sandboxing (no syscalls)
- Rate limiting on expensive operations
- Input validation on all external data

## Deployment Checklist

- [ ] All tests passing
- [ ] Docker image builds successfully
- [ ] Health check returns 200
- [ ] Connects to Supabase successfully
- [ ] Connects to Binance successfully
- [ ] Loads traders from database
- [ ] Executes signal checks
- [ ] Saves state to database
- [ ] Graceful shutdown works
- [ ] Crash recovery works
- [ ] Memory usage within limits
- [ ] CPU usage within limits
- [ ] Monitoring metrics available

## Current Status: 31% Complete (5/16 components)

Priority 1 (Foundation) should be implemented next.
