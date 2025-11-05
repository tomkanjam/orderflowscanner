# Go Backend Signal Generation Architecture Analysis

## Executive Summary

The Go backend uses an **event-driven architecture** for signal generation. Signals are generated when traders' filter code matches market conditions, calculated indicators are computed for AI analysis, but **currently indicator values are NOT persisted to the database** - they exist only in-memory during analysis execution.

---

## 1. Signal Generation Flow

### 1.1 High-Level Process

```
Market Update (WebSocket) 
  ↓
Event Bus (Candle Event)
  ↓
Trader Executor (Matches Traders to Intervals)
  ↓
Worker Pool (Parallel Symbol Processing)
  ↓
Filter Code Execution (Yaegi) → Signal Generated
  ↓
Signal Saved to Database
  ↓
Analysis Engine Queue
  ↓
Indicator Calculation → AI Analysis
```

### 1.2 Event-Driven Execution

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/internal/trader/executor.go`

- **Lines 156-186**: `handleCandleEvent()` - Matches traders to intervals and triggers execution
- **Lines 188-360**: `executeTrader()` - Main execution function with parallel worker pool
- **Lines 689-755**: `processSymbol()` - Executes filter code for a single symbol

Key points:
- Traders are triggered by candle close events from the event bus
- Worker pool (one goroutine per CPU core) processes multiple symbols in parallel
- Each symbol gets kline data, ticker data, and market data context
- Filter code is executed via Yaegi (Go interpreter)
- If filter returns `true`, a signal is created

---

## 2. Filter Code Execution

### 2.1 Yaegi Executor

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/pkg/yaegi/executor.go`

- Executes Go code dynamically at runtime
- Validates code syntax before execution
- Supports timeout-based execution (default: 1 second per symbol)
- Receives `types.MarketData` struct with klines and ticker info

### 2.2 Input Data Structure

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/pkg/types/types.go` (Lines 130-145)

```go
type MarketData struct {
    Symbol    string                `json:"symbol"`
    Ticker    *SimplifiedTicker     `json:"ticker"`
    Klines    map[string][]Kline    `json:"klines"` // Key is interval (e.g., "5m", "1h")
    Timestamp time.Time             `json:"timestamp"`
}

type SimplifiedTicker struct {
    LastPrice          float64 `json:"lastPrice"`
    PriceChangePercent float64 `json:"priceChangePercent"`
    QuoteVolume        float64 `json:"quoteVolume"`
}

type Kline struct {
    OpenTime    int64   `json:"openTime"`
    Open        float64 `json:"open"`
    High        float64 `json:"high"`
    Low         float64 `json:"low"`
    Close       float64 `json:"close"`
    Volume      float64 `json:"volume"`
    BuyVolume   float64 `json:"buyVolume"`
    SellVolume  float64 `json:"sellVolume"`
    VolumeDelta float64 `json:"volumeDelta"`
    QuoteVolume float64 `json:"quoteVolume"`
    Trades      int     `json:"trades"`
    CloseTime   int64   `json:"closeTime"`
}
```

---

## 3. Signal Data Structure

### 3.1 Signal Type

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/pkg/types/types.go` (Lines 114-128)

```go
type Signal struct {
    ID                    string    `json:"id"`
    TraderID              string    `json:"trader_id"`
    UserID                *string   `json:"user_id,omitempty"` // NULL for built-in traders
    Symbol                string    `json:"symbol"`
    Interval              string    `json:"interval"`
    Timestamp             time.Time `json:"timestamp"`
    PriceAtSignal         float64   `json:"price_at_signal"`
    ChangePercentAtSignal float64   `json:"change_percent_at_signal"`
    VolumeAtSignal        float64   `json:"volume_at_signal"`
    Count                 int       `json:"count"` // Dedupe count
    Source                string    `json:"source"` // "browser" or "cloud"
    MachineID             *string   `json:"machine_id,omitempty"`
}
```

