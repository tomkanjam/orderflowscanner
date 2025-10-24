# Ultra-Dense Trader/Signal List Design

**Status**: 🎨 design
**Created**: 2025-10-07
**Priority**: High

## Problem

Trader cards in the sidebar are horizontally squished, making controls inaccessible. The card-based design takes too much vertical space and limits how many signals users can see at once.

---

## UI/UX Design
*Stage: design | Date: 2025-10-07*

### Design Overview

Replace card-based layout with an ultra-dense single-line list view that shows only the most critical information at a glance. Users can see 3-4x more signals in the same space, with all controls accessible.

### Critical Data Points (User-Defined)

**Primary (Always Visible)**:
1. **Activity indicator** - Is it actively triggering? (dot)
2. **Name** - Signal/trader name
3. **Type** - "Trader" vs "Signal" badge
4. **Running status** - On/Off toggle
5. **Cloud status** - Deployed or not (Elite only)

**Secondary (Nice to have)**:
6. **Last trigger** - "2m ago" or "Never"
7. **Signal count** - Recent signals in parentheses

### Component Structure

#### Dense List Layout

```
Sidebar (280px minimum width):
┌──────────────────────────────────────────────────────────────┐
│  Create Signal Button                                        │
├──────────────────────────────────────────────────────────────┤
│  Signals                                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │🟢 Breakout Signal        [Signal] ⚡     2m ago  (5) ⋮│ │ ← 40px height
│  ├────────────────────────────────────────────────────────┤ │
│  │🟡 Volume Surge           [Signal] 💤    15m ago (12) ⋮│ │
│  ├────────────────────────────────────────────────────────┤ │
│  │⚪ Range Detection        [Signal] 💤     Never   (0) ⋮│ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  My AI Traders                                               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │🟢 Momentum Trader      [Trader] ⚡ ☁️  Just now (3) ⋮│ │
│  ├────────────────────────────────────────────────────────┤ │
│  │🔴 Scalping Bot         [Trader] 💤    1h ago   (0) ⋮│ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

#### Single List Item Anatomy (40px height)

```
┌──────────────────────────────────────────────────────────────┐
│ 🟢 Signal Name Here          [Signal] ⚡ ☁️  2m ago  (5)  ⋮ │
│ │  │                         │       │  │   │       │    │  │
│ │  └─ Name (flexible)        │       │  │   │       │    │  │
│ └─ Activity (8px dot)        │       │  │   │       │    │  │
│                              │       │  │   │       │    │  │
│    Type badge (70px) ────────┘       │  │   │       │    │  │
│    Running icon (20px) ──────────────┘  │   │       │    │  │
│    Cloud icon (20px) ────────────────────┘   │       │    │  │
│    Last trigger (60px) ───────────────────────┘       │    │  │
│    Count (40px) ──────────────────────────────────────┘    │  │
│    Menu (20px) ────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘

Total width breakdown:
8px (dot) + 8px (gap) + 120px (name) + 8px (gap) + 70px (badge) +
8px (gap) + 20px (run) + 8px (gap) + 20px (cloud) + 8px (gap) +
60px (time) + 8px (gap) + 40px (count) + 8px (gap) + 20px (menu) +
16px (padding L) + 16px (padding R) = ~446px ideal

Minimum viable: ~280px (name truncates heavily)
Comfortable: ~360px (reasonable truncation)
Ideal: ~440px+ (no truncation for most names)
```

### Visual Specifications

#### Typography
- **Name**: `text-sm` (14px), `font-medium`, truncate with ellipsis
- **Badge**: `text-xs` (12px), `font-medium`, uppercase
- **Time**: `text-xs` (12px), `font-normal`
- **Count**: `text-xs` (12px), `font-mono`

#### Color Palette (Supabase Design System)
Using new color scales from `supabase-design-system.css`:

**Activity Indicators**:
- Active (triggering): `oklch(0.762 0.177 165.98)` - Primary green
- Recent: `var(--primary-400)` - Lighter green
- Idle: `var(--base-400)` - Muted gray
- Error: `var(--destructive)` - Red

**Text Colors**:
- Name: `var(--foreground)` - Primary text
- Badge: `var(--muted-foreground)` - Secondary text
- Time/Count: `var(--muted-foreground)` - Tertiary text

**Backgrounds**:
- Default: `transparent`
- Hover: `var(--sidebar-accent)` - Subtle highlight
- Selected: `var(--sidebar-accent)` with left border `var(--sidebar-primary)`

#### Spacing
- **List item height**: 40px
- **Horizontal padding**: 16px left/right
- **Gap between elements**: 8px
- **List gap**: 1px (subtle separator lines)
- **Section gap**: 24px (between "Signals" and "My Traders")

#### Borders
- **List items**: None by default
- **Hover**: `border-l-2` with `var(--sidebar-primary)`
- **Selected**: `border-l-3` with `var(--sidebar-primary)` (thicker)
- **Separator**: `border-b` with `var(--border)` between items (optional, very subtle)

### Component Designs

#### SignalListItem Component
**Purpose**: Single-line list item for trader/signal
**Location**: Within TraderList scroll container

**Props**:
```typescript
interface SignalListItemProps {
  signal: Trader;
  isSelected: boolean;
  isFavorite: boolean;
  showCloudStatus?: boolean;
  onSelect?: () => void;
  onToggleEnable?: () => void;
  onToggleCloud?: () => void;
  onMenuClick?: () => void;
}
```

**Visual States**:
```
Default:
┌────────────────────────────────────────────────────────┐
│ 🟢 Signal Name          [Signal] ⚡     2m ago  (5) ⋮ │
└────────────────────────────────────────────────────────┘

