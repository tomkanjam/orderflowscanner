# Signal/Trader Card Standardization - Implementation Plan

## Overview
Implementing the unified card design system per designer specifications: 88px collapsed height, 280px expanded for signals, 328px for Elite traders. Following the Neon Terminal theme with electric lime accents for activity indicators and proper tier-adaptive content display.

Reference: `.ai-workflow/architecture/signal-trader-card-standardization-20250908-170008.md`

## Prerequisites
- [ ] Feature flag environment variable set up: `REACT_APP_ENABLE_CARD_EXPANSION=false`
- [ ] Install react-window if not present: `pnpm add react-window`
- [ ] Review designer specs at `.ai-workflow/design/signal-trader-card-standardization-design.md`
- [ ] Create feature branch: `git checkout -b feature/card-standardization`

## Implementation Phases

### Phase 1: Foundation & State Management (8 hours)

#### Chunk 1.1: Feature Flag & Activity Tracker (45 min)
```
Files to create/modify:
- src/config/features.ts (new)
- src/services/activityTracker.ts (new)
- src/types.ts (extend Trader interface)

Actions:
1. Create feature flag configuration:
   export const FEATURES = {
     ENABLE_CARD_EXPANSION: process.env.REACT_APP_ENABLE_CARD_EXPANSION === 'true'
   };

2. Create ActivityTracker service:
   - Map to store signal ID → timestamp
   - Methods: recordActivity(), getLastActivity(), isActive()
   - Export singleton instance

3. Extend Trader interface with optional displayConfig:
   displayConfig?: {
     variant?: 'compact' | 'standard' | 'detailed';
     priority?: 'high' | 'normal' | 'low';
     lastActivity?: number;
   };

Test criteria:
- [ ] Feature flag reads from env correctly
- [ ] ActivityTracker records and retrieves timestamps
- [ ] Types compile without errors

Checkpoint: Can toggle feature flag and track activity
```

#### Chunk 1.2: Card Expansion Hook (45 min)
```
Files to create:
- src/hooks/useCardExpansion.ts (new)
- src/hooks/useCardExpansion.test.ts (new)

Actions:
1. Create useCardExpansion hook:
   - State: Set<string> for expanded IDs
   - Methods: toggleExpand(id), isExpanded(id), collapseAll()
   - Return object with methods and state

2. Add animation tracking:
   - Set<string> for animatingIds
   - 200ms timeout for animation completion

3. Write unit tests for hook

Test criteria:
- [ ] Hook toggles expansion correctly
- [ ] Multiple cards can be expanded
- [ ] Animation state tracks properly

Checkpoint: Hook works in isolation with test coverage
```

#### Chunk 1.3: CSS Variables & Base Styles (30 min)
```
Files to modify:
- src/styles/neon-terminal-design-system.css
- src/components/SignalCard.css (new)

Actions:
1. Add card-specific CSS variables:
   --nt-card-height-collapsed: 88px;
   --nt-card-height-expanded-signal: 280px;
   --nt-card-height-expanded-trader: 328px;
   --nt-card-padding: 16px;
   --nt-card-transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);

2. Create base card styles per design:
   .signal-card {
     height: var(--nt-card-height-collapsed);
     background: #1A1A1C;
     border: 1px solid rgba(90, 90, 87, 0.3);
     transition: var(--nt-card-transition);
   }

3. Add activity state classes:
   .signal-card[data-activity="triggered"] - Lime pulse
   .signal-card[data-activity="high"] - Orange left border
   .signal-card[data-activity="idle"] - Opacity 0.7

Test criteria:
- [ ] CSS variables defined correctly
- [ ] Card has 88px collapsed height
- [ ] Hover state shows #1F1F22 background

Checkpoint: Visual styles match designer specs
```

**Phase 1 Complete When:**
- Feature flag system working
- Activity tracking operational
- Expansion state management ready
- Base CSS matches design specs

### Phase 2: Core UI Components (12 hours)

