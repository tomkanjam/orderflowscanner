# Implement Sidebar-First Layout from Style Guide

## Metadata
- **Status:** 📊 planning
- **Created:** 2025-01-08
- **Updated:** 2025-01-08
- **Type:** design (major UI/UX redesign)
- **Complexity:** XL (3-5 days frontend + 1-2 days testing)
- **Risk:** High (major UI change, metrics displacement)
- **Progress:** 0%

---

## Design Brief
*Stage: design | Date: 2025-01-08*

### Design Request
Transform the production app's sidebar to match the StyleGuideSupabase design - implementing a clean logo header, three-tab navigation system (Built-in | Personal | Favorites), search/filter functionality, and rich expandable signal cards with category grouping.

### Current Experience
- **What exists now:**
  - Sidebar with StatusBar header containing logo + real-time metrics (connection status, update frequency, symbol/signal counts)
  - Simple scrollable TraderList with dense SignalListItem components (single-line display)
  - CreateSignalButton at the top
  - User menu at the bottom with tier display and account links
  - No tabs, no search, no category grouping

- **User pain points:**
  - StatusBar is metrics-heavy and visually compressed (h-12)
  - No way to filter/search through signals
  - No categorization - all signals in one flat list
  - Dense list items make it hard to see signal details at a glance
  - No separation between built-in signals, personal signals, and favorites

- **Affected areas:**
  - `apps/app/src/components/StatusBar.tsx` - Metrics-heavy header to be replaced
  - `apps/app/components/Sidebar.tsx` - Main sidebar container
  - `apps/app/src/components/TraderList.tsx` - List component to be enhanced with tabs/filtering
  - `apps/app/src/components/SignalListItem.tsx` - Dense list view
  - Style guide components to integrate: `TabBar`, `FilterInput`, `CategoryHeader`, `ExpandableSignalCard`

### Desired Experience
- **What should change:**
  1. **Clean Header**: Replace StatusBar with minimal logo header (border-bottom, py-4, just logo + "vyx")
  2. **Three-Tab Navigation**: Add Built-in | Personal | Favorites tabs
  3. **Search/Filter**: Add FilterInput above tabs to search across all signals
  4. **Category Grouping**: Within Built-in tab, group signals by category (e.g., Momentum, Breakout, Volume)
  5. **Rich Display**: Replace dense SignalListItem with ExpandableSignalCard (expandable, shows description/stats)
  6. **Metrics Relocation**: Determine new home for real-time connection status and metrics
  7. **User Menu**: Decide if it stays in sidebar or moves to main content area

- **User benefit:**
  - Cleaner, less cluttered header design
  - Easy navigation between built-in, personal, and favorite signals
  - Quick search/filter to find specific signals
  - Better organization with category grouping
  - Richer signal information with expandable cards
  - More scalable as signal library grows

### Critical Questions

1. **Metrics Placement (CRITICAL)**: Where should real-time WebSocket metrics go?
   - StatusBar currently shows: connection status (connected/reconnecting/offline), update frequency (X/s), symbol count, signal count
   - Options:
     - A: Compact status bar below logo in sidebar
     - B: Floating indicator in main content area
     - C: Bottom of sidebar
     - D: Hidden by default, show on hover/click
   - **Impact**: Users rely on connection status for confidence that data is live

2. **User Menu Location**: Keep in sidebar bottom or move to main content top-right (like style guide shows)?
   - Current: Bottom of sidebar with tier display
   - Style guide: Top-right of main content area
   - Trade-off: Sidebar is "pure navigation" vs. convenient access to account

3. **Expandable Cards vs. Dense List**: Use expandable cards for all signals or make it a user preference?
   - Expandable cards look better but take more space
   - Dense list is more information-dense for power users
   - Could offer view toggle (compact vs. expanded)

4. **Mobile Strategy**: How should tabs/search/expandable cards work on mobile?
   - Full feature parity on mobile?
   - Simplified single-list view?
   - Responsive tabs that collapse to dropdown?

5. **Rollout Strategy**: This is a major UI change - how to introduce it?
   - Feature flag for gradual rollout?
   - Beta testing with subset of users first?
   - Big-bang release with ability to revert?
   - Phased: header first, then tabs, then cards?

6. **Performance Trade-off**: If expandable cards cause lag with 100+ signals, should we:
   - Limit signals shown per tab?
   - Use pagination?
   - Stick with dense list view?
   - Implement virtualization (adds complexity)?

### Design Considerations
- **Style Guide Reference**: StyleGuideSupabase.tsx lines 103-198 show complete target sidebar structure
- **Component Reuse**: TabBar, FilterInput, CategoryHeader, ExpandableSignalCard already exist in style guide
- **Theme System**: Style guide uses Supabase variables (`--primary`, `--foreground`), production uses Neon Terminal (`--nt-*`)
- **Real-time Updates**: Must maintain smooth WebSocket updates with new components
- **Accessibility**: Ensure keyboard navigation works with tabs/expandable cards

---

## Engineering Review
*Stage: engineering-review | Date: 2025-01-08*

### ⚠️ CRITICAL CORRECTION: Issue Brief is Inaccurate

After deep code analysis, the **initial problem statement is fundamentally incorrect**. The production app already has the sidebar-first layout with logo at the top. This is NOT about moving the StatusBar - it's about **transforming the sidebar content structure** to match the style guide's design system.

### Codebase Analysis

#### Current Production Sidebar Structure (`Sidebar.tsx`)
```
<aside> (h-screen, full height)
  ├── <StatusBar/> (sticky header with logo + metrics)
  │   ├── Logo + "vyx" name (left)
  │   └── Metrics (right): update freq, symbol count, signals, connection
  │
  └── <div> (scrollable content)
      ├── CreateSignalButton
      ├── TraderList (or TraderForm when editing)
      └── User Menu (bottom, with border-top)
```

#### Style Guide Sidebar Structure (`StyleGuideSupabase.tsx`)
```
<aside> (h-screen, full height)
  ├── <div> Logo Header (border-bottom)
  │   └── Logo + "vyx" name (centered/left, larger, cleaner)
  │
  └── <div> (scrollable content)
      ├── Create Button (styled with Plus icon)
      ├── FilterInput (search bar)
      ├── TabBar (Built-in | Personal | Favorites)
      ├── Signal List (expandable cards, grouped by category)
      └── [No user menu visible in style guide]
```

#### Key Structural Differences

**1. Header Design**
- **Current**: StatusBar component (12 metrics-heavy, compressed layout)
- **Style Guide**: Clean logo header (py-4, just logo + name, border-bottom)

**2. Content Organization**
- **Current**: Simple list with TraderList component
- **Style Guide**: Sophisticated structure with:
  - Search/filter input
  - Tab bar for categorization (Built-in | Personal | Favorites)
  - Grouped signal cards with CategoryHeader
  - Expandable cards with detailed info

**3. Component Architecture**
- **Current**: Uses `<SignalListItem/>` for dense single-line display
- **Style Guide**: Uses `<ExpandableSignalCard/>` for rich, interactive display

**4. Data Display**
- **Current**: StatusBar shows real-time WebSocket metrics (update frequency, connection status)
- **Style Guide**: No metrics visible - pure navigation/content focus

### Spec Analysis - CORRECTED

#### What This Task Actually Involves

This is a **major UI/UX redesign**, not a simple layout adjustment. It requires:

1. **Replace StatusBar with Logo Header**
   - Extract logo from StatusBar
   - Create new minimal header component
   - Determine where metrics go (see concerns below)

2. **Implement Three-Tab Navigation System**
   - Add TabBar component (exists in style guide)
   - Built-in tab: Show `builtInSignals` (already filtered in TraderList)
   - Personal tab: Show `customSignals` (user-created traders)
   - Favorites tab: Filter by user preferences

3. **Add Search/Filter Functionality**
   - Implement FilterInput component (exists in style guide)
   - Filter across all tabs by signal name/description

4. **Transform Signal Display**
   - Currently: Dense `SignalListItem` (single line, minimal info)
   - Target: `ExpandableSignalCard` (rich display with expand/collapse)
   - Add category grouping with `CategoryHeader`

5. **Reorganize User Menu**
   - Style guide doesn't show user menu in sidebar
   - May need to move to main content area top-right (like style guide)

#### Technical Feasibility
**Verdict:** ✅ Feasible but **LARGE** scope

**Reasoning:**
- All required components already exist in the style guide codebase
- Data structures support the new organization (traders have categories, difficulty)
- TraderManager already provides the necessary data segmentation
- The challenge is NOT technical - it's the sheer amount of UI restructuring

#### Hidden Complexity

1. **WebSocket Metrics Loss**
   - Challenge: StatusBar provides critical real-time feedback (connection status, update frequency, symbol count)
   - Impact: Users lose visibility into system health
   - Solution Required: Either:
     - Add metrics bar elsewhere (main content header?)
     - Add minimal status indicator in logo header
     - Move to bottom of sidebar
     - Show only on hover/expand

2. **TraderList vs Signal Library Components**
   - Challenge: TraderList is production-tested, battle-hardened component with complex state management
   - ExpandableSignalCard is style-guide-only, untested in production
   - Risk: Bugs, performance issues, missing edge cases
   - Mitigation: Need thorough testing plan, may need to enhance ExpandableSignalCard

3. **State Management Complexity**
   - Current: Simple list, single selection
   - Target: Multiple tabs, filtering, expansion state, category grouping
   - Must maintain: Real-time updates, enable/disable toggles, cloud execution state
   - Risk: State synchronization bugs between expanded/collapsed views

4. **Mobile Responsiveness**
   - Current StatusBar: Tested and responsive (h-12, scales down)
   - Style guide: Desktop-focused design, may not handle mobile well
   - TabBar with 3 tabs might be cramped on mobile
   - Expandable cards may not work well on small screens

5. **User Menu Displacement**
   - Current: Bottom of sidebar, always accessible
   - Style guide: User menu in main content area top-right
   - Challenge: Sidebar becomes "pure navigation" - is that OK for this app?
   - Decision needed: Keep in sidebar or move to main content?

#### Performance Concerns

**Bottlenecks identified:**
- **Category Grouping**: Currently done in useMemo, but adding real-time filter adds complexity
- **Expandable Cards**: More DOM nodes than single-line items, could impact scroll performance
- **Tab Switching**: Remounting components on tab change vs. keeping all mounted but hidden

