# Proposal V2: Per-Trader Intervals with Centralized Data Repository

## Overview
Keep the existing centralized data architecture but extend it to support multiple intervals. Each trader selects which interval data to use from the central repository.

## Simplified Architecture

### 1. Data Model Changes

```typescript
// src/abstractions/trader.interfaces.ts
export interface TraderFilter {
  code: string;
  description: string[];
  indicators?: CustomIndicatorConfig[];
  interval: KlineInterval; // NEW: Add interval preference
}
```

### 2. Extend Central Repository

```typescript
// App.tsx - Extend historicalData to support multiple intervals
const [historicalData, setHistoricalData] = useState<Map<string, Map<KlineInterval, Kline[]>>>(new Map());
// Structure: symbol -> { '1m': [...], '5m': [...], '15m': [...] }

// Helper to get klines for specific interval
const getKlinesForInterval = (symbol: string, interval: KlineInterval): Kline[] => {
  return historicalData.get(symbol)?.get(interval) || [];
};
```

### 3. Data Fetching on Startup

```typescript
// App.tsx - Modified loadInitialData
const loadInitialData = useCallback(async () => {
  // Determine which intervals are needed by active traders
  const activeIntervals = new Set<KlineInterval>();
  traders.forEach(trader => {
    if (trader.enabled) {
      activeIntervals.add(trader.filter.interval || KlineInterval.ONE_MINUTE);
    }
  });
  
  // Always include 1m as default/fallback
  activeIntervals.add(KlineInterval.ONE_MINUTE);
  
  // Fetch data for all active intervals
  const { symbols, tickers: initialTickers } = await fetchTopPairs();
  const multiIntervalData = new Map<string, Map<KlineInterval, Kline[]>>();
  
  // Fetch klines for each interval
  for (const interval of activeIntervals) {
    const klinesData = await fetchKlinesForInterval(symbols, interval);
    // Merge into multiIntervalData structure
    klinesData.forEach((klines, symbol) => {
      if (!multiIntervalData.has(symbol)) {
        multiIntervalData.set(symbol, new Map());
      }
      multiIntervalData.get(symbol)!.set(interval, klines);
    });
  }
  
  setHistoricalData(multiIntervalData);
}, [traders]);
```

### 4. WebSocket Updates

```typescript
// services/binanceService.ts - Update WebSocket to handle multiple intervals
export function connectWebSocket(symbols: string[], intervals: Set<KlineInterval>, callbacks) {
  // Create streams for each interval needed
  const streams = [];
  symbols.forEach(symbol => {
    intervals.forEach(interval => {
      streams.push(`${symbol.toLowerCase()}@kline_${interval}`);
    });
  });
  
  // Connect with all streams
  const ws = new WebSocket(`${WS_BASE_URL}${streams.join('/')}`);
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.k) {
      // Update the specific interval's kline data
      callbacks.onKlineUpdate(data.s, data.k.i, data.k);
    }
  };
}
```

### 5. Screener Updates

```typescript
// useMultiTraderScreener.ts - Pass interval-specific data to each trader
const runScreener = useCallback(() => {
  const message: MultiTraderScreenerMessage = {
    traders: enabledTraders.map(trader => ({
      traderId: trader.id,
      filterCode: trader.filter.code,
      interval: trader.filter.interval || KlineInterval.ONE_MINUTE,
      // Include interval-specific klines for each symbol
      historicalData: Object.fromEntries(
        symbols.map(symbol => [
          symbol, 
          getKlinesForInterval(symbol, trader.filter.interval)
        ])
      )
    }))
  };
  
  workerRef.current.postMessage(message);
}, []);
```

### 6. UI Changes

```typescript
// TraderForm.tsx - Add simple interval selector
<div>
  <label className="block text-sm font-medium text-[var(--tm-text-primary)] mb-1">
    Timeframe
  </label>
  <select
    value={filterInterval || KlineInterval.ONE_MINUTE}
    onChange={(e) => setFilterInterval(e.target.value as KlineInterval)}
    className="w-full p-2 bg-[var(--tm-bg-secondary)] border border-[var(--tm-border)] rounded-lg"
  >
    <option value="1m">1 Minute</option>
    <option value="5m">5 Minutes</option>
    <option value="15m">15 Minutes</option>
    <option value="1h">1 Hour</option>
    <option value="4h">4 Hours</option>
    <option value="1d">1 Day</option>
  </select>
</div>
```

## Implementation Steps (Much Simpler!)

### Phase 1: Core Changes (1 day)
1. Update Trader interface with interval field
2. Modify historicalData structure to Map<symbol, Map<interval, klines>>
3. Update data access patterns

### Phase 2: Data Fetching (1 day)
1. Modify loadInitialData to fetch multiple intervals
2. Update WebSocket to subscribe to multiple interval streams
3. Handle kline updates for different intervals

### Phase 3: Screener Integration (1 day)
1. Pass interval-specific data to screeners
2. Update worker to handle per-trader intervals
3. Test with multiple intervals

### Phase 4: UI & Migration (1 day)
1. Add interval selector to TraderForm
2. Display interval in TraderList
3. Migrate existing traders to default 1m

## Key Advantages of This Approach

1. **Minimal Architecture Changes**: Keeps existing data flow intact
2. **Shared Data**: Traders using same interval share data (memory efficient)
3. **Simple Implementation**: No complex interval management service needed
4. **Backwards Compatible**: Existing code continues to work with minor tweaks
5. **Performance**: Only fetch/stream intervals actually being used

## Smart Optimizations

### 1. Lazy Loading Intervals
```typescript
// Only fetch new interval data when a trader needs it
const enableTrader = async (traderId: string) => {
  const trader = await traderManager.getTrader(traderId);
  const interval = trader.filter.interval;
  
  // Check if we already have data for this interval
  if (!activeIntervals.has(interval)) {
    // Fetch data for new interval
    await fetchAndAddInterval(interval);
    // Add to WebSocket streams
    addWebSocketStream(interval);
  }
  
  // Enable trader
  await traderManager.enableTrader(traderId);
};
```

### 2. Interval Cleanup
```typescript
// Remove interval data when no traders use it
const cleanupUnusedIntervals = () => {
  const usedIntervals = new Set<KlineInterval>();
  traders.filter(t => t.enabled).forEach(t => {
    usedIntervals.add(t.filter.interval);
  });
  
  // Remove unused interval data
  historicalData.forEach((intervalMap, symbol) => {
    intervalMap.forEach((_, interval) => {
      if (!usedIntervals.has(interval)) {
        intervalMap.delete(interval);
      }
    });
  });
};
```

## Migration for Existing Traders
```typescript
// Simple migration - all existing traders default to 1m
const migrateTrader = (trader: Trader) => ({
  ...trader,
  filter: {
    ...trader.filter,
    interval: trader.filter.interval || KlineInterval.ONE_MINUTE
  }
});
```

## API Considerations
- Initial load: 100 symbols × N intervals = 100N requests
- Typical case: 2-3 active intervals = 200-300 requests (well within limits)
- Can optimize by fetching 1m and aggregating to higher intervals

## Summary
This approach maintains the centralized data architecture while adding interval flexibility. It's simpler to implement, more memory efficient, and requires minimal changes to existing code. Each trader just specifies which interval it wants from the central repository.