Hover:
┌────────────────────────────────────────────────────────┐
│▌🟢 Signal Name          [Signal] ⚡     2m ago  (5) ⋮ │ ← Left border highlight
└────────────────────────────────────────────────────────┘

Selected:
┌────────────────────────────────────────────────────────┐
│▌🟢 Signal Name          [Signal] ⚡     2m ago  (5) ⋮ │ ← Thicker border + bg
└────────────────────────────────────────────────────────┘

Disabled:
┌────────────────────────────────────────────────────────┐
│ ⚪ Signal Name (disabled) [Signal] 💤    Never   (0) ⋮ │ ← 50% opacity
└────────────────────────────────────────────────────────┘
```

**Interactive Elements**:

1. **Activity Dot** (8px, non-interactive) - Visual indicator
   - Green: Triggered in last 5 minutes
   - Yellow: Active in last hour
   - Gray: Idle
   - Red: Error state

2. **Name** (click to select) - Primary interaction area
   - Truncates with ellipsis
   - Shows full name in tooltip on hover
   - Click anywhere on name area to select

3. **Type Badge** (70px, non-interactive) - Visual label
   - [Signal] - Standard signal
   - [Trader] - AI trader (Elite tier)
   - Uppercase, subtle background

4. **Running Toggle** (20px, click to toggle) - Interactive icon
   - ⚡ Green - Running
   - 💤 Gray - Stopped
   - Click to toggle enabled state
   - Shows tooltip: "Enable" or "Disable"

5. **Cloud Status** (20px, Elite only) - Interactive icon
   - ☁️ Blue - Deployed to cloud
   - Empty/hidden - Not deployed
   - Click to toggle cloud deployment
   - Only shown for custom traders on Elite tier

6. **Last Trigger** (60px, non-interactive) - Text display
   - "Just now" - <1 minute
   - "2m ago" - Minutes
   - "1h ago" - Hours
   - "2d ago" - Days
   - "Never" - No triggers yet

7. **Signal Count** (40px, non-interactive) - Text display
   - (5) - Number of recent signals
   - (0) - No signals
   - Monospace font for alignment

8. **Menu Button** (20px, click for actions) - Dropdown trigger
   - ⋮ (three vertical dots)
   - Click to open action menu
   - Shows: Favorite, Edit, Delete, View Details

#### Action Menu (Dropdown)

Opens on menu button click:
```
┌─────────────────┐
│ ⭐ Favorite     │ ← If not favorited
│ ✏️ Edit         │ ← Owner/admin only
│ 🗑️ Delete       │ ← Owner/admin only
│ 📊 View Details │
└─────────────────┘
```

Or if already favorited:
```
┌─────────────────┐
│ ☆ Unfavorite    │
│ ✏️ Edit         │
│ 🗑️ Delete       │
│ 📊 View Details │
└─────────────────┘
```

### Layout Specifications

#### Sidebar Width
```
Sidebar container:
- Minimum: 280px (extreme mobile landscape)
- Comfortable: 320px (standard mobile)
- Desktop: 360px (preferred for dense list)
- Maximum: No limit (but 360px is sweet spot)
```

**Updated Sidebar.tsx** (Line 113):
```tsx
<aside className="w-full md:w-80 xl:w-[360px] flex-shrink-0 bg-[var(--sidebar-background)] ...">
```

Where:
- Mobile: `w-full` - Full width
- Tablet: `w-80` (320px) - Minimum comfortable
- Desktop: `w-[360px]` - Optimal density

#### List Container
```tsx
<div className="space-y-0">  {/* No gap, items touch */}
  <SignalListItem ... />
  <SignalListItem ... />