#### Chunk 2.1: Activity Indicator Component (1 hour)
```
Files to create:
- src/components/cards/ActivityIndicator.tsx (new)
- src/components/cards/ActivityIndicator.test.tsx (new)

Actions:
1. Create ActivityIndicator component:
   - Props: lastActivity, triggered, isActive
   - Render status dot with correct color:
     * Triggered (< 1min): Pulsing lime #C6FF00
     * Recent (< 5min): Yellow #FFD700
     * Active position: Green #00FF88
     * Idle: Gray #5A5A57

2. Add CSS animations:
   @keyframes pulseDot {
     0%, 100% { opacity: 1; scale: 1; }
     50% { opacity: 0.6; scale: 1.2; }
   }

3. Write component tests

Test criteria:
- [ ] Dot shows correct color based on state
- [ ] Pulse animation works for triggered state
- [ ] Component is 8x8px as per design

Checkpoint: Activity indicator matches design exactly
```

#### Chunk 2.2: Expandable Container Component (1.5 hours)
```
Files to create:
- src/components/cards/CardExpandable.tsx (new)
- src/components/cards/CardExpandable.css (new)

Actions:
1. Create CardExpandable wrapper:
   - Props: expanded, children, maxHeight
   - Smooth height transition (200ms)
   - Overflow hidden when collapsed

2. Implement height calculation:
   - Signal cards: 280px expanded
   - Trader cards: 328px expanded
   - Use CSS max-height for animation

3. Add expand/collapse icon:
   - ChevronDown from lucide-react
   - Rotate 180° when expanded
   - Position: top-right per design

Test criteria:
- [ ] Smooth 200ms expansion animation
- [ ] Content hidden when collapsed
- [ ] Icon rotates on state change

Checkpoint: Expansion animation works smoothly
```

#### Chunk 2.3: Enhanced SignalCard - Structure (2 hours)
```
Files to modify:
- src/components/SignalCard.tsx
- src/components/SignalCard.types.ts (new)

Actions:
1. Add new optional props per design:
   expanded?: boolean;
   onToggleExpand?: () => void;
   variant?: 'compact' | 'standard' | 'detailed';
   showActivity?: boolean;

2. Restructure layout to match 88px height:
   - Header row: Name, favorite, menu, expand icon
   - Metrics row: Based on tier (signals vs positions)
   - Last activity row: Symbol, time, percentage

3. Implement tier-adaptive rendering:
   - Free/Pro: "Triggered: X today | Y total"
   - Elite: "Win: X% | P&L: Y% | Pos: Z"

Test criteria:
- [ ] Card height exactly 88px when collapsed
- [ ] Typography matches design (Inter 16px title, JetBrains Mono 14px metrics)
- [ ] Tier-specific content displays correctly

Checkpoint: Card structure matches design mockup
```

#### Chunk 2.4: Expanded Content - Signal View (2 hours)
```
Files to modify:
- src/components/SignalCard.tsx
- src/components/cards/TriggerHistory.tsx (new)

Actions:
1. Create TriggerHistory component for expanded view:
   - Show last 5 triggers with symbol, time, price, percentage
   - "View All" link in top-right
   - Use JetBrains Mono for prices

2. Add Top Symbols section:
   - Horizontal list: "BTC (8) ETH (6) SOL (4)"
   - Inter 12px, color #8A8A86

3. Add action buttons row:
   - Chart, Edit, Clone, Delete icons
   - 32px button height, 8px gap between

Test criteria:
- [ ] Expanded height exactly 280px for signals
- [ ] Shows 5 recent triggers
- [ ] Action buttons properly spaced

Checkpoint: Signal expansion matches design exactly
```

#### Chunk 2.5: Expanded Content - Elite Trader View (2 hours)
```
Files to modify:
- src/components/SignalCard.tsx
- src/components/cards/PerformanceChart.tsx (new)
- src/components/cards/PositionsList.tsx (new)

Actions:
1. Create mini P&L chart (60px height):
   - Use Recharts for sparkline
   - Green #00FF88 for profit, Red #FF0040 for loss
   - Show percentage and dollar amount

2. Create PositionsList component:
   - Show symbol, direction, P&L, percentage, SL/TP
   - Color-coded P&L (green/red)
   - Max 3 positions visible

3. Add AI confidence badge:
   - Cyan background #00F0FF
   - Black text #0A0A0B
   - Show percentage

Test criteria:
- [ ] Expanded height exactly 328px for Elite
- [ ] Chart renders at 60px height
- [ ] Positions show real-time P&L

Checkpoint: Elite expansion matches design specs
```

**Phase 2 Complete When:**
- All components created and styled
- Heights match exactly (88px/280px/328px)
- Typography follows design system
- Tier-adaptive content working

### Phase 3: Animations & Interactions (8 hours)

