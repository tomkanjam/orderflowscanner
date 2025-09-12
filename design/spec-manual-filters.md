# Manual Filter UI Design Specification

## Design Objectives

### Primary Goals
1. **Improve Data Control** - Allow users to customize which trading pairs they monitor
2. **Enhance Performance** - Reduce data load by filtering unwanted pairs
3. **Increase Clarity** - Show filter status clearly without cluttering the interface
4. **Maintain Consistency** - Integrate seamlessly with Neon Terminal design system

### User Experience Goals
- Instant visual feedback when filters change
- Clear indication of active filters
- Easy reset to defaults
- Persistent filter preferences

## Visual Hierarchy Recommendations

### Component Placement
```
┌─────────────────────────────┐
│  [vyx logo] StatusBar       │ <- Existing
├─────────────────────────────┤
│  FilterPanel (New)          │ <- New Component
│  ┌─────────────────────┐    │
│  │ Market Filters      │    │
│  │ ├─ Volume Filter    │    │
│  │ └─ Stablecoin Toggle│    │
│  └─────────────────────┘    │
├─────────────────────────────┤
│  TraderList                 │ <- Existing
│  ...                        │
└─────────────────────────────┘
```

### Design Decisions
1. **Position**: Place FilterPanel between StatusBar and TraderList for logical flow
2. **Collapsible**: Allow collapse to save vertical space
3. **Always Visible Summary**: Show active filter count even when collapsed

## Component Specifications

### FilterPanel Component

#### Container Styling
```css
.filter-panel {
  background: var(--nt-bg-secondary);
  border-bottom: 1px solid var(--nt-border-default);
  padding: var(--nt-space-3);
  transition: var(--nt-transition-base);
}

.filter-panel.collapsed {
  padding: var(--nt-space-2);
}
```

#### Header Section
```tsx
<div className="filter-header">
  <button className="filter-toggle">
    <ChevronDown className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
    <span>Market Filters</span>
    {activeFilterCount > 0 && (
      <Badge className="filter-count">{activeFilterCount} active</Badge>
    )}
  </button>
  
  <div className="filter-summary">
    <span className="symbol-count">{filteredCount}/{totalCount} pairs</span>
  </div>
</div>
```

#### Volume Filter Control
```tsx
<div className="filter-control volume-filter">
  <label className="filter-label">
    <DollarSign className="filter-icon" />
    <span>Min Volume (USDT)</span>
    <Tooltip content="24h trading volume in USDT" />
  </label>
  
  <div className="filter-input-group">
    <input
      type="number"
      className="volume-input"
      value={minVolume}
      onChange={handleVolumeChange}
      placeholder="100000"
      step="10000"
    />
    <select className="volume-preset">
      <option value="0">All</option>
      <option value="100000">$100K+</option>
      <option value="1000000">$1M+</option>
      <option value="10000000">$10M+</option>
    </select>
  </div>
</div>
```

#### Stablecoin Toggle
```tsx
<div className="filter-control stablecoin-filter">
  <label className="filter-toggle-label">
    <Shield className="filter-icon" />
    <span>Include Stablecoins</span>
    <Tooltip content="Show/hide USDC, BUSD, DAI, etc." />
  </label>
  
  <Toggle
    checked={includeStablecoins}
    onChange={handleStablecoinToggle}
    className="stablecoin-toggle"
  />
</div>
```

### StatusBar Enhancement

Replace the static "100" display with dynamic filtered count:

```tsx
// Before
<Database className="w-3.5 h-3.5" />
<span>{symbolCount}</span>

// After
<Database className="w-3.5 h-3.5" />
<span className="symbol-status">
  {filteredSymbolCount}
  {hasActiveFilters && (
    <span className="filter-indicator">/{totalSymbolCount}</span>
  )}
</span>
```

## Interaction Patterns

### Filter Application
1. **Volume Input**
   - Debounce input by 300ms
   - Format number with thousand separators while typing
   - Allow keyboard input and preset selection
   - Show immediate count preview

2. **Stablecoin Toggle**
   - Instant application
   - Smooth transition animation
   - Update count immediately

3. **Collapse/Expand**
   - Smooth height animation
   - Persist state in localStorage
   - Keyboard shortcut: Cmd/Ctrl + F