</div>
```

Items separated by 1px border-bottom for subtle visual separation (optional).

### Responsive Behavior

#### Breakpoints
- **Mobile (<768px)**: Full width sidebar
  - Hide "Last trigger" (saves 68px)
  - Hide count (saves 48px)
  - Name gets more space

- **Tablet (768-1023px)**: 320px sidebar
  - Abbreviate "Last trigger": "2m" instead of "2m ago"
  - Keep count
  - Moderate name truncation

- **Desktop (≥1024px)**: 360px sidebar
  - Show all fields
  - Minimal name truncation for reasonable lengths

#### Width Calculations by Breakpoint

**Mobile (<768px, full width assumed ~375px)**:
```
8 (dot) + 8 (gap) + 160 (name) + 8 (gap) + 70 (badge) +
8 (gap) + 20 (run) + 8 (gap) + 20 (cloud) + 8 (gap) + 20 (menu) +
32 (padding) = 370px ✓
```

**Tablet (320px)**:
```
8 (dot) + 8 (gap) + 100 (name) + 8 (gap) + 70 (badge) +
8 (gap) + 20 (run) + 8 (gap) + 20 (cloud) + 8 (gap) +
30 (time) + 8 (gap) + 20 (menu) + 32 (padding) = 348px
Fits in 360px with breathing room ✓
```

**Desktop (360px)**:
```
8 (dot) + 8 (gap) + 120 (name) + 8 (gap) + 70 (badge) +
8 (gap) + 20 (run) + 8 (gap) + 20 (cloud) + 8 (gap) +
60 (time) + 8 (gap) + 40 (count) + 8 (gap) + 20 (menu) +
32 (padding) = 446px

Wait, that's too much for 360px!

Revised Desktop (360px):
8 (dot) + 8 (gap) + 100 (name) + 8 (gap) + 60 (badge) +
8 (gap) + 20 (run) + 8 (gap) + 20 (cloud) + 8 (gap) +
50 (time) + 8 (gap) + 30 (count) + 8 (gap) + 20 (menu) +
32 (padding) = 396px

Still too much. Final revision:

8 (dot) + 8 (gap) + 90 (name) + 8 (gap) + 60 (badge) +
8 (gap) + 20 (run) + 8 (gap) + 20 (cloud) + 8 (gap) +
40 (time) + 8 (gap) + 30 (count) + 8 (gap) + 20 (menu) +
32 (padding) = 376px ✓
```

Actually, let's be smarter about this:

**Final Layout Strategy**:
1. Fixed widths for controls: 8 (dot) + 20 (run) + 20 (cloud) + 20 (menu) = 68px
2. Fixed gaps: 8 × 8 = 64px (8 gaps between 9 elements)
3. Fixed padding: 32px (16 left + 16 right)
4. Badge: 60-70px depending on text
5. Time: 40-60px depending on abbreviation
6. Count: 30-40px

**Total fixed**: ~68 + 64 + 32 + 65 + 50 + 35 = 314px
**Remaining for name at 360px**: 360 - 314 = **46px minimum for name** 😱

That's too little! Let me reconsider...

**Actually Practical Layout** (360px sidebar):

Let's prioritize differently and hide less critical items on narrow widths:

```
// Desktop (≥360px) - Show everything
🟢 Name (80px) [Signal] (60px) ⚡ (20px) ☁️ (20px) 2m (40px) (5) (30px) ⋮ (20px)
= 8 + 80 + 60 + 20 + 20 + 40 + 30 + 20 + gaps(56) + padding(32) = 366px

// Tablet (320-359px) - Hide count
🟢 Name (100px) [Signal] (60px) ⚡ (20px) ☁️ (20px) 2m (40px) ⋮ (20px)
= 8 + 100 + 60 + 20 + 20 + 40 + 20 + gaps(48) + padding(32) = 348px

