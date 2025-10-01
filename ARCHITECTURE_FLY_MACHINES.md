# Fly.io Machines Backend Architecture

## System Overview

This document defines the backend architecture for an AI-powered crypto trading platform where each paid user receives a dedicated Fly.io machine running their custom AI traders. The system uses a hybrid architecture combining Supabase (auth, database, Edge Functions) with per-user Fly machines (signal detection, trade execution, position monitoring).

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (React + Vite)                     │
│  - Strategy creation UI                                          │
│  - Real-time signal/position display                            │
│  - Trade history and analytics                                  │
└────────────┬──────────────────────────┬─────────────────────────┘
             │                          │
             ▼                          ▼
┌─────────────────────────┐   ┌──────────────────────────────────┐
│ Supabase Edge Functions │   │    Supabase Database (Postgres)  │
│  - generate-strategy    │◄──┤  - users, fly_machines           │
│  - analyze-signal       │   │  - traders, signals              │
│  - provision-machine    │   │  - positions, trades             │
│  - destroy-machine      │   │  - analysis_history              │
└────────┬────────────────┘   └───────────┬──────────────────────┘
         │                                 │
         │ Gemini API Calls                │ Read/Write State
         ▼                                 │
┌─────────────────────┐                    │
│   Google Gemini     │                    │
│  - Strategy gen     │                    │
│  - Signal analysis  │                    │
│  - Trade decisions  │                    │
└─────────────────────┘                    │
                                           │
              ┌────────────────────────────┘
              │
              ▼
┌──────────────────────────────────────────────────────────────────┐
│           Fly.io Machine (Dedicated per User)                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Go HTTP Server                                              │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │ Core Components:                                      │  │ │
│  │  │  - Yaegi Interpreter (runs user signal code)        │  │ │
│  │  │  - Timer System (1s to candle intervals)            │  │ │
│  │  │  - Local Kline Storage (in-memory maps)             │  │ │
│  │  │  - HTTP Client (calls Supabase Edge Functions)      │  │ │
│  │  │  - Position Monitor (stop-loss, take-profit)        │  │ │
│  │  │  - Trade Executor (paper + real Binance trades)     │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
│         │                                          │              │
│         │ WebSocket                                │ REST API     │
│         ▼                                          ▼              │
│  ┌────────────────┐                        ┌────────────────┐   │
│  │    Binance     │                        │    Binance     │   │
│  │  WebSocket API │                        │    REST API    │   │
│  │  (Market Data) │                        │   (Trading)    │   │
│  └────────────────┘                        └────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Per-User Isolation**: Each paid user gets dedicated resources (Fly machine) with full state isolation
2. **Event-Driven Architecture**: Fly machines respond to timer events and market data
3. **Supabase as Source of Truth**: All state persisted to Supabase at every step
4. **Edge Functions as AI Gateway**: All Gemini API calls proxied through Supabase Edge Functions
5. **Direct Market Data**: Each machine connects directly to Binance (no shared data layer)
6. **Flexible Intervals**: User-configurable check intervals from 1 second to candle closes
7. **Paper + Real Trading**: Support both forward testing (paper) and live execution

---

## Component Architecture

### 1. Supabase Edge Functions

**Purpose**: Strategy generation, Gemini API proxy, machine lifecycle management

#### Edge Function: `generate-strategy`

**Endpoint**: `POST /functions/v1/generate-strategy`

**Request**:
```typescript
{
  userId: string;
  description: string; // Natural language strategy description
  tier: 'pro' | 'elite' | 'power';
}
```

**Process**:
1. Validate user authentication and tier
2. Call Gemini API with strategy generation prompt
3. Parse response to extract:
   - Signal code (Go syntax for Yaegi)
   - AI trader instructions (how to analyze signals)
   - Required timeframes
   - Recommended check interval
4. Save to `traders` table
5. If first trader for user → call `provision-machine` internally
6. Return trader configuration to frontend

**Response**:
```typescript
{
  traderId: string;
  signalCode: string;
  aiInstructions: string;
  timeframes: string[]; // e.g., ["1m", "5m", "1h"]
  recommendedInterval: string; // e.g., "1m" or "5s"
  machineId?: string; // If new machine was provisioned
}
```

#### Edge Function: `analyze-signal`

**Endpoint**: `POST /functions/v1/analyze-signal`

**Request**:
```typescript
{
  traderId: string;
  signalId: string;
  marketData: {
    symbol: string;
    timestamp: number;
    ticker: {
      lastPrice: string;
      volume24h: string;
      priceChange24h: string;
      // ... other ticker fields
    };
    klines: {
      [timeframe: string]: Array<[
        openTime: number,
        open: string,
        high: string,
        low: string,
        close: string,
        volume: string,
        closeTime: number,
        // ... other fields
      ]>;
    };
    indicators: {
      [name: string]: any; // Calculated indicators
    };
  };
}
```

**Process**:
1. Fetch trader's AI instructions from database
2. Build Gemini prompt with:
   - AI instructions
   - Current market data
   - Historical context if available
3. Call Gemini API
4. Parse response for decision + reasoning
5. Save to `analysis_history` table
6. Return decision to Fly machine

**Response**:
```typescript
{
  decision: 'no_trade' | 'watch' | 'open_long' | 'open_short' | 'close' | 'partial_close' |
            'scale_in' | 'scale_out' | 'update_stop_loss' | 'update_take_profit' | 'flip_position';
  reasoning: string;
  confidence: number; // 0-100
  metadata?: {
    stopLoss?: number;
    takeProfit?: number;
    positionSize?: number;
    closePercentage?: number; // For partial_close (0.25, 0.5, 0.75, etc.)
    scaleInAmount?: number; // For scale_in
    scaleOutPercentage?: number; // For scale_out
    newStopLoss?: number; // For update_stop_loss
    newTakeProfit?: number; // For update_take_profit
  };
}
```

#### Edge Function: `provision-machine`

**Endpoint**: `POST /functions/v1/provision-machine`

**Request**:
```typescript
{
  userId: string;
  tier: 'pro' | 'elite' | 'power';
}
```

**Process**:
1. Check if machine already exists for user
2. Call Fly.io API to create new machine:
   - Image: Custom Go server Docker image
   - Memory: Based on tier (Pro: 256MB, Elite: 512MB, Power: 1GB)
   - Region: User's preferred region
   - Env vars: USER_ID, SUPABASE_URL, SUPABASE_ANON_KEY
3. Wait for machine to start (poll status)
4. Save machine details to `fly_machines` table
5. Machine auto-loads traders on startup

**Response**:
```typescript
{
  machineId: string;
  status: 'starting' | 'running';
  ipAddress: string;
}
```

#### Edge Function: `destroy-machine`

**Endpoint**: `POST /functions/v1/destroy-machine`

**Request**:
```typescript
{
  userId: string;
  reason: 'subscription_cancelled' | 'user_request' | 'inactivity';
}
```

**Process**:
1. Fetch machine ID from `fly_machines` table
2. Send shutdown signal to machine (HTTP endpoint)
3. Machine gracefully:
   - Closes all WebSocket connections
   - Saves final state to database
   - Marks positions for manual review if still open
4. Call Fly.io API to destroy machine
5. Update `fly_machines` table (status: destroyed)

**Response**:
```typescript
{
  success: boolean;
  finalState: {
    openPositions: number;
    watchingSignals: number;
  };
}
```

---

### 2. Fly.io Machine (Go Server)

**Purpose**: Execute signal detection, trade execution, position monitoring for single user

#### Core Components

##### Yaegi Interpreter

**Package**: `github.com/traefik/yaegi`

**Purpose**: Execute user-generated signal code dynamically without compilation

**Usage**:
```go
import "github.com/traefik/yaegi/interp"

type SignalExecutor struct {
    interpreter *interp.Interpreter
    signalCode  string
}

func (se *SignalExecutor) LoadSignalCode(code string) error {
    se.interpreter = interp.New(interp.Options{})

    // Import standard library + custom helpers
    se.interpreter.Use(stdlib.Symbols)
    se.interpreter.Use(customHelpers) // Technical indicators

    // Compile user code (5-20ms)
    _, err := se.interpreter.Eval(code)
    return err
}

func (se *SignalExecutor) CheckSignal(symbol string, ticker Ticker, klines map[string][][]interface{}) (bool, error) {
    // Call user's check function
    v, err := se.interpreter.Eval(fmt.Sprintf(`checkSignal("%s", ticker, klines)`, symbol))
    if err != nil {
        return false, err
    }
    return v.Bool(), nil
}
```

**Helper Functions Provided to User Code**:

All technical indicator helpers are ported from the current app's `screenerHelpers.ts` to maintain compatibility. User signal code can also define custom indicators inline.