#### Chunk 3.1: Activity Animations (1.5 hours)
```
Files to modify:
- src/components/SignalCard.css
- src/components/SignalCard.tsx

Actions:
1. Implement trigger pulse animation:
   @keyframes triggerPulse {
     0% { 
       border-color: #C6FF00; 
       background: rgba(198, 255, 0, 0.1); 
     }
     100% { 
       border-color: rgba(90, 90, 87, 0.3); 
       background: transparent; 
     }
   }
   animation: triggerPulse 3s ease-out;

2. Add performance state borders:
   - Profitable: 3px solid #00FF88 left border
   - Losing: 3px solid #FF0040 with attention pulse
   - High activity: 3px solid #FF8C00

3. Hook up to WebSocket updates:
   - Listen for ticker updates
   - Record activity when signal triggers
   - Apply animation class for 3 seconds

Test criteria:
- [ ] Lime pulse on new triggers
- [ ] 3-second animation duration
- [ ] Correct border colors for states

Checkpoint: Activity animations working
```

#### Chunk 3.2: Hover & Interaction States (1 hour)
```
Files to modify:
- src/components/SignalCard.css
- src/components/SignalCard.tsx

Actions:
1. Implement hover effects:
   .signal-card:hover {
     background: #1F1F22;
     border-color: rgba(90, 90, 87, 0.5);
     transform: scale(1.01);
     transition: all 150ms ease-out;
   }

2. Add active/selected state:
   - 2px #C6FF00 border
   - Subtle box-shadow glow

3. Implement loading skeleton:
   - Shimmer animation
   - Gray placeholder bars

Test criteria:
- [ ] Hover shows elevated background
- [ ] Scale transform is exactly 1.01
- [ ] Transitions are 150ms

Checkpoint: All interaction states working
```

#### Chunk 3.3: Mobile Responsive Behavior (1.5 hours)
```
Files to modify:
- src/components/SignalCard.css
- src/components/TraderList.tsx

Actions:
1. Add responsive breakpoints:
   @media (max-width: 768px) {
     .signal-card { 
       width: 100%;
       font-size: 14px;
     }
     .signal-card__metrics {
       font-size: 12px;
     }
   }

2. Implement touch interactions:
   - Remove hover effects on touch devices
   - Add tap-to-expand behavior
   - Swipe gestures for actions (optional)

3. Adjust information density:
   - Abbreviate labels on mobile
   - Hide secondary metrics
   - Reduce padding to 12px

Test criteria:
- [ ] Cards full width on mobile
- [ ] Font sizes reduced appropriately
- [ ] Touch interactions work

Checkpoint: Mobile experience optimized
```

**Phase 3 Complete When:**
- All animations match design specs
- 200ms expand/collapse transition
- 3s trigger pulse animation
- Mobile responsive at all breakpoints

### Phase 4: Performance & Integration (8 hours)

#### Chunk 4.1: Virtual Scrolling Implementation (2 hours)
```
Files to create/modify:
- src/components/cards/VirtualCardList.tsx (new)
- src/components/TraderList.tsx

Actions:
1. Create VirtualCardList with react-window:
   - FixedSizeList for cards
   - 88px item height (collapsed)
   - Dynamic height for expanded cards

2. Implement visibility tracking:
   - IntersectionObserver for expanded cards
   - Lazy load expanded content

3. Add scroll position persistence:
   - Save scroll position on unmount
   - Restore on remount

Test criteria:
- [ ] Smooth 60fps scrolling with 100+ cards
- [ ] No jank during expansion
- [ ] Memory usage < 5MB for 100 cards

Checkpoint: Virtual scrolling working efficiently
```

#### Chunk 4.2: Performance Optimizations (2 hours)
```
Files to modify:
- src/components/SignalCard.tsx
- src/hooks/useCardExpansion.ts

Actions:
1. Optimize React.memo comparison:
   const areEqual = (prev, next) => {
     return prev.signal.id === next.signal.id &&
            prev.signal.updatedAt === next.signal.updatedAt &&
            prev.expanded === next.expanded;
   };

2. Implement update batching:
   - Queue WebSocket updates
   - Apply in requestAnimationFrame
   - Maximum 60 updates/second

3. Add performance monitoring:
   - Measure render time
   - Log slow renders > 50ms
   - Track memory usage in dev

Test criteria:
- [ ] Card render < 50ms
- [ ] No unnecessary re-renders
- [ ] Updates batched properly

Checkpoint: Performance targets met
```