### 3.2 Saving Signals to Database

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/internal/trader/executor.go` (Lines 757-793)

```go
func (e *Executor) saveSignals(signals []Signal) error {
    // Convert to types.Signal slice for DB insertion
    dbSignals := make([]*types.Signal, 0, len(signals))
    for _, signal := range signals {
        // Handle user_id: use nil for built-in traders
        var userID *string
        if signal.UserID != "" && signal.UserID != "system" {
            userID = &signal.UserID
        }
        
        dbSignals = append(dbSignals, &types.Signal{
            ID:                    signal.ID,
            TraderID:              signal.TraderID,
            UserID:                userID,
            Symbol:                signal.Symbol,
            Interval:              signal.Interval,
            Timestamp:             signal.TriggeredAt,
            PriceAtSignal:         signal.Price,
            ChangePercentAtSignal: 0, // Will be calculated from ticker data
            VolumeAtSignal:        signal.Volume,
            Count:                 1,
            Source:                "cloud",
            MachineID:             nil,
        })
    }
    
    // Single batch insert
    if err := e.supabase.CreateSignalsBatch(e.ctx, dbSignals); err != nil {
        return fmt.Errorf("failed to save signals batch: %w", err)
    }
    return nil
}
```

**Critical Finding**: Only basic signal data is saved to the database. **No indicator values are persisted.**

---

## 4. Indicator Calculation & AI Analysis

### 4.1 Where Indicators Are Calculated

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/internal/analysis/calculator.go`

**Triggered Flow**:
1. Signal is saved to database (executor.go line 338)
2. Signal is queued for analysis (executor.go line 347)
3. Analysis engine processes the signal
4. **Calculator.CalculateIndicators()** is called (line 24)

### 4.2 Indicator Calculation Process

```go
// File: calculator.go, Lines 24-67
func (c *Calculator) CalculateIndicators(req *AnalysisRequest) (map[string]interface{}, error) {
    // 1. Get trader config to know which indicators to calculate
    filter, err := req.Trader.GetFilter()
    if len(filter.Indicators) == 0 {
        return make(map[string]interface{}), nil // Empty if no indicators configured
    }
    
    // 2. Get klines for primary interval
    klines, ok := req.MarketData.Klines[req.Interval]
    
    // 3. Calculate each indicator from the config
    result := make(map[string]interface{})
    for _, indConfig := range filter.Indicators {
        value, err := c.calculateIndicator(indConfig, klines, req.MarketData)
        if err != nil {
            log.Printf("[Calculator] Failed to calculate %s: %v", indConfig.Name, err)
            continue
        }
        result[indConfig.Name] = value
    }
    
    return result, nil
}
```

### 4.3 Supported Indicators

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/internal/analysis/calculator.go` (Lines 69-89)

```go
switch config.Name {
case "MA", "SMA":
    return c.calculateMA(config, klines)
case "EMA":
    return c.calculateEMA(config, klines)
case "RSI":
    return c.calculateRSI(config, klines)
case "MACD":
    return c.calculateMACD(config, klines)
case "BollingerBands", "BB":
    return c.calculateBollingerBands(config, klines)
case "VWAP":
    return c.calculateVWAP(klines)
case "Stochastic":
    return c.calculateStochastic(config, klines)
default:
    return nil, fmt.Errorf("unsupported indicator: %s", config.Name)
}
```

### 4.4 Indicator Return Formats

Each indicator returns a map with different fields:

**MA/EMA**:
```go
map[string]interface{}{
    "value":   float64,   // Latest value
    "series":  []float64, // All historical values
    "period":  int,
}
```

**RSI**:
```go
map[string]interface{}{
    "value":   float64,   // Latest RSI
    "series":  []float64, // All RSI values
    "period":  int,
}
```

**MACD**:
```go
map[string]interface{}{
    "macd":           float64,   // Latest MACD
    "signal":         float64,   // Latest signal line
    "histogram":      float64,   // Latest histogram
    "macdSeries":     []float64, // All MACD values
    "signalSeries":   []float64, // All signal values
    "histogramSeries": []float64, // All histogram values
}
```

**Bollinger Bands**:
```go
map[string]interface{}{
    "upper":         float64,   // Latest upper band
    "middle":        float64,   // Latest middle (SMA)
    "lower":         float64,   // Latest lower band
    "upperSeries":   []float64, // All upper values
    "middleSeries":  []float64, // All middle values
    "lowerSeries":   []float64, // All lower values
    "period":        int,
    "stdDev":        float64,
}
```

**Stochastic**:
```go
map[string]interface{}{
    "k":       float64, // K% value
    "d":       float64, // D% value
    "kPeriod": int,
    "dPeriod": int,
}
```

---

## 5. Analysis Engine & Braintrust Integration

### 5.1 Analysis Engine

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/internal/analysis/engine.go`