```go
// Built-in helpers (ported from screenerHelpers.ts)
// All use "get" prefix as per execute-trader/index.ts pattern

// Trend Indicators
func getLatestSMA(klines [][]interface{}, period int) float64
func getLatestEMA(klines [][]interface{}, period int) float64
func getLatestWMA(klines [][]interface{}, period int) float64
func getLatestVWAP(klines [][]interface{}) float64

// Momentum Indicators
func getLatestRSI(klines [][]interface{}, period int) float64
func getLatestMACD(klines [][]interface{}) (macd, signal, histogram float64)
func getLatestStochastic(klines [][]interface{}, kPeriod, dPeriod int) (k, d float64)
func getLatestCCI(klines [][]interface{}, period int) float64
func getLatestWilliamsR(klines [][]interface{}, period int) float64
func getLatestROC(klines [][]interface{}, period int) float64

// Volatility Indicators
func getLatestBollingerBands(klines [][]interface{}, period int, stdDev float64) (upper, middle, lower float64)
func getLatestATR(klines [][]interface{}, period int) float64
func getLatestKeltnerChannels(klines [][]interface{}, period, atrPeriod int, multiplier float64) (upper, middle, lower float64)
func getLatestDonchianChannels(klines [][]interface{}, period int) (upper, middle, lower float64)

// Volume Indicators
func getLatestVolume(klines [][]interface{}, period int) float64
func getLatestVolumeChange(klines [][]interface{}, period int) float64
func getLatestOBV(klines [][]interface{}) float64
func getLatestVolumeMA(klines [][]interface{}, period int) float64

// Trend Strength Indicators
func getLatestADX(klines [][]interface{}, period int) float64
func getLatestAroon(klines [][]interface{}, period int) (aroonUp, aroonDown float64)

// Price Action
func getPriceChange(klines [][]interface{}, periods int) float64
func getPriceChangePercent(klines [][]interface{}, periods int) float64
func getHighestHigh(klines [][]interface{}, periods int) float64
func getLowestLow(klines [][]interface{}, periods int) float64

// Utility Functions
func getCloses(klines [][]interface{}) []float64
func getOpens(klines [][]interface{}) []float64
func getHighs(klines [][]interface{}) []float64
func getLows(klines [][]interface{}) []float64
func getVolumes(klines [][]interface{}) []float64

// Custom Indicators (user-defined in signal code)
// Example:
// func myCustomIndicator(klines [][]interface{}) float64 {
//     closes := getCloses(klines)
//     return (closes[len(closes)-1] + closes[len(closes)-2]) / 2
// }
```

**Custom Indicator Support**:

Users can define custom indicators directly in their signal code:

```go
func checkSignal(symbol string, ticker Ticker, klines map[string][][]interface{}) bool {
    // Use built-in indicators
    rsi := getLatestRSI(klines["1h"], 14)
    macd, signal, _ := getLatestMACD(klines["4h"])

    // Define custom indicator inline
    customMomentum := func(k [][]interface{}) float64 {
        closes := getCloses(k)
        if len(closes) < 10 {
            return 0
        }

        // Custom calculation: weighted average of recent price changes
        var weightedSum float64
        var weightTotal float64
        for i := 0; i < 10; i++ {
            weight := float64(10 - i)
            priceChange := (closes[len(closes)-1-i] - closes[len(closes)-2-i]) / closes[len(closes)-2-i]
            weightedSum += priceChange * weight
            weightTotal += weight
        }
        return weightedSum / weightTotal * 100
    }

    momentum := customMomentum(klines["1h"])

    // Combine indicators for signal logic
    return rsi < 30 && macd > signal && momentum > 0.5
}
```

##### Timer System

**Purpose**: Execute signal checks at user-configured intervals (1s to candle closes)

**Implementation**:
```go
type TraderTimer struct {
    traderID       string
    interval       string // "1s", "5s", "1m", "5m_close", "1h_close"
    lastExecution  time.Time
    ticker         *time.Ticker
    cancelChan     chan struct{}
}

type TimerManager struct {
    timers map[string]*TraderTimer // traderID -> timer
    mu     sync.RWMutex
}

func (tm *TimerManager) AddTrader(trader Trader) {
    timer := &TraderTimer{
        traderID: trader.ID,
        interval: trader.CheckInterval,
        cancelChan: make(chan struct{}),
    }

    // Parse interval
    if strings.HasSuffix(timer.interval, "_close") {
        // Candle close based (align to timeframe)
        go tm.runCandleCloseTimer(timer, trader)
    } else {
        // Fixed interval (1s, 5s, etc.)
        duration := parseDuration(timer.interval)
        timer.ticker = time.NewTicker(duration)
        go tm.runFixedIntervalTimer(timer, trader)
    }

    tm.mu.Lock()
    tm.timers[trader.ID] = timer
    tm.mu.Unlock()
}

func (tm *TimerManager) runFixedIntervalTimer(timer *TraderTimer, trader Trader) {
    for {
        select {
        case <-timer.ticker.C:
            tm.executeSignalCheck(trader)
        case <-timer.cancelChan:
            timer.ticker.Stop()
            return
        }
    }
}

func (tm *TimerManager) runCandleCloseTimer(timer *TraderTimer, trader Trader) {
    // Calculate next candle close time
    timeframe := strings.TrimSuffix(timer.interval, "_close")

    for {
        nextClose := calculateNextCandleClose(timeframe)
        sleepDuration := time.Until(nextClose)

        select {
        case <-time.After(sleepDuration):
            tm.executeSignalCheck(trader)
        case <-timer.cancelChan:
            return
        }
    }
}
```

##### Local Kline Storage

**Purpose**: Store candlestick data in-memory for fast access

**Structure**:
```go
type KlineStore struct {
    data map[string]map[string]*Klines // symbol -> timeframe -> klines
    mu   sync.RWMutex
}

type Klines struct {
    Data      [][]interface{} // Array format matching Binance API
    MaxLength int             // Keep last N candles
}

func (ks *KlineStore) Update(symbol, timeframe string, kline []interface{}) {
    ks.mu.Lock()
    defer ks.mu.Unlock()

    if ks.data[symbol] == nil {
        ks.data[symbol] = make(map[string]*Klines)
    }

    if ks.data[symbol][timeframe] == nil {
        ks.data[symbol][timeframe] = &Klines{
            Data:      make([][]interface{}, 0, 1000),
            MaxLength: 1000, // Keep last 1000 candles
        }
    }

    klines := ks.data[symbol][timeframe]

    // Check if update or new candle
    if len(klines.Data) > 0 {
        lastKline := klines.Data[len(klines.Data)-1]
        if lastKline[0].(int64) == kline[0].(int64) {
            // Update existing candle
            klines.Data[len(klines.Data)-1] = kline
            return
        }
    }

    // Append new candle
    klines.Data = append(klines.Data, kline)

    // Trim to max length
    if len(klines.Data) > klines.MaxLength {
        klines.Data = klines.Data[1:]
    }
}

func (ks *KlineStore) Get(symbol, timeframe string, limit int) [][]interface{} {
    ks.mu.RLock()
    defer ks.mu.RUnlock()

    klines := ks.data[symbol][timeframe]
    if klines == nil {
        return nil
    }

    if limit > len(klines.Data) {
        limit = len(klines.Data)
    }

    return klines.Data[len(klines.Data)-limit:]
}
```

##### Binance WebSocket Manager

**Purpose**: Maintain real-time connections to Binance for market data

**Implementation**:
```go
type BinanceWSManager struct {
    connections map[string]*websocket.Conn // stream -> connection
    klineStore  *KlineStore
    symbols     []string
    timeframes  []string
    mu          sync.RWMutex
}

func (bw *BinanceWSManager) Connect() error {
    // Subscribe to kline streams for all required symbol+timeframe combinations
    streams := bw.buildStreamNames()

    wsURL := fmt.Sprintf("wss://stream.binance.com:9443/stream?streams=%s", strings.Join(streams, "/"))

    conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
    if err != nil {
        return err
    }

    go bw.handleMessages(conn)

    return nil
}

func (bw *BinanceWSManager) buildStreamNames() []string {
    streams := []string{}

    for _, symbol := range bw.symbols {
        symbolLower := strings.ToLower(symbol)

        // Add ticker stream
        streams = append(streams, fmt.Sprintf("%s@ticker", symbolLower))

        // Add kline streams for each timeframe
        for _, timeframe := range bw.timeframes {
            streams = append(streams, fmt.Sprintf("%s@kline_%s", symbolLower, timeframe))
        }
    }

    return streams
}

func (bw *BinanceWSManager) handleMessages(conn *websocket.Conn) {
    for {
        var msg map[string]interface{}
        err := conn.ReadJSON(&msg)
        if err != nil {
            log.Printf("WebSocket error: %v, reconnecting...", err)
            bw.reconnect()
            return
        }

        data := msg["data"].(map[string]interface{})
        eventType := data["e"].(string)

        switch eventType {
        case "kline":
            bw.handleKlineUpdate(data)
        case "24hrTicker":
            bw.handleTickerUpdate(data)
        }
    }
}

func (bw *BinanceWSManager) handleKlineUpdate(data map[string]interface{}) {
    k := data["k"].(map[string]interface{})
    symbol := k["s"].(string)
    timeframe := k["i"].(string)

    kline := []interface{}{
        k["t"],  // Open time
        k["o"],  // Open
        k["h"],  // High
        k["l"],  // Low
        k["c"],  // Close
        k["v"],  // Volume
        k["T"],  // Close time
        k["q"],  // Quote asset volume
        k["n"],  // Number of trades
        k["V"],  // Taker buy base asset volume
        k["Q"],  // Taker buy quote asset volume
    }

    bw.klineStore.Update(symbol, timeframe, kline)
}
```

