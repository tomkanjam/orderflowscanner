# Mobile Layout Redesign for Top-Tier UX

**Type:** enhancement
**Initiative:** end-to-end-trader-workflow
**Created:** 2025-10-30 05:15:14

## Context

The app currently has basic responsive layout (vertical stacking on mobile) but lacks mobile-specific optimizations. With significant mobile user base expected at launch, we need a comprehensive mobile redesign focused on:

1. **Chart-first layout** - Chart at top, signals table below (user requirement)
2. **Touch-optimized interactions** - Gestures, tap targets, simplified navigation
3. **Space efficiency** - Collapsible navigation, drawer patterns, optimized information density
4. **Performance** - Fast chart rendering, smooth scrolling, efficient data loading

Current mobile implementation gaps:
- Sidebar takes full width on mobile (inefficient use of space)
- Chart.js not optimized for touch (no pinch-zoom, pan gestures)
- Table may overflow horizontally on small screens
- No mobile-specific navigation (hamburger/drawer)
- Signal History sidebar (Elite) could cause layout overflow
- Limited landscape orientation handling

## Linked Items
- Initiative: end-to-end-trader-workflow
- Related: User expects mobile-first experience for crypto trading

## Progress

**Phase 1: Core Layout (COMPLETED - 2025-10-30)**
- ✅ Created mobile hooks (useMediaQuery, useGestures, useBottomSheet)
- ✅ Built MobileHeader component with hamburger menu
- ✅ Built BottomNavigation component with 4 tabs
- ✅ Built SideDrawer component with slide-in animation
- ✅ Created mobile.css with animations and mobile styles
- ✅ Updated App.tsx for conditional mobile/desktop layouts
- ✅ Updated MainContent.tsx for tab-based content routing
- ✅ Build successful (no TypeScript errors)

**Current Status:**
- Mobile navigation architecture is complete and functional
- Responsive breakpoint at 768px working correctly
- Bottom nav switches between Chart/Signals/Create/Activity tabs
- Drawer slides in for trader list (replaces full-width sidebar)
- All core mobile UI components implemented

**Next Steps:**
- Phase 2: Chart optimization (touch gestures, mobile controls)
- Phase 3: Signals mobile view (card layout, swipe actions)
- Phase 4: Bottom sheet for signal details (Elite tier)
- Phase 5: Polish and cross-device testing

## Spec

### 1. MOBILE NAVIGATION ARCHITECTURE

**Pattern: Bottom Navigation + Hamburger Drawer**

```tsx
// Mobile Layout (< 768px):
<div className="flex flex-col h-screen">
  <Header /> {/* Logo, connection status, user menu */}
  <MainContent /> {/* Chart + Signals - grows to fill space */}
  <BottomNav /> {/* Quick access: Chart, Signals, Create, Activity */}
  <SideDrawer /> {/* Full sidebar content - slides in from left */}
</div>
```

**Components:**

**A. Header (Mobile)**
- Height: 56px
- Logo (left), connection indicator (center), user menu (right)
- Hamburger button (left) to open trader list drawer
- Minimal, always visible

**B. Bottom Navigation Bar**
- Height: 64px
- 4 tabs: Chart, Signals, Create Signal, Activity
- Active state with lime accent
- Icons + labels
- Fixed position at bottom

**C. Sidebar Drawer**
- Slides in from left (full overlay or push content)
- Contains entire Sidebar.tsx content:
  - Trader list
  - Filter input
  - Tabs (Built-in, Personal, Favorites)
  - Portfolio metrics (Elite)
  - Trading mode selector (Elite)
  - Positions panel (Elite)
- Backdrop overlay (80% opacity)
- Swipe-to-close gesture
- Close button (top right)

---

### 2. CHART-FIRST MOBILE LAYOUT