### Visual Feedback

#### Active Filter Indicators
```css
.filter-control.active {
  border-left: 2px solid var(--nt-accent-lime);
  background: var(--nt-accent-lime-light);
}

.filter-count {
  background: var(--nt-accent-lime);
  color: var(--nt-bg-primary);
  padding: 2px 8px;
  border-radius: var(--nt-radius-sm);
  font-size: var(--nt-text-xs);
  font-weight: 600;
}
```

#### Loading States
```css
.filter-panel.loading {
  opacity: 0.7;
  pointer-events: none;
}

.loading-indicator {
  animation: pulse 1.5s ease-in-out infinite;
}
```

## Implementation Notes for Developers

### State Management
```typescript
interface FilterState {
  minVolume: number;
  includeStablecoins: boolean;
  isExpanded: boolean;
}

// Store in App.tsx or create FilterContext
const [filters, setFilters] = useState<FilterState>({
  minVolume: 100000,
  includeStablecoins: false,
  isExpanded: true
});
```

### Filter Logic
```typescript
// Apply filters before fetching
const applyFilters = (tickers: Ticker[]): Ticker[] => {
  return tickers.filter(ticker => {
    // Volume filter
    if (parseFloat(ticker.q) < filters.minVolume) return false;
    
    // Stablecoin filter
    if (!filters.includeStablecoins) {
      const stablecoins = ['USDC', 'BUSD', 'DAI', 'TUSD', 'USDP'];
      if (stablecoins.some(stable => ticker.s.includes(stable))) {
        return false;
      }
    }
    
    return true;
  });
};
```

### Performance Considerations
1. **Memoize filtered results** to prevent unnecessary recalculations
2. **Batch WebSocket subscription updates** when filters change
3. **Use React.memo** for FilterPanel to prevent unnecessary re-renders
4. **Virtualize** if filtered list exceeds 200 items

### Accessibility Requirements
- All controls keyboard navigable
- ARIA labels for screen readers
- Focus trap when filter panel is expanded
- Announce filter changes to screen readers
- Minimum touch target size: 44x44px

## Style Guide Adherence

### Colors
- **Primary Action**: `var(--nt-accent-lime)` - Apply button, active states
- **Secondary**: `var(--nt-accent-cyan)` - Hover states
- **Text**: `var(--nt-text-primary)` for labels, `var(--nt-text-secondary)` for hints
- **Backgrounds**: `var(--nt-bg-secondary)` for panel, `var(--nt-bg-tertiary)` for inputs

### Typography
- **Labels**: `var(--nt-font-sans)`, `var(--nt-text-sm)`, font-weight: 500
- **Values**: `var(--nt-font-mono)`, `var(--nt-text-base)`
- **Counts**: `var(--nt-font-mono)`, `var(--nt-text-xs)`, font-weight: 600

### Spacing
- **Panel Padding**: `var(--nt-space-3)` (12px)
- **Control Gap**: `var(--nt-space-2)` (8px)
- **Label-Input Gap**: `var(--nt-space-1)` (4px)

### Animation
- **Transitions**: `var(--nt-transition-base)` (200ms cubic-bezier)
- **Collapse**: Height transition with easing
- **Toggle**: Smooth slide animation

## Responsive Design

### Mobile (< 768px)
- FilterPanel collapsed by default
- Full-width input controls
- Larger touch targets (min 48px)
- Sticky position for easy access

### Tablet (768px - 1024px)
- FilterPanel expanded by default
- Side-by-side layout for controls
- Standard touch targets

### Desktop (> 1024px)
- All features visible
- Hover states enabled
- Keyboard shortcuts active
- Tooltips on hover

## Future Enhancements

### Phase 2 Considerations
1. **Additional Filters**
   - Price range filter
   - Market cap filter
   - Sector/category filter
   - Custom blacklist/whitelist

2. **Filter Presets**
   - "High Volume" preset
   - "Low Cap Gems" preset
   - Custom saved presets

3. **Advanced Logic**
   - AND/OR filter combinations
   - Filter groups
   - Conditional filters

4. **Analytics**
   - Track filter usage
   - Popular filter combinations
   - Performance impact metrics