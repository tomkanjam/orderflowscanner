# 📚 AI Trader Terminal - Code Examples

Real-world code examples for using the hybrid trading terminal.

---

## 🏗️ Architecture Examples

### Creating a New Engine Instance

```go
package main

import (
    "github.com/yourusername/aitrader-tui/internal/engine"
)

func main() {
    // Configure engine
    cfg := engine.Config{
        UserID:           "user-123",
        PaperTradingOnly: true,
        BinanceAPIKey:    "",  // Not needed for paper trading
        BinanceSecretKey: "",
        DatabaseURL:      "./trading.db",
        Mode:             engine.ModeLocal,
    }

    // Create engine
    e := engine.New(cfg)

    // Start engine (initializes all components)
    if err := e.Start(); err != nil {
        panic(err)
    }

    // Engine is now running with:
    // ✅ WebSocket connected to Binance
    // ✅ SQLite database initialized
    // ✅ All traders loaded and scheduled
    // ✅ All positions monitored

    // Get status
    status := e.GetStatus()
    // status["running"] = true
    // status["active_traders"] = 5
    // status["open_positions"] = 2

    // Graceful shutdown
    defer e.Stop()
}
```

---

## 🔌 WebSocket Examples

### Subscribing to Market Data

```go
package main

import (
    "fmt"
    "github.com/yourusername/aitrader-tui/internal/websocket"
)

func main() {
    // Create WebSocket manager
    wsManager := websocket.NewManager()
    wsManager.Start()
    defer wsManager.Stop()

    // Subscribe to ticker updates (price changes)
    symbols := []string{"BTCUSDT", "ETHUSDT", "BNBUSDT"}
    if err := wsManager.SubscribeTickers(symbols); err != nil {
        panic(err)
    }

    // Subscribe to kline updates (candlesticks)
    intervals := []string{"1m", "5m", "1h"}
    if err := wsManager.SubscribeKlines("BTCUSDT", intervals); err != nil {
        panic(err)
    }

    // Get current snapshot
    snapshot := wsManager.GetSnapshot()
    fmt.Printf("Tracking %d symbols\n", len(snapshot.Symbols))

    // Get specific ticker
    btcTicker := snapshot.Tickers["BTCUSDT"]
    fmt.Printf("BTC Price: %s\n", btcTicker.LastPrice)

    // Get klines for a symbol and interval
    btc1hKlines := snapshot.Klines["BTCUSDT"]["1h"]
    fmt.Printf("BTC 1h klines: %d candles\n", len(btc1hKlines))
}
```

### Processing Real-time Events

```go
package main

import (
    "fmt"
    "github.com/yourusername/aitrader-tui/internal/websocket"
    "github.com/yourusername/aitrader-tui/internal/types"
)

func main() {
    wsManager := websocket.NewManager()
    wsManager.Start()
    defer wsManager.Stop()

    wsManager.SubscribeTickers([]string{"BTCUSDT"})

    // Get event channel
    eventChan := wsManager.GetEventChannel()

    // Process events
    for event := range eventChan {
        switch event.Type {
        case "ticker":
            if ticker, ok := event.Data.(*types.Ticker); ok {
                fmt.Printf("BTC: %s USDT\n", ticker.LastPrice)
            }

        case "kline":
            if kline, ok := event.Data.(*types.Kline); ok {
                fmt.Printf("New candle: O:%s H:%s L:%s C:%s\n",
                    kline.Open, kline.High, kline.Low, kline.Close)
            }

        case "error":
            fmt.Printf("Error: %s\n", event.Error)
        }
    }
}
```

---

## 🎯 Filter Executor Examples

### Creating a Simple RSI Filter