**Layout Priority:**
```tsx
// Portrait Mode (default):
<main className="flex-1 flex flex-col overflow-hidden">
  {activeTab === 'chart' && (
    <ChartSection /> {/* Takes 60% of available height */}
  )}
  {activeTab === 'signals' && (
    <SignalsSection /> {/* Takes 100% of available height */}
  )}
  {activeTab === 'activity' && (
    <ActivitySection /> {/* Takes 100% of available height */}
  )}
</main>

// Landscape Mode:
// Split view: Chart 50% left, Signals 50% right
```

**Chart Section (Mobile Optimized):**
- **Height:**
  - Portrait: 60% of available viewport height (minus header/bottom nav)
  - Landscape: Full height
  - Minimum: 300px
- **Touch Gestures:**
  - Pinch-to-zoom (price axis)
  - Two-finger pan (time axis scroll)
  - Single tap: Show crosshair + price info
  - Double tap: Reset zoom
  - Long press: Show signal details at that point
- **Controls:**
  - Timeframe selector (sticky at top): 1m, 5m, 15m, 1h, 4h, 1d
  - Fullscreen toggle (expand chart to 100%)
  - Indicator toggles (collapsible menu)
  - Drawing tools (minimal set: trendline, horizontal line)
- **Performance:**
  - Limit candlesticks to 200 on mobile (reduce memory)
  - Lazy load historical data on scroll
  - Throttle touch events (60fps target)
  - Use ResizeObserver for efficient canvas updates

**Implementation:**
```tsx
// apps/app/components/ChartDisplay.mobile.tsx
interface MobileChartProps {
  symbol: string;
  timeframe: string;
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
}

// Touch handler utilities
const usePinchZoom = (chartRef: ChartJS) => { ... }
const usePanGesture = (chartRef: ChartJS) => { ... }
const useLongPress = (onLongPress: (x, y) => void) => { ... }
```

---

### 3. SIGNALS TABLE MOBILE VIEW

**Pattern: Card-Based List**

Replace horizontal table scroll with vertically stacked cards:

```tsx
// Mobile Card View
<div className="signals-list-mobile overflow-y-auto">
  {signals.map(signal => (
    <SignalCardMobile
      key={signal.id}
      signal={signal}
      onClick={() => openSignalDetails(signal)}
    />
  ))}
</div>
```

**SignalCardMobile Component:**
```tsx
// Compact card design (88px height):
<div className="signal-card-mobile">
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2">
      <SignalIcon /> {/* Buy/Sell arrow */}
      <div>
        <p className="font-bold text-sm">{symbol}</p>
        <p className="text-xs text-muted">{traderName}</p>
      </div>
    </div>
    <div className="text-right">
      <p className="text-sm font-mono">${price}</p>
      <StatusBadge status={status} />
    </div>
  </div>
  <div className="flex justify-between mt-2 text-xs">
    <span>{timeAgo}</span>
    <span className={pnlClass}>{pnl}%</span>
  </div>
</div>
```

**Features:**
- Infinite scroll (load 50 at a time)
- Pull-to-refresh
- Swipe actions (left: favorite, right: archive)
- Tap to expand inline details
- Long press for quick actions menu
- Filters: Collapsible chip bar at top

**Performance:**
- Virtual scrolling for 500+ signals (react-window)
- Memoized card components
- Lazy load trader avatars

---

### 4. SIGNAL DETAILS MODAL

**Pattern: Bottom Sheet**

Instead of Elite sidebar (too wide for mobile), use bottom sheet:

```tsx
// Behavior:
- Swipe up to expand (75% screen height)
- Swipe down to collapse to peek (25% height)
- Drag handle at top
- Backdrop dismissal

// Content (same as SignalHistorySidebar):
- Signal details
- AI analysis (Elite)
- Historical performance
- Related signals
- Action buttons (Copy, Share, Monitor)
```

**States:**
1. **Collapsed:** Hidden (default)
2. **Peek:** 25% height - shows signal summary
3. **Expanded:** 75% height - full details scrollable
4. **Fullscreen:** 100% height - deep analysis mode

**Implementation:**
- Use `react-spring` for smooth animations
- Touch event handling for drag
- Backdrop overlay (variable opacity based on sheet height)
- Scroll lock on body when expanded

---