// Mobile (<320px) - Hide time and count
🟢 Name (150px) [Signal] (60px) ⚡ (20px) ☁️ (20px) ⋮ (20px)
= 8 + 150 + 60 + 20 + 20 + 20 + gaps(40) + padding(32) = 350px
```

This works! But let's simplify even more:

**Super Simple Approach** - Always show same elements, just adjust name width:

```typescript
// Flexbox approach (much simpler):
<div className="flex items-center gap-2 px-4 h-10">
  {/* Activity dot */}
  <div className="w-2 h-2 rounded-full flex-shrink-0" />

  {/* Name - takes available space */}
  <div className="flex-1 truncate text-sm font-medium" />

  {/* Badge - fixed */}
  <div className="text-xs px-2 py-1 rounded flex-shrink-0" />

  {/* Running toggle - fixed */}
  <button className="w-5 h-5 flex-shrink-0" />

  {/* Cloud toggle - fixed (Elite only) */}
  {showCloud && <button className="w-5 h-5 flex-shrink-0" />}

  {/* Time - fixed, hide on mobile */}
  <div className="text-xs hidden md:block flex-shrink-0" />

  {/* Count - fixed, hide on small */}
  <div className="text-xs font-mono hidden lg:block flex-shrink-0" />

  {/* Menu - fixed */}
  <button className="w-5 h-5 flex-shrink-0" />
</div>
```

This flexbox approach is much cleaner! The name automatically takes whatever space is available.

### Accessibility

#### WCAG 2.1 AA Compliance
- **Color contrast**: 4.5:1 minimum for text
- **Focus indicators**: 2px ring with `var(--ring)` color
- **Keyboard navigation**: Tab through items, Enter to select, Space to toggle
- **Screen readers**: Proper ARIA labels and roles
- **Touch targets**: 40px height = comfortable mobile tap

#### Keyboard Shortcuts
- **↑/↓**: Navigate list
- **Enter**: Select item
- **Space**: Toggle enable/disable
- **C**: Toggle cloud deployment (Elite only)
- **M**: Open menu
- **Escape**: Close menu

#### Screen Reader Announcements
```
"Breakout Signal, Signal type, Running, Last triggered 2 minutes ago,
5 recent signals, Selected"
```

### Animation & Transitions

#### Performance First
- CSS transforms only
- 60fps minimum
- GPU acceleration for hover effects
- No layout shifts

#### Meaningful Motion
- **Hover**: Instant background color change, border slides in from left (150ms)
- **Select**: Immediate border thickening (no animation)
- **Activity dot pulse**: 2s ease-in-out infinite for active signals
- **Toggle state**: 150ms ease-in-out color transition
- **Menu open**: 150ms ease-out slide down with fade

#### Activity Dot Animation
```css
@keyframes activityPulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.3);
  }
}