##### Signal Detection Loop

**Purpose**: Execute Yaegi signal code on timer events

**Implementation**:
```go
func (tm *TimerManager) executeSignalCheck(trader Trader) {
    startTime := time.Now()
    log.Printf("[%s] [%s] Starting signal check", startTime.Format(time.RFC3339), trader.ID)

    // Load trader's signal code into Yaegi
    executor := &SignalExecutor{}
    err := executor.LoadSignalCode(trader.SignalCode)
    if err != nil {
        log.Printf("[%s] [%s] Failed to load signal code: %v", time.Now().Format(time.RFC3339), trader.ID, err)
        return
    }

    // Get symbols to check (could be all, or trader-specific list)
    symbols := getSymbolsForTrader(trader)

    // Execute in parallel for all symbols
    var wg sync.WaitGroup
    for _, symbol := range symbols {
        wg.Add(1)
        go func(sym string) {
            defer wg.Done()

            // Get ticker data
            ticker := getTicker(sym)

            // Get klines for required timeframes
            klines := make(map[string][][]interface{})
            for _, tf := range trader.Timeframes {
                klines[tf] = klineStore.Get(sym, tf, 500) // Last 500 candles
            }

            // Run signal check
            matches, err := executor.CheckSignal(sym, ticker, klines)
            if err != nil {
                log.Printf("[%s] [%s] Signal check error for %s: %v", time.Now().Format(time.RFC3339), trader.ID, sym, err)
                return
            }

            if matches {
                log.Printf("[%s] [%s] Signal triggered for %s", time.Now().Format(time.RFC3339), trader.ID, sym)
                handleSignalMatch(trader, sym, ticker, klines)
            }
        }(symbol)
    }

    wg.Wait()

    log.Printf("[%s] [%s] Signal check completed in %v", time.Now().Format(time.RFC3339), trader.ID, time.Since(startTime))
}

func handleSignalMatch(trader Trader, symbol string, ticker Ticker, klines map[string][][]interface{}) {
    // 1. Save signal to database
    signal := Signal{
        ID:        generateID(),
        TraderID:  trader.ID,
        UserID:    trader.UserID,
        Symbol:    symbol,
        Timestamp: time.Now(),
        Status:    "new",
        TriggerPrice: ticker.LastPrice,
    }

    err := saveSignalToDB(signal)
    if err != nil {
        log.Printf("[%s] [%s] Failed to save signal: %v", time.Now().Format(time.RFC3339), trader.ID, err)
        return
    }

    // 2. Prepare market data for Gemini analysis
    indicators := calculateIndicators(klines, trader)

    marketData := MarketData{
        Symbol:    symbol,
        Timestamp: time.Now().Unix(),
        Ticker:    ticker,
        Klines:    klines,
        Indicators: indicators,
    }

    // 3. Call Supabase Edge Function for Gemini analysis
    decision, err := callAnalyzeSignal(trader.ID, signal.ID, marketData)
    if err != nil {
        log.Printf("[%s] [%s] Failed to get Gemini analysis: %v", time.Now().Format(time.RFC3339), trader.ID, err)
        return
    }

    log.Printf("[%s] [%s] Gemini decision for %s: %s - %s", time.Now().Format(time.RFC3339), trader.ID, symbol, decision.Decision, decision.Reasoning)

    // 4. Process decision
    processDecision(signal, decision)
}
```

##### Trade Executor

**Purpose**: Execute paper and real trades on Binance with comprehensive order management

#### Complete Trade Operations

The Trade Executor supports all lifecycle operations for position management:

**Entry Operations**:
- `open_long` - Enter long position (BUY market order)
- `open_short` - Enter short position (SELL market order)
- `scale_in` - Add to existing position (DCA - Dollar Cost Averaging)

**Exit Operations**:
- `close` - Exit entire position (opposite side market order)
- `partial_close` - Exit partial position (e.g., 25%, 50%, 75%)
- `scale_out` - Reduce position gradually over time

**Order Management Operations**:
- `update_stop_loss` - Move stop-loss level (trailing stops, breakeven, tighter stops)
- `update_take_profit` - Move take-profit level based on analysis
- `cancel_order` - Cancel pending limit orders
- `replace_order` - Atomically cancel and create new order

**Advanced Operations**:
- `flip_position` - Close long + open short in one transaction (or vice versa)
- `hedge` - Open opposite position for risk management

**Order Types Supported**:
- `market` - Immediate execution at current price
- `limit` - Execution at specific price or better
- `stop_market` - Stop-loss triggered market order
- `stop_limit` - Stop-loss triggered limit order
- `trailing_stop` - Dynamic stop that follows price movement

**Implementation**:
```go
type TradeExecutor struct {
    binanceClient *BinanceClient
    paperMode     bool
    paperBalance  map[string]float64 // asset -> balance for paper trading
    mu            sync.RWMutex
}

func (te *TradeExecutor) ExecuteTrade(position Position, decision Decision) error {
    if te.paperMode {
        return te.executePaperTrade(position, decision)
    }
    return te.executeRealTrade(position, decision)
}

func (te *TradeExecutor) executeRealTrade(position Position, decision Decision) error {
    var side string
    var quantity float64
    var orderType string = "MARKET" // Default to market orders

    switch decision.Decision {
    case "open_long":
        side = "BUY"
        quantity = calculatePositionSize(position, decision)
    case "open_short":
        side = "SELL"
        quantity = calculatePositionSize(position, decision)
    case "close":
        side = getCloseSide(position) // Opposite of entry
        quantity = position.Size
    case "partial_close":
        side = getCloseSide(position)
        // Use metadata to determine percentage (default 50%)
        percentage := decision.Metadata["closePercentage"].(float64)
        if percentage == 0 {
            percentage = 0.5
        }
        quantity = position.Size * percentage
    case "scale_in":
        side = position.Side == "long" ? "BUY" : "SELL"
        quantity = calculateScaleInSize(position, decision)
    case "scale_out":
        side = getCloseSide(position)
        quantity = calculateScaleOutSize(position, decision)
    case "flip_position":
        // First close existing position
        err := te.closePosition(position)
        if err != nil {
            return fmt.Errorf("failed to close position for flip: %w", err)
        }
        // Then open opposite position
        side = position.Side == "long" ? "SELL" : "BUY"
        quantity = calculatePositionSize(position, decision)
    default:
        return fmt.Errorf("unknown decision: %s", decision.Decision)
    }

    // Execute market order via Binance API
    order, err := te.binanceClient.NewOrder(position.Symbol, side, orderType, quantity)
    if err != nil {
        log.Printf("[%s] [%s] Failed to execute real trade: %v", time.Now().Format(time.RFC3339), position.SignalID, err)
        return err
    }

    // Save trade to database
    trade := Trade{
        ID:         generateID(),
        PositionID: position.ID,
        Type:       "real",
        Side:       side,
        Price:      order.Price,
        Quantity:   quantity,
        Status:     "filled",
        Timestamp:  time.Now(),
        BinanceOrderID: order.OrderID,
    }

    return saveTradeToDB(trade)
}

// Order management operations
func (te *TradeExecutor) UpdateStopLoss(position *Position, newStopLoss float64) error {
    // Cancel existing stop-loss order if any
    if position.StopLossOrderID != 0 {
        err := te.binanceClient.CancelOrder(position.Symbol, position.StopLossOrderID)
        if err != nil {
            return fmt.Errorf("failed to cancel old stop-loss: %w", err)
        }
    }

    // Place new stop-loss order
    side := getCloseSide(position)
    order, err := te.binanceClient.NewStopLossOrder(
        position.Symbol,
        side,
        position.Size,
        newStopLoss,
    )
    if err != nil {
        return fmt.Errorf("failed to place new stop-loss: %w", err)
    }

    // Update position in database
    position.StopLoss = newStopLoss
    position.StopLossOrderID = order.OrderID
    updatePositionInDB(position)

    log.Printf("[%s] [%s] Updated stop-loss to %.2f", time.Now().Format(time.RFC3339), position.ID, newStopLoss)
    return nil
}

func (te *TradeExecutor) UpdateTakeProfit(position *Position, newTakeProfit float64) error {
    // Cancel existing take-profit order if any
    if position.TakeProfitOrderID != 0 {
        err := te.binanceClient.CancelOrder(position.Symbol, position.TakeProfitOrderID)
        if err != nil {
            return fmt.Errorf("failed to cancel old take-profit: %w", err)
        }
    }

    // Place new take-profit limit order
    side := getCloseSide(position)
    order, err := te.binanceClient.NewLimitOrder(
        position.Symbol,
        side,
        position.Size,
        newTakeProfit,
    )
    if err != nil {
        return fmt.Errorf("failed to place new take-profit: %w", err)
    }

    // Update position in database
    position.TakeProfit = newTakeProfit
    position.TakeProfitOrderID = order.OrderID
    updatePositionInDB(position)

    log.Printf("[%s] [%s] Updated take-profit to %.2f", time.Now().Format(time.RFC3339), position.ID, newTakeProfit)
    return nil
}

func (te *TradeExecutor) ReplaceOrder(position *Position, oldOrderID int64, newPrice float64, newQuantity float64) error {
    // Cancel old order
    err := te.binanceClient.CancelOrder(position.Symbol, oldOrderID)
    if err != nil {
        return fmt.Errorf("failed to cancel old order: %w", err)
    }

    // Place new order
    side := getCloseSide(position)
    order, err := te.binanceClient.NewLimitOrder(
        position.Symbol,
        side,
        newQuantity,
        newPrice,
    )
    if err != nil {
        // Order cancelled but new order failed - need to handle this carefully
        log.Printf("[%s] [%s] CRITICAL: Old order cancelled but new order failed: %v", time.Now().Format(time.RFC3339), position.ID, err)
        return fmt.Errorf("failed to place new order after cancel: %w", err)
    }

    log.Printf("[%s] [%s] Replaced order %d with %d", time.Now().Format(time.RFC3339), position.ID, oldOrderID, order.OrderID)
    return nil
}

func (te *TradeExecutor) executePaperTrade(position Position, decision Decision) error {
    te.mu.Lock()
    defer te.mu.Unlock()

    // Simulate trade with current market price
    ticker := getTicker(position.Symbol)
    price, _ := strconv.ParseFloat(ticker.LastPrice, 64)

    var side string
    var quantity float64

    switch decision.Decision {
    case "open_long":
        side = "BUY"
        quantity = calculatePositionSize(position, decision)
        // Deduct from paper balance
        te.paperBalance["USDT"] -= price * quantity
    case "close":
        side = "SELL"
        quantity = position.Size
        // Add to paper balance
        te.paperBalance["USDT"] += price * quantity
    // ... other cases
    }

    // Save paper trade to database
    trade := Trade{
        ID:         generateID(),
        PositionID: position.ID,
        Type:       "paper",
        Side:       side,
        Price:      price,
        Quantity:   quantity,
        Status:     "filled",
        Timestamp:  time.Now(),
    }

    return saveTradeToDB(trade)
}
```

