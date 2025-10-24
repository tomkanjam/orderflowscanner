# Signal Library Redesign - Expandable Cards with Tabs & Filters

**Status**: 🎨 design
**Created**: 2025-10-08
**Priority**: High

## Problem

The current dense list is good for space efficiency, but:
1. No organization for the growing library of built-in signals
2. No way to filter/search through many signals
3. No tabs to separate built-in vs personal vs favorites
4. No subsections to categorize signals by strategy type
5. Cannot see details without opening menu

---

## UI/UX Design
*Stage: design | Date: 2025-10-08*

### Design Overview

Transform the signal list into an organized, searchable library with:
- **Tabs**: Built-in, Personal, Favorites (with counts)
- **Filter field**: Real-time search across signal names and descriptions
- **Subsections**: Category headers within Built-in tab (Momentum, Reversal, Order Flow, etc.)
- **Expandable cards**: Compact single-line view, click to expand for details
- **Quick actions**: All controls accessible without expanding

### Component Structure

#### Full Layout with Tabs & Filter

```
┌────────────────────────────────────────────────────┐
│  🔍 [Search signals...]                            │
├────────────────────────────────────────────────────┤
│  Built-in (23) │ Personal (5) │ Favorites (8)     │
├────────────────────────────────────────────────────┤
│                                                    │
│  MOMENTUM                                          │
│  ┌──────────────────────────────────────────────┐ │
│  │📡 RSI Oversold             ⚡ 2m ago       ⋮│ │ ← Collapsed
│  ├──────────────────────────────────────────────┤ │
│  │📡 MACD Crossover           💤 Never        ⋮│ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  REVERSAL                                          │
│  ┌──────────────────────────────────────────────┐ │
│  │📡 Support Bounce           ⚡ 5m ago       ⋮│ │
│  ├──────────────────────────────────────────────┤ │
│  │📡 Double Bottom            ⚡ 15m ago      ⋮│ │ ← Expanded
│  ├──────────────────────────────────────────────┤ │
│  │  Detects double bottom patterns with        │ │
│  │  volume confirmation at support levels.     │ │
│  │  • Price touches support twice              │ │
│  │  • Volume increases on second touch         │ │
│  │  • RSI above 30                             │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ORDER FLOW                                        │
│  ┌──────────────────────────────────────────────┐ │
│  │📡 Volume Surge             ⚡ Just now     ⋮│ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### Visual Specifications

#### Tabs
```
┌────────────────────────────────────────────────────┐
│ [Built-in (23)]  Personal (5)  Favorites (8)      │
│  ─────────────                                     │
└────────────────────────────────────────────────────┘
```

**Design**:
- Active tab: Primary color text + bottom border
- Inactive tabs: Muted text
- Count badges in parentheses
- Transitions: 150ms color fade

**Colors**:
- Active: `text-primary` with `border-b-2 border-primary`
- Inactive: `text-muted-foreground hover:text-foreground`

#### Filter Field
```
┌────────────────────────────────────────────────────┐
│  🔍  Search signals...                        ✕   │
└────────────────────────────────────────────────────┘
```

**Features**:
- Real-time filtering as user types
- Searches: signal name, description, category
- Clear button (✕) appears when text exists
- Placeholder: "Search signals..."
- Sticky position at top of scroll area

#### Category Headers
```
MOMENTUM ─────────────────────────────────────────
```

**Design**:
- Uppercase text: `text-xs font-semibold text-muted-foreground tracking-wider`
- Right border: `border-b border-border flex-1`
- Sticky within scroll container (optional)
- Margin: `mt-6 mb-2` (except first)

#### Collapsed Card (Default State)
```
┌────────────────────────────────────────────────────┐
│ 🟢 📡 RSI Oversold Signal    ⚡ ☁️  2m ago  (5) ⋮│ ← 40px height
└────────────────────────────────────────────────────┘
```

**Layout** (left to right):
1. Activity dot (8px)
2. Type icon (16px)
3. Name (flexible, truncates)
4. Running toggle (20px)
5. Cloud status (20px, Elite only)
6. Last trigger (60px, show on expanded hover)
7. Signal count (40px, show on expanded hover)
8. Menu (20px)

**Interactions**:
- Click anywhere on card → Expand/collapse
- Click toggle/cloud/menu → Don't expand, just perform action
- Hover → Show time/count (fade in)

#### Expanded Card State
```
┌────────────────────────────────────────────────────┐
│ 🟢 📡 RSI Oversold Signal    ⚡ ☁️  2m ago  (5) ⋮│ ← Header (40px)
├────────────────────────────────────────────────────┤
│ Detects oversold conditions using RSI indicator.   │
│ Triggers when RSI drops below 30 with volume       │
│ confirmation.                                      │
│                                                    │
│ Conditions:                                        │
│ • RSI < 30                                         │
│ • Volume > 1.5x average                            │
│ • Price above 20-day MA                            │
│                                                    │
│ Recent Triggers:                                   │
│ BTCUSDT   2m ago   $67,234   +2.4%                │
│ ETHUSDT   5m ago   $3,456    +1.8%                │
└────────────────────────────────────────────────────┘
```

**Content**:
- Description paragraph
- Conditions list (if available)
- Recent triggers (last 3-5)
- AI analysis preview (Elite tier only)

**Animation**:
- Height: `transition-all duration-200 ease-out`
- Content: Fade in with `opacity-0 → opacity-100` (100ms delay)
- Max height: ~280px (matches current expanded signal cards)

### Tab Content Organization

#### Built-in Tab

**Categories** (subsections):
1. **MOMENTUM** - Trend-following and momentum signals
   - RSI Oversold/Overbought
   - MACD Crossover
   - Stochastic Extremes

2. **REVERSAL** - Mean reversion and reversal patterns
   - Support Bounce
   - Resistance Rejection
   - Double Bottom/Top

3. **ORDER FLOW** - Volume and order flow analysis
   - Volume Surge
   - Unusual Volume
   - Large Order Detection

4. **BREAKOUT** - Price breakout patterns
   - Range Breakout
   - ATH Breakout
   - Consolidation Breakout

5. **VOLATILITY** - Volatility-based signals
   - Bollinger Squeeze
   - ATR Expansion
   - Low Volatility Setup

**Sorting within categories**:
- By difficulty: Beginner → Intermediate → Advanced
- Or by popularity (trigger count)

#### Personal Tab

**Organization**:
- No categories (user's custom signals/traders)
- Sort by: Most recent, Most active, Alphabetical
- Dropdown sort selector at top

**Empty state**:
```
┌────────────────────────────────────────────────────┐
│                                                    │
│              ✨                                    │
│                                                    │
│         No personal signals yet                    │
│                                                    │
│   Create your first AI-powered signal to start    │
│   automated screening and trading.                │
│                                                    │
│   [+ Create Signal with AI]                       │
│                                                    │
└────────────────────────────────────────────────────┘
```

#### Favorites Tab

**Organization**:
- Mixed: Built-in + Personal favorites
- Show category label on built-in signals
- Show owner on personal signals (if shared)

**Empty state**:
```
┌────────────────────────────────────────────────────┐
│                                                    │
│              ⭐                                    │
│                                                    │
│         No favorites yet                           │
│                                                    │
│   Mark signals as favorites to quickly access     │
│   your most-used strategies.                      │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Detailed Component Designs