**Key Methods**:
- **Lines 113-128**: `QueueAnalysis()` - Queues signals for analysis
- **Lines 158-240**: `processRequest()` - Main analysis flow with Braintrust tracing

**Analysis Pipeline**:
1. Calculate indicators (lines 179-185)
2. Build prompt with indicators (lines 187-191)
3. Call OpenRouter API (lines 193-208)
4. Parse analysis result (lines 216-225)
5. Save to database (line 229)

### 5.2 Prompt Building

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/internal/analysis/prompter.go`

The prompter formats indicators for AI consumption:

```go
// Lines 20-77: BuildAnalysisPrompt
// Includes:
// - Strategy description from trader config
// - Current price and 24h change
// - Volume data
// - Formatted technical indicators
// - Last 5 candles (OHLCV)
```

**Key Formatting Function** (Lines 129-142):
```go
func (p *Prompter) formatIndicators(indicators map[string]interface{}) string {
    // Iterates through calculated indicators
    // Extracts latest values
    // Formats as readable text for AI
}
```

### 5.3 Where Indicators Are Used

Indicators are **ONLY used for**:
1. **Prompt building** for AI analysis
2. **Optional visualization** (if frontend implements it)

They are **NOT**:
- Stored in the database
- Returned via API endpoints
- Persisted for historical analysis

---

## 6. API Endpoints for Signals

### 6.1 Current Endpoints

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/internal/server/server.go` (Lines 202-220)

```go
// Signals
api.HandleFunc("/signals", s.handleCreateSignal).Methods("POST")
api.HandleFunc("/signals", s.handleGetSignals).Methods("GET")

// Execute filter
api.HandleFunc("/execute-filter", s.handleExecuteFilter).Methods("POST")

// Trader management
traderAPI.HandleFunc("/{id}/execute-immediate", s.traderHandler.ExecuteImmediate).Methods("POST")
```

### 6.2 Signal Response Format

**GET /api/v1/signals** - NOT IMPLEMENTED (Line 504-506)
```go
func (s *Server) handleGetSignals(w http.ResponseWriter, r *http.Request) {
    // TODO: Implement GetSignals in supabase client
    respondError(w, http.StatusNotImplemented, "Not implemented", nil)
}
```

**POST /api/v1/traders/{id}/execute-immediate** - Returns ExecutionResult

**File**: `/Users/tom/Documents/Projects/ai-powered-binance-crypto-screener/backend/go-screener/internal/trader/executor.go` (Lines 362-372)

```go
type ExecutionResult struct {
    TraderID       string    `json:"traderId"`
    Timestamp      time.Time `json:"timestamp"`
    TotalSymbols   int       `json:"totalSymbols"`
    MatchCount     int       `json:"matchCount"`
    Signals        []Signal  `json:"signals"`      // Generated signals
    ExecutionTime  int64     `json:"executionTimeMs"`
    CacheHits      int       `json:"cacheHits"`
    CacheMisses    int       `json:"cacheMisses"`
}
```

The `Signal` struct in this response has:
- `ID`, `TraderID`, `UserID`, `Symbol`, `Interval`
- `TriggeredAt`, `Price`, `Volume`
- `Metadata` (map, currently empty)

**NO indicator data is included.**

---

## 7. What's Currently Missing for Frontend Chart Visualization

### 7.1 Gap Analysis

**Currently Available**:
- Signal timestamps, symbol, interval, price
- Kline data (OHLCV) for the matching symbol
- Trader configuration with indicator definitions

**Missing for Chart Display**:
- ❌ Calculated indicator values from the moment signal was generated
- ❌ Historical series of indicators (for chart overlay)
- ❌ Relationship between indicator values and signal decision
- ❌ Any way to reconstruct which exact indicator triggered the signal

### 7.2 Why Indicators Aren't Persisted

**Reasons**:
1. **Performance**: Calculating indicators for every symbol × every interval is expensive
2. **Storage**: Series data (e.g., 250 RSI values) multiplied by thousands of signals = massive DB overhead
3. **Simplicity**: Indicators are only needed for AI analysis, which happens asynchronously
4. **Reconstruction**: Can recalculate indicators from historical kline data anytime

### 7.3 Solution Architecture

To get indicator data to the frontend:

**Option 1: Fetch & Recalculate on Frontend**
- Frontend fetches klines for signal symbol/interval
- Frontend JavaScript recalculates indicators using same logic
- Pro: No backend changes, uses cached data
- Con: Slower, duplicates calculation logic