##### Position Monitor

**Purpose**: Continuously monitor open positions for stop-loss/take-profit

**Implementation**:
```go
type PositionMonitor struct {
    positions    map[string]*Position // positionID -> position
    klineStore   *KlineStore
    tradeExecutor *TradeExecutor
    mu           sync.RWMutex
}

func (pm *PositionMonitor) Start() {
    // Monitor every second
    ticker := time.NewTicker(1 * time.Second)

    for range ticker.C {
        pm.checkAllPositions()
    }
}

func (pm *PositionMonitor) checkAllPositions() {
    pm.mu.RLock()
    positions := make([]*Position, 0, len(pm.positions))
    for _, pos := range pm.positions {
        positions = append(positions, pos)
    }
    pm.mu.RUnlock()

    for _, position := range positions {
        pm.checkPosition(position)
    }
}

func (pm *PositionMonitor) checkPosition(position *Position) {
    ticker := getTicker(position.Symbol)
    currentPrice, _ := strconv.ParseFloat(ticker.LastPrice, 64)

    // Check stop-loss
    if position.StopLoss > 0 {
        if (position.Side == "long" && currentPrice <= position.StopLoss) ||
           (position.Side == "short" && currentPrice >= position.StopLoss) {
            log.Printf("[%s] [%s] Stop-loss triggered at %.2f", time.Now().Format(time.RFC3339), position.ID, currentPrice)
            pm.closePosition(position, "stop_loss")
            return
        }
    }

    // Check take-profit
    if position.TakeProfit > 0 {
        if (position.Side == "long" && currentPrice >= position.TakeProfit) ||
           (position.Side == "short" && currentPrice <= position.TakeProfit) {
            log.Printf("[%s] [%s] Take-profit triggered at %.2f", time.Now().Format(time.RFC3339), position.ID, currentPrice)
            pm.closePosition(position, "take_profit")
            return
        }
    }
}

func (pm *PositionMonitor) closePosition(position *Position, reason string) {
    // Create close decision
    decision := Decision{
        Decision:  "close",
        Reasoning: fmt.Sprintf("Position closed due to %s", reason),
    }

    // Execute close trade
    err := pm.tradeExecutor.ExecuteTrade(*position, decision)
    if err != nil {
        log.Printf("[%s] [%s] Failed to close position: %v", time.Now().Format(time.RFC3339), position.ID, err)
        return
    }

    // Update position status in database
    position.Status = "closed"
    position.CloseReason = reason
    updatePositionInDB(position)

    // Remove from monitoring
    pm.mu.Lock()
    delete(pm.positions, position.ID)
    pm.mu.Unlock()
}
```

##### Re-analysis System

**Purpose**: Periodically re-analyze watchlist signals and open positions

**Implementation**:
```go
type ReanalysisManager struct {
    timers map[string]*time.Ticker // traderID -> ticker
    mu     sync.RWMutex
}

func (rm *ReanalysisManager) AddTrader(trader Trader) {
    interval := parseReanalysisInterval(trader.ReanalysisInterval)
    ticker := time.NewTicker(interval)

    rm.mu.Lock()
    rm.timers[trader.ID] = ticker
    rm.mu.Unlock()

    go rm.runReanalysis(trader, ticker)
}

func (rm *ReanalysisManager) runReanalysis(trader Trader, ticker *time.Ticker) {
    for range ticker.C {
        rm.executeReanalysis(trader)
    }
}

func (rm *ReanalysisManager) executeReanalysis(trader Trader) {
    startTime := time.Now()
    log.Printf("[%s] [%s] Starting re-analysis", startTime.Format(time.RFC3339), trader.ID)

    // Fetch signals that need re-analysis
    signals := fetchSignalsForReanalysis(trader.ID) // status: watching or position_open

    for _, signal := range signals {
        // Get latest market data
        ticker := getTicker(signal.Symbol)
        klines := make(map[string][][]interface{})
        for _, tf := range trader.Timeframes {
            klines[tf] = klineStore.Get(signal.Symbol, tf, 500)
        }

        indicators := calculateIndicators(klines, trader)

        marketData := MarketData{
            Symbol:     signal.Symbol,
            Timestamp:  time.Now().Unix(),
            Ticker:     ticker,
            Klines:     klines,
            Indicators: indicators,
        }

        // Call Gemini for fresh analysis
        decision, err := callAnalyzeSignal(trader.ID, signal.ID, marketData)
        if err != nil {
            log.Printf("[%s] [%s] Re-analysis failed for signal %s: %v", time.Now().Format(time.RFC3339), trader.ID, signal.ID, err)
            continue
        }

        log.Printf("[%s] [%s] Re-analysis decision for %s: %s", time.Now().Format(time.RFC3339), trader.ID, signal.Symbol, decision.Decision)

        // Process decision
        processDecision(signal, decision)
    }

    log.Printf("[%s] [%s] Re-analysis completed in %v", time.Now().Format(time.RFC3339), trader.ID, time.Since(startTime))
}
```

#### HTTP API Endpoints

The Fly machine exposes internal endpoints for management:

##### `GET /health`
Returns machine health status and active traders count

##### `POST /shutdown`
Gracefully shuts down the machine:
1. Stop all timers
2. Close WebSocket connections
3. Save final state to database
4. Return summary

##### `POST /reload-traders`
Reloads trader configurations from database (called when user creates/updates traders)

##### `GET /metrics`
Returns operational metrics:
- Active traders count
- Signals checked (last hour)
- Signals triggered (last hour)
- Open positions count
- Memory usage
- WebSocket connection status

---

## Data Flow Diagrams

### Flow 1: Strategy Generation

```
┌──────────┐
│  User    │
│ (Frontend)│
└─────┬────┘
      │ 1. POST /functions/v1/generate-strategy
      │    { description: "Buy when RSI < 30..." }
      ▼
┌─────────────────────┐
│ Supabase Edge Func  │
│ generate-strategy   │
└─────┬───────────────┘
      │ 2. Call Gemini API with prompt
      ▼
┌─────────────────────┐
│  Google Gemini      │
│  Returns:           │
│   - Signal code     │
│   - AI instructions │
└─────┬───────────────┘
      │ 3. Parse & validate response
      ▼
┌─────────────────────┐
│ Supabase Database   │
│ INSERT INTO traders │
└─────┬───────────────┘
      │ 4. If first trader for user
      ▼
┌─────────────────────┐
│ Supabase Edge Func  │
│ provision-machine   │
└─────┬───────────────┘
      │ 5. Call Fly.io API
      ▼
┌─────────────────────┐
│   Fly.io API        │
│ Create new machine  │
└─────┬───────────────┘
      │ 6. Machine starts
      ▼
┌─────────────────────┐
│  Fly Machine        │
│  - Load traders     │
│  - Connect Binance  │
│  - Start timers     │
└─────────────────────┘
```

### Flow 2: Signal Detection & Analysis

