# Signal/Trader Card Standardization - Architecture Document

## Executive Summary

This architecture standardizes the signal/trader card display system by **enhancing the existing SignalCard component** rather than rebuilding from scratch. The approach minimizes risk by keeping working patterns, focusing on adding expand/collapse functionality and improving information hierarchy while maintaining backward compatibility.

## System Design

### Data Models

```typescript
// types.ts - No structural changes, just clarity additions
export type Signal = Trader; // Type alias for clarity

// Extend existing Trader interface with display hints (backward compatible)
export interface Trader {
  // ... existing fields remain unchanged ...
  
  // Optional display hints (new)
  displayConfig?: {
    variant?: 'compact' | 'standard' | 'detailed';
    priority?: 'high' | 'normal' | 'low';
    lastActivity?: number; // timestamp for activity indicators
  };
}

// Card expansion state (new)
export interface CardExpansionState {
  expandedIds: Set<string>;
  animatingIds: Set<string>; // For smooth transitions
}
```

### Component Architecture

#### Enhanced SignalCard Component
```typescript
// components/SignalCard.tsx - Extend existing component
export interface SignalCardProps {
  signal: Trader;
  isSelected: boolean;
  isFavorite: boolean;
  canView: boolean;
  // ... existing props ...
  
  // New optional props
  expanded?: boolean;
  onToggleExpand?: () => void;
  variant?: 'compact' | 'standard' | 'detailed';
  showActivity?: boolean;
}
```

#### New Supporting Components
```typescript
// components/cards/CardExpandable.tsx
export const CardExpandable: React.FC<{
  expanded: boolean;
  children: React.ReactNode;
}> = ({ expanded, children }) => {
  return (
    <div className={`transition-all duration-200 ${expanded ? 'max-h-96' : 'max-h-0 overflow-hidden'}`}>
      {children}
    </div>
  );
};

// components/cards/ActivityIndicator.tsx
export const ActivityIndicator: React.FC<{
  lastActivity?: number;
  triggered?: boolean;
}> = ({ lastActivity, triggered }) => {
  const isRecent = lastActivity && Date.now() - lastActivity < 60000; // 1 minute
  
  return (
    <div className={`
      w-2 h-2 rounded-full
      ${triggered ? 'bg-lime-500 animate-pulse' : ''}
      ${isRecent ? 'bg-yellow-500' : 'bg-gray-500'}
    `} />
  );
};
```

#### Component Hierarchy
```
App.tsx
  └── Sidebar.tsx
      └── TraderList.tsx
          └── SignalCard.tsx (enhanced)
              ├── ActivityIndicator.tsx (new)
              ├── CardExpandable.tsx (new)
              └── Existing card content
```

### Service Layer

#### Expansion State Hook
```typescript
// hooks/useCardExpansion.ts
export const useCardExpansion = () => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  const isExpanded = useCallback((id: string) => {
    return expandedIds.has(id);
  }, [expandedIds]);
  
  return { toggleExpand, isExpanded, expandedIds };
};
```

#### Activity Tracking Service
```typescript
// services/activityTracker.ts
class ActivityTracker {
  private activities = new Map<string, number>();
  
  recordActivity(signalId: string) {
    this.activities.set(signalId, Date.now());
  }
  
  getLastActivity(signalId: string): number | undefined {
    return this.activities.get(signalId);
  }
  
  isActive(signalId: string, windowMs = 60000): boolean {
    const last = this.activities.get(signalId);
    return last ? Date.now() - last < windowMs : false;
  }
}

export const activityTracker = new ActivityTracker();
```

### Data Flow

1. **Trigger Detection**: WebSocket → App.tsx → activityTracker.recordActivity()
2. **State Update**: TraderManager → subscription notification → TraderList re-render
3. **Expansion Toggle**: User click → useCardExpansion hook → SignalCard expanded prop
4. **Activity Display**: activityTracker → ActivityIndicator component → visual feedback
5. **Tier Adaptation**: User subscription → conditional rendering in SignalCard

### Integration Points

- **TraderManager**: Subscribe to trader updates (existing pattern)
- **WebSocket**: Hook into onTickerUpdate for activity tracking
- **Supabase**: No changes needed, existing persistence works
- **Authentication**: Leverage existing tier checks

## Technical Specifications

### Performance Optimizations