```go
package main

import (
    "fmt"
    "github.com/yourusername/aitrader-tui/internal/filter"
    "github.com/yourusername/aitrader-tui/internal/types"
    "time"
)

func main() {
    executor := filter.NewExecutor()

    // Create a trader with RSI filter
    trader := &types.Trader{
        ID:     "rsi-trader",
        UserID: "user-123",
        Name:   "RSI Oversold",
        Filter: types.TraderFilter{
            Code: `
                func filter(ticker *types.Ticker, klines map[string][]*types.Kline) (bool, error) {
                    // Get 1h klines
                    klines1h := klines["1h"]
                    if len(klines1h) < 14 {
                        return false, nil
                    }

                    // Calculate RSI
                    rsi := helpers.CalculateRSI(klines1h, 14)

                    // Buy when oversold (RSI < 30)
                    return rsi < 30, nil
                }
            `,
            Timeframes: []string{"1h"},
        },
        CheckIntervalSec: 300, // Check every 5 minutes
        CreatedAt:        time.Now(),
        UpdatedAt:        time.Now(),
    }

    // Compile the filter
    if err := executor.CompileFilter(trader); err != nil {
        panic(err)
    }

    // Execute against market data
    // (Assume marketData is obtained from WebSocket manager)
    result, err := executor.ExecuteFilter(trader, marketData)
    if err != nil {
        panic(err)
    }

    fmt.Printf("Matches found: %d\n", len(result.Matches))
    for _, symbol := range result.Matches {
        fmt.Printf("  - %s\n", symbol)
    }
}
```

### Multi-Indicator Filter

```go
trader := &types.Trader{
    ID:     "multi-indicator",
    UserID: "user-123",
    Name:   "SMA Crossover + RSI",
    Filter: types.TraderFilter{
        Code: `
            func filter(ticker *types.Ticker, klines map[string][]*types.Kline) (bool, error) {
                klines1h := klines["1h"]
                if len(klines1h) < 50 {
                    return false, nil
                }

                // Calculate indicators
                sma20 := helpers.CalculateSMA(klines1h, 20)
                sma50 := helpers.CalculateSMA(klines1h, 50)
                rsi := helpers.CalculateRSI(klines1h, 14)

                // Current price
                price := helpers.ParseFloat(ticker.LastPrice)

                // Entry conditions:
                // 1. Price above both SMAs (uptrend)
                // 2. SMA20 above SMA50 (bullish crossover)
                // 3. RSI between 40-60 (not overbought/oversold)
                uptrend := price > sma20 && price > sma50
                crossover := sma20 > sma50
                rsiOk := rsi > 40 && rsi < 60

                return uptrend && crossover && rsiOk, nil
            }
        `,
        Timeframes: []string{"1h"},
    },
}
```

---

## 💼 Trading Examples

### Executing a Paper Trade

```go
package main

import (
    "context"
    "fmt"
    "github.com/yourusername/aitrader-tui/internal/trade"
    "github.com/yourusername/aitrader-tui/internal/storage"
    "github.com/yourusername/aitrader-tui/internal/types"
)

func main() {
    // Create storage
    store, _ := storage.NewSQLiteStorage("./trading.db")
    defer store.Close()

    // Create trade executor (paper trading mode)
    executor := trade.NewExecutor(store, true, "", "")
    executor.Start()
    defer executor.Stop()

    // Create a signal
    signal := &types.Signal{
        ID:         "signal-001",
        TraderID:   "trader-001",
        UserID:     "user-123",
        Symbol:     "BTCUSDT",
        Status:     types.SignalStatusReady,
        EntryPrice: 43000.0,
        StopLoss:   42000.0,
        TakeProfit: 45000.0,
    }

    // Execute entry
    quantity := 0.1 // Buy 0.1 BTC
    currentPrice := 43100.0

    position, err := executor.ExecuteEntry(signal, quantity, currentPrice)
    if err != nil {
        panic(err)
    }

    fmt.Printf("Position opened: %s\n", position.ID)
    fmt.Printf("Entry price: %.2f\n", position.EntryPrice)
    fmt.Printf("Quantity: %.4f BTC\n", position.Quantity)

    // Check paper balance
    balance := executor.GetPaperBalance("user-123")
    fmt.Printf("Remaining balance: %.2f USDT\n", balance.Free)
}
```

### Closing a Position