```
┌─────────────────────┐
│  Fly Machine        │
│  Timer fires        │
└─────┬───────────────┘
      │ 1. Get latest klines from local storage
      ▼
┌─────────────────────┐
│  Yaegi Interpreter  │
│  Run signal code    │
│  for each symbol    │
└─────┬───────────────┘
      │ 2. If match found
      ▼
┌─────────────────────┐
│ Supabase Database   │
│ INSERT INTO signals │
│ status: 'new'       │
└─────┬───────────────┘
      │ 3. Prepare market data payload
      ▼
┌─────────────────────┐
│  Fly Machine        │
│  POST /functions/v1/│
│  analyze-signal     │
└─────┬───────────────┘
      │ 4. Forward to Gemini
      ▼
┌─────────────────────┐
│ Supabase Edge Func  │
│ analyze-signal      │
└─────┬───────────────┘
      │ 5. Call Gemini with AI instructions + market data
      ▼
┌─────────────────────┐
│  Google Gemini      │
│  Returns:           │
│   - decision        │
│   - reasoning       │
└─────┬───────────────┘
      │ 6. Parse response
      ▼
┌─────────────────────┐
│ Supabase Database   │
│ INSERT INTO         │
│ analysis_history    │
└─────┬───────────────┘
      │ 7. Return to machine
      ▼
┌─────────────────────┐
│  Fly Machine        │
│  Process decision:  │
│   - no_trade        │
│   - watch           │
│   - open_long/short │
│   - close           │
└─────┬───────────────┘
      │ 8. If trade decision
      ▼
┌─────────────────────┐
│  Trade Executor     │
│  Execute on Binance │
│  (paper or real)    │
└─────┬───────────────┘
      │ 9. Save trade
      ▼
┌─────────────────────┐
│ Supabase Database   │
│ INSERT INTO trades  │
│ UPDATE positions    │
└─────────────────────┘
```

### Flow 3: Position Re-analysis

```
┌─────────────────────┐
│  Fly Machine        │
│  Re-analysis timer  │
│  fires              │
└─────┬───────────────┘
      │ 1. Query signals needing re-analysis
      ▼
┌─────────────────────┐
│ Supabase Database   │
│ SELECT signals      │
│ WHERE status IN     │
│ ('watching',        │
│  'position_open')   │
└─────┬───────────────┘
      │ 2. For each signal
      ▼
┌─────────────────────┐
│  Fly Machine        │
│  - Get latest klines│
│  - Calculate        │
│    indicators       │
│  - Call analyze-    │
│    signal           │
└─────┬───────────────┘
      │ 3. Same as Flow 2 steps 4-9
      ▼
┌─────────────────────┐
│  Decision Handler   │
│  Process:           │
│   - Continue watch  │
│   - Open position   │
│   - Close position  │
│   - Partial TP      │
└─────────────────────┘
```

### Flow 4: Position Monitoring (Stop-Loss/Take-Profit)

```
┌─────────────────────┐
│  Position Monitor   │
│  Checks every 1s    │
└─────┬───────────────┘
      │ 1. For each open position
      ▼
┌─────────────────────┐
│  Get Current Price  │
│  from local ticker  │
│  data               │
└─────┬───────────────┘
      │ 2. Compare to SL/TP levels
      ▼
┌─────────────────────┐
│  Check Triggers:    │
│  - SL hit?          │
│  - TP hit?          │
└─────┬───────────────┘
      │ 3. If triggered
      ▼
┌─────────────────────┐
│  Trade Executor     │
│  Close position     │
│  (market order)     │
└─────┬───────────────┘
      │ 4. Save results
      ▼
┌─────────────────────┐
│ Supabase Database   │
│ UPDATE positions    │
│ status: 'closed'    │
│ INSERT INTO trades  │
└─────────────────────┘
```

---

## Database Schema

### Table: `users`

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'elite', 'power')),
  subscription_status TEXT CHECK (subscription_status IN ('active', 'cancelled', 'past_due')),
  binance_api_key TEXT, -- Encrypted
  binance_secret_key TEXT, -- Encrypted
  paper_trading_enabled BOOLEAN DEFAULT true,
  real_trading_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_tier ON users(tier);
```

### Table: `fly_machines`

```sql
CREATE TABLE fly_machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  machine_id TEXT UNIQUE NOT NULL, -- Fly.io machine ID
  status TEXT NOT NULL CHECK (status IN ('provisioning', 'starting', 'running', 'stopping', 'stopped', 'destroyed')),
  ip_address TEXT,
  region TEXT,
  memory_mb INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_heartbeat TIMESTAMPTZ,
  destroyed_at TIMESTAMPTZ
);

CREATE INDEX idx_fly_machines_user_id ON fly_machines(user_id);
CREATE INDEX idx_fly_machines_status ON fly_machines(status);
```

### Table: `traders`

```sql
CREATE TABLE traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT, -- Original user description
  signal_code TEXT NOT NULL, -- Go code for Yaegi
  ai_instructions TEXT NOT NULL, -- Instructions for Gemini analysis
  timeframes TEXT[] NOT NULL, -- e.g., ['1m', '5m', '1h']
  check_interval TEXT NOT NULL, -- e.g., '5s', '1m_close'
  reanalysis_interval TEXT NOT NULL, -- e.g., '5m', '1m_close'
  symbols TEXT[], -- Specific symbols, or NULL for all
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_traders_user_id ON traders(user_id);
CREATE INDEX idx_traders_status ON traders(status);
```

### Table: `signals`

```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'watching', 'position_open', 'closed')),
  trigger_price NUMERIC(20, 8) NOT NULL,
  current_price NUMERIC(20, 8),
  closed_at TIMESTAMPTZ,
  close_reason TEXT, -- 'no_trade', 'stop_loss', 'take_profit', 'manual', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_trader_id ON signals(trader_id);
CREATE INDEX idx_signals_user_id ON signals(user_id);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_signals_timestamp ON signals(timestamp DESC);
```

### Table: `positions`

```sql
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  entry_price NUMERIC(20, 8) NOT NULL,
  size NUMERIC(20, 8) NOT NULL, -- Position size in base asset
  stop_loss NUMERIC(20, 8),
  stop_loss_order_id BIGINT, -- Binance order ID for stop-loss
  take_profit NUMERIC(20, 8),
  take_profit_order_id BIGINT, -- Binance order ID for take-profit
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  exit_price NUMERIC(20, 8),
  pnl NUMERIC(20, 8), -- Profit/loss in quote asset (USDT)
  pnl_percent NUMERIC(10, 4), -- Profit/loss percentage
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  close_reason TEXT
);

CREATE INDEX idx_positions_signal_id ON positions(signal_id);
CREATE INDEX idx_positions_user_id ON positions(user_id);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_symbol ON positions(symbol);
```

### Table: `trades`

```sql
CREATE TABLE trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('paper', 'real')),
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  symbol TEXT NOT NULL,
  price NUMERIC(20, 8) NOT NULL,
  quantity NUMERIC(20, 8) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'filled', 'cancelled', 'failed')),
  binance_order_id BIGINT, -- For real trades
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_position_id ON trades(position_id);
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_type ON trades(type);
CREATE INDEX idx_trades_executed_at ON trades(executed_at DESC);
```

### Table: `analysis_history`

```sql
CREATE TABLE analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decision TEXT NOT NULL CHECK (decision IN (
    'no_trade', 'watch', 'open_long', 'open_short', 'close', 'partial_close',
    'scale_in', 'scale_out', 'update_stop_loss', 'update_take_profit', 'flip_position'
  )),
  reasoning TEXT NOT NULL,
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  market_data JSONB, -- Snapshot of market data at analysis time
  metadata JSONB -- stop_loss, take_profit, position_size, closePercentage, etc.
);

