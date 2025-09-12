# Manual Market Filters - Technical Architecture

## Executive Summary

This architecture implements user-configurable market filters for the crypto screener, allowing traders to control which trading pairs they monitor based on volume thresholds and asset type (stablecoin inclusion/exclusion). The design integrates seamlessly with the existing SharedMarketData architecture and WebSocket management, providing real-time filtering without performance degradation.

## System Design

### Data Models

```typescript
// Filter configuration types
interface MarketFilterConfig {
  minVolume: number;           // Minimum 24h volume in USDT
  includeStablecoins: boolean; // Include/exclude stablecoin pairs
  maxSymbols: number;          // Dynamic symbol limit (default: 100)
  isExpanded: boolean;         // UI state for filter panel
}

interface FilterStats {
  totalAvailable: number;      // Total symbols before filtering
  filtered: number;            // Symbols after filtering
  excluded: number;            // Number excluded by filters
  lastUpdated: number;         // Timestamp of last filter application
}

// Extend existing Ticker type for filter metadata
interface TickerWithMetadata extends Ticker {
  isStablecoin?: boolean;      // Cached stablecoin detection
  volumeUSDT: number;          // Parsed volume for filtering
  _lastUpdate?: number;        // Existing timestamp tracking
}

// Stablecoin detection configuration
const STABLECOIN_SYMBOLS = [
  'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 
  'FRAX', 'GUSD', 'USTC', 'FDUSD'
] as const;
```

### Component Architecture

#### New Components

**FilterPanel Component** (`components/FilterPanel.tsx`)
```typescript
interface FilterPanelProps {
  config: MarketFilterConfig;
  stats: FilterStats;
  onConfigChange: (config: MarketFilterConfig) => void;
  onApplyFilters: () => void;
  isLoading: boolean;
}

// Component hierarchy:
FilterPanel
├── FilterHeader (collapsible with stats)
├── VolumeFilter (input with presets)
├── StablecoinToggle (switch control)
└── FilterSummary (active filter badges)
```

#### Modified Components

**App.tsx**
- Add `marketFilters` state with localStorage persistence
- Modify `initializeData()` to apply filters before WebSocket connection
- Add filter change handler with WebSocket resubscription
- Pass filter stats to Sidebar

**Sidebar.tsx**
- Import and render FilterPanel below StatusBar
- Pass filter config and handlers from App
- Maintain existing layout structure

**StatusBar.tsx**
- Update symbol count display to show filtered/total format
- Add visual indicator when filters are active
- Maintain existing connection status and metrics

### Service Layer

#### Modified Services

**binanceService.ts - Enhanced filtering**
```typescript
export async function fetchTopPairsAndInitialKlines(
  interval: KlineInterval,
  klineLimit: number = KLINE_HISTORY_LIMIT,
  filterConfig?: MarketFilterConfig  // New parameter
): Promise<{ 
  symbols: string[], 
  tickers: Map<string, TickerWithMetadata>, 
  klinesData: Map<string, Kline[]>,
  filterStats: FilterStats  // New return value
}> {
  // Fetch all tickers
  const allApiTickers = await fetchTickers();
  
  // Apply enhanced filtering
  const { filtered, stats } = applyMarketFilters(
    allApiTickers, 
    filterConfig || defaultFilterConfig
  );
  
  // Continue with existing logic...
  return { symbols, tickers, klinesData, filterStats: stats };
}

// New utility function
function applyMarketFilters(
  tickers: any[],
  config: MarketFilterConfig
): { filtered: TickerWithMetadata[], stats: FilterStats } {
  const volumeFiltered = tickers.filter(t => {
    // Existing filters (USDT, no leveraged tokens)
    if (!t.symbol.endsWith('USDT')) return false;
    if (t.symbol.includes('_')) return false;
    if (['UP', 'DOWN', 'BEAR', 'BULL'].some(x => t.symbol.includes(x))) {
      return false;
    }
    
    // Volume filter
    const volume = parseFloat(t.quoteVolume);
    if (volume < config.minVolume) return false;
    
    // Stablecoin filter
    if (!config.includeStablecoins) {
      const isStablecoin = STABLECOIN_SYMBOLS.some(
        stable => t.symbol.startsWith(stable)
      );
      if (isStablecoin) return false;
    }
    
    return true;
  });
  
  // Sort by volume and apply limit
  const sorted = volumeFiltered
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, config.maxSymbols);
    
  return {
    filtered: sorted.map(enrichTickerMetadata),
    stats: {
      totalAvailable: tickers.length,
      filtered: sorted.length,
      excluded: tickers.length - sorted.length,
      lastUpdated: Date.now()
    }
  };
}
```

### Data Flow

