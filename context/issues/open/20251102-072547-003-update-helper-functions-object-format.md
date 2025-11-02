# Update Helper Functions for Object Format

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-02 07:25:47

## Context
Update helper functions in the filter execution environment to work with object-based kline data instead of array format.

## Linked Items
- Part of: `context/issues/open/20251102-072547-000-PROJECT-kline-object-format-volume-enrichment.md`
- Depends on: `context/issues/open/20251102-072547-001-transform-kline-to-object-format.md`

## Progress
Awaiting implementation.

## Spec

### Location
`supabase/functions/execute-trader/index.ts:84-112`

### Functions to Update

#### 1. `getLatestBollingerBands`
**Current:**
```javascript
const closes = klines.map(k => parseFloat(k[4]));
```

**Target:**
```javascript
const closes = klines.map(k => k.close);
```

#### 2. `getLatestRSI`
**Current:**
```javascript
const closes = klines.map(k => parseFloat(k[4]));
```

**Target:**
```javascript
const closes = klines.map(k => k.close);
```

#### 3. Consider adding new volume helpers
```javascript
const getLatestVolumeProfile = (klines) => {
  if (!klines || klines.length === 0) return null;
  const latest = klines[klines.length - 1];
  return {
    buyVolume: latest.buyVolume,
    sellVolume: latest.sellVolume,
    volumeDelta: latest.volumeDelta,
    buyPressure: latest.buyVolume / latest.volume, // 0-1 scale
    sellPressure: latest.sellVolume / latest.volume // 0-1 scale
  };
};

const getAverageVolumeDelta = (klines, period = 20) => {
  if (!klines || klines.length < period) return null;
  const recent = klines.slice(-period);
  const sum = recent.reduce((acc, k) => acc + k.volumeDelta, 0);
  return sum / period;
};
```

### Testing
- Test each helper function with new object format
- Verify no errors when accessing properties
- Test edge cases (empty arrays, insufficient data)
- Ensure backward compatibility is not needed (breaking change acceptable)

### Notes
- All helper functions currently use array index `[4]` for close price
- With object format, this becomes `.close`
- Consider if additional volume-based helpers would be valuable
- Keep helpers minimal - most logic should be in generated filter code