CREATE INDEX idx_analysis_history_signal_id ON analysis_history(signal_id);
CREATE INDEX idx_analysis_history_trader_id ON analysis_history(trader_id);
CREATE INDEX idx_analysis_history_user_id ON analysis_history(user_id);
CREATE INDEX idx_analysis_history_timestamp ON analysis_history(timestamp DESC);
```

---

## API Specifications

### Supabase Edge Function APIs

#### 1. Generate Strategy

**Endpoint**: `POST /functions/v1/generate-strategy`

**Headers**:
```
Authorization: Bearer <supabase_anon_key>
Content-Type: application/json
```

**Request Body**:
```json
{
  "userId": "uuid",
  "description": "Buy when RSI is oversold below 30 on 1h timeframe and MACD shows bullish crossover on 4h",
  "tier": "pro"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "trader": {
    "id": "uuid",
    "name": "RSI + MACD Strategy",
    "signalCode": "package main\n\nfunc checkSignal(symbol string, ticker Ticker, klines map[string][][]interface{}) bool {\n  // Generated Go code\n}",
    "aiInstructions": "You are analyzing a setup where RSI is oversold and MACD shows bullish momentum...",
    "timeframes": ["1h", "4h"],
    "recommendedInterval": "1h_close"
  },
  "machineId": "uuid" // Only present if new machine was provisioned
}
```

**Error Response** (400):
```json
{
  "success": false,
  "error": "Invalid tier or user not found"
}
```

#### 2. Analyze Signal

**Endpoint**: `POST /functions/v1/analyze-signal`

**Headers**:
```
Authorization: Bearer <supabase_anon_key>
Content-Type: application/json
```

**Request Body**:
```json
{
  "traderId": "uuid",
  "signalId": "uuid",
  "marketData": {
    "symbol": "BTCUSDT",
    "timestamp": 1704067200,
    "ticker": {
      "lastPrice": "42500.00",
      "volume24h": "25000.5",
      "priceChange24h": "2.5"
    },
    "klines": {
      "1h": [[1704067200000, "42000", "42600", "41900", "42500", "150.5", 1704070799999, "6312750", 1250, "80.2", "3360400"]],
      "4h": [...]
    },
    "indicators": {
      "rsi_1h": 28.5,
      "macd_4h": {"macd": 150.2, "signal": 120.5, "histogram": 29.7}
    }
  }
}
```

**Success Response** (200):
```json
{
  "success": true,
  "analysis": {
    "decision": "open_long",
    "reasoning": "RSI at 28.5 indicates oversold conditions on 1h chart. MACD bullish crossover confirmed on 4h with histogram at 29.7. Strong bullish divergence forming. Entry conditions met.",
    "confidence": 85,
    "metadata": {
      "stopLoss": 41800,
      "takeProfit": 44500,
      "positionSize": 0.1
    }
  }
}
```

**Error Response** (500):
```json
{
  "success": false,
  "error": "Failed to call Gemini API: rate limit exceeded"
}
```

#### 3. Provision Machine

**Endpoint**: `POST /functions/v1/provision-machine`

**Headers**:
```
Authorization: Bearer <supabase_anon_key>
Content-Type: application/json
```

**Request Body**:
```json
{
  "userId": "uuid",
  "tier": "pro"
}
```

**Success Response** (201):
```json
{
  "success": true,
  "machine": {
    "id": "uuid",
    "machineId": "fly-machine-id",
    "status": "starting",
    "ipAddress": "192.168.1.100",
    "region": "iad"
  }
}
```

#### 4. Destroy Machine

**Endpoint**: `POST /functions/v1/destroy-machine`

**Headers**:
```
Authorization: Bearer <supabase_anon_key>
Content-Type: application/json
```

**Request Body**:
```json
{
  "userId": "uuid",
  "reason": "subscription_cancelled"
}
```

**Success Response** (200):
```json
{
  "success": true,
  "finalState": {
    "openPositions": 2,
    "watchingSignals": 5
  }
}
```

### Fly Machine Internal APIs

#### 1. Health Check

**Endpoint**: `GET /health`

**Response** (200):
```json
{
  "status": "healthy",
  "uptime": 3600,
  "activeTraders": 5,
  "openPositions": 3,
  "websocketConnected": true
}
```

#### 2. Reload Traders

**Endpoint**: `POST /reload-traders`

**Response** (200):
```json
{
  "success": true,
  "tradersLoaded": 6
}
```

#### 3. Shutdown

**Endpoint**: `POST /shutdown`

**Request Body**:
```json
{
  "reason": "subscription_cancelled"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Machine shutting down gracefully",
  "openPositions": 2,
  "watchingSignals": 5
}
```

#### 4. Metrics

**Endpoint**: `GET /metrics`

**Response** (200):
```json
{
  "activeTraders": 5,
  "signalsChecked1h": 1250,
  "signalsTriggered1h": 8,
  "openPositions": 3,
  "watchingSignals": 12,
  "memoryUsageMB": 180,
  "websocketStatus": "connected",
  "lastKlineUpdate": "2025-01-01T12:00:00Z"
}
```

---

## Technology Stack

### Fly.io Machine
- **Language**: Go 1.21+
- **Interpreter**: Yaegi (github.com/traefik/yaegi) - Go interpreter for dynamic code execution
- **Trading SDK**: go-binance (github.com/adshao/go-binance) - Official Binance SDK for WebSocket + REST
- **WebSocket**: gorilla/websocket (github.com/gorilla/websocket) - WebSocket client
- **HTTP Client**: net/http (standard library)
- **Database Client**: pgx (github.com/jackc/pgx) - PostgreSQL driver
- **Logging**: zerolog (github.com/rs/zerolog) - Fast structured logging with timestamps
- **Event Bus**: EventBus (github.com/asaskevich/EventBus) - Pub/sub for internal event-driven architecture
- **Concurrency**: errgroup (golang.org/x/sync/errgroup) - Structured concurrency with error handling
- **Rate Limiting**: go-ratelimit (github.com/uber-go/ratelimit) - Rate limiting for Binance API calls
- **State Machine**: fsm (github.com/looplab/fsm) - Finite state machine for position lifecycle management
- **Configuration**: viper (github.com/spf13/viper) - Configuration management
- **Validation**: validator (github.com/go-playground/validator) - Struct validation
- **Metrics**: prometheus/client_golang - Prometheus metrics export

### Supabase Edge Functions
- **Runtime**: Deno
- **Language**: TypeScript
- **AI SDK**: Firebase AI Logic / Gemini SDK
- **Database**: Supabase Client (supabase-js)

### Database
- **Type**: PostgreSQL 15+
- **Hosting**: Supabase
- **Features**: Row Level Security, Realtime subscriptions, Extensions (pg_cron)

### External APIs
- **Binance**: WebSocket API (market data), REST API (trading)
- **Google Gemini**: 1.5 Pro or Flash models via Firebase AI Logic
- **Fly.io**: Machines API for provisioning/destroying

---

## Deployment Architecture

### Docker Image for Fly Machine

**Dockerfile**:
```dockerfile
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build binary
RUN CGO_ENABLED=0 GOOS=linux go build -o /trader-machine ./cmd/machine

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /trader-machine .

EXPOSE 8080

CMD ["./trader-machine"]
```

### Fly.io Configuration

**fly.toml**:
```toml
app = "trader-machines"
primary_region = "iad"

[build]
  image = "registry.fly.io/trader-machines:latest"

[[services]]
  internal_port = 8080
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[env]
  SUPABASE_URL = "https://your-project.supabase.co"

[experimental]
  auto_rollback = true

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1
```

### Machine Provisioning Flow

1. **User Creates First Trader** → Frontend calls `generate-strategy`
2. **Edge Function Detects** → No machine exists for user
3. **Call Fly.io API**:
   ```typescript
   const response = await fetch('https://api.machines.dev/v1/apps/trader-machines/machines', {
     method: 'POST',
     headers: {
       'Authorization': `Bearer ${FLY_API_TOKEN}`,
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       name: `trader-${userId}`,
       region: 'iad',
       config: {
         image: 'registry.fly.io/trader-machines:latest',
         env: {
           USER_ID: userId,
           SUPABASE_URL: process.env.SUPABASE_URL,
           SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
         },
         services: [
           {
             protocol: 'tcp',
             internal_port: 8080,
             ports: [{ port: 443, handlers: ['tls', 'http'] }]
           }
         ]
       }
     })
   });
   ```
4. **Machine Starts** → Runs `/trader-machine` binary
5. **Machine Initialization**:
   - Load `USER_ID` from env
   - Connect to Supabase
   - Fetch all traders for user
   - Connect to Binance WebSocket
   - Start signal detection timers
   - Start re-analysis timers
   - Start position monitor
6. **Save to Database**:
   ```sql
   INSERT INTO fly_machines (user_id, machine_id, status, ip_address, region, memory_mb)
   VALUES ($1, $2, 'running', $3, $4, 256);
   ```

### Machine Lifecycle States

```
provisioning → starting → running → stopping → stopped → destroyed
                   ↑                    ↓
                   └────── error ───────┘
