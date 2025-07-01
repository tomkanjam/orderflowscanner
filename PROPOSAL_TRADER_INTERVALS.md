# Proposal: Per-Trader Interval Settings

## Overview
Enable each trader to operate on its own candle interval (1m, 5m, 15m, 1h, 4h, 1d) instead of using a global interval for all traders.

## Current Architecture
- Single global `klineInterval` state in App.tsx
- All traders use the same interval data
- One set of historical klines fetched for all traders
- Single WebSocket stream for real-time updates

## Proposed Architecture

### 1. Data Model Changes

```typescript
// src/abstractions/trader.interfaces.ts
export interface TraderFilter {
  code: string;
  description: string[];
  indicators?: CustomIndicatorConfig[];
  interval: KlineInterval; // NEW: Add interval to filter
}
```

### 2. Multi-Interval Data Management

```typescript
// App.tsx - Replace single historicalData with multi-interval storage
const [multiIntervalData, setMultiIntervalData] = useState<Map<string, Map<KlineInterval, Kline[]>>>(new Map());
// Structure: symbol -> interval -> klines

// New helper to get data for specific interval
const getKlinesForInterval = (symbol: string, interval: KlineInterval): Kline[] => {
  return multiIntervalData.get(symbol)?.get(interval) || [];
};
```

### 3. Data Fetching Strategy

```typescript
// services/binanceService.ts
export async function fetchKlinesForInterval(
  symbol: string, 
  interval: KlineInterval, 
  limit: number = KLINE_HISTORY_LIMIT
): Promise<Kline[]> {
  const response = await fetch(`${API_BASE_URL}/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  // ... error handling
  return await response.json();
}

// New service to manage multi-interval data
class IntervalDataManager {
  private dataCache: Map<string, Map<KlineInterval, Kline[]>> = new Map();
  private activeIntervals: Set<KlineInterval> = new Set();
  private wsConnections: Map<KlineInterval, WebSocket> = new Map();
  
  async ensureDataForInterval(symbols: string[], interval: KlineInterval): Promise<void> {
    if (!this.activeIntervals.has(interval)) {
      // Fetch initial data for this interval
      await this.fetchInitialData(symbols, interval);
      // Set up WebSocket for this interval
      this.setupWebSocket(symbols, interval);
      this.activeIntervals.add(interval);
    }
  }
  
  getKlines(symbol: string, interval: KlineInterval): Kline[] | undefined {
    return this.dataCache.get(symbol)?.get(interval);
  }
}
```

### 4. Screener Engine Updates

```typescript
// browserScreenerEngine.ts - Update to pass interval-specific data
export class BrowserScreenerEngine implements IScreenerEngine {
  async executeFilter(
    filterCode: string, 
    marketData: Map<string, MarketData>,
    interval: KlineInterval // NEW parameter
  ): Promise<FilterResult[]> {
    // Filter execution remains the same, but marketData 
    // now contains klines for the specific interval
  }
}

// useMultiTraderScreener.ts - Update to handle per-trader intervals
const runScreener = useCallback(() => {
  // Group traders by interval to optimize data passing
  const tradersByInterval = new Map<KlineInterval, Trader[]>();
  enabledTraders.forEach(trader => {
    const interval = trader.filter.interval;
    if (!tradersByInterval.has(interval)) {
      tradersByInterval.set(interval, []);
    }
    tradersByInterval.get(interval)!.push(trader);
  });
  
  // Run screeners for each interval group
  tradersByInterval.forEach((traders, interval) => {
    const intervalData = prepareDataForInterval(interval);
    // Send to worker with interval-specific data
  });
}, []);
```

### 5. UI Changes

```typescript
// TraderForm.tsx - Add interval selector
<div>
  <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
    Candle Interval
  </label>
  <select
    value={filterInterval}
    onChange={(e) => setFilterInterval(e.target.value as KlineInterval)}
    className="w-full p-2 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg"
  >
    {KLINE_INTERVALS.map(({ value, label }) => (
      <option key={value} value={value}>{label}</option>
    ))}
  </select>
  <p className="text-xs text-[var(--tm-text-muted)] mt-1">
    The trader will analyze {filterInterval} candles for this strategy
  </p>