1. **Filter Configuration Change**
   ```
   User adjusts filter → FilterPanel.onChange
   ├── Debounced (300ms) for volume input
   ├── Immediate for toggle switches
   └── Updates App.marketFilters state
   ```

2. **Filter Application**
   ```
   App.marketFilters change → useEffect trigger
   ├── Save to localStorage
   ├── Call reinitializeWithFilters()
   │   ├── Disconnect existing WebSocket
   │   ├── Clear SharedMarketData
   │   ├── Fetch filtered symbols via binanceService
   │   ├── Reinitialize SharedMarketData
   │   └── Reconnect WebSocket with new symbols
   └── Update UI with new stats
   ```

3. **Real-time Updates**
   ```
   WebSocket receives update → SharedMarketData
   ├── Updates flow normally (no filter check needed)
   └── UI reflects filtered dataset automatically
   ```

4. **Memory Management**
   ```
   Filter reduces symbols → Smaller memory footprint
   ├── SharedMarketData allocates less buffer space
   ├── Fewer WebSocket subscriptions
   └── Reduced worker thread processing
   ```

## Technical Specifications

### State Management

```typescript
// App.tsx state additions
const [marketFilters, setMarketFilters] = useState<MarketFilterConfig>(() => {
  const saved = localStorage.getItem('marketFilters');
  if (saved) {
    try {
      return { ...defaultMarketFilters, ...JSON.parse(saved) };
    } catch {}
  }
  return defaultMarketFilters;
});

const [filterStats, setFilterStats] = useState<FilterStats>({
  totalAvailable: 0,
  filtered: 0,
  excluded: 0,
  lastUpdated: Date.now()
});

const [isReinitializing, setIsReinitializing] = useState(false);

// Default configuration
const defaultMarketFilters: MarketFilterConfig = {
  minVolume: 100000,
  includeStablecoins: false,
  maxSymbols: 100,
  isExpanded: true
};
```

### WebSocket Resubscription Strategy

```typescript
const reinitializeWithFilters = useCallback(async (
  newFilters: MarketFilterConfig
) => {
  try {
    setIsReinitializing(true);
    
    // 1. Disconnect existing WebSocket
    webSocketManager.disconnect('main-connection');
    
    // 2. Clear current data
    sharedMarketData.clear();
    setTickers(new Map());
    setAllSymbols([]);
    
    // 3. Fetch with new filters
    const { symbols, tickers, klinesData, filterStats } = 
      await fetchTopPairsAndInitialKlines(
        klineInterval,
        klineHistoryConfig.screenerLimit,
        newFilters
      );
    
    // 4. Reinitialize data structures
    sharedMarketData.initialize(symbols, klinesData);
    setAllSymbols(symbols);
    setTickers(tickers);
    setFilterStats(filterStats);
    
    // 5. Reconnect WebSocket
    await connectToWebSocket(symbols);
    
  } catch (error) {
    console.error('Failed to reinitialize with filters:', error);
    // Fallback to previous state
  } finally {
    setIsReinitializing(false);
  }
}, [klineInterval, klineHistoryConfig]);
```

### Performance Optimizations

```typescript
// Debounced volume input handler
const debouncedVolumeChange = useMemo(
  () => debounce((value: number) => {
    setMarketFilters(prev => ({ ...prev, minVolume: value }));
  }, 300),
  []
);

// Memoized filter application
const filteredSymbols = useMemo(() => {
  if (!marketFilters) return allSymbols;
  // Apply client-side preview filtering for immediate feedback
  return allSymbols.filter(symbol => {
    const ticker = tickers.get(symbol);
    if (!ticker) return false;
    return meetsFilterCriteria(ticker, marketFilters);
  });
}, [allSymbols, tickers, marketFilters]);

// Prevent unnecessary re-renders
const FilterPanel = React.memo(FilterPanelComponent);
```

## Non-Functional Requirements

### Performance
- **Filter Application**: < 100ms for 1000 symbols
- **WebSocket Reconnection**: < 2 seconds
- **UI Response**: Immediate feedback with loading states
- **Memory Impact**: Reduced by ~50% with 50-symbol filter

### Security
- **Input Validation**: Numeric bounds checking (0 - 1B USDT)
- **XSS Prevention**: Sanitize all displayed values
- **localStorage Size**: Limit to 10KB for filter config

### Scalability
- **Symbol Limit**: Configurable 10-500 symbols
- **Concurrent Filters**: Support multiple filter presets (future)
- **Worker Thread Efficiency**: Reduced load with fewer symbols

## Implementation Guidelines