```

### Scaling Considerations

- **Per-User Machines**: Linear scaling with user count
- **Cost Per Machine**: ~$3.19-5.70/month with scale-to-zero
- **Memory Limits**:
  - Pro tier: 256MB (up to ~20 traders)
  - Elite tier: 512MB (up to ~50 traders)
  - Power tier: 1GB (up to ~100 traders)
- **Concurrent Traders**: Goroutines handle parallel execution efficiently
- **Binance Rate Limits**: Each machine has independent API limits

### Machine Code Updates & Deployment Strategy

#### Rolling Updates (Recommended)

**Strategy**: Update machines one-by-one with zero downtime per user

**Process**:
1. **Build & Push New Image**:
   ```bash
   # Build new Docker image with version tag
   docker build -t registry.fly.io/trader-machines:v1.2.0 .
   docker push registry.fly.io/trader-machines:v1.2.0

   # Tag as latest
   docker tag registry.fly.io/trader-machines:v1.2.0 registry.fly.io/trader-machines:latest
   docker push registry.fly.io/trader-machines:latest
   ```

2. **Update Machines via Fly.io API**:
   ```typescript
   // Supabase Edge Function: update-machines

   async function updateAllMachines() {
     // Get all running machines
     const { data: machines } = await supabase
       .from('fly_machines')
       .select('*')
       .eq('status', 'running');

     for (const machine of machines) {
       try {
         // Step 1: Signal machine to save state
         await fetch(`https://${machine.ip_address}/prepare-shutdown`, {
           method: 'POST'
         });

         // Step 2: Update machine via Fly.io API
         await fetch(`https://api.machines.dev/v1/apps/trader-machines/machines/${machine.machine_id}`, {
           method: 'POST',
           headers: {
             'Authorization': `Bearer ${FLY_API_TOKEN}`,
             'Content-Type': 'application/json'
           },
           body: JSON.stringify({
             config: {
               image: 'registry.fly.io/trader-machines:latest'
             }
           })
         });

         // Step 3: Wait for machine to restart
         await waitForMachineReady(machine.machine_id);

         // Step 4: Verify machine health
         const health = await fetch(`https://${machine.ip_address}/health`);
         if (!health.ok) {
           throw new Error('Machine failed health check after update');
         }

         console.log(`✓ Updated machine ${machine.machine_id}`);

         // Rate limit: wait between updates
         await sleep(5000);
       } catch (error) {
         console.error(`✗ Failed to update machine ${machine.machine_id}:`, error);
         // Continue with next machine
       }
     }
   }
   ```

3. **Machine Graceful Shutdown Flow**:
   ```go
   func (m *Machine) PrepareShutdown() error {
       log.Printf("[%s] Preparing for shutdown - saving state", time.Now().Format(time.RFC3339))

       // 1. Stop accepting new signals
       m.timerManager.PauseAll()

       // 2. Wait for in-flight operations to complete
       m.waitGroup.Wait()

       // 3. Save final state to database
       err := m.saveState()
       if err != nil {
           return err
       }

       // 4. Close WebSocket connections
       m.binanceWS.Close()

       log.Printf("[%s] Ready for shutdown", time.Now().Format(time.RFC3339))
       return nil
   }

   func (m *Machine) RecoverAfterRestart() error {
       log.Printf("[%s] Recovering state after restart", time.Now().Format(time.RFC3339))

       // Load state from database and resume
       return m.RecoverState()
   }
   ```

**Pros**:
- ✅ Zero downtime per user
- ✅ Automatic rollback if machine fails health check
- ✅ State preserved across updates
- ✅ Can pause/resume during deployment

**Cons**:
- ⏱️ Takes time to update all machines (5s × N machines)
- 🔄 Machines briefly offline during restart (~10-30s)

**Best For**: Production deployments with many users

---

#### Blue-Green Deployment (Alternative)

**Strategy**: Create new machines alongside old ones, then switch

**Process**:
1. **Create Green Machines**:
   ```typescript
   async function blueGreenDeploy() {
     const { data: oldMachines } = await supabase
       .from('fly_machines')
       .select('*')
       .eq('status', 'running');

     const newMachineIds = [];

     for (const oldMachine of oldMachines) {
       // Create new machine with latest image
       const response = await fetch('https://api.machines.dev/v1/apps/trader-machines/machines', {
         method: 'POST',
         headers: {
           'Authorization': `Bearer ${FLY_API_TOKEN}`,
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
           name: `trader-${oldMachine.user_id}-green`,
           region: oldMachine.region,
           config: {
             image: 'registry.fly.io/trader-machines:latest',
             env: {
               USER_ID: oldMachine.user_id,
               SUPABASE_URL: process.env.SUPABASE_URL,
               SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
             },
             services: [
               {
                 protocol: 'tcp',
                 internal_port: 8080,
                 ports: [{ port: 443, handlers: ['tls', 'http'] }]
               }
             ]
           }
         })
       });

       const newMachine = await response.json();
       newMachineIds.push(newMachine.id);

       // Wait for new machine to be ready
       await waitForMachineReady(newMachine.id);
     }

     // Switch: update database to point to new machines
     // Destroy old machines
     for (const oldMachine of oldMachines) {
       await destroyMachine(oldMachine.machine_id);
     }
   }
   ```

**Pros**:
- ✅ Instant rollback (switch back to blue)
- ✅ Can test green before switching
- ✅ No user downtime

**Cons**:
- 💰 2x cost during deployment
- 🔄 State migration complexity
- ⏱️ Longer deployment time

**Best For**: Critical updates that need testing before full rollout

---

#### Hot Reload (Future Enhancement)

**Strategy**: Update code without restarting process

**Concept**:
```go
func (m *Machine) HotReload() error {
    // 1. Download new binary
    newBinary, err := downloadBinary("https://updates.example.com/trader-machine-v1.2.0")
    if err != nil {
        return err
    }

    // 2. Verify signature
    if !verifySignature(newBinary) {
        return errors.New("invalid signature")
    }

    // 3. Spawn new process
    cmd := exec.Command(newBinary)
    cmd.Env = os.Environ()

    // 4. Transfer state via IPC
    stateJSON, _ := json.Marshal(m.state)
    cmd.Stdin = bytes.NewReader(stateJSON)

    // 5. Start new process
    err = cmd.Start()
    if err != nil {
        return err
    }

    // 6. Wait for new process to confirm ready
    // 7. Old process exits

    return nil
}
```

**Pros**:
- ⚡ Sub-second updates
- ✅ No machine restart

**Cons**:
- 🔧 Complex implementation
- 🐛 Risk of state corruption
- 🔒 Security concerns

**Best For**: Future optimization for critical hotfixes

---

#### Deployment Pipeline

**Recommended CI/CD Flow**:

```yaml
# .github/workflows/deploy-machines.yml

name: Deploy Fly Machines

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build Docker Image
        run: |
          docker build -t registry.fly.io/trader-machines:${{ github.sha }} .
          docker tag registry.fly.io/trader-machines:${{ github.sha }} registry.fly.io/trader-machines:latest

      - name: Push to Fly.io Registry
        run: |
          echo ${{ secrets.FLY_API_TOKEN }} | docker login -u x --password-stdin registry.fly.io
          docker push registry.fly.io/trader-machines:${{ github.sha }}
          docker push registry.fly.io/trader-machines:latest

      - name: Deploy Rolling Update
        run: |
          curl -X POST https://your-project.supabase.co/functions/v1/update-machines \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"imageTag": "${{ github.sha }}"}'

      - name: Verify Deployment
        run: |
          # Check all machines healthy
          curl https://your-project.supabase.co/functions/v1/check-machine-health \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}"
