# Manual Market Filters - Implementation Plan

## Overview
Implementing user-configurable market filters for controlling which trading pairs are monitored based on volume thresholds and stablecoin inclusion/exclusion. Reference: [Architecture Doc](./../architecture/manual-filters-2025-01-12.md)

## Prerequisites
- [x] Architecture document reviewed and approved
- [x] Development environment running (`pnpm dev`)
- [x] Understand SharedMarketData and WebSocket patterns
- [ ] Create feature branch: `git checkout -b feat/manual-market-filters`

## Implementation Phases

### Phase 1: Foundation (2 hours)
**Objective:** Set up types, interfaces, and utility functions

#### Chunk 1.1: Type Definitions and Constants (30 min)
```
Files to create/modify:
- apps/app/types.ts (modify)
- apps/app/src/utils/filterConstants.ts (create)

Actions:
1. Add MarketFilterConfig and FilterStats interfaces to types.ts
2. Extend Ticker type with TickerWithMetadata
3. Create filterConstants.ts with STABLECOIN_SYMBOLS and defaults
4. Export all new types

Test criteria:
- [ ] TypeScript compiles without errors: pnpm build
- [ ] No import errors in existing files
- [ ] Constants are properly typed

Checkpoint: Can import and use new types in a test file
```

```typescript
// apps/app/types.ts additions
export interface MarketFilterConfig {
  minVolume: number;
  includeStablecoins: boolean;
  maxSymbols: number;
  isExpanded: boolean;
}

export interface FilterStats {
  totalAvailable: number;
  filtered: number;
  excluded: number;
  lastUpdated: number;
}

export interface TickerWithMetadata extends Ticker {
  isStablecoin?: boolean;
  volumeUSDT: number;
  _lastUpdate?: number;
}
```

#### Chunk 1.2: Filter Utilities (45 min)
```
Files to create:
- apps/app/src/utils/filterHelpers.ts (create)
- apps/app/src/hooks/useDebounce.ts (create)

Actions:
1. Create filterHelpers.ts with:
   - applyMarketFilters() function
   - meetsFilterCriteria() function
   - detectStablecoin() function
2. Create useDebounce hook for input handling
3. Add unit tests for filter functions

Test criteria:
- [ ] Filter functions correctly identify stablecoins
- [ ] Volume filtering works with edge cases (0, negative, string)
- [ ] Debounce hook delays execution correctly

Checkpoint: Filter utilities work independently with mock data
```

```typescript
// apps/app/src/utils/filterHelpers.ts
import { STABLECOIN_SYMBOLS } from './filterConstants';

export function detectStablecoin(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.some(stable => 
    symbol.startsWith(stable) && symbol.endsWith('USDT')
  );
}

export function meetsFilterCriteria(
  ticker: TickerWithMetadata,
  config: MarketFilterConfig
): boolean {
  // Volume check
  if (ticker.volumeUSDT < config.minVolume) return false;
  
  // Stablecoin check
  if (!config.includeStablecoins && ticker.isStablecoin) return false;
  
  return true;
}
```

#### Chunk 1.3: Service Layer Enhancement (45 min)
```
Files to modify:
- apps/app/services/binanceService.ts

Actions:
1. Add filterConfig parameter to fetchTopPairsAndInitialKlines
2. Implement applyMarketFilters function
3. Return FilterStats from fetch function
4. Add enrichTickerMetadata helper
5. Update return type signatures

Test criteria:
- [ ] Existing calls still work (backward compatible)
- [ ] Filters apply correctly when provided
- [ ] Stats accurately reflect filtering results

Checkpoint: Can call service with filters and get filtered results
```

**Phase 1 Complete When:**
- All types compile correctly
- Filter utilities have 100% test coverage
- Service layer accepts filter config
- No regression in existing functionality

### Phase 2: FilterPanel Component (2.5 hours)
**Objective:** Build the UI component for filter controls

#### Chunk 2.1: FilterPanel Base Component (45 min)
```
Files to create:
- apps/app/components/FilterPanel/FilterPanel.tsx
- apps/app/components/FilterPanel/index.ts

Actions:
1. Create FilterPanel component with props interface
2. Implement collapsible header with ChevronDown icon
3. Add filter stats display (X/Y pairs)
4. Setup expand/collapse state management
5. Apply Neon Terminal styling

Test criteria:
- [ ] Component renders without errors
- [ ] Collapse/expand animation works smoothly
- [ ] Stats display correctly with mock data

Checkpoint: FilterPanel displays and collapses properly
```

