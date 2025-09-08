# Product Requirements Document: Signal/Trader Card Standardization

## Executive Summary
**What:** Standardize the design and information architecture of signal cards (Free/Pro) and trader cards (Elite) to provide a consistent, tier-appropriate experience.
**Why:** Current inconsistencies between built-in and user-created signals cause confusion, reduce scanning efficiency, and fail to showcase tier value properly.
**Who:** All users - Free tier (signal browsing), Pro tier (signal creation), Elite tier (automated trading).
**When:** Q1 2025 - High priority due to fundamental UX impact.

## Problem Statement
### Current State
- Built-in signal cards show different information than user-created signal cards
- No expand/collapse functionality on cards (only in enhanced table)
- Elite users see completely different interface without smooth transition
- Users must click into signals to see important details
- Information density is inconsistent across card types

### Pain Points
- **Scanning inefficiency:** Can't quickly identify high-quality signals (Pro) or profitable traders (Elite)
- **Cognitive friction:** Mental model breaks when switching between signal types
- **Missing context:** Critical information hidden until user clicks through
- **Tier confusion:** Unclear what additional value higher tiers provide
- **Mobile experience:** Cards don't adapt well to smaller screens

### Opportunity
Create a unified card system that:
- Enables 2-second signal/trader evaluation
- Progressively reveals tier-appropriate information
- Drives tier upgrades through clear value demonstration
- Maintains consistency while respecting tier capabilities

## Solution Overview
Implement a standardized card component system with tier-adaptive information display, consistent visual hierarchy, and smooth expand/collapse functionality. Cards will show tier-appropriate metrics (trigger frequency for signals, trading performance for traders) while maintaining visual consistency.

### Core Functionality
1. **Unified Card Component**
   - User can view any signal/trader in consistent format
   - System will adapt display based on user tier and card type
   - Result: Reduced cognitive load, faster scanning

2. **Progressive Information Disclosure**
   - User can expand/collapse cards for details
   - System will show tier-appropriate expanded content
   - Result: Optimal information density without overwhelm

3. **Activity-Based Visual Hierarchy**
   - User can instantly identify active/important items
   - System will highlight based on tier-relevant activity
   - Result: Attention directed to actionable items

4. **Tier-Adaptive Metrics**
   - User sees metrics relevant to their capabilities
   - System shows signals for Free/Pro, trading for Elite
   - Result: Clear value progression across tiers

## User Stories

### Primary Flow - Pro Tier Signal Creator
**As a** Pro tier day trader managing 10 custom signals
**I want to** quickly scan my signals to see which are triggering frequently
**So that** I can focus on the most active market opportunities

**Acceptance Criteria:**
- [ ] Given collapsed view, when scanning, then I see trigger counts and last trigger time
- [ ] Given signal card, when I expand, then I see recent triggers with symbols and timestamps
- [ ] Given multiple signals, when triggered, then active ones are visually prominent
- [ ] System updates trigger counts within 1 second of new trigger
- [ ] Card expand/collapse animation completes in <200ms

### Secondary Flow - Elite Tier Automated Trader
**As an** Elite tier algo trader with 20+ active traders
**I want to** monitor real-time P&L and positions at a glance
**So that** I can manage risk and optimize performance

**Acceptance Criteria:**
- [ ] Given trader card, when collapsed, then I see win rate, P&L%, and position count
- [ ] Given active position, when market moves, then P&L updates in real-time
- [ ] Given losing position, when threshold hit, then card shows red accent
- [ ] Given expanded view, when viewing, then I see position details and AI confidence
- [ ] System handles 100+ cards with smooth scrolling at 60fps

### Edge Cases
1. **Market volatility (20+ simultaneous triggers):**
   - Batch updates every 500ms
   - Show trigger count badge
   - Priority queue by confidence/impact

2. **Connection lost:**
   - Show stale data indicator after 30s
   - Grey out real-time metrics
   - Cache last known state

3. **Mobile viewport:**
   - Stack cards vertically
   - Swipe actions for expand/collapse
   - Reduce information density

## Technical Requirements

### Performance
- Card render: <50ms per card
- Expand animation: 200ms duration
- Real-time updates: <1s latency
- List scrolling: 60fps with 100+ cards
- Memory usage: <2MB per 100 cards

### Data Requirements
- Source: WebSocket streams (real-time), Firebase (persistent)
- Updates: Real-time for active, 30s polling for idle
- Caching: 5-minute TTL for trigger history
- Retention: Last 100 triggers per signal

### Component Architecture
```typescript
interface CardProps {
  type: 'signal' | 'trader';
  tier: 'free' | 'pro' | 'elite';
  data: SignalData | TraderData;
  expanded: boolean;
  onToggle: () => void;
}

// Shared base component
<CardBase>
  <CardHeader /> // Name, status, actions
  <CardMetrics /> // Tier-adaptive metrics
  <CardExpandable /> // Collapsible details
</CardBase>
```