#### FilterInput Component

**Location**: Top of TraderList, above tabs

```tsx
interface FilterInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}
```

**Visual**:
```
┌────────────────────────────────────────────────────┐
│  🔍  momentum rsi                             ✕   │
└────────────────────────────────────────────────────┘
```

**Features**:
- Auto-focus on "/" key press (global keyboard shortcut)
- Escape to clear and blur
- Debounced filtering (150ms) for performance
- Filters across: name, description, category, conditions

#### TabBar Component

```tsx
interface TabBarProps {
  activeTab: 'builtin' | 'personal' | 'favorites';
  onTabChange: (tab: string) => void;
  counts: {
    builtin: number;
    personal: number;
    favorites: number;
  };
}
```

**Visual States**:
- **Active**: Bold text, primary color, bottom border
- **Inactive**: Normal weight, muted color
- **Hover**: Slight color change
- **Disabled**: Lower opacity (if tier locked)

#### CategoryHeader Component

```tsx
interface CategoryHeaderProps {
  category: string;
  count?: number;
  collapsible?: boolean;
  isCollapsed?: boolean;
  onToggle?: () => void;
}
```

**With collapse option**:
```
MOMENTUM (8) ───────────────────────────────── ▼
```

Click header → Collapse/expand all signals in category

#### ExpandableSignalCard Component

