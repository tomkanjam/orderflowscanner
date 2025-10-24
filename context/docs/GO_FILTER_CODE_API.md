# Go Filter Code API Reference

## Overview

Trader filter code is **pure Go code** that gets wrapped in an `evaluate()` function and executed using Yaegi interpreter.

## Function Signature

```go
func evaluate(data *types.MarketData) bool {
    // Your code here
}
```

**CRITICAL**:
- The code you generate will be wrapped automatically
- DO NOT include `func evaluate()` declaration
- DO NOT include package or import statements
- ONLY provide the function body
- MUST return a boolean value

## Available Data Structure

### `data *types.MarketData`

```go
type MarketData struct {
    Symbol    string                // e.g., "BTCUSDT"
    Ticker    *SimplifiedTicker     // Real-time ticker data
    Klines    map[string][]Kline    // Historical candles by interval
    Timestamp time.Time             // Current timestamp
}
```

### `data.Ticker *SimplifiedTicker`

```go
type SimplifiedTicker struct {
    LastPrice          float64  // Current price
    PriceChangePercent float64  // 24h price change %
    QuoteVolume        float64  // 24h volume
}
```

### `data.Klines map[string][]Kline`

Access via: `data.Klines["1m"]`, `data.Klines["5m"]`, `data.Klines["1h"]`, etc.

```go
type Kline struct {
    OpenTime                 int64
    Open                     float64
    High                     float64
    Low                      float64
    Close                    float64
    Volume                   float64
    CloseTime                int64
    QuoteAssetVolume         float64
    NumberOfTrades           int
    TakerBuyBaseAssetVolume  float64
    TakerBuyQuoteAssetVolume float64
}
```

**Example Access**:
```go
klines5m := data.Klines["5m"]
if len(klines5m) < 20 {
    return false
}

latestClose := klines5m[len(klines5m)-1].Close
```

## Available Indicator Functions

All functions are in the `indicators` package and return **pointers** (can be `nil`!).

### Moving Averages

```go
// Simple Moving Average (SMA)
indicators.CalculateMA(klines []types.Kline, period int) *float64
indicators.CalculateMASeries(klines []types.Kline, period int) []float64

// Exponential Moving Average (EMA)
indicators.CalculateEMA(klines []types.Kline, period int) *float64
indicators.CalculateEMASeries(klines []types.Kline, period int) []float64
```

### RSI (Relative Strength Index)

```go
// RSI Result
type RSIResult struct {
    Value  float64
    Series []float64
}

indicators.CalculateRSI(klines []types.Kline, period int) *RSIResult
indicators.GetLatestRSI(klines []types.Kline, period int) *float64
```

### MACD

```go
type MACDResult struct {
    MACD      float64
    Signal    float64
    Histogram float64
}

indicators.CalculateMACD(klines, shortPeriod, longPeriod, signalPeriod int) *MACDResult
indicators.GetLatestMACD(klines, 12, 26, 9 int) *struct{MACD, Signal, Histogram float64}
```

### Bollinger Bands

```go
type BollingerBandsResult struct {
    Upper  float64
    Middle float64
    Lower  float64
}

indicators.CalculateBollingerBands(klines []types.Kline, period int, stdDev float64) *BollingerBandsResult
indicators.GetLatestBollingerBands(klines, 20, 2.0) *struct{Upper, Middle, Lower float64}
```

### Volume & Price

```go
indicators.CalculateAvgVolume(klines []types.Kline, period int) *float64
indicators.GetHighestHigh(klines []types.Kline, period int) *float64
indicators.GetLowestLow(klines []types.Kline, period int) *float64
indicators.CalculateVWAP(klines []types.Kline) float64  // Not a pointer!
```

### Stochastic

```go
type StochasticResult struct {
    K float64
    D float64
}

indicators.CalculateStochastic(klines []types.Kline, kPeriod, dPeriod int) *StochasticResult
```

### Patterns

```go
// Returns: "bullish", "bearish", or "" (empty string)
indicators.DetectEngulfingPattern(klines []types.Kline) string
```

