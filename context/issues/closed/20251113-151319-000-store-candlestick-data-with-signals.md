# Store Candlestick Data with Signals

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-13 15:13:19

## Context

Currently, signals store indicator data (RSI, MACD, etc.) in the `indicator_data` JSONB column, but not the underlying candlestick (kline) data. This means:

1. To display a signal's chart, we must fetch klines separately from Binance API
2. Historical signals don't preserve the exact market state at signal time
3. Charts can't be displayed offline or if Binance API is unavailable
4. Extra API call adds latency to chart rendering

By storing candlestick data alongside indicator data, we achieve:
- **Instant chart rendering** - Everything in one database query
- **Historical accuracy** - Exact market state preserved
- **Reduced API calls** - No separate Binance kline fetch needed
- **Offline capability** - View past signals without live market connection
- **Consistency** - Klines match exactly what filter code evaluated

## Linked Items
- Part of: `context/issues/open/20251105-163439-001-PROJECT-create-trader-edge-function.md`
- Related to: Indicator visualization system (034_add_indicator_data_to_signals.sql)

## Progress

### Completed ✅
1. **Backend Implementation** - Added `serializeKlines()` helper function and modified `processSymbol()` to include candlestick data in `indicatorData`
   - Location: `backend/go-screener/internal/trader/executor.go:828-852, 776-780`
   - Stores last 150 klines in format: `{x, o, h, l, c, v}`

2. **Frontend Types** - Updated Signal interface to include klines in `indicatorData`
   - Location: `apps/app/src/abstractions/interfaces.ts:135-138`

3. **ChartDisplay Component** - Added support for `preCalculatedKlines` prop
   - Location: `apps/app/components/ChartDisplay.tsx:23, 192, 333, 442-455, 835-848`
   - Uses pre-calculated klines when available, falls back to fetching

4. **Data Flow** - Updated App.tsx and MainContent to extract and pass klines
   - Location: `apps/app/App.tsx:1145-1150, 1226, 1300`
   - Location: `apps/app/components/MainContent.tsx:36, 84, 147, 241`

### Verified ✅
Feature fully deployed and tested:
- Backend deployed to Fly.io (vyx-app)
- Frontend deployed (vyx repo)
- Verified with 3 signals from "1m MACD Cross Below 40" trader:
  - FDUSDUSDT (bf58cde5-9aae-48f6-8ed9-786ac520b0b8)
  - AVNTUSDT (b1a2b6f5-f327-4972-8876-8730431480eb)
  - LSKUSDT (90e51292-8588-410c-8a9e-f23f65443240)
- All signals contain exactly 150 klines in correct format: `{x, o, h, l, c, v}`
- Stored alongside indicator data: `klines`, `macd_12_26_9`, `macd_histogram_12_26_9`

## Spec

### Architecture Decision: Option 1 (Store in `indicator_data`)

**Store candlestick data in existing `indicator_data` JSONB column** alongside indicators:

```json
{
  "rsi_14": [{"x": 1699564800000, "y": 28.5}, ...],
  "bb_20_2": [{"x": 1699564800000, "y": 46200, "y2": 45600, "y3": 45000}, ...],
  "klines": [
    {"x": 1699564800000, "o": 45500, "h": 45600, "l": 45400, "c": 45550, "v": 1250.5},
    {"x": 1699564860000, "o": 45550, "h": 45700, "l": 45500, "c": 45650, "v": 1580.3}
  ]
}
```

**Rationale:**
- ✅ No schema changes or migrations needed
- ✅ Atomic storage with indicators (same transaction)
- ✅ GIN index already optimized for JSONB queries
- ✅ Simple implementation

**Storage Limit:** Store last 150 klines (matches indicator window)
- Current: ~2KB per signal
- With 150 klines: ~8-10KB per signal
- Reasonable trade-off for instant rendering

### Implementation

#### 1. Backend - Go Screener

