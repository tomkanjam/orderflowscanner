# Frontend: Indicator Data Integration

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-01-05 12:58:47

## Context

Update the frontend to consume indicator data from signals and display on charts. The data will come pre-calculated from the Go backend, so no client-side calculation is needed.

## Linked Items

- Part of: `context/issues/open/20251105-125847-001-PROJECT-custom-indicator-visualization.md`
- Depends on: `context/issues/open/20251105-125847-004-go-backend-series-execution.md`

## Progress

Pending - will start after Go backend implementation is complete.

## Spec

### Current Architecture

**ChartDisplay Component** (`apps/app/components/ChartDisplay.tsx`):
- Receives `indicators` prop: `CustomIndicatorConfig[]`
- Uses `useIndicatorWorker` hook to calculate indicators in Web Worker
- Creates chart datasets from calculated data

**Problem**: Frontend doesn't need to calculate anymore - data comes from backend.

### Required Changes

#### 1. Update TypeScript Interfaces

File: `apps/app/src/abstractions/interfaces.ts`

```typescript
interface SignalLifecycle {
    id: string;
    symbol: string;
    // ... existing fields ...

    // NEW: Pre-calculated indicator data from backend
    indicatorData?: Record<string, IndicatorDataPoint[]>;

    // Keep existing for backward compatibility
    analysis?: AnalysisResult;
}
```

#### 2. Update Signal Fetching

File: `apps/app/src/services/signalManager.ts` (or wherever signals are fetched)

Ensure API calls return `indicator_data`:

```typescript
async function fetchSignals(traderId: string): Promise<SignalLifecycle[]> {
    const response = await fetch(`/api/signals?trader_id=${traderId}`);
    const data = await response.json();

    return data.map((signal: any) => ({
        id: signal.id,
        symbol: signal.symbol,
        // ... map other fields ...
        indicatorData: signal.indicator_data, // NEW: from backend
    }));
}
```

#### 3. Modify ChartDisplay Component

File: `apps/app/components/ChartDisplay.tsx`

**Option A: Accept indicatorData prop directly**

```typescript
interface ChartDisplayProps {
    symbol: string;
    klines: Kline[];
    interval: KlineInterval;

    // OLD: indicators config (for calculation)
    indicators?: CustomIndicatorConfig[];

    // NEW: pre-calculated data (from signal)
    indicatorData?: Record<string, IndicatorDataPoint[]>;

    // ... other props
}

export default function ChartDisplay({
    symbol,
    klines,
    interval,
    indicators,
    indicatorData,
    // ...
}: ChartDisplayProps) {
    // If indicatorData provided, use it directly (no calculation)
    // Otherwise, fall back to calculating from indicators config
    const calculatedData = useIndicatorWorker(
        indicators && !indicatorData ? indicators : [],
        klines
    );

    const finalIndicatorData = indicatorData || calculatedData;

    // ... rest of component uses finalIndicatorData
}
```

**Option B: Detect indicatorData automatically**

```typescript
export default function ChartDisplay(props: ChartDisplayProps) {
    // If parent provides indicator data, skip calculation
    const shouldCalculate = props.indicators && !props.indicatorData;

    const calculatedData = useIndicatorWorker(
        shouldCalculate ? props.indicators : [],
        props.klines
    );

    const indicatorData = props.indicatorData || calculatedData;

    // Use indicatorData for chart rendering
}
```

#### 4. Update Parent Components

File: `apps/app/components/MainContent.tsx`

Pass indicator data when signal is selected:

```typescript
function MainContent() {
    const [selectedSignal, setSelectedSignal] = useState<SignalLifecycle | null>(null);

    const handleRowClick = (symbol: string, traderId?: string, signalId?: string) => {
        // Fetch signal with indicator data
        const signal = signals.find(s => s.id === signalId);
        setSelectedSignal(signal);
    };

    return (
        <>
            <SignalsTable
                signals={signals}
                onRowClick={handleRowClick}
            />

            {selectedSignal && (
                <ChartDisplay
                    symbol={selectedSignal.symbol}
                    klines={klines}
                    interval={selectedSignal.interval}
                    indicatorData={selectedSignal.indicatorData} // NEW
                />
            )}
        </>
    );
}
```