Replaces `SignalListItem` with expand/collapse functionality.

```tsx
interface ExpandableSignalCardProps {
  signal: Trader;
  isExpanded: boolean;
  isSelected: boolean;
  isFavorite: boolean;
  showCloudStatus?: boolean;
  cloudMachineStatus?: string;
  canEdit?: boolean;
  canDelete?: boolean;
  onExpand?: () => void;
  onSelect?: () => void;
  onToggleEnable?: () => void;
  onToggleCloud?: () => void;
  onToggleFavorite?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}
```

**States**:
- `isExpanded`: Show/hide details section
- `isSelected`: Primary selection (for main view)
- Both can be true simultaneously

### Filtering Logic

**Filter applies to**:
1. Signal name (case-insensitive)
2. Signal description
3. Category name
4. Filter conditions (if present)

**Examples**:
- Search "rsi" → Shows all RSI-related signals
- Search "momentum" → Shows Momentum category signals
- Search "oversold" → Shows signals with "oversold" in description
- Search "support" → Shows signals mentioning support levels

**Performance**:
- Memoize filtered results
- Debounce input (150ms)
- Virtual scrolling for 100+ signals (future optimization)

### Responsive Behavior

#### Desktop (≥1024px)
- Sidebar: 360px width
- Show all metadata inline
- Expanded cards: Full details

#### Tablet (768-1023px)
- Sidebar: 320px width
- Hide time/count unless expanded
- Compressed expanded view

#### Mobile (<768px)
- Full width sidebar
- Minimal controls
- Tap to expand for all details

### Accessibility

#### Keyboard Navigation
- **Tab**: Navigate between filter, tabs, cards
- **↑/↓**: Move between cards
- **Enter**: Expand/collapse focused card
- **Space**: Toggle enable on focused card
- **/**: Focus filter input
- **Esc**: Clear filter and close expanded card

#### Screen Reader
- Tab counts announced: "Built-in tab, 23 signals"
- Expanded state: "Expanded" or "Collapsed"
- Filter results: "Showing 5 of 23 signals"

### Animation Specifications

#### Card Expand/Collapse
```css
.expandable-card {
  transition: all 200ms ease-out;
}

.expandable-card__content {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  transition: max-height 200ms ease-out,
              opacity 150ms ease-out 50ms;
}

.expandable-card--expanded .expandable-card__content {
  max-height: 280px;
  opacity: 1;
}
```

#### Tab Switch
```css
.tab {
  transition: color 150ms ease-out,
              border-color 150ms ease-out;
}
```

#### Filter Results
- New filtered items: Fade in (100ms)
- Removed items: Fade out (100ms)
- List reorganizes smoothly

### Implementation Plan

#### Phase 1: Core Structure
- [ ] Create TabBar component
- [ ] Create FilterInput component
- [ ] Update TraderList to use tabs
- [ ] Add state management for activeTab and filter

#### Phase 2: Expandable Cards
- [ ] Create ExpandableSignalCard component
- [ ] Add expand/collapse animation
- [ ] Handle click interactions (expand vs. action buttons)
- [ ] Migrate from SignalListItem to ExpandableSignalCard

#### Phase 3: Categories & Organization
- [ ] Add category field to Trader interface
- [ ] Create CategoryHeader component
- [ ] Group built-in signals by category
- [ ] Add category collapsing (optional)

#### Phase 4: Filtering
- [ ] Implement filter logic
- [ ] Add keyboard shortcut (/)
- [ ] Debounce filter input
- [ ] Show "No results" state

#### Phase 5: Favorites Tab
- [ ] Track favorites in subscription preferences
- [ ] Create favorites view (mixed built-in + personal)
- [ ] Add empty state

#### Phase 6: Polish
- [ ] Add loading states
- [ ] Optimize performance (memoization)
- [ ] Test keyboard navigation
- [ ] Add animations
- [ ] Test with 100+ signals

---

## Benefits

1. **Better Organization**: Category-based browsing for built-in library
2. **Faster Discovery**: Real-time search to find signals quickly
3. **Clean Interface**: Collapsed by default, expand on demand
4. **Focused Views**: Tabs separate built-in, personal, and favorites
5. **Scalable**: Can handle 100+ signals without overwhelming users
6. **Accessible**: Full keyboard navigation and screen reader support

---

*[End of design. Ready for implementation]*