```go
// Monitor position and close when target reached
currentPrice := 45100.0 // Target reached!

err := executor.ExecuteExit(position, "take_profit", currentPrice)
if err != nil {
    panic(err)
}

fmt.Printf("Position closed\n")
fmt.Printf("Exit price: %.2f\n", position.ExitPrice)
fmt.Printf("PnL: %.2f USDT (%.2f%%)\n",
    position.RealizedPnL, position.PnLPercent)
```

---

## 📊 Position Monitoring Examples

### Setting Up Position Monitor

```go
package main

import (
    "fmt"
    "github.com/yourusername/aitrader-tui/internal/position"
    "github.com/yourusername/aitrader-tui/internal/storage"
    "github.com/yourusername/aitrader-tui/internal/types"
)

func main() {
    store, _ := storage.NewSQLiteStorage("./trading.db")
    defer store.Close()

    // Create monitor with callback
    monitor := position.NewMonitor(store, handleTrigger)
    monitor.Start()
    defer monitor.Stop()

    // Add a position to monitor
    position := &types.Position{
        ID:           "pos-001",
        Symbol:       "BTCUSDT",
        Side:         types.PositionSideLong,
        EntryPrice:   43000.0,
        CurrentPrice: 43500.0,
        Quantity:     0.1,
        StopLoss:     42000.0,
        TakeProfit:   45000.0,
        Status:       types.PositionStatusOpen,
    }

    monitor.AddPosition(position)

    // Update price (would come from WebSocket in real usage)
    monitor.UpdatePrice("BTCUSDT", 44000.0)
    monitor.UpdatePrice("BTCUSDT", 45100.0) // Take profit triggered!
}

// Callback when stop loss or take profit is triggered
func handleTrigger(pos *types.Position, triggerType string, price float64) error {
    fmt.Printf("Position %s: %s triggered at %.2f\n",
        pos.ID, triggerType, price)

    // Execute exit order
    // ... (would call trade executor)

    return nil
}
```

### Monitoring Multiple Positions

```go
// Get all open positions
openPositions := monitor.GetOpenPositions()
fmt.Printf("Monitoring %d positions\n", len(openPositions))

// Get positions by user
userPositions := monitor.GetPositionsByUser("user-123")

// Get positions by symbol
btcPositions := monitor.GetPositionsBySymbol("BTCUSDT")

// Get total PnL across all positions
totalPnL := monitor.GetTotalPnL()
fmt.Printf("Total unrealized PnL: %.2f USDT\n", totalPnL)
```

---

## ⏰ Timer Examples

### Scheduling Trader Checks

```go
package main

import (
    "fmt"
    "github.com/yourusername/aitrader-tui/internal/timer"
    "github.com/yourusername/aitrader-tui/internal/types"
    "time"
)

func main() {
    // Create timer manager with callback
    timerMgr := timer.NewManager(handleCheck)
    timerMgr.Start()
    defer timerMgr.Stop()

    // Create traders with different intervals
    trader1 := &types.Trader{
        ID:               "fast-trader",
        CheckIntervalSec: 60, // Check every minute
    }

    trader2 := &types.Trader{
        ID:               "slow-trader",
        CheckIntervalSec: 300, // Check every 5 minutes
    }

    // Schedule both traders
    timerMgr.ScheduleTrader(trader1)
    timerMgr.ScheduleTrader(trader2)

    // Trigger immediate check
    timerMgr.TriggerNow("fast-trader")

    // Get next check time
    nextTime, exists := timerMgr.GetNextCheckTime("fast-trader")
    if exists {
        fmt.Printf("Next check in: %v\n", time.Until(nextTime))
    }
}

// Callback function executed when timer fires
func handleCheck(traderID string) error {
    fmt.Printf("Checking trader: %s\n", traderID)

    // Execute filter
    // Process results
    // Create signals

    return nil
}
```

---

## 💾 Storage Examples

### SQLite Operations

