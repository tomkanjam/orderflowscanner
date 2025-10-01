# 🔌 Integration Guide: Mock → Real Data

## Current State: Mock Data

The terminal UI currently shows **simulated data** for demonstration. Here's how to connect it to real trading infrastructure.

## Option 1: Connect to Fly Machine Backend ⭐ (Recommended)

The Fly machine backend (`fly-machine/`) has all the real infrastructure:
- ✅ Live Binance WebSocket
- ✅ Database integration
- ✅ Real signal execution
- ✅ Position tracking
- ✅ AI analysis

### Architecture:
```
Terminal UI (TUI)  ←→  Fly Machine Backend  ←→  Binance API
     ↓                        ↓                       ↓
  Display              Business Logic           Market Data
```

### Implementation Steps:

#### 1. Add WebSocket Client to TUI
```go
// terminal/internal/client/websocket.go
package client

import (
    "github.com/gorilla/websocket"
)

type Client struct {
    conn *websocket.Conn
    url  string
}

func NewClient(url string) (*Client, error) {
    conn, _, err := websocket.DefaultDialer.Dial(url, nil)
    if err != nil {
        return nil, err
    }

    return &Client{
        conn: conn,
        url:  url,
    }, nil
}

func (c *Client) SubscribeMarketData() (<-chan MarketUpdate, error) {
    updates := make(chan MarketUpdate)

    go func() {
        for {
            var update MarketUpdate
            err := c.conn.ReadJSON(&update)
            if err != nil {
                close(updates)
                return
            }
            updates <- update
        }
    }()

    return updates, nil
}
```

#### 2. Update TUI Model
```go
// terminal/internal/tui/model.go
type Model struct {
    // ... existing fields

    // Add real data client
    client *client.Client
    marketUpdates <-chan client.MarketUpdate
}

func New(backendURL string) Model {
    client, _ := client.NewClient(backendURL)
    updates, _ := client.SubscribeMarketData()

    return Model{
        client: client,
        marketUpdates: updates,
        // ... rest
    }
}
```

#### 3. Update Event Handler
```go
// terminal/internal/tui/update.go
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {

    case client.MarketUpdate:
        // Update markets with real data
        for i := range m.markets {
            if m.markets[i].Symbol == msg.Symbol {
                m.markets[i].Price = msg.Price
                m.markets[i].Change24h = msg.Change24h
            }
        }
        return m, waitForMarketUpdate(m.marketUpdates)

    // ... rest
}
```

---

## Option 2: Direct Binance Integration

Connect TUI directly to Binance without backend:

### Add Binance Client
```go
// terminal/internal/binance/client.go
package binance

import (
    "github.com/adshao/go-binance/v2"
    "github.com/gorilla/websocket"
)

type StreamClient struct {
    symbols []string
    streams map[string]*websocket.Conn
}

func NewStreamClient(symbols []string) *StreamClient {
    return &StreamClient{
        symbols: symbols,
        streams: make(map[string]*websocket.Conn),
    }
}

func (sc *StreamClient) SubscribePrices() (<-chan PriceUpdate, error) {
    updates := make(chan PriceUpdate)

    for _, symbol := range sc.symbols {
        go sc.subscribeTicker(symbol, updates)
    }

    return updates, nil
}

func (sc *StreamClient) subscribeTicker(symbol string, updates chan<- PriceUpdate) {
    endpoint := fmt.Sprintf("wss://stream.binance.com:9443/ws/%s@ticker",
        strings.ToLower(symbol))

    conn, _, err := websocket.DefaultDialer.Dial(endpoint, nil)
    if err != nil {
        return
    }

    for {
        var msg map[string]interface{}
        err := conn.ReadJSON(&msg)
        if err != nil {
            return
        }

        price, _ := strconv.ParseFloat(msg["c"].(string), 64)
        change, _ := strconv.ParseFloat(msg["p"].(string), 64)

        updates <- PriceUpdate{
            Symbol: symbol,
            Price:  price,
            Change: change,
        }
    }
}
```

### Update Main
```go
// terminal/cmd/aitrader/main.go
func main() {
    // Initialize Binance client
    symbols := []string{"BTCUSDT", "ETHUSDT", "SOLUSDT"}
    binanceClient := binance.NewStreamClient(symbols)
    priceUpdates, _ := binanceClient.SubscribePrices()

    // Create TUI with real data
    m := tui.NewWithBinance(priceUpdates)

    p := tea.NewProgram(m, tea.WithAltScreen())
    p.Run()
}
```

---

## Option 3: Hybrid Approach (Database + WebSocket)

Use existing Supabase backend with direct Binance feed:

### Architecture:
```
Terminal UI
├── Binance WebSocket (live prices)
├── Supabase Database (traders, signals, positions)
└── Gemini API (AI analysis)
```