```typescript
// Optimize card rendering with better memo comparison
const SignalCardMemo = React.memo(SignalCard, (prev, next) => {
  // Only re-render if these specific props change
  return (
    prev.signal.id === next.signal.id &&
    prev.signal.updatedAt === next.signal.updatedAt &&
    prev.isSelected === next.isSelected &&
    prev.expanded === next.expanded &&
    prev.isFavorite === next.isFavorite
  );
});

// Virtual scrolling for large lists (>50 cards)
import { FixedSizeList } from 'react-window';

const VirtualCardList = ({ signals, height = 600 }) => (
  <FixedSizeList
    height={height}
    itemCount={signals.length}
    itemSize={88} // Card height when collapsed
    width="100%"
  >
    {({ index, style }) => (
      <div style={style}>
        <SignalCardMemo signal={signals[index]} />
      </div>
    )}
  </FixedSizeList>
);
```

### CSS Enhancements

```css
/* Add to existing styles */
.signal-card {
  transition: all 200ms ease-out;
}

.signal-card[data-expanded="true"] {
  height: auto;
  min-height: 280px;
}

.signal-card[data-activity="recent"] {
  border-left: 3px solid var(--nt-color-warning);
}

.signal-card[data-activity="triggered"] {
  animation: triggerPulse 3s ease-out;
}

@keyframes triggerPulse {
  0% {
    border-color: var(--nt-color-primary);
    background: rgba(198, 255, 0, 0.1);
  }
  100% {
    border-color: var(--nt-color-border);
    background: transparent;
  }
}
```

## Implementation Guidelines

### Phase 1: Core Enhancements (Week 1)
1. Add expansion state hook to TraderList
2. Enhance SignalCard with expand/collapse
3. Create ActivityIndicator component
4. Integrate activity tracking

### Phase 2: Visual Polish (Week 2)
1. Add animation styles
2. Implement tier-specific expanded content
3. Add trigger pulse animations
4. Mobile responsive adjustments

### Phase 3: Performance (Week 3)
1. Implement virtual scrolling for >50 cards
2. Optimize memo comparisons
3. Add performance monitoring
4. Load testing and optimization

### Code Organization
```
src/
  components/
    SignalCard.tsx          # Enhanced existing component
    cards/
      ActivityIndicator.tsx # New
      CardExpandable.tsx    # New
  hooks/
    useCardExpansion.ts     # New
  services/
    activityTracker.ts      # New
```

## Migration Strategy

### Backward Compatibility
- All new props are optional
- Existing SignalCard usage continues to work
- Feature flag for new functionality: `ENABLE_CARD_EXPANSION`

### Rollout Plan
```typescript
// Feature flag implementation
const FEATURES = {
  ENABLE_CARD_EXPANSION: process.env.REACT_APP_ENABLE_EXPANSION === 'true'
};

// In SignalCard
const showExpandButton = FEATURES.ENABLE_CARD_EXPANSION && onToggleExpand;
```

### Rollback Procedure
1. Set `ENABLE_CARD_EXPANSION=false`
2. Deploy immediately (no code changes needed)
3. New features hidden, old behavior restored

## Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Performance degradation | Low | Medium | Virtual scrolling, monitoring |
| Breaking existing cards | Very Low | High | Optional props, feature flag |
| Animation jank | Medium | Low | CSS-only animations, will-change |
| Memory leaks | Low | Medium | Proper cleanup in hooks |

## Monitoring & Observability

```typescript
// Add performance tracking
const trackCardPerformance = () => {
  performance.mark('card-render-start');
  // ... render logic ...
  performance.mark('card-render-end');
  performance.measure('card-render', 'card-render-start', 'card-render-end');
  
  const measure = performance.getEntriesByName('card-render')[0];
  if (measure.duration > 50) {
    console.warn(`Slow card render: ${measure.duration}ms`);
  }
};
```

## Success Criteria

- [ ] Existing cards continue to work without changes
- [ ] Expand/collapse completes in <200ms
- [ ] 60fps scrolling with 100+ cards
- [ ] No increase in memory usage
- [ ] Activity indicators update within 1 second
- [ ] Feature flag toggle works instantly
- [ ] All existing tests pass
- [ ] Mobile responsive at all breakpoints

## Questions/Decisions Needed

1. **Virtual scrolling threshold**: Implement at 50 or 100 cards?
   - Recommendation: 50 for mobile, 100 for desktop
   
2. **Expanded state persistence**: Save in localStorage?
   - Recommendation: No, start fresh each session
   
3. **Activity window**: How long to show "recent" activity?
   - Recommendation: 1 minute for triggered, 5 minutes for recent

## Next Steps

1. Implement Phase 1 with feature flag disabled
2. Test with small group (10% of Pro users)
3. Monitor performance metrics
4. Gradual rollout if metrics are good
5. Full release after 1 week of stable operation

---

**Architecture Approved By**: Engineering Lead  
**Date**: 2025-09-08  
**Confidence Level**: High - Minimal changes to working code  
**Estimated Effort**: 80 hours (2 weeks) vs 136 hours (original estimate)