```tsx
// apps/app/components/FilterPanel/FilterPanel.tsx
import React, { useState } from 'react';
import { ChevronDown, Filter, Database } from 'lucide-react';
import { MarketFilterConfig, FilterStats } from '../../types';

interface FilterPanelProps {
  config: MarketFilterConfig;
  stats: FilterStats;
  onConfigChange: (config: MarketFilterConfig) => void;
  isLoading: boolean;
}

export const FilterPanel: React.FC<FilterPanelProps> = ({
  config,
  stats,
  onConfigChange,
  isLoading
}) => {
  const [isExpanded, setIsExpanded] = useState(config.isExpanded);
  
  return (
    <div className="filter-panel bg-[var(--nt-bg-secondary)] border-b border-[var(--nt-border-default)] p-3">
      {/* Header */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <ChevronDown className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          <Filter className="w-4 h-4" />
          <span>Market Filters</span>
        </div>
        <div className="flex items-center gap-2 text-[var(--nt-text-secondary)]">
          <Database className="w-3.5 h-3.5" />
          <span className="font-mono text-xs">{stats.filtered}/{stats.totalAvailable}</span>
        </div>
      </button>
      
      {/* Controls - shown when expanded */}
      {isExpanded && (
        <div className="mt-4 space-y-3">
          {/* Volume filter and stablecoin toggle go here */}
        </div>
      )}
    </div>
  );
};
```

#### Chunk 2.2: Volume Filter Control (45 min)
```
Files to create:
- apps/app/components/FilterPanel/VolumeFilter.tsx

Actions:
1. Create VolumeFilter component with number input
2. Add preset dropdown (100k, 1M, 10M)
3. Implement debounced onChange handler
4. Format numbers with commas while typing
5. Add $ prefix and USDT suffix styling

Test criteria:
- [ ] Input accepts only valid numbers
- [ ] Presets update input value correctly
- [ ] Debounce delays API calls by 300ms
- [ ] Formatting doesn't break cursor position

Checkpoint: Volume filter works with proper debouncing
```

#### Chunk 2.3: Stablecoin Toggle (30 min)
```
Files to create:
- apps/app/components/FilterPanel/StablecoinToggle.tsx

Actions:
1. Create toggle component with switch control
2. Add icon and label with tooltip
3. Implement immediate onChange (no debounce)
4. Style active/inactive states
5. Add list of affected stablecoins in tooltip

Test criteria:
- [ ] Toggle switches smoothly
- [ ] onChange fires immediately
- [ ] Visual feedback clear for on/off states

Checkpoint: Complete FilterPanel with all controls working
```

#### Chunk 2.4: FilterPanel Integration & Styling (30 min)
```
Files to modify:
- apps/app/components/FilterPanel/FilterPanel.tsx

Actions:
1. Import and integrate VolumeFilter and StablecoinToggle
2. Add loading overlay when isLoading=true
3. Show active filter count badges
4. Add reset filters button
5. Ensure responsive layout for mobile

Test criteria:
- [ ] All controls integrate properly
- [ ] Loading state prevents interaction
- [ ] Mobile layout doesn't break
- [ ] Reset returns to defaults

Checkpoint: Complete, styled FilterPanel ready for integration
```

**Phase 2 Complete When:**
- FilterPanel renders all controls
- Interactions work smoothly
- Styling matches Neon Terminal theme
- Component is fully self-contained

### Phase 3: Data Layer Integration (2 hours)
**Objective:** Connect filters to data fetching and WebSocket

#### Chunk 3.1: App State Management (45 min)
```
Files to modify:
- apps/app/App.tsx

Actions:
1. Add marketFilters state with localStorage init
2. Add filterStats state
3. Add isReinitializing loading state
4. Create handleFilterChange callback
5. Add localStorage persistence effect

Test criteria:
- [ ] State initializes from localStorage
- [ ] Changes persist to localStorage
- [ ] Default values work when localStorage empty

Checkpoint: Filter state management working in App
```

```typescript
// apps/app/App.tsx additions
const defaultMarketFilters: MarketFilterConfig = {
  minVolume: 100000,
  includeStablecoins: false,
  maxSymbols: 100,
  isExpanded: true
};

const [marketFilters, setMarketFilters] = useState<MarketFilterConfig>(() => {
  const saved = localStorage.getItem('marketFilters');
  if (saved) {
    try {
      return { ...defaultMarketFilters, ...JSON.parse(saved) };
    } catch {
      return defaultMarketFilters;
    }
  }
  return defaultMarketFilters;
});

const [filterStats, setFilterStats] = useState<FilterStats>({
  totalAvailable: 0,
  filtered: 0,
  excluded: 0,
  lastUpdated: Date.now()
});
```