```

**Health Check During Deployment**:
```go
func (m *Machine) HealthCheck() HealthStatus {
    return HealthStatus{
        Status:            "healthy",
        Version:           "v1.2.0",
        Uptime:            time.Since(m.startTime).Seconds(),
        ActiveTraders:     len(m.timerManager.timers),
        OpenPositions:     len(m.positionMonitor.positions),
        WebSocketConnected: m.binanceWS.IsConnected(),
        LastKlineUpdate:   m.klineStore.lastUpdate,
    }
}
```

---

#### Version Compatibility

**Database Migrations**:
- Use versioned migrations in Supabase
- Machines check schema version on startup
- Refuse to start if incompatible schema

```go
func (m *Machine) CheckSchemaVersion() error {
    var schemaVersion int
    err := m.db.QueryRow("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").Scan(&schemaVersion)
    if err != nil {
        return err
    }

    if schemaVersion < MinRequiredSchemaVersion {
        return fmt.Errorf("schema version %d too old, need %d", schemaVersion, MinRequiredSchemaVersion)
    }

    if schemaVersion > MaxSupportedSchemaVersion {
        return fmt.Errorf("schema version %d too new, max supported %d", schemaVersion, MaxSupportedSchemaVersion)
    }

    return nil
}
```

---

## State Management & Recovery

### State Persistence Strategy

**Every state change is immediately persisted to Supabase**:
1. Signal triggered → Save to `signals` table
2. Gemini analysis complete → Save to `analysis_history` table
3. Trade executed → Save to `trades` table
4. Position opened/updated → Save to `positions` table

**Crash Recovery**:
1. Machine restarts (Fly auto-restart or manual)
2. Loads `USER_ID` from env
3. Queries database for:
   - Active traders
   - Open positions
   - Watching signals
4. Resumes monitoring from last known state

**Example Recovery Flow**:
```go
func (m *Machine) RecoverState() error {
    // Load traders
    traders, err := m.db.GetActiveTraders(m.userID)
    if err != nil {
        return err
    }

    for _, trader := range traders {
        // Restart signal detection timer
        m.timerManager.AddTrader(trader)

        // Restart re-analysis timer
        m.reanalysisManager.AddTrader(trader)
    }

    // Load open positions for monitoring
    positions, err := m.db.GetOpenPositions(m.userID)
    if err != nil {
        return err
    }

    for _, position := range positions {
        m.positionMonitor.AddPosition(position)
    }

    // Load watching signals for re-analysis
    signals, err := m.db.GetWatchingSignals(m.userID)
    if err != nil {
        return err
    }

    log.Printf("State recovered: %d traders, %d positions, %d watching signals",
        len(traders), len(positions), len(signals))

    return nil
}
```

### Heartbeat System

**Purpose**: Detect dead machines and alert user

**Implementation**:
```go
func (m *Machine) StartHeartbeat() {
    ticker := time.NewTicker(30 * time.Second)

    for range ticker.C {
        _, err := m.db.Exec(`
            UPDATE fly_machines
            SET last_heartbeat = NOW()
            WHERE machine_id = $1
        `, m.machineID)

        if err != nil {
            log.Printf("Failed to update heartbeat: %v", err)
        }
    }
}
```

**Database Monitor** (pg_cron job in Supabase):
```sql
-- Run every minute
SELECT cron.schedule(
  'check-dead-machines',
  '* * * * *',
  $$
  UPDATE fly_machines
  SET status = 'error'
  WHERE status = 'running'
    AND last_heartbeat < NOW() - INTERVAL '2 minutes';
  $$
);
```

---

## Error Handling & Recovery

### Error Categories

#### 1. Binance Connection Errors
**Problem**: WebSocket disconnects, API rate limits

**Handling**:
```go
func (bw *BinanceWSManager) reconnect() {
    maxRetries := 10
    backoff := 1 * time.Second

    for i := 0; i < maxRetries; i++ {
        log.Printf("[%s] Reconnecting to Binance (attempt %d/%d)", time.Now().Format(time.RFC3339), i+1, maxRetries)

        err := bw.Connect()
        if err == nil {
            log.Printf("[%s] Reconnected successfully", time.Now().Format(time.RFC3339))
            return
        }

        time.Sleep(backoff)
        backoff *= 2 // Exponential backoff
    }

    log.Printf("[%s] Failed to reconnect after %d attempts, shutting down", time.Now().Format(time.RFC3339), maxRetries)
    panic("Unable to reconnect to Binance")
}
```

#### 2. Yaegi Compilation Errors
**Problem**: User signal code has syntax errors

**Handling**:
```go
func (se *SignalExecutor) LoadSignalCode(code string) error {
    _, err := se.interpreter.Eval(code)
    if err != nil {
        // Save error to database
        updateTraderError(se.traderID, fmt.Sprintf("Compilation failed: %v", err))

        // Mark trader as error state
        updateTraderStatus(se.traderID, "error")

        return fmt.Errorf("yaegi compilation failed: %w", err)
    }
    return nil
}
```

**Frontend shows**: "Your strategy code has a syntax error. Please regenerate."

#### 3. Gemini API Errors
**Problem**: Rate limits, timeouts, invalid responses

**Handling**:
```go
func callAnalyzeSignal(traderID, signalID string, marketData MarketData) (*Decision, error) {
    maxRetries := 3
    backoff := 2 * time.Second

    for i := 0; i < maxRetries; i++ {
        resp, err := httpClient.Post(
            fmt.Sprintf("%s/functions/v1/analyze-signal", supabaseURL),
            "application/json",
            marshalJSON(AnalyzeRequest{
                TraderID: traderID,
                SignalID: signalID,
                MarketData: marketData,
            }),
        )

        if err == nil && resp.StatusCode == 200 {
            var decision Decision
            json.NewDecoder(resp.Body).Decode(&decision)
            return &decision, nil
        }

        log.Printf("[%s] [%s] Gemini analysis failed (attempt %d/%d): %v", time.Now().Format(time.RFC3339), traderID, i+1, maxRetries, err)
        time.Sleep(backoff)
        backoff *= 2
    }

    return nil, fmt.Errorf("failed to get Gemini analysis after %d retries", maxRetries)
}
```

**Fallback**: If Gemini fails, signal stays in "new" status and user is notified

#### 4. Trade Execution Errors
**Problem**: Binance order fails (insufficient balance, invalid params)

**Handling**:
```go
func (te *TradeExecutor) executeRealTrade(position Position, decision Decision) error {
    order, err := te.binanceClient.NewOrder(position.Symbol, side, "MARKET", quantity)
    if err != nil {
        // Save failed trade to database
        trade := Trade{
            PositionID: position.ID,
            Type:       "real",
            Side:       side,
            Status:     "failed",
            ErrorMessage: err.Error(),
        }
        saveTradeToDB(trade)

        // Send notification to user
        sendNotification(position.UserID, "Trade Failed", fmt.Sprintf("Failed to execute %s order for %s: %v", side, position.Symbol, err))

        return err
    }

    return nil
}
```

---

## Cost Analysis

### Per-User Machine Costs

**Fly.io Machine Pricing** (with scale-to-zero):
- **Pro Tier** (256MB): $0.0000022/s = $5.70/month max (94% uptime) → **Actual: $1.94/month**
- **Elite Tier** (512MB): $0.0000044/s = $11.40/month max → **Actual: $3.19/month**
- **Power Tier** (1GB): $0.0000088/s = $22.80/month max → **Actual: $5.70/month**

### Profit Margins

| Tier  | Price | Cost | Profit | Margin |
|-------|-------|------|--------|--------|
| Pro   | $20   | $1.94| $18.06 | 90%    |
| Elite | $50   | $3.19| $46.81 | 94%    |
| Power | $100  | $5.70| $94.30 | 94%    |

### Scaling Economics (100 Users)

**Pro Tier** (80 users × $20):
- Revenue: $1,600/month
- Fly Costs: $155.20/month
- Supabase: ~$25/month (Database + Edge Functions)
- **Net Profit: $1,419.80/month (89% margin)**

**Elite Tier** (15 users × $50):
- Revenue: $750/month
- Fly Costs: $47.85/month
- **Net Profit: $702.15/month (94% margin)**

**Power Tier** (5 users × $100):
- Revenue: $500/month
- Fly Costs: $28.50/month
- **Net Profit: $471.50/month (94% margin)**

**Total (100 Users)**:
- Revenue: $2,850/month
- Costs: $256.55/month
- **Net Profit: $2,593.45/month (91% margin)**

---

## Security Considerations

### 1. API Key Management
- Binance API keys stored encrypted in Supabase (`users.binance_api_key`)
- Keys only loaded into machine memory, never logged
- Keys passed via secure env vars to machine

### 2. Yaegi Sandboxing
- User code runs in Yaegi interpreter (safe by default)
- No access to filesystem, network, or system calls
- Only whitelisted helper functions available

### 3. Database Security
- Row Level Security (RLS) on all tables
- Users can only access their own data
- Edge Functions use service role key (elevated permissions)
- Machines use anon key + RLS policies

### 4. Edge Function Authentication
- All calls require `Authorization: Bearer <token>`
- Token validated against Supabase Auth
- Rate limiting on expensive operations (Gemini calls)

### 5. Fly Machine Isolation
- Each user gets dedicated machine (no shared state)
- Machines can only write to their user's database rows
- Network policies restrict inter-machine communication

---

## Monitoring & Observability

### Metrics to Track

**Per-Machine Metrics**:
- Active traders count
- Signals checked per hour
- Signals triggered per hour
- Gemini API calls per hour
- Open positions count
- Memory usage
- CPU usage
- WebSocket connection uptime

**System-Wide Metrics**:
- Total active machines
- Machines in error state
- Database query performance
- Edge Function execution times
- Gemini API error rates
- Trade execution success rates

### Logging Strategy

**Structured Logging with Timestamps** (as per CLAUDE.md):
```go
log.Printf("[%s] [%s] Signal triggered for %s at %.2f",
    time.Now().Format(time.RFC3339),
    trader.ID,
    symbol,
    price)
```

**Log Aggregation**:
- Fly logs shipped to Supabase Edge Function
- Stored in `machine_logs` table for debugging
- Queryable by user for their machine only

### Alerting

**Critical Alerts** (sent to user + ops team):
- Machine failed to start
- Binance connection lost for >5 minutes
- Gemini API failing for >10 minutes
- Trade execution failed
- Machine heartbeat missed (dead machine)

**User Notifications**:
- New signal triggered (if enabled)
- Position opened
- Position closed (SL/TP hit)
- Trader entered error state

---

## Future Enhancements

### Phase 2 Features
1. **Backtesting**: Run signal code against historical data before deployment
2. **Multi-Exchange**: Support for Coinbase, Kraken, etc.
4. **Portfolio Management**: Cross-trader risk limits and correlation analysis
5. **Social Trading**: Share strategies, copy other traders

### Phase 3 Features
1. **Advanced Order Types**: Limit orders, trailing stops, iceberg orders
2. **Machine Learning Models**: Train custom models on user's trading history
3. **Multi-Asset**: Stocks, forex, options, futures
4. **White Label**: Allow other platforms to embed the trading engine

---

## Summary

This architecture provides:

✅ **Per-user isolation** with dedicated Fly machines
✅ **Flexible signal detection** (1s to candle intervals)
✅ **Powerful AI analysis** via Gemini (proxied through Edge Functions)
✅ **Real-time position monitoring** with stop-loss/take-profit
✅ **Paper + real trading** support
✅ **Full state persistence** in Supabase
✅ **Crash recovery** with state reload from database
✅ **Cost-effective** (~90% profit margins)
✅ **Scalable** to 1,000+ users
✅ **Secure** with encryption, sandboxing, and RLS

The hybrid Supabase + Fly.io architecture balances simplicity (auth, database, AI proxy) with power (dedicated compute, direct Binance access, custom execution intervals), creating a professional-grade trading platform at sustainable unit economics.