**File:** `backend/go-screener/internal/trader/executor.go`

Add helper function to serialize klines:
```go
// serializeKlines converts kline data to chart-ready format
// Returns last `limit` klines in format: {x: timestamp, o, h, l, c, v}
func serializeKlines(klines []types.Kline, limit int) []map[string]interface{} {
    if klines == nil || len(klines) == 0 {
        return []map[string]interface{}{}
    }

    start := 0
    if len(klines) > limit {
        start = len(klines) - limit
    }

    result := make([]map[string]interface{}, 0, len(klines)-start)
    for i := start; i < len(klines); i++ {
        result = append(result, map[string]interface{}{
            "x": klines[i].CloseTime,
            "o": klines[i].Open,
            "h": klines[i].High,
            "l": klines[i].Low,
            "c": klines[i].Close,
            "v": klines[i].Volume,
        })
    }
    return result
}
```

Modify `processSymbol()` at line ~762:
```go
// Execute series code if available (for indicator visualization)
if trader.Config.SeriesCode != "" {
    log.Printf("[Executor] Executing series code for %s", symbol)

    indicatorData, err := e.seriesExec.ExecuteSeriesCode(ctx, trader.Config.SeriesCode, marketData)
    if err != nil {
        log.Printf("[Executor] Series code execution failed for %s: %v", symbol, err)
    } else {
        // Validate output format
        expectedIndicators := make([]string, len(trader.Config.Indicators))
        for i, ind := range trader.Config.Indicators {
            expectedIndicators[i] = ind.ID
        }

        if err := e.seriesExec.ValidateSeriesOutput(indicatorData, expectedIndicators); err != nil {
            log.Printf("[Executor] Series output validation failed for %s: %v", symbol, err)
        } else {
            // ADD: Include candlestick data for chart rendering
            if klines, exists := marketData.Klines[triggerInterval]; exists && len(klines) > 0 {
                indicatorData["klines"] = serializeKlines(klines, 150)
                log.Printf("[Executor] Added %d klines for %s", len(indicatorData["klines"].([]map[string]interface{})), symbol)
            }

            // Store indicator data with signal
            signal.IndicatorData = indicatorData
            log.Printf("[Executor] Successfully generated indicator data for %s: %d indicators", symbol, len(indicatorData))
        }
    }
}
```

#### 2. Frontend - TypeScript

**File:** `apps/app/src/abstractions/interfaces.ts` (line ~135)

Update Signal interface to include klines in indicatorData:
```typescript
// Indicator visualization data
indicatorData?: {
    klines?: Array<{x: number; o: number; h: number; l: number; c: number; v: number}>;
    [indicatorId: string]: Array<{ x: number; y: number; y2?: number; y3?: number }>;
};
```

**File:** `apps/app/components/ChartDisplay.tsx`

Add prop for pre-calculated klines:
```typescript
interface ChartDisplayProps {
  symbol: string | null;
  klines: Kline[] | undefined;
  indicators: CustomIndicatorConfig[] | null;
  interval: KlineInterval;
  signalLog: SignalLogEntry[];
  historicalSignals?: HistoricalSignal[];
  isMobile?: boolean;
  preCalculatedIndicators?: Record<string, Array<{ x: number; y: number; y2?: number; y3?: number }>>;
  preCalculatedKlines?: Array<{x: number; o: number; h: number; l: number; c: number; v: number}>; // NEW
}
```