#### Chunk 3.2: Filter Application in Data Fetch (45 min)
```
Files to modify:
- apps/app/App.tsx (initializeData function)
- apps/app/services/binanceService.ts

Actions:
1. Pass marketFilters to fetchTopPairsAndInitialKlines
2. Update initializeData to use filter config
3. Set filterStats from service response
4. Ensure backward compatibility
5. Handle filter errors gracefully

Test criteria:
- [ ] Filters apply during initial load
- [ ] Stats update correctly
- [ ] No errors when filters undefined
- [ ] Existing code paths still work

Checkpoint: App loads with filtered data on startup
```

#### Chunk 3.3: WebSocket Reconnection Handler (30 min)
```
Files to modify:
- apps/app/App.tsx

Actions:
1. Create reinitializeWithFilters function
2. Disconnect existing WebSocket on filter change
3. Clear SharedMarketData
4. Refetch with new filters
5. Reconnect WebSocket with filtered symbols

Test criteria:
- [ ] WebSocket disconnects cleanly
- [ ] New connection uses filtered symbols
- [ ] No memory leaks during reconnection
- [ ] Loading state shows during transition

Checkpoint: Changing filters triggers data reload
```

```typescript
const reinitializeWithFilters = useCallback(async (
  newFilters: MarketFilterConfig
) => {
  try {
    setIsReinitializing(true);
    
    // Disconnect WebSocket
    webSocketManager.disconnect('main-connection');
    
    // Clear data
    sharedMarketData.clear();
    setTickers(new Map());
    setAllSymbols([]);
    
    // Refetch with filters
    const { symbols, tickers, klinesData, filterStats } = 
      await fetchTopPairsAndInitialKlines(
        klineInterval,
        klineHistoryConfig.screenerLimit,
        newFilters
      );
    
    // Reinitialize
    sharedMarketData.initialize(symbols, klinesData);
    setAllSymbols(symbols);
    setTickers(tickers);
    setFilterStats(filterStats);
    
    // Reconnect
    await connectToWebSocket(symbols);
    
  } catch (error) {
    console.error('Filter reinitialization failed:', error);
  } finally {
    setIsReinitializing(false);
  }
}, [klineInterval, klineHistoryConfig]);
```

**Phase 3 Complete When:**
- Filters affect data on load
- Filter changes trigger reload
- WebSocket updates filtered symbols only
- No memory leaks or orphaned connections

### Phase 4: UI Integration (1.5 hours)
**Objective:** Connect FilterPanel to App and update StatusBar

#### Chunk 4.1: Sidebar Integration (30 min)
```
Files to modify:
- apps/app/components/Sidebar.tsx

Actions:
1. Import FilterPanel component
2. Add props for filter config and handlers
3. Render FilterPanel below StatusBar
4. Pass through all required props
5. Handle loading states

Test criteria:
- [ ] FilterPanel appears in correct position
- [ ] Props flow correctly from App
- [ ] No layout breaking
- [ ] Loading states propagate

Checkpoint: FilterPanel visible and interactive in sidebar
```

#### Chunk 4.2: StatusBar Dynamic Count (30 min)
```
Files to modify:
- apps/app/src/components/StatusBar.tsx

Actions:
1. Add filteredCount and totalCount props
2. Update symbol count display logic
3. Show "filtered/total" when filters active
4. Add filter indicator icon when active
5. Update prop types

Test criteria:
- [ ] Count shows correctly (45/100 format)
- [ ] Single number when no filters
- [ ] Filter icon appears when active
- [ ] No visual glitches

Checkpoint: StatusBar reflects filter state
```

```tsx
// StatusBar.tsx modification
<div className="flex items-center gap-1 text-[var(--nt-text-secondary)]">
  <Database className="w-3.5 h-3.5" />
  <span className="font-mono">
    {symbolCount}
    {hasActiveFilters && (
      <span className="text-[var(--nt-text-muted)]">/{totalSymbols}</span>
    )}
  </span>
  {hasActiveFilters && (
    <Filter className="w-3 h-3 text-[var(--nt-accent-lime)]" />
  )}
</div>
```

#### Chunk 4.3: Connect Everything (30 min)
```
Files to modify:
- apps/app/App.tsx
- apps/app/components/Sidebar.tsx

Actions:
1. Pass filter props from App to Sidebar
2. Pass handlers for filter changes
3. Connect loading states
4. Ensure data flows correctly
5. Test full integration

Test criteria:
- [ ] Filter changes update data
- [ ] Stats display correctly
- [ ] Loading states work
- [ ] No console errors

Checkpoint: Full feature working end-to-end
```

**Phase 4 Complete When:**
- FilterPanel fully integrated
- StatusBar shows dynamic counts
- Filter changes reload data
- UI updates reflect filter state