### 5. ACTIVITY PANEL MOBILE

**Pattern: Full-Screen Modal**

Current ActivityPanel becomes fullscreen on mobile:

```tsx
// Triggered from Bottom Nav "Activity" tab
<div className="fixed inset-0 z-50 bg-background">
  <Header>
    <BackButton />
    <Title>Activity</Title>
    <FilterButton />
  </Header>
  <Tabs>Triggers, Trades, History</Tabs>
  <ActivityList /> {/* Full height scrollable */}
</div>
```

---

### 6. CREATE SIGNAL FLOW (MOBILE)

**Pattern: Multi-Step Modal**

Current TraderForm optimized for mobile:

```tsx
// Step 1: Choose method
<div className="fixed inset-0 z-50">
  <ProgressBar step={1} totalSteps={3} />
  <div className="p-4">
    <Button>Natural Language</Button>
    <Button>Code Editor</Button>
  </div>
</div>

// Step 2: Input (Natural Language)
<Textarea
  rows={6}
  placeholder="Describe your trading strategy..."
  autoFocus
/>

// Step 3: Review & Save
<SignalPreview />
<BottomActions>
  <Button variant="secondary">Back</Button>
  <Button>Create Signal</Button>
</BottomActions>
```

**Mobile Optimizations:**
- Keyboard-aware layout (shift content up when keyboard open)
- Auto-save draft to localStorage
- Simplified code editor (syntax highlighting only, no advanced features)
- Voice input option for natural language

---

### 7. TOUCH INTERACTION STANDARDS

**Tap Targets:**
- Minimum: 44x44px (iOS guideline)
- Buttons: 48x48px
- Small interactive elements: 40x40px with padding

**Gestures:**
- **Swipe left/right:** Navigate between tabs/screens
- **Pull down:** Refresh data
- **Long press:** Context menu / quick actions
- **Pinch:** Zoom (chart only)
- **Two-finger scroll:** Pan chart time axis

**Visual Feedback:**
- Ripple effect on tap (Material Design style)
- Scale transform on press (0.98x)
- Active state: 200ms delay
- Disabled state: 50% opacity

---

### 8. RESPONSIVE BREAKPOINTS STRATEGY

```tsx
// Tailwind breakpoints:
// xs: 0-639px     (mobile portrait)
// sm: 640-767px   (mobile landscape, small tablets)
// md: 768-1023px  (tablets, current desktop breakpoint)
// lg: 1024px+     (desktop)

// New mobile-first approach:
const isMobilePortrait = useMediaQuery('(max-width: 639px)');
const isMobileLandscape = useMediaQuery('(min-width: 640px) and (max-width: 767px)');
const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
const isDesktop = useMediaQuery('(min-width: 1024px)');
```

**Layout Matrix:**

| Breakpoint | Sidebar | Chart | Signals | Bottom Nav |
|------------|---------|-------|---------|------------|
| Mobile Portrait (<640px) | Drawer | 60% height | 40% height | Visible |
| Mobile Landscape (640-767px) | Drawer | 50% width | 50% width | Visible |
| Tablet (768-1023px) | Side panel | Top 50% | Bottom 50% | Hidden |
| Desktop (1024px+) | Side panel | Top 60% | Bottom 40% | Hidden |

---

### 9. PERFORMANCE OPTIMIZATIONS

**Chart Rendering:**
- Reduce canvas resolution on mobile (devicePixelRatio: 1.5 instead of 2)
- Limit candlesticks to 200 on screen
- Debounce zoom/pan events (16ms for 60fps)
- Use `willReadFrequently: true` for canvas context

**List Rendering:**
- Virtual scrolling for signals list (react-window)
- Pagination: 50 signals per batch
- Intersection Observer for infinite scroll
- Memoize signal cards

**Data Loading:**
- Service Worker for offline support
- Cache WebSocket data in IndexedDB
- Lazy load non-critical data (portfolio metrics, history)

**Bundle Size:**
- Code splitting by route
- Lazy load chart component
- Dynamic imports for modals/drawers
- Tree-shake unused Tailwind classes

