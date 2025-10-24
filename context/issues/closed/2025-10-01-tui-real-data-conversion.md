# Complete TUI Real Data Conversion for Live Engine Integration

## Metadata
- **Status:** 🎯 ready
- **Created:** 2025-10-01T14:05:00+02:00
- **Updated:** 2025-10-01T14:05:00+02:00
- **Priority:** High
- **Type:** feature
- **Progress:** [████      ] 40%

---

## Feature Summary
*Stage: ready | Date: 2025-10-01T14:05:00+02:00*

### Current State

The TUI engine integration framework is **complete** with all data fetching methods in place:
- ✅ Engine exposes `GetMarketData()`, `GetTraders()`, `GetPositions()`, `GetSignals()`, `GetBalance()`
- ✅ TUI calls `refreshFromEngine()` every 100ms tick
- ✅ Data flows from engine to TUI model
- ⏳ **Update helper methods have TODO stubs** - no actual data conversion happens

**Result**: TUI still shows mock data instead of real engine data.

### What Needs to Happen

Implement the 4 data conversion methods in `terminal/internal/tui/model.go`:

1. **`updateMarketData(interface{})`** - Convert WebSocket snapshot to TUI market table
2. **`updateTraders(interface{})`** - Convert storage traders to TUI trader table
3. **`updatePositions(interface{})`** - Convert storage positions to TUI positions table
4. **`updateSignals(interface{})`** - Convert storage signals to TUI signals table

### Domain Context: Cryptocurrency Trading

As a **cryptocurrency trading terminal**, users expect:
- **Real-time price updates** - Sub-second latency for market data
- **Accurate position tracking** - Live P&L calculations updated constantly
- **Signal lifecycle visibility** - Watch signals progress from detection → entry → exit
- **Trader performance metrics** - See which strategies are working
- **Instant feedback** - Any lag breaks the trading experience

The mock data currently shown is **worse than useless** for a trading terminal - it trains bad habits and provides no actual value. Real data integration is **critical** for this to be a functional trading tool.

---

## Technical Implementation Plan

### 1. Market Data Conversion (`updateMarketData`)

**Input**: `*types.MarketDataSnapshot`
```go
type MarketDataSnapshot struct {
    Tickers   map[string]*Ticker        // Real-time prices
    Klines    map[string]map[string][]*Kline  // Historical candles
    Symbols   []string
    Timestamp int64
}
```

**Output**: `[]MarketData` for TUI table
```go
type MarketData struct {
    Symbol       string
    Price        float64
    Change24h    float64
    ChangePct24h float64
    Volume24h    float64
    Sparkline    string  // Mini chart: "▂▃▅▇█▇▅▃▂"
}
```

**Conversion Logic**:
- Extract ticker for each symbol
- Parse `LastPrice`, `PriceChange`, `PriceChangePercent`, `Volume`
- Generate sparkline from recent kline closes (last 9 candles)
- Handle missing tickers gracefully (some symbols may not be subscribed)

**Edge Cases**:
- Symbol subscribed but no ticker data yet → Skip or show "Loading..."
- Price change calculation if 24h data incomplete → Use available data
- Sparkline generation if < 9 candles available → Use what's available

---

### 2. Traders Conversion (`updateTraders`)

**Input**: `[]*types.Trader`
```go
type Trader struct {
    ID                string
    Name              string
    Description       string
    Symbols           []string
    Status            TraderStatus  // active/inactive
    CheckIntervalSec  int
    LastCheckedAt     time.Time
    Filter            TraderFilter
}
```

**Output**: `[]TraderData` for TUI table
```go
type TraderData struct {
    ID           string
    Name         string
    Status       string
    Interval     string  // "5m", "15m", etc.
    SignalsCount int     // Need to query
    LastCheck    time.Time
}
```

**Conversion Logic**:
- Map trader fields directly
- Convert `CheckIntervalSec` to human-readable interval ("5m", "1h")
- Query signal count per trader (may need separate storage call)
- Use `LastCheckedAt` for timing display

**Edge Cases**:
- Trader never checked yet → Show "Never" or "Pending"
- Signal count query fails → Show 0 or "-"
- Very long trader names → Truncate for table display

---

### 3. Positions Conversion (`updatePositions`)

**Input**: `[]*types.Position`
```go
type Position struct {
    ID            string
    Symbol        string
    Side          PositionSide  // LONG/SHORT
    EntryPrice    float64
    CurrentPrice  float64
    Quantity      float64
    StopLoss      float64
    TakeProfit    float64
    UnrealizedPnL float64
    PnLPercent    float64
    Status        PositionStatus  // open/closed
    CreatedAt     time.Time
}
```

**Output**: `[]PositionData` for TUI table
```go
type PositionData struct {
    ID           string
    Symbol       string
    Side         string
    EntryPrice   float64
    CurrentPrice float64
    Size         float64
    PNL          float64
    PNLPct       float64
    StopLoss     float64
    TakeProfit   float64
    Sparkline    string  // Price movement since entry
    OpenedAt     time.Time
}
```