#### Chunk 4.3: Integration with Existing System (2 hours)
```
Files to modify:
- src/components/TraderList.tsx
- src/components/Sidebar.tsx
- src/App.tsx

Actions:
1. Update TraderList to use new props:
   - Pass expanded state from hook
   - Add onToggleExpand handler
   - Connect activity tracker

2. Wire up WebSocket updates:
   - Listen for ticker updates in App.tsx
   - Record activity on signal trigger
   - Pass activity data to cards

3. Ensure backward compatibility:
   - All new props optional
   - Feature flag controls new behavior
   - Existing functionality preserved

Test criteria:
- [ ] Existing cards still work
- [ ] Feature flag toggles properly
- [ ] WebSocket updates flow correctly

Checkpoint: Fully integrated with system
```

**Phase 4 Complete When:**
- Virtual scrolling implemented
- Performance targets met (<50ms render)
- Fully integrated with existing code
- Feature flag working

## Testing Strategy

### Unit Tests
```bash
# After each component chunk
pnpm test src/components/cards/ActivityIndicator.test.tsx
pnpm test src/hooks/useCardExpansion.test.ts

# Full test suite
pnpm test
```

### Integration Tests
1. Enable feature flag: `REACT_APP_ENABLE_CARD_EXPANSION=true`
2. Load page with 100+ signals
3. Verify smooth scrolling at 60fps
4. Test expand/collapse animations
5. Verify tier-specific content
6. Check mobile responsive behavior

### Manual Testing Checklist
- [ ] Cards are exactly 88px height when collapsed
- [ ] Signal cards expand to 280px
- [ ] Elite trader cards expand to 328px
- [ ] Lime pulse animation on triggers (3s)
- [ ] Typography matches design (Inter/JetBrains Mono)
- [ ] Colors match Neon Terminal theme
- [ ] Mobile responsive at 768px breakpoint
- [ ] Virtual scrolling kicks in at 50+ cards
- [ ] Feature flag toggles functionality

## Rollback Plan
If issues arise:
1. Set `REACT_APP_ENABLE_CARD_EXPANSION=false` in environment
2. Deploy immediately (no code changes needed)
3. Revert to previous Git commit if necessary: `git revert HEAD`
4. Clear browser cache if CSS issues persist
5. Notify PM of specific blockers encountered

## PM Checkpoints
Points where PM should review:
- [ ] After Phase 1 - Foundation ready, feature flag working
- [ ] After Phase 2 - Core UI matches design specs exactly
- [ ] After Phase 3 - All animations and interactions working
- [ ] Before Phase 4 - Confirm performance requirements
- [ ] Final review - Complete feature with all polish

## Success Metrics
How we know it's working:
- [ ] All unit tests passing (100% coverage for new code)
- [ ] Render performance < 50ms per card
- [ ] 60fps scrolling with 100+ cards
- [ ] Memory usage < 5MB for 100 cards
- [ ] Exact height specifications met (88/280/328px)
- [ ] All tier-specific content displaying correctly
- [ ] Mobile responsive without horizontal scroll
- [ ] Feature flag toggles seamlessly

## Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Breaking existing types | TypeScript strict mode catches | ⏳ |
| 2 | Height calculations wrong | Designer review after Phase 2 | ⏳ |
| 3 | Animation performance | Use CSS-only, GPU acceleration | ⏳ |
| 4 | Virtual scrolling complexity | Start simple, enhance later | ⏳ |

## Time Estimate
- Phase 1: 8 hours (Foundation)
- Phase 2: 12 hours (Core UI)
- Phase 3: 8 hours (Animations)
- Phase 4: 8 hours (Performance)
- Testing/Polish: 4 hours
- **Total: 40 hours (1 week)**

Note: This is 50% of the original architecture estimate due to simplified approach

## Next Actions
Immediate steps to begin:
1. Create feature branch: `git checkout -b feature/card-standardization`
2. Set up feature flag: `REACT_APP_ENABLE_CARD_EXPANSION=false`
3. Create `src/config/features.ts` file
4. Begin Phase 1, Chunk 1.1 (Activity Tracker)
5. Run `pnpm build` after each chunk to catch errors early

---

**Plan Created**: 2025-09-08
**Designer Specs**: Strictly adhered to
**Confidence Level**: High - detailed chunks with exact specifications