Modify useEffect at line ~331 to use pre-calculated klines:
```typescript
// Calculate indicators when they change (or use pre-calculated from backend)
useEffect(() => {
    if (!indicators || (!klines && !preCalculatedKlines) || (klines && klines.length === 0 && !preCalculatedKlines)) {
        setCalculatedIndicators(new Map());
        setLoadingStates(new Map());
        return;
    }

    // If we have pre-calculated indicators from backend, use them directly
    if (preCalculatedIndicators) {
        const resultsMap = new Map<string, IndicatorDataPoint[]>();

        indicators.forEach(indicator => {
            const backendData = preCalculatedIndicators[indicator.id];
            if (backendData) {
                // Convert backend format to IndicatorDataPoint format
                const indicatorPoints: IndicatorDataPoint[] = backendData.map(point => ({
                    x: point.x,
                    y: point.y,
                    y2: point.y2,
                    y3: point.y3
                }));
                resultsMap.set(indicator.id, indicatorPoints);
            }
        });

        setCalculatedIndicators(resultsMap);
        setLoadingStates(new Map()); // Clear all loading states
        return;
    }

    // ... rest of existing logic
}, [indicators, klines, preCalculatedIndicators, preCalculatedKlines]);
```

Use preCalculatedKlines in chart creation (line ~446):
```typescript
// Use pre-calculated klines if available, otherwise convert from props
const candlestickData: CandlestickDataPoint[] = preCalculatedKlines
    ? preCalculatedKlines.map(k => ({ x: k.x, o: k.o, h: k.h, l: k.l, c: k.c }))
    : klines.map(k => ({
        x: k[0],
        o: parseFloat(k[1]),
        h: parseFloat(k[2]),
        l: parseFloat(k[3]),
        c: parseFloat(k[4])
      }));
```

**File:** `apps/app/App.tsx` (line ~1142)

Pass klines to ChartDisplay:
```typescript
const selectedSignalPreCalculatedIndicators = useMemo(() => {
    if (!selectedSignalId) return undefined;
    const selectedSignal = allSignals.find(s => s.id === selectedSignalId);
    return selectedSignal?.indicatorData;
}, [selectedSignalId, allSignals]);

const selectedSignalPreCalculatedKlines = useMemo(() => {
    if (!selectedSignalId) return undefined;
    const selectedSignal = allSignals.find(s => s.id === selectedSignalId);
    return selectedSignal?.indicatorData?.klines;
}, [selectedSignalId, allSignals]);

// In ChartDisplay component:
<ChartDisplay
    // ... existing props
    preCalculatedIndicators={selectedSignalPreCalculatedIndicators}
    preCalculatedKlines={selectedSignalPreCalculatedKlines}
/>
```

### Testing Checklist

- [x] Create new signal and verify klines stored in `indicator_data`
- [x] Verify JSON structure: `{"macd_12_26_9": [...], "klines": [...]}`
- [x] Verify 150 klines stored (not more, not less)
- [x] Frontend displays chart without fetching from Binance
- [x] Historical signals show correct candlestick data
- [x] Chart rendering performance is acceptable
- [x] Database query performance unchanged
- [x] Storage size per signal is reasonable (~8-10KB)

### Rollout Plan

1. ✅ **Phase 1:** Deploy backend changes (executor.go) - Deployed to Fly.io
2. ✅ **Phase 2:** Deploy frontend changes (interfaces, ChartDisplay, App) - Pushed to vyx repo
3. ✅ **Phase 3:** Monitor storage impact and query performance - Verified with production signals
4. ⏭️ **Phase 4:** Optional: Backfill existing signals (if needed) - Skipped (not necessary)

### Notes

- No database migration required (using existing JSONB column)
- Backward compatible (old signals without klines still work)
- Frontend gracefully falls back to fetching klines if not present
- Storage: 150 klines × ~50 bytes = ~7.5KB per signal (acceptable)

## Completion
**Closed:** 2025-11-13 20:10:00
**Outcome:** Success - Feature fully deployed and verified
**Commits:**
- a482730 - chore: remove debug logging after fixing indicator data display
- 0111c37 - fix: correct case mismatch for indicator_data access in App.tsx
- a8cf4fb - fix: extract indicator_data from metadata when loading signals from database
- ecb8a00 - debug: add logging to trace indicator_data flow from signal to ChartDisplay
- 9294575 - fix: correct case mismatch for indicator_data access