**Conversion Logic**:
- Map position fields directly
- `Size` = `Quantity`
- `PNL` = `UnrealizedPnL`
- Generate sparkline from position price history (may need to track)
- Filter to only `Status == open` positions

**Edge Cases**:
- Position just opened, no price history → Simple sparkline or placeholder
- Stop loss/take profit not set (0) → Display as "-" in table
- Closed positions should not appear in this table

---

### 4. Signals Conversion (`updateSignals`)

**Input**: `[]*types.Signal`
```go
type Signal struct {
    ID          string
    TraderID    string
    Symbol      string
    Status      SignalStatus  // watching/ready/entered/exited/abandoned
    EntryPrice  float64
    CurrentPrice float64
    Confidence  int  // 0-100
    Reasoning   string
    CreatedAt   time.Time
}
```

**Output**: `[]SignalData` for TUI table
```go
type SignalData struct {
    ID           string
    Symbol       string
    Status       string
    EntryPrice   float64
    CurrentPrice float64
    Confidence   int
    AIReasoning  string
    CreatedAt    time.Time
}
```

**Conversion Logic**:
- Direct field mapping (already aligned)
- Truncate `Reasoning` if too long for table cell
- Sort by `CreatedAt` descending (newest first)
- Limit to recent N signals (50?)

**Edge Cases**:
- Signal with no current price yet → Use entry price or "-"
- Very long reasoning text → Truncate with "..." or show in tooltip
- No signals in database → Show empty table with helpful message

---

## Success Criteria

- [ ] **Market Data**: TUI shows real-time Binance prices from WebSocket
- [ ] **Traders**: TUI displays active traders from SQLite/Supabase
- [ ] **Positions**: TUI shows open positions with live P&L updates
- [ ] **Signals**: TUI displays recent signals from database
- [ ] **Balance**: TUI shows actual paper trading balance ($10k starting)
- [ ] **Updates**: Data refreshes smoothly every 100ms without flicker
- [ ] **Empty States**: Graceful handling when no traders/positions/signals exist
- [ ] **Error Handling**: Failed conversions don't crash TUI, log warnings

---

## Implementation Steps

### Step 1: Market Data Conversion (High Priority)
**File**: `terminal/internal/tui/model.go`

```go
func (m *Model) updateMarketData(data interface{}) {
    snapshot, ok := data.(*types.MarketDataSnapshot)
    if !ok || snapshot == nil {
        return
    }

    m.markets = make([]MarketData, 0, len(snapshot.Symbols))

    for _, symbol := range snapshot.Symbols {
        ticker, exists := snapshot.Tickers[symbol]
        if !exists {
            continue
        }

        price, _ := strconv.ParseFloat(ticker.LastPrice, 64)
        change, _ := strconv.ParseFloat(ticker.PriceChange, 64)
        changePct, _ := strconv.ParseFloat(ticker.PriceChangePercent, 64)
        volume, _ := strconv.ParseFloat(ticker.Volume, 64)

        // Generate sparkline from recent klines
        sparkline := m.generateSparkline(snapshot.Klines[symbol])

        m.markets = append(m.markets, MarketData{
            Symbol:       symbol,
            Price:        price,
            Change24h:    change,
            ChangePct24h: changePct,
            Volume24h:    volume,
            Sparkline:    sparkline,
        })
    }

    // Refresh market table
    m.marketTable = m.createMarketTable()
}

func (m *Model) generateSparkline(klines map[string][]*types.Kline) string {
    // Get 1h klines for sparkline
    hourlyKlines, exists := klines["1h"]
    if !exists || len(hourlyKlines) < 2 {
        return "▂▂▂▂▂▂▂▂▂"
    }

    // Take last 9 candles
    count := 9
    if len(hourlyKlines) < count {
        count = len(hourlyKlines)
    }
    recent := hourlyKlines[len(hourlyKlines)-count:]

    // Extract closing prices
    closes := make([]float64, len(recent))
    for i, k := range recent {
        closes[i], _ = strconv.ParseFloat(k.Close, 64)
    }

    // Generate sparkline characters
    return helpers.GenerateSparkline(closes)
}
```

### Step 2: Traders Conversion
```go
func (m *Model) updateTraders(data interface{}) {
    traders, ok := data.([]*types.Trader)
    if !ok || traders == nil {
        return
    }

    m.traders = make([]TraderData, 0, len(traders))

    for _, t := range traders {
        // Convert check interval to readable format
        interval := formatInterval(t.CheckIntervalSec)

        m.traders = append(m.traders, TraderData{
            ID:           t.ID,
            Name:         t.Name,
            Status:       string(t.Status),
            Interval:     interval,
            SignalsCount: 0, // TODO: Query from storage
            LastCheck:    t.LastCheckedAt,
        })
    }

    m.tradersTable = m.createTradersTable()
}

func formatInterval(seconds int) string {
    if seconds < 60 {
        return fmt.Sprintf("%ds", seconds)
    } else if seconds < 3600 {
        return fmt.Sprintf("%dm", seconds/60)
    } else {
        return fmt.Sprintf("%dh", seconds/3600)
    }
}
```