**Option 2: Fetch from Go Backend**
- Add indicator calculation endpoint
- Return indicator series for a given symbol/interval/timeframe
- Pro: Uses Go's fast calculation
- Con: Another API call per signal

**Option 3: Store Indicators with Signals (Recommended)**
- Modify signal save to include calculated indicators
- Store as JSONB in Supabase (efficient)
- Return indicators in signal API response
- Pro: One-time calculation, no duplication, always available
- Con: Requires data model change

---

## 8. Code Flow Diagram: Signal Generation to Analysis

```
executeTrader() [executor.go:188]
  ├─ Get symbols to screen [line 204]
  ├─ Fetch kline data [line 222]
  ├─ Batch fetch ticker data [line 232]
  └─ Worker pool processes symbols [lines 240-302]
      └─ For each symbol (parallel):
          ├─ processSymbol() [line 273]
          │   ├─ Build MarketData with klines & ticker
          │   ├─ Execute filter code via Yaegi [line 732]
          │   └─ If matches: create Signal [lines 738-751]
          │       └─ Signal has: ID, TraderID, UserID, Symbol, Interval, Price, Volume, Metadata
          └─ Collect signals [lines 311-328]
  
  ├─ Save signals to DB [line 338]
  │   └─ Signals saved with basic fields only (NO indicators)
  │
  └─ Queue signals for analysis [line 347]
      └─ queueSignalsForAnalysis() [line 511]
          └─ For each signal:
              ├─ Fetch klines for analysis
              ├─ Fetch ticker data
              └─ Create AnalysisRequest → Queue for analysis [line 618]
                  └─ Analysis Engine processes [engine.go:158]
                      ├─ CalculateIndicators() [line 179]
                      │   ├─ Get indicator configs from trader filter
                      │   └─ Calculate each indicator from klines
                      │       (Result: map[string]interface{})
                      │
                      ├─ BuildAnalysisPrompt() [line 188]
                      │   └─ Format indicators for AI
                      │
                      ├─ Call OpenRouter API [line 205]
                      │   └─ Use Braintrust tracing
                      │
                      └─ SaveAnalysisResult() [line 229]
                          (Currently just logs, TODO: implement DB save)
```

---

## 9. Key Files Reference

| File Path | Purpose | Key Lines |
|-----------|---------|-----------|
| `executor.go` | Signal generation & filter execution | 156-360, 689-793 |
| `calculator.go` | Indicator calculations | 24-303 |
| `prompter.go` | Indicator formatting for AI | 20-225 |
| `engine.go` | Analysis queue & processing | 112-260 |
| `types.go` | Data structures (Signal, Kline, MarketData) | 8-145, 114-128 |
| `server.go` | API routes | 202-220, 503-506 |
| `trader_handlers.go` | Trader management endpoints | 206-247 |
| `indicators/helpers.go` | Technical indicator implementations | 9-456 |

---

## 10. Recommended Next Steps for Chart Visualization

### Step 1: Extend Signal Save
Modify `saveSignals()` to store calculated indicators:
```go
Signal {
    // ... existing fields
    IndicatorData  json.RawMessage `json:"indicator_data"` // Store calculated indicators
}
```

### Step 2: Calculate Indicators Before Saving
In `processSymbol()` after filter match:
```go
// Calculate indicators while we have the data
indicators := calculateIndicatorsForSignal(signal, marketData, trader)

// Include in signal metadata
signal.Metadata["indicators"] = indicators
```

### Step 3: Extend API Response
Modify signal response to include indicators:
```go
type SignalResponse struct {
    Signal
    Indicators map[string]interface{} `json:"indicators"`
    Klines    []Kline               `json:"klines"`
}
```

### Step 4: Frontend Integration
Frontend receives signals with:
- Indicator values at time of signal
- Kline data for chart
- All data needed for visualization

---

## Summary

**Current State**:
- Signals are generated via filter code execution
- Indicators are calculated but only used for AI analysis
- No indicator persistence or frontend visibility
- Only basic signal metadata stored in DB

**Key Insight**:
The backend has **all the capability** to provide indicator data - it calculates everything. It's just not persisted or exposed via API. This is an **output problem**, not a calculation problem.

**Path Forward**:
To visualize indicators on charts, modify the signal persistence layer to include calculated indicator data. No changes needed to calculation logic - just extend what gets saved and returned.
