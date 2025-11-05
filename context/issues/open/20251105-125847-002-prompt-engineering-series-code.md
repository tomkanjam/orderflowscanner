# Update Braintrust Prompt for Series Code Generation

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-01-05 12:58:47

## Context

The current `regenerate-filter-go` prompt only generates filter code (boolean evaluation). We need to extend it to also generate series code that returns indicator data for visualization.

## Linked Items

- Part of: `context/issues/open/20251105-125847-001-PROJECT-custom-indicator-visualization.md`

## Progress

Starting prompt engineering phase.

## Spec

### Current Prompt Structure

- Returns: `{filterCode: string, requiredTimeframes: string[]}`
- Generates only boolean evaluation logic
- 731 lines with full indicator API docs

### Required Changes

1. **Add seriesCode to output format**
   - New field in JSON response
   - Function signature: `func calculateSeries(data *types.MarketData) map[string]interface{}`
   - Returns map of indicator_id → data points

2. **Add indicators array to output format**
   - Describes each indicator calculated in seriesCode
   - Fields: id, name, type, panel, params

3. **Add seriesCode documentation section**
   - Explain purpose (visualization data)
   - Show example structure
   - Document data point format: `{x: timestamp, y: value, y2?, y3?, y4?}`
   - Emphasize last 150 points only

4. **Add complete examples**
   - Example 1: Simple indicator (RSI)
   - Example 2: Multi-line indicator (Bollinger Bands)
   - Example 3: Complex custom indicator (Stochastic RSI)

### New Output Format

```json
{
  "filterCode": "string",
  "seriesCode": "string",
  "requiredTimeframes": ["5m"],
  "indicators": [
    {
      "id": "unique_id",
      "name": "Display Name",
      "type": "line" | "bar",
      "panel": true | false,
      "params": { /* config */ }
    }
  ]
}
```

### SeriesCode Requirements

1. **Return type**: `map[string]interface{}`
2. **Keys**: Match indicator IDs in indicators array
3. **Values**: Array of data points
4. **Data point format**: `map[string]interface{}{"x": timestamp, "y": value}`
5. **Length**: Last 150 points (or less if insufficient klines)
6. **Timeframe**: Use first timeframe from requiredTimeframes
7. **Efficiency**: Can be slower than filterCode (only runs on signal)

### Example Addition to Prompt

```markdown
## Output Format

Return a JSON object with BOTH filter code and series code:

```json
{
  "filterCode": "// Boolean evaluation (returns bool)",
  "seriesCode": "// Data collection (returns map[string]interface{})",
  "requiredTimeframes": ["5m"],
  "indicators": [/* indicator metadata */]
}
```

### filterCode (Existing)

- Returns `bool` for signal matching
- Fast execution on every candle
- Same as current implementation

### seriesCode (NEW)

Returns `map[string]interface{}` with indicator visualization data.

**Function signature:**
```go
func calculateSeries(data *types.MarketData) map[string]interface{} {
    result := make(map[string]interface{})
    // ... populate indicator data
    return result
}
```

**Requirements:**
- Each key = indicator ID from indicators array
- Each value = slice of data points
- Data points: `[]map[string]interface{}`
- Format: `{"x": timestamp_ms, "y": value}`
- Include last 150 data points

**Example:**
```go
func calculateSeries(data *types.MarketData) map[string]interface{} {
    result := make(map[string]interface{})

    klines := data.Klines["15m"]
    if len(klines) < 30 {
        return result
    }

    // Calculate RSI series
    rsiData := make([]map[string]interface{}, 0)

    startIdx := len(klines) - 150
    if startIdx < 14 {
        startIdx = 14
    }

    for i := startIdx; i < len(klines); i++ {
        rsi := calculateRSI(klines[:i+1], 14)
        rsiData = append(rsiData, map[string]interface{}{
            "x": klines[i].OpenTime,
            "y": rsi,
        })
    }

    result["rsi_14"] = rsiData
    return result
}
```

### Multi-Line Indicators

For indicators with multiple lines (Bollinger Bands, MACD):

```go
indicatorData = append(indicatorData, map[string]interface{}{
    "x": klines[i].OpenTime,
    "y": upperBand,
    "y2": middleBand,
    "y3": lowerBand,
})
```

### indicators Array

Describe each indicator for frontend rendering:

```json
{
  "id": "bb_20_2",
  "name": "Bollinger Bands (20,2)",
  "type": "line",
  "panel": false,
  "params": {
    "period": 20,
    "stdDev": 2
  }
}
```

Fields:
- `id`: Unique identifier (matches seriesCode keys)
- `name`: Display name for chart legend
- `type`: "line" or "bar"
- `panel`: true = separate panel below, false = overlay on price chart
- `params`: Parameters used in calculation
```

### Testing Strategy

1. Test with standard indicators (RSI, MACD, Bollinger Bands)
2. Test with custom indicators (Stochastic RSI, ADX)
3. Verify both filter and series code use same calculation logic
4. Check indicators array matches seriesCode keys
5. Validate data point format and timestamps

### Implementation Steps

1. Draft prompt additions in markdown
2. Upload to Braintrust with metadata:
   ```json
   {
     "version": "4.0",
     "changelog": "Added series code generation for indicator visualization",
     "feature": "dual-code-generation"
   }
   ```
3. Test with curl or braintrust skill
4. Verify JSON response format
5. Test with 3-5 example conditions
6. Refine based on results

## Completion Criteria

1. ✅ Prompt updated in Braintrust
2. ✅ Generates valid seriesCode
3. ✅ Generates indicators array
4. ✅ Both codes use same calculation logic
5. ✅ Data point format is correct
6. ✅ Works for standard and custom indicators
