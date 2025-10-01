# 🚀 AI Trader Terminal - Quick Start Guide

A comprehensive guide to getting started with the hybrid AI trading terminal.

---

## 📋 Prerequisites

- Go 1.21 or higher
- Git
- (Optional) Binance API keys for real trading
- (Optional) Supabase account for cloud storage
- (Optional) Fly.io account for cloud deployment

---

## ⚡ Quick Start (5 minutes)

### 1. Build the Binary

```bash
# Clone or navigate to the project
cd terminal

# Build the binary
go build -o aitrader ./cmd/aitrader

# Verify build
./aitrader --version
# Output: aitrader version 1.0.0
```

### 2. Run in Local Mode

```bash
# Set required environment variable
export USER_ID="your-user-id"

# Run the TUI
./aitrader
```

You should see a beautiful terminal interface with 7 panels showing:
- Market overview
- Active traders
- Signals
- Positions
- Performance
- Logs
- Deployment controls

Press `q` to quit.

---

## 🎯 Three Main Modes

### Mode 1: Local TUI (Development)

**Use Case**: Development, testing, local monitoring

```bash
# Minimal setup
export USER_ID="dev-user"
./aitrader

# With paper trading (default)
export USER_ID="dev-user"
export PAPER_TRADING="true"
./aitrader

# With real trading (requires API keys)
export USER_ID="dev-user"
export PAPER_TRADING="false"
export BINANCE_API_KEY="your-api-key"
export BINANCE_SECRET_KEY="your-secret-key"
./aitrader
```

**Features**:
- ✅ Beautiful TUI with 7 panels
- ✅ Local SQLite database
- ✅ Real-time WebSocket data
- ✅ Mock data for testing
- ✅ Keyboard navigation (1-7, Tab, q)

### Mode 2: Cloud Daemon (Production)

**Use Case**: 24/7 headless execution in the cloud

```bash
# Required environment variables
export USER_ID="prod-user"
export API_KEY="secure-random-key"
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"

# Optional
export BINANCE_API_KEY="your-api-key"
export BINANCE_SECRET_KEY="your-secret-key"
export LOG_LEVEL="info"

# Run as daemon
./aitrader --daemon
```

**Features**:
- ✅ Headless operation (no TUI)
- ✅ HTTP API on port 8080
- ✅ Cloud storage (Supabase)
- ✅ JSON structured logging
- ✅ API authentication
- ✅ Health checks

**API Endpoints**:
```bash
# Health check (no auth)
curl http://localhost:8080/health

# Get engine status
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:8080/status

# Get markets
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:8080/api/markets

# Get traders
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:8080/api/traders

# Get signals
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:8080/api/signals

# Get positions
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:8080/api/positions
```

### Mode 3: Deploy to Fly.io

**Use Case**: One-command cloud deployment

```bash
# Required
export USER_ID="your-user-id"

# Optional (set as Fly secrets instead)
export API_KEY="your-api-key"
export BINANCE_API_KEY="your-binance-key"
export BINANCE_SECRET_KEY="your-binance-secret"

# Deploy
./aitrader --deploy

# Follow the prompts:
# 1. Authenticate with Fly.io (if needed)
# 2. Create app (auto-generated name)
# 3. Set secrets
# 4. Deploy
```

**Features**:
- ✅ Automatic fly.toml generation
- ✅ Secret management
- ✅ Health checks configured
- ✅ Auto-restart on failure
- ✅ Global edge deployment

---

## 🔧 Configuration

### Environment Variables

#### Required
- `USER_ID` - Unique identifier for the user

#### Trading
- `PAPER_TRADING` - Enable paper trading (default: "true")
- `BINANCE_API_KEY` - Binance API key (required if PAPER_TRADING=false)
- `BINANCE_SECRET_KEY` - Binance secret key (required if PAPER_TRADING=false)

#### Storage
- `DATABASE_URL` - SQLite database path (default: "./aitrader.db")
- `SUPABASE_URL` - Supabase project URL (for cloud mode)
- `SUPABASE_ANON_KEY` - Supabase anonymous key (for cloud mode)

#### API
- `API_KEY` - API authentication key (for cloud mode)

#### Logging
- `LOG_LEVEL` - Log level: debug, info, warn, error (default: "info")

### Example Configurations

#### Development (Paper Trading)
```bash
export USER_ID="dev-001"
export PAPER_TRADING="true"
export LOG_LEVEL="debug"
export DATABASE_URL="./dev.db"
```

#### Production (Real Trading)
```bash
export USER_ID="prod-001"
export PAPER_TRADING="false"
export BINANCE_API_KEY="real-api-key"
export BINANCE_SECRET_KEY="real-secret-key"
export SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export API_KEY="secure-random-key"
export LOG_LEVEL="info"
```

---

## 📊 Storage Setup

### SQLite (Local Mode)

No setup required! SQLite database is created automatically at `./aitrader.db`.

**Schema includes**:
- `traders` - Trading strategies
- `signals` - Trading signals
- `positions` - Open/closed positions
- `heartbeats` - Machine heartbeats

**View data**:
```bash
# Install sqlite3
brew install sqlite3  # macOS
apt-get install sqlite3  # Linux

# Open database
sqlite3 aitrader.db

# List tables
.tables

# Query traders
SELECT * FROM traders;

# Query positions
SELECT * FROM positions WHERE status = 'open';
```

### Supabase (Cloud Mode)

1. **Create Supabase Project**:
   - Go to https://supabase.com
   - Create new project
   - Get your project URL and anon key