### Implementation:
```go
// terminal/internal/data/provider.go
package data

import (
    "github.com/supabase-community/supabase-go"
)

type DataProvider struct {
    supabase *supabase.Client
    binance  *binance.StreamClient
}

func NewDataProvider(supabaseURL, supabaseKey string) *DataProvider {
    sb := supabase.CreateClient(supabaseURL, supabaseKey)
    bc := binance.NewStreamClient([]string{"BTCUSDT", "ETHUSDT"})

    return &DataProvider{
        supabase: sb,
        binance:  bc,
    }
}

func (dp *DataProvider) GetTraders(userID string) ([]Trader, error) {
    var traders []Trader
    err := dp.supabase.DB.
        From("traders").
        Select("*").
        Eq("user_id", userID).
        Execute(&traders)

    return traders, err
}

func (dp *DataProvider) StreamPrices() <-chan PriceUpdate {
    return dp.binance.SubscribePrices()
}
```

---

## Quick Start: Real Data Integration

### Step 1: Choose Integration Method

**For Full Backend (Recommended):**
```bash
# 1. Start Fly machine backend
cd fly-machine
go run cmd/machine/main.go

# 2. Update TUI to connect
export BACKEND_URL="http://localhost:8080"
cd ../terminal
go run cmd/aitrader/main.go
```

**For Direct Binance:**
```bash
# Add Binance SDK
cd terminal
go get github.com/adshao/go-binance/v2
go get github.com/gorilla/websocket

# Run with Binance integration
go run cmd/aitrader/main.go --mode=live
```

### Step 2: Add Environment Variables

Create `terminal/.env`:
```bash
# For Backend Integration
BACKEND_URL=http://localhost:8080
BACKEND_WS=ws://localhost:8080/ws

# For Direct Integration
BINANCE_API_KEY=your_api_key
BINANCE_SECRET_KEY=your_secret_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
USER_ID=your_user_id

# Mode
MODE=live  # or 'demo' for mock data
```

### Step 3: Update Model Initialization

```go
// terminal/cmd/aitrader/main.go
func main() {
    // Load config
    mode := os.Getenv("MODE")

    var m tui.Model

    if mode == "live" {
        // Real data
        backendURL := os.Getenv("BACKEND_URL")
        m = tui.NewWithBackend(backendURL)
    } else {
        // Mock data (current)
        m = tui.New()
    }

    p := tea.NewProgram(m, tea.WithAltScreen())
    p.Run()
}
```

---

## Data Flow: Mock vs Real

### Current (Mock):
```
tickMsg (100ms) → Update prices in memory → Refresh UI
```

### Real (Backend):
```
WebSocket → Market data → Update model → Refresh UI
          → Signal check → AI analysis → Position update
```

### Real (Direct):
```
Binance WS → Price updates → Update UI
Supabase → Traders/Signals/Positions → Update UI
Gemini API → AI analysis → Update UI
```

---

## Implementation Checklist

### Phase 1: Live Prices
- [ ] Add WebSocket client package
- [ ] Connect to Binance or backend
- [ ] Update model with real prices
- [ ] Replace mock tick with real updates

### Phase 2: Real Traders
- [ ] Connect to Supabase database
- [ ] Load actual traders from DB
- [ ] Display real trader status
- [ ] Update last check times

### Phase 3: Real Signals
- [ ] Subscribe to signal events
- [ ] Display actual signals from backend
- [ ] Show real AI confidence
- [ ] Update signal status

### Phase 4: Real Positions
- [ ] Load open positions from DB
- [ ] Calculate real-time P&L
- [ ] Monitor SL/TP triggers
- [ ] Update position status

### Phase 5: AI Integration
- [ ] Connect to Gemini API
- [ ] Stream AI analysis
- [ ] Display real reasoning
- [ ] Update confidence scores

---

## Development Workflow

### 1. Local Development (Mock)
```bash
cd terminal
MODE=demo go run cmd/aitrader/main.go
```

### 2. Local Testing (Real)
```bash
# Start backend
cd fly-machine
go run cmd/machine/main.go

# Start TUI
cd ../terminal
MODE=live BACKEND_URL=http://localhost:8080 go run cmd/aitrader/main.go
```

### 3. Production (Real)
```bash
# Deploy backend to Fly.io
cd fly-machine
fly deploy

# Run TUI connecting to production
cd ../terminal
MODE=live BACKEND_URL=https://your-machine.fly.dev aitrader
```

---

## Next Steps

1. **Quick Win**: Add live Binance prices (1 hour)
2. **Medium**: Connect to Supabase for traders/signals (2-3 hours)
3. **Full Integration**: Backend + TUI (4-6 hours)

Want me to implement any of these options?