#### 5. Backward Compatibility

Support both modes:
1. **New mode**: Signal has `indicatorData` → use it directly
2. **Legacy mode**: Signal has `indicators` config → calculate in worker

```typescript
function ChartDisplay(props: ChartDisplayProps) {
    // Determine data source
    const hasPreCalculatedData = props.indicatorData && Object.keys(props.indicatorData).length > 0;

    // Only calculate if no pre-calculated data
    const calculatedData = useIndicatorWorker(
        hasPreCalculatedData ? [] : (props.indicators || []),
        props.klines
    );

    const indicatorData = hasPreCalculatedData ? props.indicatorData : calculatedData;

    // ... render charts
}
```

#### 6. Indicator Configuration

When using pre-calculated data, we still need indicator configs for rendering (colors, panel placement, etc.).

**Solution**: Get indicator configs from trader filter:

```typescript
interface SignalLifecycle {
    // ... existing fields ...
    indicatorData?: Record<string, IndicatorDataPoint[]>;
    indicatorConfigs?: CustomIndicatorConfig[]; // NEW: from trader.filter.indicators
}
```

Update signal fetching to include configs:

```typescript
async function fetchSignalWithTrader(signalId: string) {
    const signal = await fetchSignal(signalId);
    const trader = await fetchTrader(signal.traderId);

    return {
        ...signal,
        indicatorData: signal.indicator_data,
        indicatorConfigs: trader.filter.indicators, // Get configs from trader
    };
}
```

#### 7. Chart Rendering Flow

```
Signal Selected
    ↓
Has indicatorData?
    ↓ YES
Get indicatorConfigs from trader
    ↓
Fetch klines for symbol/interval
    ↓
Pass to ChartDisplay:
    - klines (candlestick data)
    - indicatorData (pre-calculated values)
    - indicatorConfigs (rendering metadata)
    ↓
ChartDisplay renders:
    - Price chart with candlesticks
    - Overlay indicators (panel=false)
    - Panel indicators (panel=true)
    ↓
NO CALCULATION NEEDED ✅
```

### Data Flow Comparison

**Before (with calculation):**
```
Signal → indicators config → Web Worker calculates → Chart
                              (2-3 seconds)
```

**After (pre-calculated):**
```
Signal → indicatorData → Chart
         (instant)
```

### Performance Improvement

- **Before**: 2-3 seconds to calculate indicators in Web Worker
- **After**: Instant chart rendering (0ms calculation time)
- **Network**: ~5-10KB additional payload per signal (negligible)

### Testing Strategy

1. Test with signal that has indicatorData (new flow)
2. Test with signal that lacks indicatorData (legacy flow)
3. Test with multiple indicator types (line, multi-line, panel vs overlay)
4. Verify chart renders correctly
5. Verify zoom/pan still works
6. Test with different timeframes

### Edge Cases

1. **Signal has no indicatorData**: Fall back to calculation (if indicators config available)
2. **Signal has partial indicatorData**: Use what's available, skip missing
3. **indicatorData format invalid**: Log error, fall back to calculation
4. **Trader deleted**: Can't get indicatorConfigs → show chart without indicators

## Implementation Steps

1. Update TypeScript interfaces
2. Modify ChartDisplay to accept indicatorData prop
3. Update parent components to pass indicatorData
4. Test with backend-generated signals
5. Verify backward compatibility
6. Add error handling for edge cases

## Completion Criteria

1. ✅ SignalLifecycle includes indicatorData field
2. ✅ ChartDisplay accepts pre-calculated data
3. ✅ Charts render instantly without calculation
4. ✅ Backward compatibility maintained
5. ✅ All indicator types render correctly (line, multi-line, panel, overlay)
6. ✅ Error handling works for edge cases
