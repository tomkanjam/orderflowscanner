# PROJECT: Migrate Kline Data to Object Format with Volume Enrichment

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-02 07:25:47

## Context
Currently, filter code receives kline data as arrays with string values requiring manual parsing. This leads to:
- LLM-generated filters making indexing mistakes (using wrong array index)
- Repeated boilerplate code for parsing and volume calculations
- Poor developer experience that increases error rates

Converting to self-documenting object notation with pre-computed volume metrics will:
- Reduce LLM hallucinations and coding errors
- Eliminate redundant parsing and calculations
- Make filter code more readable and maintainable

## Linked Items
- Part of: End-to-end trader workflow implementation
- Supersedes: `context/issues/open/20251102-071844-000-enrich-kline-data-volume-metrics.md`

## Sub-issues
- [ ] `context/issues/open/20251102-072547-001-transform-kline-to-object-format.md` - Transform kline arrays to objects with volume enrichment
- [ ] `context/issues/open/20251102-072547-002-update-braintrust-prompt-object-notation.md` - Update LLM prompt for object notation
- [ ] `context/issues/open/20251102-072547-003-update-helper-functions-object-format.md` - Update helper functions to work with objects
- [ ] `context/issues/open/20251102-072547-004-test-kline-object-migration.md` - Test and validate migration

## Progress
Project created, awaiting implementation of sub-issues.

## Spec

### Goals
1. Convert kline data from array format to object format
2. Parse all numeric fields from strings to numbers
3. Add computed volume metrics: buyVolume, sellVolume, volumeDelta
4. Remove redundant volume fields
5. Update LLM prompt to generate code using object notation
6. Update helper functions to work with new format

### Current Format (Array)
```javascript
[
  openTime,              // [0]
  open.toString(),       // [1] - STRING
  high.toString(),       // [2] - STRING
  low.toString(),        // [3] - STRING
  close.toString(),      // [4] - STRING
  volume.toString(),     // [5] - STRING
  closeTime,             // [6]
  quoteAssetVolume.toString(),      // [7] - STRING
  numberOfTrades,        // [8]
  takerBuyBaseAssetVolume.toString(),  // [9] - STRING
  takerBuyQuoteAssetVolume.toString()  // [10] - STRING
]
```

### Target Format (Object)
```javascript
{
  // Time
  openTime: number,
  closeTime: number,

  // OHLC (parsed to numbers)
  open: number,
  high: number,
  low: number,
  close: number,

  // Volume (base asset)
  volume: number,           // Total base asset volume
  buyVolume: number,        // Taker buy base volume (aggressive buys)
  sellVolume: number,       // Calculated: volume - buyVolume
  volumeDelta: number,      // Calculated: buyVolume - sellVolume

  // Quote asset volume
  quoteVolume: number,      // Total quote asset volume (dollar volume)

  // Trade count
  trades: number            // Number of trades (renamed from numberOfTrades)
}
```

### Redundant Fields Removed
- `takerBuyBaseAssetVolume` → replaced by `buyVolume`
- `takerBuyQuoteAssetVolume` → removed (redundant, can calculate if needed)

### Example Filter Code Comparison

**Before (Array):**
```javascript
const close = parseFloat(kline[4]);
const volume = parseFloat(kline[5]);
const buyVolume = parseFloat(kline[9]);
const sellVolume = volume - buyVolume;

return close > 50000 && buyVolume > sellVolume * 1.5;
```

**After (Object):**
```javascript
return kline.close > 50000 && kline.buyVolume > kline.sellVolume * 1.5;
```

### Migration Impact
- **Breaking change** for existing filters
- Existing filters will need regeneration (acceptable since we're pre-launch)
- Prompt update required in Braintrust

### Success Criteria
- All kline data fields are parsed numbers (no strings)
- Volume metrics are pre-calculated correctly
- Helper functions work with object format
- LLM prompt updated with object notation examples
- Filters execute successfully with new format
