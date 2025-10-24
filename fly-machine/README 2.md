# Fly.io Trading Machine

Go-based trading machine that runs dedicated per-user instances for AI-powered crypto trading.

## Implementation Status

### ✅ Completed Components

1. **Core Types** (`internal/types/types.go`)
   - All data structures for traders, signals, positions, trades
   - Configuration, health status, market data types

2. **Technical Indicators** (`internal/indicators/helpers.go`)
   - 30+ indicators ported from TypeScript screenerHelpers
   - Trend: SMA, EMA, WMA, VWAP
   - Momentum: RSI, MACD, Stochastic, CCI, Williams%R, ROC
   - Volatility: Bollinger Bands, ATR, Keltner Channels, Donchian Channels
   - Volume: OBV, Volume MA, Volume Change
   - Trend Strength: ADX, Aroon
   - Price Action helpers

3. **Kline Storage** (`internal/storage/kline_store.go`)
   - Thread-safe in-memory storage
   - Automatic trimming to max length
   - Symbol/timeframe indexing
   - Statistics and monitoring

4. **Binance WebSocket** (`internal/binance/websocket.go`)
   - Real-time kline and ticker streams
   - Automatic reconnection with exponential backoff
   - Heartbeat/ping mechanism
   - Dynamic symbol/timeframe updates

## 🚧 Remaining Components to Implement

### High Priority

1. **Database Client** (`internal/database/client.go`)
   ```go
   - Connect to Supabase Postgres via pgx
   - CRUD operations for all tables (traders, signals, positions, trades)
   - Transaction support
   - Connection pooling
   ```

2. **Binance REST Client** (`internal/binance/client.go`)
   ```go
   - Trade execution (market, limit, stop orders)
   - Order management (cancel, replace, update)
   - Account information
   - Rate limiting
   ```

3. **Yaegi Signal Executor** (`internal/executor/yaegi.go`)
   ```go
   - Load and compile user signal code
   - Inject helper functions from indicators package
   - Execute checkSignal() function
   - Error handling and sandboxing
   ```

4. **Timer Management** (`internal/timer/manager.go`)
   ```go
   - Fixed interval timers (1s, 5s, 1m, etc.)
   - Candle close timers (aligned to timeframes)
   - Per-trader timer lifecycle
   - Pause/resume capability
   ```

5. **Trade Executor** (`internal/executor/trade.go`)
   ```go
   - All trade operations (open, close, scale in/out, flip, etc.)
   - Order management (update SL/TP, cancel, replace)
   - Paper and real trading modes
   - Position size calculations
   ```

6. **Position Monitor** (`internal/monitor/position.go`)
   ```go
   - Check SL/TP triggers every second
   - Trailing stop implementation
   - Auto-close on triggers
   - PNL calculations
   ```

7. **Re-analysis Manager** (`internal/reanalysis/manager.go`)
   ```go
   - Periodic re-analysis of watching signals
   - Position updates for open trades
   - Call Gemini via Supabase Edge Function
   - Decision processing
   ```

8. **HTTP Server** (`internal/server/http.go`)
   ```go
   - Health check endpoint
   - Metrics endpoint
   - Reload traders endpoint
   - Shutdown endpoint
   - Prepare shutdown endpoint
   ```

9. **Machine Orchestrator** (`cmd/machine/main.go`)
   ```go
   - Initialize all components
   - Load traders from database
   - Start WebSocket connections
   - Start all timers and monitors
   - Graceful shutdown
   - State recovery
   ```

### Supporting Files

10. **Configuration** (`internal/config/config.go`)
    ```go
    - Load from environment variables
    - Validation
    - Defaults
    ```

11. **Event Bus** (`internal/events/bus.go`)
    ```go
    - Signal triggered event
    - Analysis completed event
    - Position opened/closed events
    - Trade executed event
    ```

12. **Logger Setup** (`internal/logger/logger.go`)
    ```go
    - Zerolog configuration
    - Structured logging with timestamps
    - Log levels
    ```

## Project Structure

```
fly-machine/
├── cmd/
│   └── machine/
│       └── main.go                 # Entry point
├── internal/
│   ├── types/
│   │   └── types.go               # ✅ Data structures
│   ├── indicators/
│   │   └── helpers.go             # ✅ Technical indicators
│   ├── storage/
│   │   └── kline_store.go         # ✅ Kline storage
│   ├── binance/
│   │   ├── websocket.go           # ✅ WebSocket manager
│   │   └── client.go              # 🚧 REST client
│   ├── database/
│   │   └── client.go              # 🚧 Database operations
│   ├── executor/
│   │   ├── yaegi.go               # 🚧 Signal code executor
│   │   └── trade.go               # 🚧 Trade executor
│   ├── timer/
│   │   └── manager.go             # 🚧 Timer system
│   ├── monitor/
│   │   └── position.go            # 🚧 Position monitor
│   ├── reanalysis/
│   │   └── manager.go             # 🚧 Re-analysis manager
│   ├── server/
│   │   └── http.go                # 🚧 HTTP server
│   ├── events/
│   │   └── bus.go                 # 🚧 Event system
│   ├── config/
│   │   └── config.go              # 🚧 Configuration
│   └── logger/
│       └── logger.go              # 🚧 Logger setup
├── go.mod                          # ✅ Dependencies
├── Dockerfile                      # 🚧 Docker image
├── fly.toml                        # 🚧 Fly.io config
└── README.md                       # ✅ This file
```

## Building

```bash
cd fly-machine

# Download dependencies
go mod download

# Build binary
go build -o trader-machine ./cmd/machine

# Run locally
./trader-machine
```

## Environment Variables

```bash
USER_ID=<uuid>                      # User ID from Supabase
SUPABASE_URL=<url>                   # Supabase project URL
SUPABASE_ANON_KEY=<key>              # Supabase anon key
DATABASE_URL=<url>                   # Postgres connection string
MACHINE_ID=<id>                      # Fly machine ID
VERSION=v1.0.0                       # Version tag
LOG_LEVEL=info                       # Log level
PAPER_TRADING_ONLY=true              # Paper trading mode
```

## Next Steps

1. Run `go mod tidy` to ensure all dependencies are correct
2. Implement remaining components in priority order
3. Test each component individually
4. Integration testing with Supabase
5. Load testing with multiple traders
6. Deploy to Fly.io

## Development Notes

- All timestamps use RFC3339 format as per CLAUDE.md
- Use zerolog for structured logging
- Event-driven architecture with EventBus
- State persisted to Supabase at every step
- Graceful shutdown with state saving
- Automatic crash recovery