---

### 10. ACCESSIBILITY (A11Y)

- **Focus management:** Trap focus in modals/drawers
- **ARIA labels:** All interactive elements
- **Keyboard navigation:** Tab order, Enter/Space to activate
- **Screen reader:** Announce signal updates
- **Color contrast:** AAA standard (4.5:1 minimum)
- **Text sizing:** Support browser zoom up to 200%

---

### 11. IMPLEMENTATION PHASES

**Phase 1: Core Layout (2-3 days)**
- Create mobile layout wrapper component
- Implement bottom navigation
- Add sidebar drawer with backdrop
- Update routing for tab switching

**Phase 2: Chart Optimization (2-3 days)**
- Add touch gesture handlers (pinch, pan, long press)
- Implement landscape mode layout
- Optimize canvas performance
- Add mobile-specific controls

**Phase 3: Signals Mobile View (2 days)**
- Create SignalCardMobile component
- Implement virtual scrolling
- Add swipe actions
- Pull-to-refresh

**Phase 4: Signal Details (1-2 days)**
- Build bottom sheet component
- Port SignalHistorySidebar content
- Add drag gestures
- Smooth animations

**Phase 5: Polish & Testing (2 days)**
- Touch interaction refinements
- Performance profiling
- Cross-device testing (iOS Safari, Chrome Android)
- Edge case handling (keyboard open, orientation change)

**Total Estimate:** 9-12 days

---

### 12. FILES TO MODIFY/CREATE

**New Files:**
```
apps/app/src/components/mobile/
├── BottomNavigation.tsx
├── SideDrawer.tsx
├── MobileHeader.tsx
├── SignalCardMobile.tsx
├── BottomSheet.tsx
├── MobileChartControls.tsx
└── hooks/
    ├── useGestures.ts
    ├── useBottomSheet.ts
    └── useMediaQuery.ts
```

**Modified Files:**
```
apps/app/App.tsx                      // Add mobile layout wrapper
apps/app/components/MainContent.tsx   // Add bottom nav routing
apps/app/components/ChartDisplay.tsx  // Add touch gesture support
apps/app/components/Sidebar.tsx       // Adapt for drawer mode
apps/app/src/components/TraderSignalsTable.tsx  // Add mobile card view
apps/app/tailwind.config.js           // Add mobile-specific utilities
```

**CSS Updates:**
```
apps/app/public/neon-terminal-design-system.css  // Add mobile CSS vars
apps/app/src/styles/mobile.css  // New mobile-specific styles
```

---

### 13. TESTING STRATEGY

**Devices to Test:**
- iPhone SE (smallest screen: 375x667)
- iPhone 14 Pro (390x844)
- Pixel 7 (412x915)
- iPad Mini (768x1024)
- Samsung Galaxy S23 (360x800)

**Scenarios:**
- Portrait orientation (default)
- Landscape orientation (chart + table side-by-side)
- Keyboard open (input fields)
- Slow network (loading states)
- Offline mode (cached data)
- 100+ active signals (performance)

**Tools:**
- Chrome DevTools mobile emulation
- Lighthouse performance audit (target: 90+ score)
- React DevTools profiler
- Network throttling (3G simulation)

---

### 14. SUCCESS METRICS

**Performance:**
- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- Chart render time: < 500ms
- Smooth scrolling: 60fps

**UX:**
- Task completion rate: 95%+
- Average session duration: +30% vs desktop
- Signal creation on mobile: 40%+ of total

**Technical:**
- Mobile bounce rate: < 20%
- Zero layout shifts (CLS: 0)
- No horizontal scroll
- Touch target compliance: 100%

---

## Notes

- Prioritize iOS Safari and Chrome Android (90% of mobile users)
- Consider progressive web app (PWA) features for future (install prompt, offline)
- Elite features (AI analysis, portfolio) should gracefully degrade on mobile
- Test with real market data and 500+ active signals
- Ensure accessibility for screen readers and voice control
- Consider haptic feedback for signal alerts (iOS/Android)