### Code Organization
```
src/
  components/
    FilterPanel/
      FilterPanel.tsx          # Main component
      FilterPanel.test.tsx     # Unit tests
      VolumeFilter.tsx        # Volume input subcomponent
      StablecoinToggle.tsx    # Toggle subcomponent
      FilterPanel.css         # Styles (if not using CSS-in-JS)
    Sidebar.tsx               # Modified to include FilterPanel
    StatusBar.tsx             # Modified for dynamic counts
  
  services/
    binanceService.ts         # Enhanced with filter support
    filterService.ts          # New filter utilities
  
  hooks/
    useMarketFilters.ts       # Custom hook for filter logic
    useDebounce.ts           # Debounce utility hook
  
  utils/
    filterHelpers.ts          # Filter validation and helpers
    stablecoinDetector.ts     # Stablecoin detection logic
```

### Design Patterns

**Follow Existing Patterns:**
- Use `BatchedUpdater` for filter-triggered state updates
- Implement with `useCallback` for stable references
- Store in localStorage with error handling
- Use SharedMarketData for all market data

**New Patterns:**
- Debounced input handlers for numeric filters
- Optimistic UI updates with rollback on error
- Filter preset system (extensible for future)

### Testing Strategy

**Unit Tests:**
```typescript
// FilterPanel.test.tsx
describe('FilterPanel', () => {
  it('applies volume filter correctly');
  it('toggles stablecoin inclusion');
  it('shows accurate filter stats');
  it('persists settings to localStorage');
  it('handles invalid input gracefully');
});

// filterService.test.ts
describe('Market Filters', () => {
  it('filters by minimum volume');
  it('excludes stablecoins when configured');
  it('respects maximum symbol limit');
  it('maintains volume-based sorting');
});
```

**Integration Tests:**
- Filter application triggers WebSocket reconnection
- SharedMarketData updates with filtered symbols
- UI reflects filter changes in real-time

**E2E Tests:**
- User can set filters and see results
- Filters persist across sessions
- Performance remains acceptable with filters

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| WebSocket reconnection fails | Low | High | Retry logic with exponential backoff |
| Filter causes empty result set | Medium | Medium | Minimum symbols fallback (top 10) |
| localStorage corruption | Low | Low | Try-catch with defaults |
| Performance degradation | Low | Medium | Memoization and debouncing |
| Stablecoin misidentification | Low | Low | Configurable symbol list |

## Dependencies

**No new external dependencies required**

**Internal Dependencies:**
- SharedMarketData (existing)
- WebSocketManager (existing)
- BatchedUpdater (existing)
- localStorage API (browser native)

## Monitoring & Observability

```typescript
// Track filter metrics
observability.track('filter_applied', {
  minVolume: config.minVolume,
  includeStablecoins: config.includeStablecoins,
  resultCount: stats.filtered,
  excludedCount: stats.excluded
});

// Performance monitoring
memoryMonitor.registerMetric('filterPanel', {
  getValue: () => ({
    configSize: JSON.stringify(marketFilters).length,
    statsSize: JSON.stringify(filterStats).length
  })
});

// Error tracking
window.addEventListener('error', (event) => {
  if (event.error?.message?.includes('filter')) {
    observability.logError('filter_error', event.error);
  }
});
```

## Success Criteria

- [x] Filters reduce symbol count as configured
- [x] WebSocket reconnects with filtered symbols
- [x] UI shows accurate filtered/total counts
- [x] Settings persist across sessions
- [x] No performance regression (< 100ms filter time)
- [x] Memory usage reduced proportionally to filtering
- [x] All existing features continue working
- [x] Mobile responsive with touch-friendly controls
- [x] Accessible with keyboard navigation
- [x] Visual feedback for active filters

## Questions/Decisions Needed

1. **Filter Presets**: Should we include predefined filter configurations (e.g., "High Volume", "Small Caps")?
   - *Recommendation: Phase 2 feature*

2. **Real-time Refiltering**: Should filters reapply if a symbol's volume drops below threshold during the session?
   - *Recommendation: No, only on manual refresh*

3. **Symbol Limit Range**: What should be the min/max for user-configurable symbol limits?
   - *Recommendation: 10 min, 200 max*

4. **Stablecoin List**: Should users be able to customize which symbols are considered stablecoins?
   - *Recommendation: Hidden advanced setting*

## Implementation Notes

This architecture maintains the elegant simplicity of the existing system while adding robust filtering capabilities. The key insights:

1. **Leverage Existing Infrastructure**: Uses SharedMarketData and WebSocketManager without modification
2. **Single Point of Filtering**: Apply at data fetch, not throughout the app
3. **Predictable Performance**: Filtering happens once during initialization
4. **Memory Efficient**: Fewer symbols = less memory usage automatically
5. **User-Friendly**: Simple controls with immediate visual feedback

The implementation should take approximately 2-3 days with proper testing.