### Phase 5: Polish & Edge Cases (1 hour)
**Objective:** Handle edge cases, add polish, and ensure robustness

#### Chunk 5.1: Error Handling & Validation (30 min)
```
Files to modify:
- apps/app/components/FilterPanel/VolumeFilter.tsx
- apps/app/App.tsx

Actions:
1. Add min/max volume validation (0 - 1B)
2. Handle network errors during reload
3. Add retry logic for failed fetches
4. Show error toast on failure
5. Implement fallback to previous state

Test criteria:
- [ ] Invalid inputs prevented
- [ ] Network errors handled gracefully
- [ ] User informed of issues
- [ ] App doesn't crash on errors

Checkpoint: Robust error handling in place
```

#### Chunk 5.2: Performance & Polish (30 min)
```
Files to modify:
- apps/app/components/FilterPanel/FilterPanel.tsx
- apps/app/App.tsx

Actions:
1. Add React.memo to FilterPanel
2. Memoize filter calculations
3. Add smooth transitions
4. Add keyboard shortcuts (Cmd+F to toggle)
5. Optimize re-renders

Test criteria:
- [ ] No unnecessary re-renders
- [ ] Smooth animations
- [ ] Keyboard shortcuts work
- [ ] Performance unchanged

Checkpoint: Feature polished and performant
```

**Phase 5 Complete When:**
- All edge cases handled
- Performance optimized
- Smooth user experience
- No regressions

## Testing Strategy

### Unit Tests
```bash
# After each chunk
pnpm test

# Specific tests
pnpm test filterHelpers
pnpm test FilterPanel
pnpm test useDebounce
```

### Integration Tests
1. Start app with default filters
2. Change volume filter → verify symbol count changes
3. Toggle stablecoins → verify USDC pairs appear/disappear
4. Check localStorage persistence
5. Verify WebSocket reconnection

### Manual Testing Checklist
1. [ ] App loads with default filters (100k volume, no stables)
2. [ ] Volume input accepts valid numbers only
3. [ ] Presets work correctly (100k, 1M, 10M)
4. [ ] Stablecoin toggle adds/removes USDC, BUSD, etc.
5. [ ] Filter stats show accurate counts
6. [ ] StatusBar reflects filtered state
7. [ ] Collapse/expand works smoothly
8. [ ] Settings persist on reload
9. [ ] WebSocket reconnects with new symbols
10. [ ] Loading states show during transitions
11. [ ] Mobile layout responsive
12. [ ] No console errors
13. [ ] Memory usage acceptable

## Rollback Plan
If critical issues arise:
1. `git checkout main` - return to stable branch
2. Clear localStorage: `localStorage.removeItem('marketFilters')`
3. Document specific issue for debugging
4. Revert service changes if needed

## PM Checkpoints
Review points for PM testing:
- [ ] **After Phase 1** - Types and utilities ready (no UI yet)
- [ ] **After Phase 2** - FilterPanel component demo-able
- [ ] **After Phase 3** - Filters affect data (core functionality)
- [ ] **After Phase 4** - Full integration complete
- [ ] **Before Phase 5** - Confirm polish priorities

## Success Metrics
- [ ] TypeScript compilation: 0 errors
- [ ] Filter application time: < 100ms
- [ ] WebSocket reconnection: < 2 seconds
- [ ] Memory usage reduced with fewer symbols
- [ ] All existing features still working
- [ ] Mobile responsive (375px minimum)
- [ ] Keyboard accessible
- [ ] localStorage < 10KB

## Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Type conflicts with existing code | Extend, don't modify base types | ⏳ |
| 2 | Complex UI state management | Keep state in parent component | ⏳ |
| 3 | WebSocket reconnection failures | Add retry with exponential backoff | ⏳ |
| 4 | Performance regression | Benchmark before/after, use memoization | ⏳ |
| 5 | Edge case crashes | Comprehensive error boundaries | ⏳ |

## Time Estimate
- Phase 1: 2 hours
- Phase 2: 2.5 hours
- Phase 3: 2 hours
- Phase 4: 1.5 hours
- Phase 5: 1 hour
- **Total: 9 hours** (1.5 days with testing)

## Next Actions
1. Create feature branch: `git checkout -b feat/manual-market-filters`
2. Start with Phase 1, Chunk 1.1 (type definitions)
3. Run `pnpm build` after each chunk to verify
4. Commit after each successful chunk

## Notes
- Each chunk is independently testable
- No chunk should break existing functionality
- Commits after each chunk allow easy rollback
- PM can test UI after Phase 2, full feature after Phase 4