2. **Create Tables** (run in SQL editor):
```sql
-- Traders table
CREATE TABLE traders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    symbols TEXT,
    timeframes TEXT,
    check_interval TEXT,
    signal_code TEXT,
    reanalysis_interval TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Signals table
CREATE TABLE signals (
    id TEXT PRIMARY KEY,
    trader_id TEXT NOT NULL REFERENCES traders(id),
    symbol TEXT NOT NULL,
    timeframe TEXT,
    signal_type TEXT,
    status TEXT DEFAULT 'pending',
    trigger_price REAL,
    target_price REAL,
    stop_loss REAL,
    confidence INTEGER,
    reasoning TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Positions table
CREATE TABLE positions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    trader_id TEXT NOT NULL REFERENCES traders(id),
    signal_id TEXT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    entry_price REAL NOT NULL,
    current_price REAL,
    size REAL NOT NULL,
    stop_loss REAL,
    take_profit REAL,
    pnl REAL DEFAULT 0,
    pnl_pct REAL DEFAULT 0,
    status TEXT DEFAULT 'open',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    closed_at TIMESTAMP
);

-- Heartbeats table
CREATE TABLE heartbeats (
    machine_id TEXT PRIMARY KEY,
    last_seen TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_traders_user_id ON traders(user_id);
CREATE INDEX idx_traders_status ON traders(status);
CREATE INDEX idx_signals_trader_id ON signals(trader_id);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_positions_status ON positions(status);
```

3. **Configure Environment**:
```bash
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
```

---

## 🧪 Testing

### Run Tests
```bash
# All tests
go test ./... -v

# With coverage
go test ./... -cover

# Specific package
go test ./internal/engine -v
go test ./internal/storage -v
go test ./internal/helpers -v

# With race detector
go test ./... -race
```

### Test Results
```
✅ internal/engine    5 tests   18.4% coverage
✅ internal/helpers  11 tests   52.9% coverage
✅ internal/storage   2 tests   42.7% coverage
✅ Total: 18 tests, all passing
```

---

## 🐛 Troubleshooting

### Build Issues

**Problem**: `go build` fails
```bash
# Solution: Update dependencies
go mod tidy
go mod download
go build ./cmd/aitrader
```

**Problem**: Missing dependencies
```bash
# Solution: Install required packages
go get github.com/gorilla/websocket@latest
go get github.com/mattn/go-sqlite3@latest
go get github.com/traefik/yaegi@latest
go get github.com/adshao/go-binance/v2@latest
```

### Runtime Issues

**Problem**: "USER_ID environment variable is required"
```bash
# Solution: Set USER_ID
export USER_ID="your-user-id"
./aitrader
```

**Problem**: "Failed to open database"
```bash
# Solution: Check file permissions
chmod 755 .
touch aitrader.db
chmod 644 aitrader.db
```

**Problem**: "WebSocket connection failed"
```bash
# Solution: Check internet connection and firewall
# Binance WebSocket: wss://stream.binance.com:9443
curl https://api.binance.com/api/v3/ping
```

### Logs

**Enable debug logging**:
```bash
export LOG_LEVEL="debug"
./aitrader
```

**Cloud logs** (Fly.io):
```bash
flyctl logs -a your-app-name
flyctl logs -a your-app-name --follow
```

---

## 📚 Common Tasks

### Create a Trader (via SQLite)

```bash
sqlite3 aitrader.db << EOF
INSERT INTO traders (id, user_id, name, description, symbols, timeframes, check_interval, signal_code, status, created_at, updated_at)
VALUES (
    'trader-001',
    'user-123',
    'RSI Oversold',
    'Buy when RSI < 30',
    '["BTCUSDT", "ETHUSDT"]',
    '["1h"]',
    '5m',
    'func filter(ticker *Ticker, klines map[string][]*Kline) (bool, error) {
        rsi := helpers.CalculateRSI(klines["1h"], 14)
        return rsi < 30, nil
    }',
    'active',
    datetime('now'),
    datetime('now')
);
EOF
```

### Monitor Paper Trading Balance

```bash
# The balance is stored in memory
# Check via API (daemon mode):
curl -H "Authorization: Bearer $API_KEY" \
  http://localhost:8080/status | jq
```

### Check WebSocket Status

```bash
# Via API
curl http://localhost:8080/health | jq
# Output: {"status":"healthy","time":"2025-10-01T..."}
```

---

## 🔐 Security Best Practices

1. **API Keys**
   - Never commit API keys to git
   - Use environment variables or Fly secrets
   - Rotate keys regularly

2. **Database**
   - Use strong passwords for Supabase
   - Enable Row Level Security (RLS)
   - Regular backups

3. **API Authentication**
   - Always set `API_KEY` in cloud mode
   - Use long, random keys (32+ characters)
   - Store securely (env vars, secrets manager)

4. **Network**
   - Use HTTPS for API calls
   - Enable firewall rules
   - Limit access to trusted IPs

---

## 📖 Next Steps

1. **Read the Architecture** - `HYBRID_ARCHITECTURE.md`
2. **Review Implementation** - `IMPLEMENTATION_COMPLETE.md`
3. **Check Status** - `STATUS.md`
4. **Deploy to Cloud** - Follow Mode 3 above

---

## 🆘 Getting Help

- **Documentation**: See `README.md` for overview
- **Architecture**: See `HYBRID_ARCHITECTURE.md`
- **Integration**: See `INTEGRATION_GUIDE.md`
- **Code Review**: See `CODE_REVIEW.md`

---

## ⚡ Quick Reference

```bash
# Build
go build -o aitrader ./cmd/aitrader

# Run modes
./aitrader              # Local TUI
./aitrader --daemon     # Cloud daemon
./aitrader --deploy     # Deploy to Fly.io
./aitrader --monitor    # Monitor cloud (planned)

# Help
./aitrader --help
./aitrader --version

# Tests
go test ./... -v
go test ./... -cover

# Validation
go vet ./...
go build ./cmd/aitrader
```

---

**Ready to start trading! 🚀**