```go
package main

import (
    "context"
    "github.com/yourusername/aitrader-tui/internal/storage"
    "time"
)

func main() {
    ctx := context.Background()

    // Create SQLite storage
    store, err := storage.NewSQLiteStorage("./trading.db")
    if err != nil {
        panic(err)
    }
    defer store.Close()

    // Create a trader
    trader := &storage.Trader{
        ID:          "trader-001",
        UserID:      "user-123",
        Name:        "My Strategy",
        Description: "RSI-based strategy",
        Symbols:     []string{"BTCUSDT", "ETHUSDT"},
        Timeframes:  []string{"1h", "4h"},
        CheckInterval: "5m",
        SignalCode:  "// filter code here",
        Status:      "active",
        CreatedAt:   time.Now(),
        UpdatedAt:   time.Now(),
    }

    // Save trader
    if err := store.CreateTrader(ctx, trader); err != nil {
        panic(err)
    }

    // Get trader
    retrieved, err := store.GetTrader(ctx, "trader-001")
    if err != nil {
        panic(err)
    }

    // Update trader
    retrieved.Name = "Updated Strategy"
    if err := store.UpdateTrader(ctx, retrieved); err != nil {
        panic(err)
    }

    // Get all active traders
    traders, err := store.GetActiveTraders(ctx, "user-123")
    if err != nil {
        panic(err)
    }

    // Create a signal
    signal := &storage.Signal{
        ID:           "signal-001",
        TraderID:     "trader-001",
        Symbol:       "BTCUSDT",
        Timeframe:    "1h",
        SignalType:   "entry",
        Status:       "pending",
        TriggerPrice: 43000.0,
        TargetPrice:  45000.0,
        StopLoss:     42000.0,
        Confidence:   85,
        Reasoning:    "RSI oversold",
        Metadata:     map[string]interface{}{"rsi": 28},
        CreatedAt:    time.Now(),
        UpdatedAt:    time.Now(),
    }

    if err := store.CreateSignal(ctx, signal); err != nil {
        panic(err)
    }

    // Create a position
    position := &storage.Position{
        ID:           "pos-001",
        UserID:       "user-123",
        TraderID:     "trader-001",
        SignalID:     "signal-001",
        Symbol:       "BTCUSDT",
        Side:         "LONG",
        EntryPrice:   43000.0,
        CurrentPrice: 43500.0,
        Size:         0.1,
        StopLoss:     42000.0,
        TakeProfit:   45000.0,
        PNL:          50.0,
        PNLPct:       1.16,
        Status:       "open",
        CreatedAt:    time.Now(),
        UpdatedAt:    time.Now(),
    }

    if err := store.CreatePosition(ctx, position); err != nil {
        panic(err)
    }

    // Get open positions
    positions, err := store.GetOpenPositions(ctx, "user-123")
    if err != nil {
        panic(err)
    }

    // Close position
    if err := store.ClosePosition(ctx, "pos-001"); err != nil {
        panic(err)
    }
}
```

### Supabase Operations

```go
package main

import (
    "context"
    "github.com/yourusername/aitrader-tui/internal/storage"
)

func main() {
    ctx := context.Background()

    // Create Supabase storage
    store, err := storage.NewSupabaseStorage(
        "https://your-project.supabase.co",
        "your-anon-key",
    )
    if err != nil {
        panic(err)
    }
    defer store.Close()

    // Same interface as SQLite!
    traders, err := store.GetActiveTraders(ctx, "user-123")
    if err != nil {
        panic(err)
    }

    // All other operations work identically
}
```

---

## 🧮 Helper Function Examples

### PnL Calculations

```go
package main

import (
    "fmt"
    "github.com/yourusername/aitrader-tui/internal/helpers"
)

func main() {
    // Long position
    entryPrice := 43000.0
    currentPrice := 44000.0
    quantity := 0.1

    // Calculate PnL
    pnl := helpers.CalculatePnL(entryPrice, currentPrice, quantity, true)
    fmt.Printf("PnL: %.2f USDT\n", pnl) // 100.00 USDT

    // Calculate PnL percentage
    pnlPct := helpers.CalculatePnLPercent(entryPrice, currentPrice, true)
    fmt.Printf("PnL%%: %.2f%%\n", pnlPct) // 2.33%

    // Short position
    pnlShort := helpers.CalculatePnL(entryPrice, currentPrice, quantity, false)
    fmt.Printf("Short PnL: %.2f USDT\n", pnlShort) // -100.00 USDT
}
```