### State Management
- Use React.memo with custom comparison
- Batch WebSocket updates in 500ms windows
- Virtual scrolling for lists >50 cards
- Lazy load expanded content

## UI/UX Requirements

### Desktop (Primary)
**Card Layout - Collapsed (90px height):**
```
┌─────────────────────────────────────────┐
│ [●] Signal Name              [★] [⋮]     │ <- 16px font, status dot
│ ---------------------------------------- │
│ Triggered: 12 today | 47 total    [▼]   │ <- 14px metrics
│ Last: 2m ago | 15m timeframe            │ <- 12px muted text
└─────────────────────────────────────────┘
```

**Card Layout - Expanded (250px height):**
```
┌─────────────────────────────────────────┐
│ [Header remains same]                    │
│ ---------------------------------------- │
│ Recent Triggers:                         │
│   BTCUSDT  ↗ 2m ago    +2.4%           │
│   ETHUSDT  ↗ 5m ago    +1.8%           │
│   [... up to 10 items]                  │
│ ---------------------------------------- │
│ Top Symbols: BTC (8), ETH (6), SOL (4) │
└─────────────────────────────────────────┘
```

### Mobile (Secondary)
- Full width cards with 16px padding
- Tap to expand (no hover states)
- Swipe left for actions menu
- Maximum 2 cards visible without scrolling

### Visual Design
**Color Coding:**
- Active/Triggered: Primary blue (#3B82F6)
- Positive P&L: Success green (#10B981)
- Negative P&L: Danger red (#EF4444)
- Idle/Inactive: Muted grey (#6B7280)

**Animations:**
- Expand/collapse: 200ms ease-in-out
- New trigger pulse: 2s fade from yellow
- Position update: 300ms color transition

**Information Density:**
- Collapsed: 3-4 key metrics
- Expanded: 8-10 detailed items
- Mobile: Reduce by 30%

## Success Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Scan time | <2 seconds to identify best signal | User testing |
| Interaction efficiency | 40% fewer clicks to key info | Analytics |
| Tier upgrades | 15% increase in Pro→Elite | Conversion tracking |
| Performance | 60fps with 100+ cards | Performance monitoring |
| User satisfaction | >4.5/5 rating | In-app feedback |

## Rollout Strategy
1. **Phase 1:** Implement new CardBase component (1 week)
   - Build shared component structure
   - Add tier-adaptive rendering
   
2. **Phase 2:** Beta test with 10% Pro users (1 week)
   - A/B test against current design
   - Gather performance metrics
   
3. **Phase 3:** Full rollout with migration (3 days)
   - Deploy to all users
   - Monitor for issues

## Dependencies
- [ ] React.memo optimization in place
- [ ] WebSocket message batching system
- [ ] Virtual scrolling library (react-window)
- [ ] Animation library (framer-motion)
- [ ] Performance monitoring (Web Vitals)

## Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Performance degradation with many cards | High | Implement virtual scrolling, lazy loading |
| Breaking existing workflows | Medium | Gradual rollout, feature flag |
| Mobile performance issues | Medium | Reduce animation complexity on mobile |
| WebSocket message overflow | Low | Implement message queuing and batching |

## Out of Scope
- Card customization/user preferences
- Drag-and-drop reordering
- Card grouping/categorization (future)
- Advanced filtering UI (exists separately)
- Multi-select batch operations (future)

## Open Questions
- [ ] Should we allow users to customize information density? (Settings)
- [ ] Should expanded state persist across sessions? (LocalStorage)
- [ ] Should we add keyboard shortcuts for power users? (j/k navigation)
- [ ] How many historical triggers to store? (Memory vs utility)
- [ ] Should Elite users see both signal and trader views? (Toggle)

## Appendix
### Competitive Analysis
- **TradingView:** Strategy cards show backtest results prominently
- **3Commas:** Bot cards focus on profit percentage and active deals
- **Cryptohopper:** Signal cards show success rate and total signals

### Technical Diagrams
```
Component Hierarchy:
CardList
├── VirtualScroller
│   └── CardBase[]
│       ├── CardHeader
│       │   ├── StatusIndicator
│       │   ├── Title
│       │   └── Actions
│       ├── CardMetrics
│       │   └── TierAdapter
│       └── CardExpandable
│           ├── TriggerList (Signal)
│           └── PositionList (Trader)
```

### Migration Plan
1. Feature flag new card design
2. Run A/B test for 1 week
3. Monitor performance metrics
4. Address feedback
5. Full deployment

### Accessibility Requirements
- ARIA labels for all interactive elements
- Keyboard navigation support
- Screen reader announcements for updates
- Sufficient color contrast (WCAG AA)
- Focus indicators for keyboard users