.activity-dot--active {
  animation: activityPulse 2s ease-in-out infinite;
}
```

### Implementation Notes

#### New Component: SignalListItem.tsx

**Location**: `apps/app/src/components/SignalListItem.tsx`

**Structure**:
```tsx
import React from 'react';
import { Trader } from '../abstractions/trader.interfaces';
import { Power, Cloud, CloudOff, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SignalListItemProps {
  signal: Trader;
  isSelected: boolean;
  isFavorite: boolean;
  showCloudStatus?: boolean;
  cloudMachineStatus?: 'stopped' | 'running';
  onSelect?: () => void;
  onToggleEnable?: () => void;
  onToggleCloud?: () => void;
  onToggleFavorite?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function SignalListItem({ ... }: SignalListItemProps) {
  // Get activity state
  const activityState = getActivityState(signal);

  // Format time
  const lastTrigger = formatLastTrigger(signal.metrics?.lastSignalAt);

  return (
    <div
      className={`
        flex items-center gap-2 px-4 h-10
        cursor-pointer transition-all duration-150
        ${isSelected ? 'bg-sidebar-accent border-l-3 border-sidebar-primary' : ''}
        hover:bg-sidebar-accent hover:border-l-2 hover:border-sidebar-primary
      `}
      onClick={onSelect}
    >
      {/* Activity dot */}
      <div
        className={`
          w-2 h-2 rounded-full flex-shrink-0
          ${activityState === 'active' ? 'bg-primary animate-pulse' : ''}
          ${activityState === 'recent' ? 'bg-primary-400' : ''}
          ${activityState === 'idle' ? 'bg-base-400' : ''}
        `}
      />

      {/* Name */}
      <span className="flex-1 truncate text-sm font-medium text-foreground">
        {signal.name}
      </span>

      {/* Type badge */}
      <span className="px-2 py-1 text-xs font-medium rounded bg-muted text-muted-foreground uppercase flex-shrink-0">
        {signal.isBuiltIn ? 'Signal' : 'Trader'}
      </span>

      {/* Running toggle */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleEnable?.();
        }}
        className="w-5 h-5 flex-shrink-0 transition-colors"
      >
        {signal.enabled ? (
          <Power className="w-4 h-4 text-primary" />
        ) : (
          <Power className="w-4 h-4 text-base-400" />
        )}
      </button>

      {/* Cloud toggle (Elite only) */}
      {showCloudStatus && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleCloud?.();
          }}
          disabled={cloudMachineStatus !== 'running'}
          className="w-5 h-5 flex-shrink-0 transition-colors disabled:opacity-30"
        >
          {signal.cloud_config?.enabledInCloud ? (
            <Cloud className="w-4 h-4 text-blue-400" />
          ) : (
            <CloudOff className="w-4 h-4 text-base-400" />
          )}
        </button>
      )}

      {/* Last trigger */}
      <span className="text-xs text-muted-foreground flex-shrink-0 hidden md:block">
        {lastTrigger}
      </span>

      {/* Signal count */}
      <span className="text-xs font-mono text-muted-foreground flex-shrink-0 hidden lg:block">
        ({signal.metrics?.totalSignals || 0})
      </span>

      {/* Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="w-5 h-5 flex-shrink-0 hover:text-foreground transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onToggleFavorite}>
            {isFavorite ? '☆ Unfavorite' : '⭐ Favorite'}
          </DropdownMenuItem>
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              ✏️ Edit
            </DropdownMenuItem>
          )}
          {onDelete && (
            <DropdownMenuItem onClick={onDelete}>
              🗑️ Delete
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onSelect}>
            📊 View Details
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
```

#### Update TraderList.tsx

Replace `SignalCardEnhanced` usage with `SignalListItem`:

```tsx
// Before:
<div className="space-y-2">
  {signals.map(signal => (
    <SignalCardEnhanced key={signal.id} ... />
  ))}
</div>

// After:
<div className="space-y-0 border-t border-sidebar-border">
  {signals.map(signal => (
    <SignalListItem
      key={signal.id}
      signal={signal}
      isSelected={selectedTraderId === signal.id}
      isFavorite={preferences?.favorite_signals?.includes(signal.id)}
      showCloudStatus={cloudExecution.isEliteTier && !signal.isBuiltIn}
      cloudMachineStatus={cloudExecution.machineStatus}
      onSelect={() => onSelectTrader?.(signal.id)}
      onToggleEnable={() => handleToggleTrader(signal)}
      onToggleCloud={() => handleToggleCloudExecution(signal)}
      onToggleFavorite={() => handleToggleFavorite(signal.id)}
      onEdit={canEdit ? () => onEditTrader(signal) : undefined}
      onDelete={canDelete ? () => handleDeleteTrader(signal) : undefined}
    />
  ))}
</div>
```

#### Update Sidebar.tsx

```tsx
// Line 113 - Update width
<aside className="w-full md:w-80 xl:w-[360px] flex-shrink-0 bg-[var(--sidebar-background)] ...">
```

### Design Validation

#### Usability Testing
- [ ] All controls accessible at 360px width
- [ ] Items readable at 320px width
- [ ] No horizontal scroll at any breakpoint
- [ ] Touch targets meet 40px minimum on mobile
- [ ] Names don't overlap controls
- [ ] Menu opens without clipping
- [ ] Can see 12+ signals without scrolling (vs 4-5 with cards)

#### Visual Testing
- [ ] List feels balanced and scannable
- [ ] Activity dots are noticeable
- [ ] Type badges are readable
- [ ] Hover states are clear
- [ ] Selection state is obvious
- [ ] Colors match Supabase design system

#### Performance Metrics
- [ ] No layout shifts when toggling controls
- [ ] Smooth scrolling with 50+ items
- [ ] Fast rendering of list
- [ ] Animations run at 60fps

### Benefits of Dense List Design

1. **3-4x More Visible**: See 12-15 signals vs 3-4 cards in same space
2. **Faster Scanning**: Single-line format = easier to scan
3. **Less Scrolling**: More content visible = less scrolling needed
4. **No Width Issues**: Everything fits comfortably at 360px
5. **Cleaner UI**: Less visual noise, more focus on content
6. **Better Performance**: Simpler DOM = faster rendering
7. **Mobile Friendly**: Works great on narrow screens

### Migration Path

**Phase 1**: Create new SignalListItem component
**Phase 2**: Update TraderList to use new component
**Phase 3**: Update Sidebar width
**Phase 4**: Remove old SignalCardEnhanced (or keep for detail view)
**Phase 5**: Test and polish

Estimated time: 2-3 hours for full implementation

---

*[End of design. Ready for implementation]*
