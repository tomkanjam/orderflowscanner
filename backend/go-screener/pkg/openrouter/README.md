# OpenRouter Client Package

This package provides a Go client wrapper for the OpenRouter API, specifically designed for cryptocurrency trading signal analysis using LLMs (Gemini, Claude, GPT-4, etc.).

## Features

- **Multi-Model Support**: Access to Gemini 2.0 Flash, Claude, GPT-4, and other models via OpenRouter
- **Automatic Retry Logic**: Configurable retry attempts with exponential backoff
- **Structured Analysis**: Predefined prompts and response schemas for trading signal analysis
- **JSON Response Parsing**: Robust parsing with markdown code block extraction
- **Validation & Sanitization**: Comprehensive validation of AI responses with business rule enforcement
- **Type-Safe**: Full TypeScript-like type safety with Go structs

## Installation

The package uses the `github.com/revrost/go-openrouter` library:

```bash
go get github.com/revrost/go-openrouter
```

## Usage

### Basic Client Setup

```go
import "github.com/vyx/go-screener/pkg/openrouter"

// Create client with default config
config := openrouter.DefaultConfig("your-api-key")
client, err := openrouter.NewClient(config)
if err != nil {
    log.Fatal(err)
}
```

### Custom Configuration

```go
config := &openrouter.Config{
    APIKey:      "your-api-key",
    Model:       "google/gemini-2.0-flash-exp:free",
    MaxRetries:  5,
    RetryDelay:  3 * time.Second,
    Temperature: 0.15, // Lower = more deterministic
    MaxTokens:   4000,
}
client, err := openrouter.NewClient(config)
```

### Signal Analysis

```go
// Prepare analysis data
data := openrouter.SignalAnalysisData{
    StrategyDescription: "Buy when RSI < 30 and price breaks above 20 EMA",
    Symbol:              "BTCUSDT",
    CurrentPrice:        50000.0,
    PriceChangePercent:  2.5,
    Volume24h:           1500000000.0,
    CalculatedIndicators: map[string]interface{}{
        "RSI_14":   28.5,
        "EMA_20":   49800.0,
        "MACD":     map[string]float64{"value": 150.0, "signal": 120.0},
    },
}

// Format prompt
promptStr, err := openrouter.FormatSignalAnalysisPrompt(data)
if err != nil {
    log.Fatal(err)
}

// Send request
req := &openrouter.ChatRequest{
    SystemPrompt: openrouter.SystemPrompts.SignalAnalysis,
    UserPrompt:   promptStr,
}

resp, err := client.Chat(ctx, req)
if err != nil {
    log.Fatal(err)
}

// Parse response
result, err := openrouter.ParseAnalysisResult(resp.Content)
if err != nil {
    log.Fatal(err)
}

// Sanitize and validate
if err := openrouter.ValidateAndSanitize(result); err != nil {
    log.Fatal(err)
}

// Use the result
if result.ShouldEnterTrade() {
    fmt.Printf("ENTER TRADE at $%.2f\n", *result.EntryPrice)
    fmt.Printf("Stop Loss: $%.2f\n", *result.StopLoss)
    fmt.Printf("Confidence: %.2f\n", result.Confidence)
}
```

### Monitoring Re-Analysis

```go
// Re-analyze a monitored signal
monitorData := openrouter.MonitoringAnalysisData{
    StrategyDescription:  "...",
    Symbol:               "BTCUSDT",
    CurrentPrice:         51000.0,
    PreviousPrice:        50000.0,
    PriceChangePercent:   3.5,
    Volume24h:            1600000000.0,
    CalculatedIndicators: indicators,
    PreviousAnalysis:     previousResult,
    AnalysisCount:        2,
    MaxReanalyses:        5,
    TimeSinceSignal:      30 * time.Minute,
}

promptStr, err := openrouter.FormatMonitoringAnalysisPrompt(monitorData)
// ... same as above
```

## Response Structure

The AI returns structured JSON analysis:

```json
{
  "decision": "enter",
  "confidence": 0.85,
  "reasoning": "Strong RSI oversold + bullish EMA breakout confirmation",
  "entry_price": 50100.00,
  "stop_loss": 48500.00,
  "take_profit_1": 52000.00,
  "take_profit_2": 54000.00,
  "position_size_pct": 5.0,
  "risk_reward_ratio": 2.5,
  "timeframe": "2-3 days"
}
```

### Decision Types

- **`enter`**: High-probability setup, recommend immediate position
- **`reject`**: Signal invalid or risk too high
- **`wait`**: Signal has potential but needs confirmation (monitored)
- **`continue_monitoring`**: Still waiting for better conditions (re-analysis)

## System Prompts

The package includes three pre-configured system prompts:

1. **`SystemPrompts.SignalAnalysis`**: For initial signal evaluation
2. **`SystemPrompts.MonitoringAnalysis`**: For re-analyzing monitored signals
3. **`SystemPrompts.StrategyExplanation`**: For explaining strategies to users

## Validation Rules

The `ValidateAndSanitize` function enforces:

- Confidence between 0.0 and 1.0 (auto-capped)
- Position size between 0.1% and 10% (auto-capped)
- Stop loss must be below entry price (for longs)
- Stop loss percentage maximum 10% from entry
- Risk/reward ratio minimum 1.0:1
- Take profit targets in correct order

## Performance

- Average latency: 2-4 seconds (with Gemini 2.0 Flash)
- Retry logic: 3 attempts with 2-second delays
- Token usage: ~500-1000 prompt tokens, ~200-400 completion tokens

## Error Handling

```go
resp, err := client.Chat(ctx, req)
if err != nil {
    // Could be network error, API error, or timeout
    log.Printf("API call failed: %v", err)
    return
}

result, err := openrouter.ParseAnalysisResult(resp.Content)
if err != nil {
    // Invalid JSON or malformed response
    log.Printf("Failed to parse response: %v", err)
    return
}

if err := openrouter.ValidateAndSanitize(result); err != nil {
    // Business rule violation
    log.Printf("Invalid analysis: %v", err)
    return
}
```

## Testing

Run the test suite:

```bash
go test -v ./pkg/openrouter/...
```

Benchmark performance:

```bash
go test -bench=. ./pkg/openrouter/...
```

## Model Recommendations

| Model | Speed | Cost | Quality | Best For |
|-------|-------|------|---------|----------|
| `google/gemini-2.0-flash-exp:free` | ⚡⚡⚡ | Free | ⭐⭐⭐ | Default choice |
| `anthropic/claude-3.5-sonnet` | ⚡⚡ | $$$ | ⭐⭐⭐⭐⭐ | Complex analysis |
| `openai/gpt-4-turbo` | ⚡ | $$$$ | ⭐⭐⭐⭐ | High-stakes decisions |

## Environment Variables

```bash
# Required
OPENROUTER_API_KEY=your-api-key

# Optional (defaults shown)
OPENROUTER_MODEL=google/gemini-2.0-flash-exp:free
OPENROUTER_MAX_RETRIES=3
OPENROUTER_TEMPERATURE=0.2
OPENROUTER_MAX_TOKENS=4000
```

## Architecture Integration

This package is used by:

- **Analysis Engine** (`pkg/analysis/engine.go`): Initial signal evaluation
- **Monitoring Engine** (`pkg/monitoring/engine.go`): Continuous signal monitoring
- **Position Manager**: Entry decision validation

## License

Part of the vyx-app Go screener backend.