### Stop Loss / Take Profit Checks

```go
currentPrice := 41900.0
stopLoss := 42000.0
takeProfit := 45000.0
isLong := true

// Check stop loss
if helpers.ShouldTriggerStopLoss(currentPrice, stopLoss, isLong) {
    fmt.Println("Stop loss triggered!")
}

// Check take profit
if helpers.ShouldTriggerTakeProfit(currentPrice, takeProfit, isLong) {
    fmt.Println("Take profit triggered!")
}
```

### Validation

```go
// Validate symbol
if !helpers.ValidateSymbol("BTCUSDT") {
    fmt.Println("Invalid symbol")
}

// Validate price
if !helpers.ValidatePrice(43000.0) {
    fmt.Println("Invalid price")
}

// Validate quantity
if !helpers.ValidateQuantity(0.1) {
    fmt.Println("Invalid quantity")
}
```

---

## 🔄 Complete Trading Flow Example

```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/yourusername/aitrader-tui/internal/engine"
    "github.com/yourusername/aitrader-tui/internal/types"
)

func main() {
    // 1. Create and start engine
    cfg := engine.Config{
        UserID:           "user-123",
        PaperTradingOnly: true,
        Mode:             engine.ModeLocal,
    }

    e := engine.New(cfg)
    if err := e.Start(); err != nil {
        panic(err)
    }
    defer e.Stop()

    fmt.Println("✅ Engine started")

    // 2. Engine automatically:
    //    - Connects to Binance WebSocket
    //    - Loads active traders
    //    - Compiles filter code
    //    - Schedules checks
    //    - Monitors positions

    // 3. Periodically check status
    ticker := time.NewTicker(10 * time.Second)
    defer ticker.Stop()

    for range ticker.C {
        status := e.GetStatus()

        fmt.Printf("\n📊 Status:\n")
        fmt.Printf("  Running: %v\n", status["running"])
        fmt.Printf("  Active Traders: %v\n", status["active_traders"])
        fmt.Printf("  Open Positions: %v\n", status["open_positions"])
        fmt.Printf("  Total PnL: %.2f USDT\n", status["total_pnl"])
        fmt.Printf("  WebSocket: %v\n", status["websocket_status"])
    }

    // Engine handles everything automatically:
    // - Executes filters on schedule
    // - Creates signals when matches found
    // - Monitors positions for triggers
    // - Executes trades (paper or real)
    // - Updates prices from WebSocket
}
```

---

## 🎓 Best Practices

### 1. Always Use Context

```go
ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
defer cancel()

trader, err := storage.GetTrader(ctx, traderID)
```

### 2. Handle Errors Properly

```go
if err := executor.CompileFilter(trader); err != nil {
    log.Error().
        Err(err).
        Str("trader_id", trader.ID).
        Msg("Failed to compile filter")
    return err
}
```

### 3. Graceful Shutdown

```go
// Set up signal handling
sigChan := make(chan os.Signal, 1)
signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

// Wait for signal
<-sigChan

// Graceful shutdown
log.Info().Msg("Shutting down...")
engine.Stop()
```

### 4. Test Filter Code Before Production

```go
// Always compile and test filters before deploying
if err := executor.CompileFilter(trader); err != nil {
    fmt.Printf("Filter has compilation error: %v\n", err)
    return
}

// Test with sample data
testResult, err := executor.ExecuteFilter(trader, sampleData)
if err != nil {
    fmt.Printf("Filter execution error: %v\n", err)
    return
}
```

---

## 📚 More Resources

- **Architecture**: `HYBRID_ARCHITECTURE.md`
- **Implementation**: `IMPLEMENTATION_COMPLETE.md`
- **Quick Start**: `QUICKSTART.md`
- **Status**: `STATUS.md`

---

Happy Trading! 🚀
