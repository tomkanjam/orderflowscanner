# Update Braintrust Prompt for Object Notation

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-02 07:25:47

## Context
Update the `regenerate-filter-go` prompt in Braintrust to generate filter code using object notation instead of array indices.

## Linked Items
- Part of: `context/issues/open/20251102-072547-000-PROJECT-kline-object-format-volume-enrichment.md`
- Depends on: `context/issues/open/20251102-072547-001-transform-kline-to-object-format.md`

## Progress
Completed. Braintrust prompt updated to version 4.0 with extended Kline struct and volume analysis examples.

## Completion
**Closed:** 2025-11-02 07:43:26
**Outcome:** Success
**Commits:** e7089e2
**Braintrust Version:** 4.0 (transaction ID: 1000196070990596915)

## Spec

### Prompt Location
Braintrust: `regenerate-filter-go` prompt
https://www.braintrust.dev/app/AI%20Trader/p/prompts

### Changes Required

**IMPORTANT**: Present the prompt changes to the user and ask for permission before making them (per CLAUDE.md prompt management rules).

1. **Update kline data structure documentation**
   - Remove array index examples
   - Add object property examples
   - Document all available fields

2. **Update code examples**
   - Replace `parseFloat(kline[4])` → `kline.close`
   - Replace `parseFloat(kline[5])` → `kline.volume`
   - Add examples using new volume fields

3. **Add volume metric examples**
   ```javascript
   // Buy/Sell pressure analysis
   if (kline.buyVolume > kline.sellVolume * 1.5) {
     // Strong buy pressure
   }

   // Volume delta
   if (kline.volumeDelta > 0) {
     // Net buying
   }
   ```

4. **Update all code examples throughout the 731-line prompt**
   - Search for array access patterns: `[0]`, `[4]`, `[5]`, etc.
   - Replace with object notation: `.openTime`, `.close`, `.volume`, etc.

### Key Fields to Document
```typescript
{
  // Time
  openTime: number
  closeTime: number

  // OHLC
  open: number
  high: number
  low: number
  close: number

  // Volume metrics
  volume: number       // Total base volume
  buyVolume: number    // Aggressive buy volume
  sellVolume: number   // Aggressive sell volume
  volumeDelta: number  // buyVolume - sellVolume (+ = buying, - = selling)
  quoteVolume: number  // Dollar/USDT volume

  // Trade count
  trades: number
}
```

### Testing
- Generate a test filter using natural language
- Verify it uses object notation (not array indices)
- Verify no `parseFloat()` calls (fields already numbers)
- Verify volume metrics are used correctly
- Test with Braintrust evaluation framework

### Notes
- This is a critical prompt change - must get user approval first
- The prompt is 731 lines with full indicator API docs
- Cache TTL is 5 minutes, so changes take effect quickly
