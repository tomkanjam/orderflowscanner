# Transform Kline Data to Object Format with Volume Enrichment

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-02 07:25:47

## Context
Convert kline data from array format to object format with pre-computed volume metrics to improve LLM code generation quality and reduce errors.

## Linked Items
- Part of: `context/issues/open/20251102-072547-000-PROJECT-kline-object-format-volume-enrichment.md`

## Progress
Awaiting implementation.

## Spec

### Location
`supabase/functions/execute-trader/index.ts:166-178`

### Current Code
```javascript
klines[timeframe] = data.map(k => [
  k.openTime,           // [0]
  k.open.toString(),    // [1]
  k.high.toString(),    // [2]
  k.low.toString(),     // [3]
  k.close.toString(),   // [4]
  k.volume.toString(),  // [5]
  k.closeTime,          // [6]
  k.quoteAssetVolume.toString(),     // [7]
  k.numberOfTrades,     // [8]
  k.takerBuyBaseAssetVolume.toString(), // [9]
  k.takerBuyQuoteAssetVolume.toString() // [10]
]);
```

### Target Code
```javascript
klines[timeframe] = data.map(k => {
  const volume = k.volume;
  const buyVolume = k.takerBuyBaseAssetVolume;
  const sellVolume = volume - buyVolume;

  return {
    openTime: k.openTime,
    closeTime: k.closeTime,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: volume,
    buyVolume: buyVolume,
    sellVolume: sellVolume,
    volumeDelta: buyVolume - sellVolume,
    quoteVolume: k.quoteAssetVolume,
    trades: k.numberOfTrades
  };
});
```

### Testing
- Verify all fields are numbers (not strings)
- Verify volume calculations: `buyVolume + sellVolume === volume`
- Verify volumeDelta: `buyVolume - sellVolume`
- Test with multiple timeframes
- Ensure no parsing errors in filter execution

### Notes
- The `formatKlinesForEdgeFunction` already parses strings to numbers, so we can use them directly
- Remove redundant quote asset fields (takerBuyQuoteAssetVolume)
- Keep it simple - just transform the structure