</div>
```

### 6. Migration Strategy

```typescript
// traderManager.ts - Add migration for existing traders
async migrateTraders() {
  const traders = await this.getTraders();
  for (const trader of traders) {
    if (!trader.filter.interval) {
      // Default existing traders to 1m interval
      await this.updateTrader(trader.id, {
        filter: {
          ...trader.filter,
          interval: KlineInterval.ONE_MINUTE
        }
      });
    }
  }
}
```

## Implementation Steps

### Phase 1: Data Model & Storage (2-3 days)
1. Update Trader interface with interval field
2. Implement IntervalDataManager service
3. Modify data storage in App.tsx
4. Add database migration for existing traders

### Phase 2: Multi-Interval Data Fetching (2-3 days)
1. Update binanceService to support interval-specific fetching
2. Implement WebSocket management for multiple intervals
3. Add data caching and cleanup logic
4. Handle API rate limits for multiple interval requests

### Phase 3: Screener Updates (1-2 days)
1. Update screener engine to accept interval parameter
2. Modify worker to handle interval-specific data
3. Update useMultiTraderScreener hook
4. Test performance with multiple intervals

### Phase 4: UI Integration (1 day)
1. Add interval selector to TraderForm
2. Display interval in TraderList
3. Update AI generation to suggest appropriate intervals
4. Add interval info to signal displays

### Phase 5: Optimization & Testing (2 days)
1. Implement data deduplication (1m data can be aggregated to 5m, etc.)
2. Add cleanup for unused interval data
3. Performance testing with multiple intervals
4. Edge case handling

## Technical Considerations

### 1. API Rate Limits
- Binance allows 1200 requests/minute
- With 100 symbols × 6 intervals = 600 requests on startup
- Solution: Stagger initial data fetching, prioritize active trader intervals

### 2. Memory Usage
- 6× more kline data in worst case
- Solution: Implement LRU cache, clean up unused intervals after 5 minutes

### 3. WebSocket Connections
- Binance allows max 1024 streams per connection
- Solution: Multiplex streams, group by interval

### 4. Performance Impact
- More data to process in screeners
- Solution: Optimize by grouping traders by interval, parallel processing

### 5. Data Aggregation
- Higher intervals can be derived from lower ones
- Example: 5 × 1m candles = 1 × 5m candle
- Reduces API calls but increases computation

## Benefits
1. **Flexibility**: Traders can operate on timeframes suitable for their strategies
2. **Accuracy**: Scalping strategies use 1m, swing strategies use 4h/1d
3. **Performance**: Less noise in higher timeframes for trend-following strategies
4. **Multi-strategy**: Run both intraday and position traders simultaneously

## Risks & Mitigation
1. **Increased Complexity**: Mitigate with good abstraction and testing
2. **Higher Resource Usage**: Implement smart caching and cleanup
3. **API Limits**: Use data aggregation where possible
4. **User Confusion**: Provide good defaults and tooltips

## Alternative Approaches

### Option A: Interval Groups (Simpler)
- Support only 3 intervals: fast (1m), medium (15m), slow (4h)
- Reduces complexity while providing flexibility
- Easier to implement and maintain

### Option B: Dynamic Fetching (Complex)
- Fetch interval data only when trader is enabled
- Minimal memory usage but higher latency
- More API calls during operation

## Recommendation
Proceed with the full implementation but start with Phase 1-3 to validate the approach. Consider Option A if performance issues arise.

## Success Metrics
- No degradation in screener performance
- Memory usage increase < 3x
- API rate limit compliance
- User satisfaction with interval flexibility