### Step 3: Positions Conversion
```go
func (m *Model) updatePositions(data interface{}) {
    positions, ok := data.([]*types.Position)
    if !ok || positions == nil {
        return
    }

    m.positions = make([]PositionData, 0, len(positions))

    for _, p := range positions {
        // Only show open positions
        if p.Status != types.PositionStatusOpen {
            continue
        }

        m.positions = append(m.positions, PositionData{
            ID:           p.ID,
            Symbol:       p.Symbol,
            Side:         string(p.Side),
            EntryPrice:   p.EntryPrice,
            CurrentPrice: p.CurrentPrice,
            Size:         p.Quantity,
            PNL:          p.UnrealizedPnL,
            PNLPct:       p.PnLPercent,
            StopLoss:     p.StopLoss,
            TakeProfit:   p.TakeProfit,
            Sparkline:    "▃▅▇█▇▅▃", // TODO: Generate from price history
            OpenedAt:     p.CreatedAt,
        })
    }

    // Update total PNL
    totalPnL := 0.0
    for _, p := range m.positions {
        totalPnL += p.PNL
    }
    m.totalPNL = totalPnL
    m.totalPNLPct = (totalPnL / m.balance) * 100

    m.positionsTable = m.createPositionsTable()
}
```

### Step 4: Signals Conversion
```go
func (m *Model) updateSignals(data interface{}) {
    signals, ok := data.([]*types.Signal)
    if !ok || signals == nil {
        return
    }

    m.signals = make([]SignalData, 0, len(signals))

    for _, s := range signals {
        // Truncate reasoning for table display
        reasoning := s.Reasoning
        if len(reasoning) > 100 {
            reasoning = reasoning[:97] + "..."
        }

        m.signals = append(m.signals, SignalData{
            ID:           s.ID,
            Symbol:       s.Symbol,
            Status:       string(s.Status),
            EntryPrice:   s.EntryPrice,
            CurrentPrice: s.CurrentPrice,
            Confidence:   s.Confidence,
            AIReasoning:  reasoning,
            CreatedAt:    s.CreatedAt,
        })
    }

    m.signalsTable = m.createSignalsTable()
}
```

---

## Testing Plan

### Manual Testing
1. **Start engine with USER_ID set**:
   ```bash
   export USER_ID="test-user"
   cd terminal && ./aitrader
   ```

2. **Verify market data**:
   - Should see real Binance prices
   - Prices should update in real-time
   - Sparklines should change

3. **Add a trader to database**:
   ```bash
   sqlite3 aitrader.db
   INSERT INTO traders (id, user_id, name, symbols, status, created_at)
   VALUES ('t1', 'test-user', 'Test Trader', '["BTCUSDT"]', 'active', datetime('now'));
   ```
   - Verify trader appears in TUI

4. **Test with no data**:
   - Empty database → Should show empty tables with helpful messages
   - No WebSocket connection → Should handle gracefully

### Edge Case Testing
- [ ] TUI starts before engine connects
- [ ] Engine disconnects mid-session
- [ ] Database query fails
- [ ] Invalid data types received
- [ ] Very long trader/signal names
- [ ] Hundreds of positions/signals

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Type assertion failures crash TUI | High | Defensive type checks, return early on errors |
| Slow database queries block UI | High | Async data fetching, don't block tick handler |
| WebSocket data missing/delayed | Medium | Show "Loading..." states, cache last known values |
| Float parsing errors | Medium | Handle parse errors, use 0.0 as fallback |
| Memory leak from accumulating data | Low | Limit signal/position history, clear old data |

---

## Dependencies

- ✅ Engine data fetching methods (`GetMarketData`, etc.)
- ✅ TUI refresh framework (`refreshFromEngine`)
- ⏳ Helper method: `GenerateSparkline([]float64)` in helpers package
- ⏳ Helper method: `formatInterval(seconds int)` utility

---

## Definition of Done

- [ ] All 4 update methods implemented with real conversions
- [ ] TUI shows live market data from Binance WebSocket
- [ ] TUI displays traders from database
- [ ] TUI shows open positions with P&L
- [ ] TUI displays recent signals
- [ ] Empty states handled gracefully
- [ ] Type assertions include error handling
- [ ] Code tested with real engine running
- [ ] No mock data visible when engine connected
- [ ] Documentation updated with usage examples

---

## Priority Assessment

**Urgency:** High - Terminal currently non-functional for actual trading
**Impact:** Transformative - Changes TUI from demo to real tool
**Effort:** M - 4 conversion methods, straightforward data mapping
**Recommendation:** **Proceed immediately** - This unblocks the terminal for real use

---

*Ready for implementation. All framework is in place, just need the 4 data conversion methods.*