**Mitigation:**
- Use virtualization if signal list grows large (react-window/react-virtual)
- Memoize expensive calculations (grouping, filtering)
- Lazy load expanded card content
- Keep tab content mounted but use CSS `display: none` for instant switching

**During peak usage for trading domain:**
- Expected load: 100+ active signals firing in real-time
- Current capacity: TraderList handles this well with simple list
- Scaling needed: Need to ensure expanded cards don't cause jank during high-frequency updates

### Architecture Recommendations

#### Proposed Approach

**Phase 1: Header Transformation** (Low Risk)
1. Extract logo from StatusBar into new `SidebarHeader` component
2. Keep StatusBar metrics in temporary location (below header or floating)
3. Test with users, gather feedback on metrics placement

**Phase 2: Content Structure** (Medium Risk)
1. Add TabBar component above TraderList
2. Implement tab switching logic (filter existing TraderList data)
3. Add FilterInput above tabs
4. Keep using SignalListItem for now (don't switch to ExpandableSignalCard yet)

**Phase 3: Rich Display** (High Risk)
1. Gradually replace SignalListItem with ExpandableSignalCard
2. Add category grouping with CategoryHeader
3. Implement expand/collapse state management
4. Extensive testing of real-time updates with new component

#### Data Flow

1. User opens app → Sidebar loads
2. TraderManager provides traders → TraderList processes
3. **NEW**: Filter by search query → Filtered list
4. **NEW**: Group by active tab (built-in/personal/favorites)
5. **NEW**: Within built-in tab, group by category
6. Render appropriate card component (Item vs ExpandableCard)
7. Real-time updates flow through existing TraderManager subscription
8. State changes trigger re-renders with memoized computations

#### Key Components

**New Components to Build:**
- `SidebarHeader.tsx` - Clean logo + name header
- `SignalTabs.tsx` - Tab navigation wrapper
- `SignalSearch.tsx` - Search/filter input wrapper

**Modified Components:**
- `Sidebar.tsx` - Major restructure to new layout
- `TraderList.tsx` - Add filtering, tab awareness, category grouping

**To Be Replaced (Eventually):**
- `StatusBar.tsx` - Remove from sidebar, repurpose or delete

**To Be Enhanced:**
- `ExpandableSignalCard.tsx` - Production-ready version (error handling, loading states, real-time updates)

### Implementation Complexity

#### Effort Breakdown
- **Frontend**: **XL** (3-5 days)
  - Header transformation: 4 hours
  - Tab system integration: 6 hours
  - Search/filter logic: 4 hours
  - Category grouping: 4 hours
  - ExpandableCard production-readiness: 8 hours
  - Testing and bug fixes: 8-12 hours

- **Backend**: **None** (all frontend)

- **Infrastructure**: **None**

- **Testing**: **L** (1-2 days)
  - Unit tests for new components
  - Integration tests for tab/filter combinations
  - Performance tests with 100+ signals
  - Mobile responsiveness testing
  - Real-time update testing

#### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Loss of critical metrics visibility | **High** | **High** | Design metrics location before removing StatusBar |
| ExpandableCard performance issues | **Medium** | **High** | Implement virtualization, memoization |
| State management bugs with tabs/filters | **Medium** | **Medium** | Comprehensive testing, add debugging tools |
| Mobile UX degradation | **High** | **Medium** | Test on mobile early, adjust tab/card design |
| User confusion from major UI change | **Medium** | **High** | Phased rollout, user feedback, ability to revert |
| Real-time updates breaking with new components | **Low** | **Critical** | Extensive testing with live WebSocket data |

### Security Considerations

#### Authentication/Authorization
- No changes needed - existing tier system works with new layout
- Tab visibility based on currentTier already implemented

#### Data Protection
- No sensitive data exposure changes
- User preferences for favorites/enabled signals remain secure

### Testing Strategy

#### Unit Tests
- `SidebarHeader.tsx`: Renders logo, handles clicks
- `SignalTabs.tsx`: Tab switching logic, active state
- `SignalSearch.tsx`: Filter query updates, debouncing
- TraderList filtering/grouping logic with various data combinations

#### Integration Tests
- Tab + filter combinations
- Real-time trader updates across all tabs
- Enable/disable toggles while filtered
- Expand/collapse state persistence across navigation
- User menu functionality from new location

#### Performance Tests
- Render time with 100+ signals
- Scroll performance with expanded cards
- Filter debounce behavior
- Tab switch speed
- Memory usage over extended session

#### User Acceptance Testing
- Navigation intuitiveness
- Metrics visibility (can users still monitor system health?)
- Mobile usability
- Accessibility (keyboard navigation, screen readers)

### Technical Recommendations

#### Must Have
1. **Metrics solution** - Don't remove StatusBar until metrics have a new home
2. **Phased rollout** - Don't ship all changes at once
3. **Feature flag** - Allow users to switch back if needed
4. **Performance baseline** - Measure before/after to ensure no degradation

#### Should Have
1. **Virtualization** - For signal lists > 50 items
2. **Search debouncing** - 300ms delay to prevent jank
3. **Expand state persistence** - Remember which cards were expanded
4. **Loading states** - For async operations

#### Nice to Have
1. **Keyboard shortcuts** - Quick tab switching (Ctrl+1/2/3)
2. **Drag-and-drop** - Reorder favorites
3. **Bulk actions** - Enable/disable multiple signals
4. **Export/Import** - Share favorite configurations

### Implementation Guidelines

#### Code Organization
```
src/
  components/
    sidebar/
      Sidebar.tsx (main container)
      SidebarHeader.tsx (logo header)
      SignalTabs.tsx (tab navigation)
      SignalSearch.tsx (filter input)
      SignalContent.tsx (tabbed content area)
    signals/
      SignalListItem.tsx (existing, dense view)
      ExpandableSignalCard.tsx (rich view)
      CategoryHeader.tsx (group headers)
    TraderList.tsx (enhanced with filtering/grouping)
```

#### Key Decisions
- **State management**: Keep in TraderList, pass filtered/grouped data to display components
- **Tab switching**: Render all tabs, use CSS visibility for instant switching
- **Card expansion**: Local state in each card, no global "only one expanded" constraint
- **Filtering**: Client-side only, no backend changes needed
- **Real-time updates**: Maintain existing TraderManager subscription pattern

### Questions for PM/Design

1. **Metrics Placement (CRITICAL)**: Where should connection status and WebSocket metrics go?
   - Option A: Small status bar below logo in sidebar
   - Option B: Floating widget in main content area
   - Option C: Bottom of sidebar
   - Option D: Hidden, accessible via menu/modal

2. **User Menu Location**: Keep in sidebar bottom or move to main content top-right (like style guide)?

3. **Mobile Strategy**: Should we maintain feature parity on mobile or simplify?
   - Full tabs + search on mobile?
   - Simplified single-list view?
   - Responsive tabs that collapse?

4. **Rollout Strategy**: How to introduce this major UI change?
   - Feature flag for gradual rollout?
   - Beta testing with subset of users?
   - Big-bang release with ability to revert?

5. **Expandable Cards**: Always use them or make it a user preference?
   - Dense view (current SignalListItem)
   - Rich view (new ExpandableSignalCard)
   - User-configurable?

6. **Performance vs. UX Trade-off**: If expandable cards cause performance issues with 100+ signals, should we:
   - Limit number of signals shown per tab?
   - Use pagination?
   - Stick with dense list view?
   - Implement virtualization (adds complexity)?

### Pre-Implementation Checklist

- [ ] ✅ Performance requirements achievable (with virtualization if needed)
- [ ] ✅ Security model defined (no changes needed)
- [ ] ⚠️ **Error handling strategy clear** (need to define for new components)
- [ ] ❌ **Monitoring plan in place** (need to define metrics for success)
- [ ] ⚠️ **Rollback strategy defined** (need feature flag implementation)
- [ ] ✅ Dependencies available (all components exist in style guide)
- [ ] ✅ No blocking technical debt
- [ ] ❌ **Metrics placement decided** (BLOCKER - must resolve before starting)
- [ ] ❌ **User menu location decided** (BLOCKER - impacts layout)

### Recommended Next Steps

1. **BLOCK**: Do NOT proceed to architecture until critical questions answered:
   - Where do WebSocket metrics go?
   - Where does user menu go?
   - What's the rollout strategy?

2. **If Approved After Answers**:
   - Create detailed architecture doc
   - Build prototype with just header change
   - Get user feedback before full implementation

3. **Alternative Approach**: Consider **incremental adoption**:
   - Phase 1: Just fix the header (logo only, keep metrics for now)
   - Phase 2: Add tabs to existing list view
   - Phase 3: Add search/filter
   - Phase 4: Replace with expandable cards
   - This reduces risk and allows user feedback at each stage

---
*Status: ⚠️ BLOCKED - Awaiting PM decisions on metrics placement and user menu location*
*Next: Resolve blockers, then /architect issues/2025-01-08-design-sidebar-layout-implementation.md*

---

## System Architecture
*Stage: architect | Date: 2025-01-08*

### Architecture Overview

This section defines the complete technical architecture for transforming the production sidebar from a simple list-based design to a sophisticated tab-based navigation system with search/filter, category grouping, and rich expandable cards.

### Component Architecture

#### New Component Structure

```
Sidebar.tsx (Enhanced)
├── SidebarHeader.tsx (NEW)
│   ├── Logo + App Name
│   └── [Optional: Compact metrics indicator]
│
├── Scrollable Content Container
│   ├── CreateSignalButton (existing)
│   ├── FilterInput (from style guide)
│   ├── TabBar (from style guide)
│   │   └── TabButton × 3 (Built-in | Personal | Favorites)
│   │
│   ├── SignalContent.tsx (NEW - manages tab content)
│   │   ├── [Built-in Tab Content]
│   │   │   └── For each category:
│   │   │       ├── CategoryHeader (from style guide)
│   │   │       └── ExpandableSignalCard[] (from style guide)
│   │   │
│   │   ├── [Personal Tab Content]
│   │   │   └── ExpandableSignalCard[] (user's custom traders)
│   │   │
│   │   └── [Favorites Tab Content]
│   │       └── ExpandableSignalCard[] (favorited signals)
│   │
│   └── UserMenu (existing, may relocate)
│       ├── Tier Display
│       ├── Account Links
│       └── Sign Out
```

#### Component Specifications

**SidebarHeader.tsx** (NEW)
```typescript
interface SidebarHeaderProps {
  // Optional: Show compact metrics
  showMetrics?: boolean;
  connectionStatus?: 'connected' | 'disconnected' | 'reconnecting';
  updateFrequency?: number;
}

// Renders:
// - Logo + "vyx" name (clean, py-4, border-bottom)
// - Optional metrics badge (if showMetrics=true)
```

**SignalContent.tsx** (NEW)
```typescript
interface SignalContentProps {
  activeTab: 'builtin' | 'personal' | 'favorites';
  filterQuery: string;
  traders: Trader[];
  favorites: Set<string>;
  selectedTraderId: string | null;
  expandedCardIds: Set<string>;

  onSelectTrader: (traderId: string) => void;
  onToggleExpand: (traderId: string) => void;
  onToggleEnable: (traderId: string) => void;
  onToggleFavorite: (traderId: string) => void;
  onEdit: (trader: Trader) => void;
  onDelete: (traderId: string) => void;
}

// Responsibilities:
// 1. Filter traders by search query
// 2. Segment traders by active tab
// 3. Group built-in traders by category
// 4. Render appropriate list with expandable cards
// 5. Manage expansion state
```

**Enhanced Sidebar.tsx**
```typescript
// Add new state:
const [activeTab, setActiveTab] = useState<'builtin' | 'personal' | 'favorites'>('builtin');
const [filterQuery, setFilterQuery] = useState('');
const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());
const [favorites, setFavorites] = useState<Set<string>>(new Set());

// Keep existing:
// - selectedTraderId
// - showCreateForm
// - editingTrader
// - user/tier state
// - WebSocket metrics
```

**Enhanced TraderList.tsx** (or new SignalList.tsx)
```typescript
interface SignalListProps {
  signals: Trader[];
  groupByCategory?: boolean; // true for Built-in tab
  selectedSignalId: string | null;
  expandedSignalIds: Set<string>;
  favorites: Set<string>;

  onSelectSignal: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onToggleEnable: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onEdit?: (signal: Trader) => void;
  onDelete?: (id: string) => void;
}

// Logic:
// 1. If groupByCategory=true, group signals by category
// 2. Render CategoryHeader for each group
// 3. Render ExpandableSignalCard for each signal
// 4. Handle expand/collapse state
```

**Production-Ready ExpandableSignalCard.tsx**
```typescript
// Enhance existing component with:
interface ExpandableSignalCardProps {
  // ... existing props ...

  // Add real-time support:
  activityState?: 'idle' | 'recent' | 'high' | 'triggered';
  realTimeMetrics?: {
    lastSignalAt?: Date;
    totalSignals?: number;
    currentSymbols?: string[];
  };

  // Add cloud support:
  cloudStatus?: {
    enabled: boolean;
    machineStatus: 'stopped' | 'starting' | 'running' | 'error';
  };

  // Performance optimization:
  isVisible?: boolean; // for virtualization
}

// Enhancements needed:
// 1. Connect to activityTracker for real-time state
// 2. Optimize re-renders with React.memo
// 3. Add loading states for async operations
// 4. Handle edge cases (missing data, errors)
```

### Data Models & Interfaces

#### State Management Types

```typescript
// Tab state
type TabType = 'builtin' | 'personal' | 'favorites';

interface TabState {
  active: TabType;
  counts: {
    builtin: number;
    personal: number;
    favorites: number;
  };
}

// Filter state
interface FilterState {
  query: string;
  debouncedQuery: string; // for performance
}

// Expansion state
interface ExpansionState {
  expandedIds: Set<string>;
  // Optional: Persist to localStorage for session continuity
}

// Favorite state
interface FavoriteState {
  favoriteIds: Set<string>;
  // Sync with user preferences in database
}

// Metrics state (if keeping in sidebar)
interface MetricsState {
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  updateFrequency: number;
  symbolCount: number;
  signalCount: number;
  lastUpdate: number | null;
}
```

#### Data Flow Interfaces

```typescript
// Grouped signals for rendering
interface GroupedSignals {
  [category: string]: Trader[];
}

// Filtered and segmented data
interface SegmentedData {
  builtin: GroupedSignals; // grouped by category
  personal: Trader[]; // flat list
  favorites: Trader[]; // flat list
}

// Tab counts for badges
interface TabCounts {
  builtin: number;
  personal: number;
  favorites: number;
}
```

### Service Layer

**No changes needed** - existing services remain unchanged:
- `TraderManager` - Provides real-time trader data
- `activityTracker` - Tracks signal activity states
- `webSocketManager` - Manages live data connections
- Firebase/Supabase - Authentication and data persistence

### Data Flow Architecture

#### Complete Data Flow

```
1. Component Mount
   App.tsx
   └─> Sidebar.tsx mounts
       ├─> Subscribes to TraderManager
       ├─> Loads favorites from localStorage/DB
       └─> Initializes state (tab='builtin', filter='', expanded=∅)

2. Real-Time Data Updates
   Binance WebSocket
   └─> webSocketManager
       └─> TraderManager.processUpdate()
           └─> Sidebar receives updated traders
               └─> Re-render with new data

3. User Interaction: Search
   User types in FilterInput
   └─> setFilterQuery(value)
       └─> Debounced (300ms)
           └─> filterTraders(debouncedQuery)
               └─> SignalContent receives filtered traders
                   └─> Re-render with filtered list

4. User Interaction: Tab Switch
   User clicks tab (e.g., "Personal")
   └─> setActiveTab('personal')
       └─> SignalContent receives activeTab='personal'
           └─> Filters traders where !isBuiltIn
               └─> Renders personal traders list

5. User Interaction: Expand Card
   User clicks signal card
   └─> onToggleExpand(traderId)
       └─> setExpandedCardIds(prev => toggle(traderId))
           └─> ExpandableSignalCard receives isExpanded=true
               └─> Animates expansion, shows details

6. User Interaction: Toggle Favorite
   User clicks favorite icon
   └─> onToggleFavorite(traderId)
       ├─> setFavorites(prev => toggle(traderId))
       ├─> Persist to localStorage
       └─> Optional: Sync to Supabase user_preferences

7. User Interaction: Enable/Disable Signal
   User toggles signal in dropdown menu
   └─> onToggleEnable(traderId)
       └─> TraderManager.updateTrader({ enabled: !enabled })
           └─> Database update
               └─> Real-time sync back to UI
```

#### Filtering Logic

```typescript
// Filter traders by search query
function filterTraders(traders: Trader[], query: string): Trader[] {
  if (!query.trim()) return traders;

  const lowerQuery = query.toLowerCase();
  return traders.filter(trader =>
    trader.name.toLowerCase().includes(lowerQuery) ||
    trader.description?.toLowerCase().includes(lowerQuery) ||
    trader.category?.toLowerCase().includes(lowerQuery)
  );
}

// Segment traders by tab
function segmentTraders(
  traders: Trader[],
  favorites: Set<string>
): SegmentedData {
  const builtin = traders.filter(t => t.isBuiltIn);
  const personal = traders.filter(t => !t.isBuiltIn);
  const favoriteList = traders.filter(t => favorites.has(t.id));

  return {
    builtin: groupByCategory(builtin),
    personal,
    favorites: favoriteList
  };
}

// Group built-in signals by category
function groupByCategory(traders: Trader[]): GroupedSignals {
  return traders.reduce((groups, trader) => {
    const category = trader.category || 'Other';
    if (!groups[category]) groups[category] = [];
    groups[category].push(trader);
    return groups;
  }, {} as GroupedSignals);
}
```

#### State Management Strategy

**Use React State + useMemo for Performance**

```typescript
// In Sidebar.tsx
function Sidebar({ ... }) {
  // Core state
  const [activeTab, setActiveTab] = useState<TabType>('builtin');
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites());

  // Get traders from TraderManager
  const traders = useTraderManager();

  // Debounce search for performance
  const debouncedQuery = useDebouncedValue(filterQuery, 300);

  // Filter and segment - memoized for performance
  const filteredTraders = useMemo(
    () => filterTraders(traders, debouncedQuery),
    [traders, debouncedQuery]
  );

  const segmentedData = useMemo(
    () => segmentTraders(filteredTraders, favorites),
    [filteredTraders, favorites]
  );

  // Calculate tab counts for badges
  const tabCounts = useMemo(
    () => ({
      builtin: segmentedData.builtin.length,
      personal: segmentedData.personal.length,
      favorites: segmentedData.favorites.length
    }),
    [segmentedData]
  );

  // ... rest of component
}
```

**Why Not Redux/Context?**
- Current app doesn't use global state management
- This state is sidebar-specific, doesn't need to be shared
- React state + useMemo is sufficient for this scope
- Keeps architecture simple and maintainable

**Performance Optimizations:**
1. **Memoization**: Filter/group computations only run when dependencies change
2. **Debouncing**: Search input debounced to 300ms to prevent excessive re-renders
3. **React.memo**: ExpandableSignalCard wrapped in memo to prevent unnecessary re-renders
4. **Set for expandedIds**: O(1) lookup for expansion state
5. **CSS visibility**: Keep all tabs mounted, toggle with `display: none` for instant switching

### Migration Strategy

#### Phase 1: Foundation (Low Risk - 1 day)
**Goal**: Replace StatusBar with clean header, establish new structure

1. Create `SidebarHeader.tsx` component
   - Extract logo from StatusBar
   - Clean design: py-4, border-bottom
   - Add optional compact metrics badge

2. Update `Sidebar.tsx`
   - Replace `<StatusBar/>` with `<SidebarHeader/>`
   - Temporarily show metrics in compact format
   - No functionality changes yet

3. Test & Deploy
   - Verify real-time metrics still work
   - Check mobile responsiveness
   - Get user feedback on header design

**Rollback**: Simple - revert to StatusBar if issues

#### Phase 2: Navigation Layer (Medium Risk - 1-2 days)
**Goal**: Add tabs and search without changing signal display

1. Add `FilterInput` above signal list
   - Implement search filtering
   - Add debouncing (300ms)

2. Add `TabBar` component
   - Three tabs: Built-in | Personal | Favorites
   - Show counts in badges

3. Add tab filtering logic
   - Filter traders by active tab
   - Keep using existing `SignalListItem` (no ExpandableCard yet)

4. Add favorites functionality
   - Heart icon to mark favorites
   - Store in localStorage
   - Show in Favorites tab

5. Test & Deploy
   - Verify filtering works across tabs
   - Check search performance with 100+ signals
   - Ensure real-time updates work with filters

**Rollback**: Feature flag to hide tabs/search, show simple list

#### Phase 3: Rich Display (High Risk - 2 days)
**Goal**: Replace SignalListItem with ExpandableSignalCard

1. Enhance `ExpandableSignalCard.tsx`
   - Add production features (error handling, loading states)
   - Connect to activityTracker
   - Optimize with React.memo

2. Create `SignalContent.tsx` wrapper
   - Manages tab content rendering
   - Handles expansion state
   - Groups built-in signals by category

3. Add `CategoryHeader.tsx` for grouping

4. Gradual rollout (A/B test or feature flag)
   - 10% of users see expandable cards
   - Monitor performance metrics
   - Gather feedback

5. Full deployment if metrics good
   - Expand to 100% of users
   - Remove SignalListItem if successful

**Rollback**: Feature flag to revert to SignalListItem

#### Phase 4: Polish & Optimization (1 day)
**Goal**: Performance and UX improvements

1. Add virtualization if needed (react-window)
2. Persist expansion state to localStorage
3. Sync favorites to Supabase
4. Add keyboard shortcuts (Ctrl+1/2/3 for tabs)
5. Optimize for mobile

### Testing Strategy

#### Unit Tests

**SidebarHeader.tsx**
```typescript
describe('SidebarHeader', () => {
  it('renders logo and app name', () => { ... });
  it('shows metrics badge when enabled', () => { ... });
  it('displays connection status correctly', () => { ... });
});
```

**SignalContent.tsx**
```typescript
describe('SignalContent', () => {
  it('filters signals by search query', () => { ... });
  it('segments signals by active tab', () => { ... });
  it('groups built-in signals by category', () => { ... });
  it('handles empty states for each tab', () => { ... });
  it('manages expansion state correctly', () => { ... });
});
```

**TabBar Component**
```typescript
describe('TabBar', () => {
  it('switches tabs on click', () => { ... });
  it('shows correct counts in badges', () => { ... });
  it('highlights active tab', () => { ... });
});
```

**FilterInput Component**
```typescript
describe('FilterInput', () => {
  it('debounces input by 300ms', () => { ... });
  it('clears on Escape key', () => { ... });
  it('focuses on / key', () => { ... });
});
```

#### Integration Tests

**Tab + Filter Combinations**
```typescript
describe('Tab and Filter Integration', () => {
  it('filters within active tab only', () => { ... });
  it('persists filter when switching tabs', () => { ... });
  it('updates counts when filter changes', () => { ... });
  it('shows empty state when filter returns no results', () => { ... });
});
```

**Real-Time Updates**
```typescript
describe('Real-Time Data Flow', () => {
  it('updates signal list when WebSocket data arrives', () => { ... });
  it('maintains filter when data updates', () => { ... });
  it('maintains expansion state during updates', () => { ... });
  it('updates activity badges in real-time', () => { ... });
});
```

**Expansion State**
```typescript
describe('Card Expansion', () => {
  it('expands card on click', () => { ... });
  it('collapses card on second click', () => { ... });
  it('maintains expansion across tab switches', () => { ... });
  it('handles multiple expanded cards', () => { ... });
});
```

#### Performance Tests

**Rendering Performance**
```typescript
describe('Performance', () => {
  it('renders 100+ signals in < 100ms', () => { ... });
  it('filter response time < 50ms', () => { ... });
  it('tab switch < 50ms', () => { ... });
  it('scroll performance with expanded cards acceptable', () => { ... });
  it('memory usage stable over 1 hour session', () => { ... });
});
```

**Debouncing**
```typescript
describe('Search Debouncing', () => {
  it('waits 300ms before filtering', () => { ... });
  it('cancels previous filter on new input', () => { ... });
  it('filters immediately on paste', () => { ... });
});
```

#### User Acceptance Testing

**Navigation**
- [ ] Can users find built-in signals easily?
- [ ] Is tab switching intuitive?
- [ ] Does search work as expected?
- [ ] Can users mark/unmark favorites easily?

**Information Visibility**
- [ ] Is connection status visible enough? (without StatusBar)
- [ ] Can users see signal details without expanding?
- [ ] Is category grouping helpful or confusing?
- [ ] Are activity states (Triggered, Watching) clear?

**Mobile Experience**
- [ ] Do tabs work well on small screens?
- [ ] Is search usable on mobile?
- [ ] Do expanded cards work on mobile?
- [ ] Can users scroll smoothly?

**Accessibility**
- [ ] Keyboard navigation works (Tab, Enter, Arrow keys)
- [ ] Screen readers announce tab changes
- [ ] Focus management correct (search, tabs, cards)
- [ ] Color contrast meets WCAG standards

### Performance Considerations

#### Optimization Techniques

**1. Memoization**
```typescript
// Memoize expensive computations
const filteredTraders = useMemo(
  () => filterTraders(traders, debouncedQuery),
  [traders, debouncedQuery]
);

const segmentedData = useMemo(
  () => segmentTraders(filteredTraders, favorites),
  [filteredTraders, favorites]
);
```

**2. React.memo for Components**
```typescript
export const ExpandableSignalCard = React.memo<ExpandableSignalCardProps>(
  ({ signal, isExpanded, ... }) => {
    // Component implementation
  },
  (prevProps, nextProps) => {
    // Custom comparison for shallow equality
    return (
      prevProps.signal.id === nextProps.signal.id &&
      prevProps.isExpanded === nextProps.isExpanded &&
      prevProps.signal.enabled === nextProps.signal.enabled &&
      prevProps.signal.metrics?.totalSignals === nextProps.signal.metrics?.totalSignals
    );
  }
);
```

**3. Debouncing Search**
```typescript
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
```

**4. Virtualization (if needed)**
```typescript
import { VariableSizeList as List } from 'react-window';

// Use for lists > 50 items
<List
  height={600}
  itemCount={signals.length}
  itemSize={index => expandedIds.has(signals[index].id) ? 300 : 60}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <ExpandableSignalCard signal={signals[index]} ... />
    </div>
  )}
</List>
```

**5. CSS Performance**
```css
/* Use CSS for tab visibility instead of unmounting */
.tab-content {
  display: none; /* Hidden tabs */
}

.tab-content.active {
  display: block; /* Active tab */
}

/* Hardware acceleration for expand animation */
.expandable-card {
  transform: translateZ(0);
  will-change: max-height;
  transition: max-height 0.2s ease-out;
}
```

#### Performance Targets

| Metric | Target | Current | Notes |
|--------|--------|---------|-------|
| Initial render | < 100ms | ~50ms | With 100 signals |
| Filter response | < 50ms | N/A | After 300ms debounce |
| Tab switch | < 50ms | N/A | Using CSS visibility |
| Expand card | < 200ms | N/A | Smooth animation |
| Scroll FPS | 60 fps | 60 fps | Maintain with expanded cards |
| Memory usage | < 200 MB | ~150 MB | Over 1 hour session |

### Deployment Considerations

#### Feature Flags

```typescript
// Feature flag configuration
interface FeatureFlags {
  newSidebarLayout: boolean; // Overall feature flag
  showExpandableCards: boolean; // Gradual rollout of rich cards
  showMetricsInHeader: boolean; // A/B test metrics location
  enableVirtualization: boolean; // Performance optimization
}

// Usage in Sidebar.tsx
const flags = useFeatureFlags();

{flags.showExpandableCards ? (
  <ExpandableSignalCard ... />
) : (
  <SignalListItem ... />
)}
```

#### Rollout Strategy

**Week 1: Alpha (Internal Testing)**
- Deploy to staging environment
- Team testing with real data
- Performance monitoring
- Bug fixes

**Week 2: Beta (10% of Users)**
- Feature flag enabled for 10%
- Monitor metrics: render time, error rate, engagement
- Collect user feedback
- Fix critical issues

**Week 3: Gradual Rollout (50%)**
- Increase to 50% if metrics good
- Continue monitoring
- Refine based on feedback

**Week 4: Full Rollout (100%)**
- Enable for all users
- Monitor for issues
- Keep feature flag for quick rollback if needed

#### Rollback Plan

**Immediate Rollback (< 5 minutes)**
```bash
# Disable feature flag
supabase secrets set FEATURE_NEW_SIDEBAR=false

# Or deploy previous version
git revert <commit-hash>
pnpm build
# Deploy
```

**Conditions for Rollback**
- Error rate > 1%
- Performance degradation > 20%
- Critical bug discovered
- User complaints > 10% of feedback

#### Monitoring & Success Metrics

**Technical Metrics**
- Page load time: < 100ms
- Error rate: < 0.1%
- CPU usage: < 50%
- Memory usage: < 200 MB
- API calls: No increase (client-side only)

**User Engagement Metrics**
- Tab usage: Do users use all tabs?
- Search usage: How often is search used?
- Expansion rate: Do users expand cards?
- Favorites: How many favorites per user?
- Session duration: Does it increase/decrease?

**User Satisfaction Metrics**
- User feedback score (1-5): Target > 4.0
- Feature adoption rate: Target > 80%
- Complaints: Target < 5%

### Open Questions & Decisions Needed

#### Critical Blockers (Must Resolve Before Implementation)

**1. Metrics Placement** ⚠️ BLOCKER
- **Question**: Where should WebSocket metrics go after removing StatusBar?
- **Options**:
  - A: Compact badge in SidebarHeader (always visible)
  - B: Floating indicator in main content area
  - C: Bottom of sidebar (always visible)
  - D: Hidden, show on hover/menu
- **Impact**: High - users rely on connection status for confidence
- **Recommendation**: Option A (compact badge) or C (bottom of sidebar)

**2. User Menu Location** ⚠️ BLOCKER
- **Question**: Keep in sidebar bottom or move to main content?
- **Current**: Bottom of sidebar with tier display
- **Style Guide**: Shows in main content top-right
- **Trade-off**: Pure navigation vs. convenient access
- **Recommendation**: Keep in sidebar for consistency with current UX

**3. Rollout Strategy** ⚠️ BLOCKER
- **Question**: How to introduce this major UI change?
- **Options**:
  - A: Feature flag with gradual rollout (10% → 50% → 100%)
  - B: Beta program with opt-in
  - C: Phased release (header → tabs → cards)
- **Recommendation**: Option C (phased) for lowest risk

#### Important Decisions (Should Resolve Before Implementation)

**4. Dense vs. Expandable Cards**
- **Question**: Always use expandable cards or make it configurable?
- **Trade-off**: UX richness vs. information density
- **Recommendation**: Start with expandable cards, add view toggle later if requested

**5. Virtualization**
- **Question**: Implement virtualization from the start or wait for performance issues?
- **Trade-off**: Complexity vs. performance
- **Recommendation**: Wait - implement if > 100 signals cause lag

**6. Mobile Strategy**
- **Question**: Full feature parity on mobile or simplified?
- **Options**:
  - A: Full parity (tabs, search, expandable cards)
  - B: Simplified (single list, basic search)
  - C: Responsive (tabs collapse to dropdown)
- **Recommendation**: Option C (responsive design)

### Architecture Summary

This architecture transformation converts a simple list-based sidebar into a sophisticated navigation system with:

**New Capabilities:**
1. **Three-tab navigation**: Built-in | Personal | Favorites
2. **Search/filter**: Find signals quickly
3. **Category grouping**: Organize built-in signals
4. **Rich display**: Expandable cards with detailed info
5. **Favorites system**: Mark/unmark favorites

**Technical Approach:**
- **Component-based**: Modular, reusable components
- **React state + useMemo**: Simple, performant state management
- **Phased rollout**: Low-risk incremental deployment
- **Feature flags**: Quick rollback capability
- **Performance-first**: Debouncing, memoization, React.memo

**Risk Mitigation:**
- **Phased deployment**: Test each phase before next
- **Feature flags**: Easy rollback if issues
- **Monitoring**: Track performance and user satisfaction
- **Existing services**: No backend changes needed

**Timeline:**
- Phase 1 (Header): 1 day
- Phase 2 (Tabs/Search): 1-2 days
- Phase 3 (Expandable Cards): 2 days
- Phase 4 (Polish): 1 day
- **Total**: 5-6 days + testing

**Blockers**: Resolve metrics placement and user menu location before starting implementation.

---
*Status: ✅ ARCHITECTURE COMPLETE - Ready for /plan after blockers resolved*
*Next: Resolve 3 critical blockers, then /plan issues/2025-01-08-design-sidebar-layout-implementation.md*

---

## Implementation Plan
*Stage: planning | Date: 2025-01-08*

### Overview

Transform the production sidebar from a simple list-based design to a sophisticated navigation system with three-tab organization (Built-in | Personal | Favorites), search/filter functionality, and rich expandable signal cards. Implementation follows a **micro-increment approach** where each task is independently testable in the running app, allowing continuous validation and immediate rollback if needed.

**Key Strategy**: Build in tiny, testable chunks (15-30 min each) that can be verified in the browser immediately after each change.

### Prerequisites

- [x] Architecture document complete
- [ ] **CRITICAL BLOCKER**: PM decision on metrics placement (where to show connection status/update frequency)
- [ ] **CRITICAL BLOCKER**: PM decision on user menu location (sidebar vs main content)
- [ ] **CRITICAL BLOCKER**: PM decision on rollout strategy (phased vs feature flag)
- [ ] Development environment running (`pnpm dev`)
- [ ] Create feature branch: `git checkout -b feature/sidebar-redesign`
- [ ] Style guide reference loaded at `/style-guide-supabase`

**⚠️ DO NOT BEGIN IMPLEMENTATION UNTIL ALL 3 BLOCKERS RESOLVED**

### Implementation Phases

---

#### Phase 0: Mockup/Prototype Review (30 min - ALREADY COMPLETE)
**Objective:** Validate UX approach before full implementation

✅ **Complete**: StyleGuideSupabase.tsx already serves as interactive mockup
- Available at `/style-guide-supabase` route
- Shows all target UI states (tabs, search, expandable cards, category grouping)
- Demonstrates responsive behavior
- Includes activity states (Triggered, Watching, In trade)

**PM has approved style guide as target design** ✅

**Phase 0 Complete**: Ready to implement in production

---

#### Phase 1: Foundation - Utility Functions & Hooks (2 hours)
**Objective:** Build reusable logic without touching UI yet

##### Task 1.1: Create useDebouncedValue hook (15 min)

**Files to create:**
- `apps/app/src/hooks/useDebouncedValue.ts`

**Actions:**
- [ ] Create hook with TypeScript generics
- [ ] Implement 300ms debounce with setTimeout
- [ ] Handle cleanup on unmount
- [ ] Export hook

**Code to write:**
```typescript
import { useState, useEffect } from 'react';

export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}
```

**Test criteria:**
- [ ] TypeScript compiles without errors
- [ ] Hook exports successfully
- [ ] No console errors when importing

**How to test:**
```bash
pnpm build
# Should compile successfully
```

**Checkpoint:** ✅ Hook created and compiles

---

##### Task 1.2: Create filtering utility functions (20 min)

**Files to create:**
- `apps/app/src/utils/signalFilters.ts`

**Actions:**
- [ ] Create `filterTraders()` function
- [ ] Create `segmentTraders()` function
- [ ] Create `groupByCategory()` function
- [ ] Add TypeScript interfaces
- [ ] Export all functions

**Code to write:**
```typescript
import { Trader } from '../abstractions/trader.interfaces';

export interface GroupedSignals {
  [category: string]: Trader[];
}

export interface SegmentedData {
  builtin: GroupedSignals;
  personal: Trader[];
  favorites: Trader[];
}

export function filterTraders(traders: Trader[], query: string): Trader[] {
  if (!query.trim()) return traders;

  const lowerQuery = query.toLowerCase();
  return traders.filter(trader =>
    trader.name.toLowerCase().includes(lowerQuery) ||
    trader.description?.toLowerCase().includes(lowerQuery) ||
    trader.category?.toLowerCase().includes(lowerQuery)
  );
}

export function segmentTraders(
  traders: Trader[],
  favorites: Set<string>
): SegmentedData {
  const builtin = traders.filter(t => t.isBuiltIn);
  const personal = traders.filter(t => !t.isBuiltIn);
  const favoriteList = traders.filter(t => favorites.has(t.id));

  return {
    builtin: groupByCategory(builtin),
    personal,
    favorites: favoriteList
  };
}

export function groupByCategory(traders: Trader[]): GroupedSignals {
  return traders.reduce((groups, trader) => {
    const category = trader.category || 'Other';
    if (!groups[category]) groups[category] = [];
    groups[category].push(trader);
    return groups;
  }, {} as GroupedSignals);
}
```

**Test criteria:**
- [ ] Functions compile without errors
- [ ] Export works correctly
- [ ] No runtime errors

**How to test:**
```bash
pnpm build
# Verify no TypeScript errors
```

**Checkpoint:** ✅ Filter utilities ready

---

##### Task 1.3: Create favorites management utility (20 min)

**Files to create:**
- `apps/app/src/utils/favoritesStorage.ts`

**Actions:**
- [ ] Create `loadFavorites()` function
- [ ] Create `saveFavorites()` function
- [ ] Handle localStorage errors gracefully
- [ ] Add TypeScript types

**Code to write:**
```typescript
const FAVORITES_KEY = 'vyx_signal_favorites';

export function loadFavorites(): Set<string> {
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    if (!stored) return new Set();

    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch (error) {
    console.warn('[Favorites] Failed to load favorites:', error);
    return new Set();
  }
}

export function saveFavorites(favorites: Set<string>): void {
  try {
    const array = Array.from(favorites);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(array));
  } catch (error) {
    console.warn('[Favorites] Failed to save favorites:', error);
  }
}

export function toggleFavorite(
  favorites: Set<string>,
  traderId: string
): Set<string> {
  const newFavorites = new Set(favorites);
  if (newFavorites.has(traderId)) {
    newFavorites.delete(traderId);
  } else {
    newFavorites.add(traderId);
  }
  saveFavorites(newFavorites);
  return newFavorites;
}
```

**Test criteria:**
- [ ] Functions compile
- [ ] localStorage operations don't throw
- [ ] Handles missing localStorage gracefully

**How to test:**
```bash
pnpm build
# Test in browser console:
# > import { loadFavorites } from './utils/favoritesStorage'
# > loadFavorites()
```

**Checkpoint:** ✅ Favorites management ready

---

##### Task 1.4: Move style guide components to production (30 min)

**Files to move/copy:**
- `apps/app/src/components/TabBar.tsx` (from style guide)
- `apps/app/src/components/FilterInput.tsx` (from style guide)
- `apps/app/src/components/CategoryHeader.tsx` (from style guide)

**Actions:**
- [ ] Copy TabBar.tsx to production components
- [ ] Copy FilterInput.tsx (already exists, verify it's identical)
- [ ] Copy CategoryHeader.tsx to production components
- [ ] Update imports to use production paths
- [ ] Verify no theme conflicts (Supabase vs Neon Terminal variables)

**Test criteria:**
- [ ] All components compile
- [ ] No import errors
- [ ] Theme variables resolve correctly

**How to test:**
```bash
pnpm build
# Verify all files compile
# Check no "Cannot find module" errors
```

**Checkpoint:** ✅ Components ready for integration

---

**Phase 1 Complete When:**
- [x] All utility functions created and tested
- [x] All hooks working
- [x] All components copied and compiling
- [x] No TypeScript errors
- [x] No runtime errors when importing

**Total Phase 1 Time:** ~2 hours

---

#### Phase 2: Header Transformation (1.5 hours)
**Objective:** Replace StatusBar with clean header WITHOUT breaking real-time metrics

##### Task 2.1: Create SidebarHeader component (30 min)

**Files to create:**
- `apps/app/src/components/SidebarHeader.tsx`

**Actions:**
- [ ] Create component with logo + app name
- [ ] Add optional metrics badge prop
- [ ] Use Tailwind classes matching style guide
- [ ] Make it responsive

**Code to write:**
```typescript
import React from 'react';
import { Wifi, WifiOff, Activity } from 'lucide-react';

interface SidebarHeaderProps {
  showMetrics?: boolean;
  connectionStatus?: 'connected' | 'disconnected' | 'reconnecting';
  updateFrequency?: number;
}

export function SidebarHeader({
  showMetrics = false,
  connectionStatus = 'connected',
  updateFrequency = 0
}: SidebarHeaderProps) {
  const getConnectionConfig = () => {
    switch (connectionStatus) {
      case 'connected':
        return { icon: Wifi, color: 'text-green-500', label: 'Live' };
      case 'reconnecting':
        return { icon: Wifi, color: 'text-yellow-500', label: 'Reconnecting' };
      case 'disconnected':
        return { icon: WifiOff, color: 'text-red-500', label: 'Offline' };
    }
  };

  const config = getConnectionConfig();
  const ConnectionIcon = config.icon;

  return (
    <div className="px-4 py-4 border-b border-border">
      <div className="flex items-center justify-between">
        {/* Logo + Name */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary-foreground">
              <path d="M13 12L20 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M4 5L8 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <path d="M8 15L4 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-lg">vyx</span>
        </div>

        {/* Optional Metrics Badge */}
        {showMetrics && (
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <Activity className="w-3 h-3" />
              <span>{updateFrequency}/s</span>
            </div>
            <div className="flex items-center gap-1">
              <ConnectionIcon className={`w-3 h-3 ${config.color}`} />
              <span className={config.color}>{config.label}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Test criteria:**
- [ ] Component renders without errors
- [ ] Logo displays correctly
- [ ] Metrics badge toggles with showMetrics prop
- [ ] Connection status colors work

**How to test:**
1. Build: `pnpm build`
2. **CRITICAL**: Do NOT integrate yet - just verify it compiles
3. Create test file if needed to render component in isolation

**Checkpoint:** ✅ Header component created

---

##### Task 2.2: Add SidebarHeader to Sidebar (TEMPORARY - both headers) (20 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Import SidebarHeader
- [ ] Add ABOVE StatusBar temporarily (so we have BOTH)
- [ ] Pass showMetrics=true and real metrics
- [ ] Leave StatusBar intact for now

**Code to add:**
```typescript
// At top of file
import { SidebarHeader } from '../src/components/SidebarHeader';

// In JSX, BEFORE <StatusBar/>
<SidebarHeader
  showMetrics={true}
  connectionStatus={connectionStatus}
  updateFrequency={metrics.updateFrequency}
/>
```

**Test criteria:**
- [ ] App loads without errors
- [ ] Both headers visible (old StatusBar + new SidebarHeader)
- [ ] Real-time metrics update in both
- [ ] No layout breaking

**How to test:**
1. Build: `pnpm build`
2. Start dev server (if not running): `pnpm dev`
3. Open app in browser
4. **Verify**: See TWO headers (new clean one + old StatusBar)
5. **Verify**: Connection status updates in both
6. **Verify**: Update frequency counts in both

**Checkpoint:** ✅ New header added alongside old one

---

##### Task 2.3: Remove StatusBar (20 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Comment out `<StatusBar/>` (don't delete yet - for easy rollback)
- [ ] Verify layout still works
- [ ] Verify metrics still visible

**Test criteria:**
- [ ] App loads without errors
- [ ] Only new header visible
- [ ] Metrics still updating
- [ ] No broken styles

**How to test:**
1. Build: `pnpm build`
2. Refresh browser
3. **Verify**: Only ONE header (clean design)
4. **Verify**: Metrics badge shows connection status
5. **Verify**: Can still see update frequency
6. **If broken**: Uncomment StatusBar and debug

**Checkpoint:** ✅ StatusBar removed, new header working

---

##### Task 2.4: Optional - Move metrics to bottom of sidebar (if PM decides) (20 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`
- `apps/app/src/components/SidebarHeader.tsx`

**Actions (only if PM chooses "bottom" option):**
- [ ] Set `showMetrics={false}` in SidebarHeader
- [ ] Create new `<MetricsFooter/>` component
- [ ] Add before user menu at bottom
- [ ] Pass same metrics props

**Test criteria:**
- [ ] Metrics visible at bottom
- [ ] No layout shift
- [ ] Still updates in real-time

**Checkpoint:** ✅ Metrics relocated (if applicable)

---

**Phase 2 Complete When:**
- [x] SidebarHeader component working
- [x] StatusBar replaced
- [x] Metrics still visible and updating
- [x] No layout issues
- [x] App stable and usable

**PM Checkpoint Required:** ✅ Approve header design before Phase 3

**Total Phase 2 Time:** ~1.5 hours

---

#### Phase 3: Tab System (2 hours)
**Objective:** Add three-tab navigation WITHOUT changing signal display yet

##### Task 3.1: Add tab state to Sidebar (15 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Add `activeTab` state
- [ ] Add type: `type TabType = 'builtin' | 'personal' | 'favorites'`
- [ ] Initialize to 'builtin'

**Code to add:**
```typescript
type TabType = 'builtin' | 'personal' | 'favorites';
const [activeTab, setActiveTab] = useState<TabType>('builtin');
```

**Test criteria:**
- [ ] Compiles without errors
- [ ] App still loads
- [ ] No visual change yet

**How to test:**
```bash
pnpm build && pnpm dev
# App should load unchanged
```

**Checkpoint:** ✅ Tab state added

---

##### Task 3.2: Add TabBar component (15 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Import TabBar component
- [ ] Add ABOVE TraderList (but below Create button)
- [ ] Pass activeTab and setActiveTab
- [ ] Calculate counts (builtin/personal/favorites)

**Code to add:**
```typescript
import { TabBar } from '../src/components/TabBar';

// Calculate counts
const builtinCount = traders.filter(t => t.isBuiltIn).length;
const personalCount = traders.filter(t => !t.isBuiltIn).length;
const favoritesCount = 0; // Will implement favorites next

// In JSX, after CreateSignalButton, before TraderList
<div className="px-4 mb-4">
  <TabBar
    tabs={[
      { id: 'builtin', label: 'Built-in', count: builtinCount },
      { id: 'personal', label: 'Personal', count: personalCount },
      { id: 'favorites', label: 'Favorites', count: favoritesCount }
    ]}
    activeTab={activeTab}
    onTabChange={(tab) => setActiveTab(tab as TabType)}
  />
</div>
```

**Test criteria:**
- [ ] Tabs visible
- [ ] Counts display correctly
- [ ] Active tab highlighted
- [ ] Click changes active tab (verify in React DevTools)

**How to test:**
1. Build and refresh
2. **Verify**: See three tabs (Built-in | Personal | Favorites)
3. **Verify**: Built-in count matches number of built-in signals
4. **Verify**: Active tab has underline
5. Click Personal tab -> verify active state changes

**Checkpoint:** ✅ Tabs visible and clickable

---

##### Task 3.3: Filter TraderList by active tab (30 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Add useMemo to filter traders by active tab
- [ ] Pass filtered traders to TraderList
- [ ] Keep using existing SignalListItem (no expandable cards yet)

**Code to add:**
```typescript
import { useMemo } from 'react';

// Filter traders based on active tab
const displayedTraders = useMemo(() => {
  switch (activeTab) {
    case 'builtin':
      return traders.filter(t => t.isBuiltIn);
    case 'personal':
      return traders.filter(t => !t.isBuiltIn);
    case 'favorites':
      // TODO: Will implement favorites next
      return [];
    default:
      return traders;
  }
}, [traders, activeTab]);
```

**Then modify TraderList to accept filtered list:**
- Current: TraderList filters internally
- Change: Pass `traders={displayedTraders}` prop

**Test criteria:**
- [ ] Built-in tab shows only built-in signals
- [ ] Personal tab shows only custom traders
- [ ] Switching tabs updates list immediately
- [ ] Real-time updates still work in all tabs

**How to test:**
1. Build and refresh
2. **On Built-in tab**: Count signals -> should match built-in signals
3. **Click Personal tab**: List changes -> should show custom traders (if any)
4. **Click back to Built-in**: List changes back
5. **Enable/disable a signal**: Verify it stays in correct tab

**Checkpoint:** ✅ Tab filtering working

---

##### Task 3.4: Add favorites state and toggle (30 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Add favorites state using favoritesStorage utility
- [ ] Add toggleFavorite handler
- [ ] Pass to TraderList
- [ ] Update favorites count

**Code to add:**
```typescript
import { loadFavorites, toggleFavorite } from '../src/utils/favoritesStorage';

// State
const [favorites, setFavorites] = useState<Set<string>>(loadFavorites());

// Handler
const handleToggleFavorite = useCallback((traderId: string) => {
  setFavorites(prev => toggleFavorite(prev, traderId));
}, []);

// Update favorites tab filter
case 'favorites':
  return traders.filter(t => favorites.has(t.id));

// Update favorites count
const favoritesCount = favorites.size;
```

**Modify TraderList to show favorite icon:**
- Add favorite prop to SignalListItem
- Show star icon if favorited
- Click star to toggle

**Test criteria:**
- [ ] Can mark signal as favorite
- [ ] Favorite persists after refresh
- [ ] Favorites tab shows only favorited signals
- [ ] Count updates when adding/removing favorites

**How to test:**
1. Build and refresh
2. **Click star icon** on a signal
3. **Verify**: Star turns gold/filled
4. **Click Favorites tab**: Signal appears
5. **Refresh page**: Favorite still marked
6. **Remove favorite**: Verify it leaves Favorites tab

**Checkpoint:** ✅ Favorites working

---

**Phase 3 Complete When:**
- [x] Tabs visible and functional
- [x] Tab filtering works correctly
- [x] Favorites system implemented
- [x] Real-time updates work in all tabs
- [x] No performance issues

**PM Checkpoint Required:** ✅ Verify tab navigation intuitive

**Total Phase 3 Time:** ~2 hours

---

#### Phase 4: Search/Filter (1 hour)
**Objective:** Add search functionality across all tabs

##### Task 4.1: Add search state (15 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Add `filterQuery` state
- [ ] Add `debouncedQuery` using useDebouncedValue hook
- [ ] Import filterTraders utility

**Code to add:**
```typescript
import { useDebouncedValue } from '../src/hooks/useDebouncedValue';
import { filterTraders } from '../src/utils/signalFilters';

const [filterQuery, setFilterQuery] = useState('');
const debouncedQuery = useDebouncedValue(filterQuery, 300);
```

**Test criteria:**
- [ ] Compiles without errors
- [ ] No visual change yet

**Checkpoint:** ✅ Search state ready

---

##### Task 4.2: Add FilterInput component (15 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Import FilterInput
- [ ] Add ABOVE TabBar
- [ ] Wire up filterQuery state

**Code to add:**
```typescript
import { FilterInput } from '../src/components/FilterInput';

// In JSX, after Create button, before TabBar
<div className="px-4 mb-2">
  <FilterInput
    value={filterQuery}
    onChange={setFilterQuery}
    placeholder="Search..."
  />
</div>
```

**Test criteria:**
- [ ] Search box visible
- [ ] Typing works
- [ ] Placeholder shows "Search..."

**How to test:**
1. Build and refresh
2. **Verify**: Search input visible above tabs
3. **Type something**: Input responds
4. **Press Esc**: Clears input (FilterInput has built-in shortcut)

**Checkpoint:** ✅ Search input visible

---

##### Task 4.3: Apply search filter (20 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Update displayedTraders useMemo to apply search filter
- [ ] Filter AFTER tab segmentation
- [ ] Use filterTraders utility

**Code to modify:**
```typescript
const displayedTraders = useMemo(() => {
  // First, filter by tab
  let filtered: Trader[];
  switch (activeTab) {
    case 'builtin':
      filtered = traders.filter(t => t.isBuiltIn);
      break;
    case 'personal':
      filtered = traders.filter(t => !t.isBuiltIn);
      break;
    case 'favorites':
      filtered = traders.filter(t => favorites.has(t.id));
      break;
    default:
      filtered = traders;
  }

  // Then, apply search filter
  return filterTraders(filtered, debouncedQuery);
}, [traders, activeTab, favorites, debouncedQuery]);
```

**Test criteria:**
- [ ] Typing filters signals in real-time (after 300ms debounce)
- [ ] Search works within active tab
- [ ] Clearing search shows all signals in tab
- [ ] Search is case-insensitive

**How to test:**
1. Build and refresh
2. **On Built-in tab, type "breakout"**: Only breakout signals show
3. **Type "momentum"**: List updates
4. **Clear search**: All built-in signals back
5. **Switch to Personal tab**: Search persists, filters personal signals
6. **Type gibberish**: Empty state shows

**Checkpoint:** ✅ Search filtering working

---

##### Task 4.4: Add empty state (10 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx` or `TraderList.tsx`

**Actions:**
- [ ] Show message when displayedTraders is empty
- [ ] Differentiate between "no signals" vs "no results"

**Code to add in TraderList:**
```typescript
if (displayedTraders.length === 0) {
  return (
    <div className="px-4 py-8 text-center text-muted-foreground">
      {filterQuery ? (
        <>
          <p className="text-sm">No signals match "{filterQuery}"</p>
          <p className="text-xs mt-1">Try a different search term</p>
        </>
      ) : (
        <p className="text-sm">No signals in this tab</p>
      )}
    </div>
  );
}
```

**Test criteria:**
- [ ] Empty state shows when no matches
- [ ] Different message for search vs no signals
- [ ] Styling matches app theme

**How to test:**
1. **Search for gibberish**: See "No signals match..." message
2. **Go to Favorites tab (if empty)**: See "No signals in this tab"

**Checkpoint:** ✅ Empty states handled

---

**Phase 4 Complete When:**
- [x] Search input working
- [x] Debouncing prevents lag
- [x] Filters within active tab
- [x] Empty states friendly
- [x] No performance issues with 100+ signals

**Total Phase 4 Time:** ~1 hour

---

#### Phase 5: Expandable Cards (2.5 hours)
**Objective:** Replace SignalListItem with ExpandableSignalCard

##### Task 5.1: Add expansion state (15 min)

**Files to modify:**
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Add `expandedCardIds` state as Set<string>
- [ ] Add toggle handler

**Code to add:**
```typescript
const [expandedCardIds, setExpandedCardIds] = useState<Set<string>>(new Set());

const handleToggleExpand = useCallback((traderId: string) => {
  setExpandedCardIds(prev => {
    const next = new Set(prev);
    if (next.has(traderId)) {
      next.delete(traderId);
    } else {
      next.add(traderId);
    }
    return next;
  });
}, []);
```

**Test criteria:**
- [ ] Compiles without errors
- [ ] No visual change yet

**Checkpoint:** ✅ Expansion state ready

---

##### Task 5.2: Enhance ExpandableSignalCard for production (45 min)

**Files to modify:**
- `apps/app/src/components/ExpandableSignalCard.tsx`

**Actions:**
- [ ] Wrap with React.memo for performance
- [ ] Connect to activityTracker for real-time state
- [ ] Add proper error handling
- [ ] Ensure works with cloud execution status

**Code to modify:**
```typescript
import React from 'react';
import { activityTracker } from '../services/activityTracker';

export const ExpandableSignalCard = React.memo<ExpandableSignalCardProps>(
  (props) => {
    const { signal, isExpanded, onToggleExpand, ... } = props;

    // Get real-time activity state
    const activityState = activityTracker.getActivityState(signal.id);

    // Existing component logic...

  },
  // Custom comparison to prevent unnecessary re-renders
  (prevProps, nextProps) => {
    return (
      prevProps.signal.id === nextProps.signal.id &&
      prevProps.isExpanded === nextProps.isExpanded &&
      prevProps.signal.enabled === nextProps.signal.enabled &&
      prevProps.signal.metrics?.totalSignals === nextProps.signal.metrics?.totalSignals
    );
  }
);

ExpandableSignalCard.displayName = 'ExpandableSignalCard';
```

**Test criteria:**
- [ ] Component memoized correctly
- [ ] Activity states update (Triggered, Watching)
- [ ] No unnecessary re-renders
- [ ] Performance acceptable with many cards

**How to test:**
1. Build: `pnpm build`
2. Open React DevTools Profiler
3. Enable/disable a signal -> only that card re-renders
4. Check activity state updates in real-time

**Checkpoint:** ✅ ExpandableSignalCard production-ready

---

##### Task 5.3: Add ExpandableSignalCard alongside SignalListItem (30 min)

**Files to modify:**
- `apps/app/src/components/TraderList.tsx`

**Actions:**
- [ ] Import ExpandableSignalCard
- [ ] Add temporary feature flag or prop to toggle views
- [ ] Render BOTH components for testing
- [ ] Pass expansion state

**Code to add:**
```typescript
import { ExpandableSignalCard } from './ExpandableSignalCard';

interface TraderListProps {
  // ... existing props ...
  useExpandableCards?: boolean; // Temporary flag
  expandedCardIds?: Set<string>;
  onToggleExpand?: (id: string) => void;
  favorites?: Set<string>;
  onToggleFavorite?: (id: string) => void;
}

// In render:
{useExpandableCards ? (
  <ExpandableSignalCard
    signal={trader}
    isExpanded={expandedCardIds?.has(trader.id) || false}
    onToggleExpand={() => onToggleExpand?.(trader.id)}
    isFavorite={favorites?.has(trader.id) || false}
    onToggleFavorite={() => onToggleFavorite?.(trader.id)}
    // ... other props
  />
) : (
  <SignalListItem
    // existing props
  />
)}
```

**Test criteria:**
- [ ] Can toggle between views
- [ ] Both views work with same data
- [ ] Expansion works in expandable view
- [ ] Favorites work in both views

**How to test:**
1. Set `useExpandableCards={true}` in Sidebar
2. Build and refresh
3. **Verify**: See expandable cards instead of dense list
4. **Click card**: Expands to show details
5. **Click again**: Collapses
6. **Enable/disable signal**: Works correctly
7. Set back to `false`: Dense list returns

**Checkpoint:** ✅ Both views working

---

##### Task 5.4: Add category grouping for Built-in tab (45 min)

**Files to modify:**
- `apps/app/src/components/TraderList.tsx`

**Actions:**
- [ ] Import CategoryHeader and groupByCategory
- [ ] Group signals when `activeTab === 'builtin'`
- [ ] Render with category headers

**Code to add:**
```typescript
import { CategoryHeader } from './CategoryHeader';
import { groupByCategory, GroupedSignals } from '../utils/signalFilters';

// In component:
const shouldGroupByCategory = activeTab === 'builtin' && useExpandableCards;

const groupedSignals = useMemo(() => {
  if (!shouldGroupByCategory) return null;
  return groupByCategory(displayedTraders);
}, [shouldGroupByCategory, displayedTraders]);

// In render:
{shouldGroupByCategory && groupedSignals ? (
  // Render grouped
  Object.entries(groupedSignals).map(([category, signals]) => (
    <div key={category} className="mb-6">
      <CategoryHeader title={category} count={signals.length} />
      <div className="space-y-2">
        {signals.map(signal => (
          <ExpandableSignalCard key={signal.id} signal={signal} {...props} />
        ))}
      </div>
    </div>
  ))
) : (
  // Render flat list
  displayedTraders.map(trader => (
    useExpandableCards ? (
      <ExpandableSignalCard key={trader.id} signal={trader} {...props} />
    ) : (
      <SignalListItem key={trader.id} trader={trader} {...props} />
    )
  ))
)}
```

**Test criteria:**
- [ ] Built-in tab shows category headers
- [ ] Each category has correct count
- [ ] Categories ordered logically
- [ ] Personal/Favorites tabs show flat list

**How to test:**
1. Build and refresh
2. **On Built-in tab with expandable cards**:
   - See category headers (Momentum, Breakout, Volume, etc.)
   - Signals grouped under correct categories
3. **Switch to Personal tab**: No category headers
4. **Search**: Categories filter correctly

**Checkpoint:** ✅ Category grouping working

---

##### Task 5.5: Permanently switch to expandable cards (15 min)

**Files to modify:**
- `apps/app/src/components/TraderList.tsx`
- `apps/app/components/Sidebar.tsx`

**Actions:**
- [ ] Remove `useExpandableCards` feature flag
- [ ] Remove SignalListItem rendering
- [ ] Always use ExpandableSignalCard

**Test criteria:**
- [ ] Only expandable cards render
- [ ] No dead code left
- [ ] All functionality works

**How to test:**
1. Build and refresh
2. **Verify**: Expandable cards everywhere
3. **Test all tabs**: Built-in (grouped), Personal, Favorites
4. **Test all interactions**: Expand, collapse, enable, favorite

**Checkpoint:** ✅ Expandable cards fully integrated

---

**Phase 5 Complete When:**
- [x] Expandable cards working
- [x] Expansion state managed correctly
- [x] Category grouping in Built-in tab
- [x] Performance acceptable (< 100ms renders)
- [x] No memory leaks
- [x] Real-time updates smooth

**PM Checkpoint Required:** ✅ Verify card design and grouping

**Total Phase 5 Time:** ~2.5 hours

---

#### Phase 6: Polish & Edge Cases (1.5 hours)
**Objective:** Handle edge cases, optimize, and finalize

##### Task 6.1: Optimize performance (30 min)

**Files to modify:**
- Various components

**Actions:**
- [ ] Profile with React DevTools
- [ ] Verify memoization working
- [ ] Check for unnecessary re-renders
- [ ] Optimize if needed

**Test criteria:**
- [ ] Render time < 100ms with 100+ signals
- [ ] Smooth scrolling
- [ ] No jank when expanding/collapsing
- [ ] Memory stable over 10 min session

**How to test:**
1. Open React DevTools Profiler
2. Record performance while:
   - Switching tabs
   - Searching
   - Expanding/collapsing cards
   - Enabling/disabling signals
3. Check for slow renders or excessive re-renders

**Checkpoint:** ✅ Performance optimized

---

##### Task 6.2: Error boundaries and graceful degradation (20 min)

**Files to modify:**
- `apps/app/src/components/Sidebar.tsx`
- Individual components

**Actions:**
- [ ] Add error boundary around signal list
- [ ] Handle missing data gracefully
- [ ] Add loading states if needed

**Test criteria:**
- [ ] App doesn't crash on errors
- [ ] User sees friendly error message
- [ ] Can recover without refresh

**Checkpoint:** ✅ Error handling solid

---

##### Task 6.3: Mobile responsiveness check (20 min)

**Actions:**
- [ ] Test on mobile viewport
- [ ] Verify tabs work on small screens
- [ ] Check expandable cards on mobile
- [ ] Adjust spacing if needed

**Test criteria:**
- [ ] Tabs readable and clickable on mobile
- [ ] Search input usable on mobile
- [ ] Cards expand/collapse smoothly on mobile
- [ ] No horizontal overflow

**How to test:**
1. Open browser DevTools
2. Switch to mobile viewport (iPhone/Android)
3. Test all interactions
4. Check portrait and landscape

**Checkpoint:** ✅ Mobile responsive

---

##### Task 6.4: Accessibility check (20 min)

**Actions:**
- [ ] Test keyboard navigation
- [ ] Verify focus management
- [ ] Check ARIA labels
- [ ] Run Lighthouse audit

**Test criteria:**
- [ ] Tab key navigates correctly
- [ ] Enter key activates buttons/cards
- [ ] Focus visible
- [ ] Screen reader friendly

**How to test:**
1. Navigate with Tab key only
2. Try to use all features without mouse
3. Run Lighthouse accessibility audit
4. Fix any issues found

**Checkpoint:** ✅ Accessible

---

##### Task 6.5: Final cleanup (20 min)

**Actions:**
- [ ] Remove commented-out StatusBar code
- [ ] Remove unused imports
- [ ] Remove console.logs
- [ ] Update comments

**Test criteria:**
- [ ] No dead code
- [ ] No console warnings
- [ ] Clean git diff

**Checkpoint:** ✅ Code clean

---

**Phase 6 Complete When:**
- [x] Performance optimized
- [x] Errors handled gracefully
- [x] Mobile responsive
- [x] Accessible
- [x] Code clean and documented

**Total Phase 6 Time:** ~1.5 hours

---

### Testing Strategy

#### After Each Task (< 2 min)
```bash
# Type check
pnpm build

# If task modified components, test in browser:
# 1. Refresh browser
# 2. Verify change visible/working
# 3. Check browser console for errors
# 4. Test basic interactions
```

#### After Each Phase (5-10 min)
```bash
# Full build
pnpm build

# Type check
pnpm typecheck

# Run tests (if exist)
pnpm test

# Manual verification:
# 1. Test all tabs
# 2. Test search
# 3. Test favorites
# 4. Test expand/collapse
# 5. Test enable/disable
# 6. Verify real-time updates
# 7. Check mobile view
```

#### Final Integration Test (30 min)
```bash
# Production build
pnpm build

# Full E2E test:
# 1. Test as anonymous user
# 2. Test as Free tier
# 3. Test as Pro tier
# 4. Test as Elite tier
# 5. Test on desktop (Chrome, Firefox, Safari)
# 6. Test on mobile (iOS, Android)
# 7. Test slow network (DevTools throttling)
# 8. Test disconnection/reconnection
# 9. Check for memory leaks (DevTools Memory profiler)
# 10. Verify all features work
```

### Manual Testing Checklist

**Core Functionality:**
- [ ] All three tabs (Built-in, Personal, Favorites) work
- [ ] Search filters within active tab
- [ ] Search debounces correctly (no lag)
- [ ] Empty states show appropriate messages
- [ ] Category grouping in Built-in tab
- [ ] Expandable cards expand/collapse smoothly
- [ ] Favorites persist after refresh
- [ ] Enable/disable signals works
- [ ] Real-time activity states update (Triggered, Watching)
- [ ] Connection status displays correctly

**Performance:**
- [ ] Render time < 100ms with 100+ signals
- [ ] Smooth scrolling
- [ ] No jank when interacting
- [ ] Memory stable over time
- [ ] No console errors/warnings

**Responsive:**
- [ ] Works on desktop (1920x1080)
- [ ] Works on tablet (768x1024)
- [ ] Works on mobile (375x667)
- [ ] No horizontal overflow
- [ ] Touch interactions work on mobile

**Accessibility:**
- [ ] Keyboard navigation works (Tab, Enter, Esc)
- [ ] Focus visible
- [ ] Screen reader announces changes
- [ ] Color contrast sufficient
- [ ] ARIA labels present

**Edge Cases:**
- [ ] No signals in tab shows empty state
- [ ] Search with no matches shows message
- [ ] Disconnect/reconnect recovers gracefully
- [ ] Large number of favorites (100+) performs ok
- [ ] Fast typing in search doesn't cause issues

### Rollback Plan

**If any task breaks the app:**
1. `git stash` current changes
2. `git checkout feature/sidebar-redesign` (last working commit)
3. `pnpm build && pnpm dev`
4. Document issue in this file
5. Fix issue in isolated branch
6. Re-attempt task

**If entire phase needs rollback:**
1. `git log --oneline` - find last working commit
2. `git reset --hard <commit-hash>`
3. `pnpm build && pnpm dev`
4. Review what went wrong
5. Adjust plan and retry

**Emergency rollback to main:**
```bash
git checkout main
pnpm install
pnpm build
pnpm dev
```

### PM Checkpoints

**Phase 2 Checkpoint** (After header transformation):
- [ ] PM approves clean header design
- [ ] PM confirms metrics visibility acceptable
- [ ] PM signs off to continue

**Phase 3 Checkpoint** (After tab system):
- [ ] PM tests tab navigation
- [ ] PM verifies tab organization makes sense
- [ ] PM confirms ready for search

**Phase 5 Checkpoint** (After expandable cards):
- [ ] PM tests expandable cards
- [ ] PM verifies category grouping helpful
- [ ] PM confirms design matches vision

**Final Checkpoint** (Before merge):
- [ ] PM does full feature review
- [ ] PM tests on their device
- [ ] PM approves for production

### Success Metrics

**Implementation complete when:**
- [ ] All 6 phases complete
- [ ] All tests passing
- [ ] TypeScript 0 errors
- [ ] 0 console errors/warnings
- [ ] Performance targets met:
  - Initial render < 100ms
  - Search response < 50ms
  - Tab switch < 50ms
  - Expand card < 200ms
  - 60 FPS scrolling
- [ ] Works on desktop and mobile
- [ ] Accessibility standards met
- [ ] PM approved

### Risk Tracking

| Phase | Risk | Mitigation | Status |
|-------|------|------------|--------|
| 1 | Breaking existing types | Import utilities without modifying existing code | ⏳ |
| 2 | Losing metrics visibility | Keep both headers initially, test before removing | ⏳ |
| 3 | Tab filtering breaks real-time updates | Use useMemo, test updates in each tab | ⏳ |
| 4 | Search causes lag | Debounce 300ms, test with 100+ signals | ⏳ |
| 5 | Expandable cards slow | Memoize components, profile performance | ⏳ |
| 6 | Mobile UX issues | Test mobile early in phase | ⏳ |

### Time Estimates

- **Phase 0:** 0 hours (complete - style guide exists)
- **Phase 1:** 2 hours (foundation)
- **Phase 2:** 1.5 hours (header)
- **Phase 3:** 2 hours (tabs)
- **Phase 4:** 1 hour (search)
- **Phase 5:** 2.5 hours (expandable cards)
- **Phase 6:** 1.5 hours (polish)
- **Testing:** 1.5 hours (full integration)

**Total: ~12 hours development + 1.5 hours testing = 13.5 hours**

**Estimated days**: 2-3 days (assuming 4-6 hours/day focused work)

### Next Actions

1. **Resolve 3 critical blockers with PM:**
   - [ ] Metrics placement decision
   - [ ] User menu location decision
   - [ ] Rollout strategy decision

2. **Once blockers resolved:**
   - [ ] Create feature branch: `git checkout -b feature/sidebar-redesign`
   - [ ] Start Phase 1, Task 1.1
   - [ ] Follow plan incrementally
   - [ ] Test after each task

3. **Communication:**
   - [ ] Update PM after each phase
   - [ ] Document any deviations from plan
   - [ ] Flag blockers immediately

---

**Implementation Notes:**

- Each task is 15-30 min for quick feedback loops
- Test in browser after EVERY task
- Build breaks = immediate rollback and fix
- Keep dev server running for fast refresh
- Use React DevTools to verify state changes
- Check browser console constantly
- Mobile test early and often
- PM checkpoints are mandatory gates

**Remember:** The goal is **small, safe, testable increments**. If any task feels too big, break it down further. If something breaks, stash and rollback immediately.

---

*Status: 📊 PLAN COMPLETE - Ready for /implement after blockers resolved*
*Next: Resolve 3 blockers, then begin Phase 1*