## Critical Rules

### 1. **Always Check Kline Length**
```go
klines := data.Klines["5m"]
if len(klines) < requiredPeriod {
    return false
}
```

### 2. **Always Check for `nil` Pointers**
```go
rsi := indicators.GetLatestRSI(klines, 14)
if rsi == nil {
    return false
}

// Dereference with *
return *rsi < 30.0
```

### 3. **Use `:=` for Variable Declaration**
```go
// Correct
klines := data.Klines["5m"]
ma50 := indicators.CalculateMA(klines, 50)

// Wrong
var klines = data.Klines["5m"]  // Don't use var in filter code
```

### 4. **Return Boolean**
```go
// Good
return *rsi < 30.0 && currentPrice > *ma50

// Bad
return 1  // Not a boolean!
```

## Complete Example: Three Green Candles

```go
// Get 5-minute candles
klines := data.Klines["5m"]

// Need at least 3 candles
if len(klines) < 3 {
    return false
}

// Get last 3 candles
candle1 := klines[len(klines)-3]
candle2 := klines[len(klines)-2]
candle3 := klines[len(klines)-1]

// Check all three are green (close > open)
green1 := candle1.Close > candle1.Open
green2 := candle2.Close > candle2.Open
green3 := candle3.Close > candle3.Open

// Check they're consecutive greens
return green1 && green2 && green3
```

## Complete Example: RSI Oversold with Volume

```go
klines := data.Klines["1h"]

// Need enough data for RSI(14)
if len(klines) < 14 {
    return false
}

// Calculate RSI
rsi := indicators.GetLatestRSI(klines, 14)
if rsi == nil {
    return false
}

// Calculate average volume
avgVol := indicators.CalculateAvgVolume(klines, 20)
if avgVol == nil {
    return false
}

// Get current volume
currentVol := klines[len(klines)-1].Volume

// Condition: RSI below 30 AND volume above average
return *rsi < 30.0 && currentVol > *avgVol
```

## Complete Example: Multi-Timeframe MACD

```go
// Get multiple timeframes
klines1m := data.Klines["1m"]
klines5m := data.Klines["5m"]

// Check we have enough data
if len(klines1m) < 26 || len(klines5m) < 26 {
    return false
}

// Calculate MACD on both timeframes
macd1m := indicators.GetLatestMACD(klines1m, 12, 26, 9)
macd5m := indicators.GetLatestMACD(klines5m, 12, 26, 9)

if macd1m == nil || macd5m == nil {
    return false
}

// Both timeframes must show positive histogram
return macd1m.Histogram > 0 && macd5m.Histogram > 0
```

## What NOT to Use

### ❌ NO Helper Functions
```go
// WRONG - BuildSimpleSignalResult doesn't exist!
return types.BuildSimpleSignalResult(...)

// WRONG - No signal building functions exist
return helpers.CreateSignal(...)
```

### ❌ NO External Packages
```go
// WRONG - Can't import random packages
import "math/rand"
```

### ❌ NO Side Effects
```go
// WRONG - Don't try to modify data or create signals
data.Klines["5m"] = append(...)  // Read-only!
```

## Available Packages

Only these packages are available:
- `github.com/vyx/go-screener/pkg/types` (types only, no functions)
- `github.com/vyx/go-screener/pkg/indicators` (all indicator functions listed above)

## Supported Timeframes

- `"1m"` - 1 minute
- `"5m"` - 5 minutes
- `"15m"` - 15 minutes
- `"1h"` - 1 hour
- `"4h"` - 4 hours
- `"1d"` - 1 day

## Error Handling

```go
// Always validate before using
klines := data.Klines["5m"]
if len(klines) == 0 {
    return false  // No data available
}

// Always nil-check pointer returns
ma := indicators.CalculateMA(klines, 50)
if ma == nil {
    return false  // Not enough data for MA(50)
}

// Now safe to use
return data.Ticker.LastPrice > *ma
```
