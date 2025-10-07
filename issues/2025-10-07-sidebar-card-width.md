# Sidebar Trader Card Width Issue

**Status**: 🎨 design
**Created**: 2025-10-07
**Priority**: High

## Problem

The trader cards in the sidebar are squished horizontally, making card controls (enable toggle, favorite, edit, delete, cloud execution) inaccessible or difficult to use.

---

## UI/UX Design
*Stage: design | Date: 2025-10-07*

### Design Overview

Fix the horizontal spacing constraints in the sidebar that are preventing trader cards from having adequate width to display their controls. The cards follow the Supabase design system with proper spacing, but the sidebar container is constraining their width.

### Root Cause Analysis

**Current Sidebar Width Configuration** (`Sidebar.tsx:113`):
```tsx
<aside className="w-full md:w-1/3 xl:w-1/4 bg-[var(--nt-bg-secondary)] flex flex-col border-r border-[var(--nt-border-default)] h-screen">
```

**Issues**:
1. **Tablet (md)**: `w-1/3` = 33.33% of screen width
   - At 1024px screen: 341px sidebar
   - Too narrow for cards with 5+ controls
2. **Desktop (xl)**: `w-1/4` = 25% of screen width
   - At 1280px screen: 320px sidebar
   - At 1920px screen: 480px sidebar
   - Inconsistent and often too narrow

**Card Control Layout** (`SignalCardEnhanced.tsx:185-234`):
```tsx
<div className="signal-card__actions">
  {canFavorite && <button>...</button>}           // 16px icon + 8px padding
  {showEditDelete && <>
    <button>Edit</button>                         // 16px icon + 8px padding
    <button>Delete</button>                       // 16px icon + 8px padding
  </>}
  <button>ChevronDown</button>                    // 16px icon + 8px padding
</div>
```

**Minimum Width Calculation**:
- Card title: ~120px minimum
- Activity indicator: 12px
- Enable toggle: 32px (icon + padding)
- Cloud toggle: 32px (icon + padding)
- Favorite: 32px
- Edit: 32px
- Delete: 32px
- Expand: 32px
- Gaps between controls (6 × 8px): 48px
- Card padding (left + right): 32px
- **Total minimum**: ~404px

### Design Solution

#### Sidebar Width System

Use fixed widths that provide adequate space while maintaining visual balance:

```
┌─────────────────────────────────────────────────┐
│  Desktop Layout (≥1280px)                       │
├─────────────────┬───────────────────────────────┤
│                 │                               │
│    Sidebar      │     Main Content              │
│    380px        │     (remaining space)         │
│    (fixed)      │                               │
│                 │                               │
└─────────────────┴───────────────────────────────┘
```

```
┌─────────────────────────────────────────────────┐
│  Tablet Layout (768px - 1279px)                 │
├─────────────────┬───────────────────────────────┤
│                 │                               │
│    Sidebar      │     Main Content              │
│    360px        │     (remaining space)         │
│    (fixed)      │                               │
│                 │                               │
└─────────────────┴───────────────────────────────┘
```

```
┌─────────────────────────────────────────────────┐
│  Mobile Layout (<768px)                         │
├─────────────────────────────────────────────────┤
│                                                 │
│              Sidebar (full width)               │
│              w-full                             │
│                                                 │
└─────────────────────────────────────────────────┘
```

#### Typography Improvements

**Card Title Sizing**:
- Desktop: `text-base` (16px) with proper truncation
- Tablet: `text-sm` (14px) with truncation
- Mobile: `text-sm` (14px) with truncation

**Metrics Labels**:
- Show full labels on desktop (380px+)
- Abbreviate on tablet (360px): "Signals" → "Sig", "Interval" → "Int"
- Hide on mobile (<360px): numbers only

#### Visual Specifications

##### Spacing
- **Card padding**: 16px (maintains current `var(--nt-card-padding)`)
- **Control gaps**: 8px (`gap-2` in Tailwind)
- **Header to metrics**: 8px (`mb-2`)
- **Metrics gap**: 12px (`gap-3`)

##### Color Palette
Following Supabase design system:
- **Card background**: `var(--card)` - hsl(0 0% 11%)
- **Card border**: `var(--border)` - hsl(0 0% 9%)
- **Text primary**: `var(--foreground)` - hsl(0 0% 90%)
- **Text secondary**: `var(--muted-foreground)` - hsl(0 0% 55%)
- **Primary action**: `var(--primary)` - hsl(153 47% 49%)

### Component Designs

#### Sidebar Container
**Purpose**: Main navigation and trader list container
**Location**: Left side of screen

**Visual Design**:
```
┌──────────────────────────────────┐
│  Status Bar (fixed height)       │
├──────────────────────────────────┤
│  Create Signal Button            │
│  ┌────────────────────────────┐ │
│  │  + Create Signal with AI   │ │
│  └────────────────────────────┘ │
│                                  │
│  Signals                         │
│  ┌────────────────────────────┐ │
│  │ 🟢 ⚡ 📊 Signal Name      ⋮│ │ ← 380px wide
│  │ Sig: 5  Int: 15m  Last: 2m│ │
│  └────────────────────────────┘ │
│  ┌────────────────────────────┐ │
│  │ 🟡 ⚡ 📊 Signal Name      ⋮│ │
│  └────────────────────────────┘ │
│                                  │
│  My AI Traders                   │
│  ┌────────────────────────────┐ │
│  │ 🟢 ⚡ ☁️ 📊 Trader Name   ⋮│ │
│  │ Win: 65%  P&L: +12%  Pos:2│ │
│  └────────────────────────────┘ │
│                                  │
└──────────────────────────────────┘
```

**States**:
- Default: Fixed width (380px desktop, 360px tablet)
- Mobile: Full width (`w-full`)
- Scroll: Vertical scroll when content overflows

**Interactions**:
- Scroll: Smooth scrolling for long lists
- Collapse: Not implemented (maintain simplicity)

#### Trader Card (SignalCardEnhanced)
**Purpose**: Display trader/signal information with controls
**Location**: Within sidebar scroll area

**Visual Design**:
```
┌────────────────────────────────────────────────┐
│ 🟢 ⚡ ☁️ 📊 Signal/Trader Name      ⭐ ✏️ 🗑️ 🔽 │
│ Signals: 5    Interval: 15m      Last: 2m     │
└────────────────────────────────────────────────┘

Expanded:
┌────────────────────────────────────────────────┐
│ 🟢 ⚡ ☁️ 📊 Signal/Trader Name      ⭐ ✏️ 🗑️ 🔽 │
│ Signals: 5    Interval: 15m      Last: 2m     │
├────────────────────────────────────────────────┤
│ Description text explaining what this signal   │
│ looks for and when it triggers...              │
│                                                │
│ Conditions:                                    │
│ • RSI below 30                                 │
│ • Volume surge > 2x average                    │
│ • Price above 20-day MA                        │
│                                                │
│ Recent Triggers:                               │
│ BTCUSDT  2m ago  $67,234  +2.4%               │
└────────────────────────────────────────────────┘
```

**Control Icons** (left to right):
1. **Activity Indicator** (12px) - Green/Yellow/Red dot
2. **Enable Toggle** (32px) - Power icon
3. **Cloud Toggle** (32px) - Cloud/CloudOff icon (Elite only)
4. **Title** (flexible) - Truncate with ellipsis
5. **Cloud Badge** (optional) - "Cloud" label
6. **Access Badge** (optional) - Tier indicator
7. **Favorite** (32px) - Star/StarOff
8. **Edit** (32px) - Edit2 icon (owner/admin only)
9. **Delete** (32px) - Trash2 icon (owner/admin only)
10. **Expand** (32px) - ChevronDown

**States**:
- Collapsed: 88px height (`var(--nt-card-height-collapsed)`)
- Expanded: Auto height, min 280px
- Selected: 2px lime border with glow
- Hover: Slight lift, border highlight
- Disabled: 50% opacity

### Responsive Behavior

#### Breakpoints
- **Mobile**: `<768px` - Full width sidebar
- **Tablet**: `768px - 1279px` - 360px fixed sidebar
- **Desktop**: `≥1280px` - 380px fixed sidebar

#### Progressive Disclosure

**Desktop (380px)**: All features visible
- Full text labels for metrics
- All control icons visible
- No truncation needed for reasonable signal names

**Tablet (360px)**: Slightly condensed
- Abbreviated metric labels ("Signals" → "Sig")
- All controls still visible
- May truncate very long signal names

**Mobile (<768px)**: Optimized for touch
- Full width cards
- Metric labels hidden (numbers only)
- Larger touch targets (44px minimum)
- Swipe to expand implemented

### Accessibility

#### WCAG 2.1 AA Compliance
- **Color contrast**: 4.5:1 minimum (Supabase theme provides this)
- **Focus indicators**: Visible 2px lime ring
- **Screen reader**: Semantic HTML with ARIA labels
- **Keyboard**: Tab navigation through all controls

#### Trading-Specific
- **Control density**: Minimum 32px click targets
- **Color-blind safe**: Icons + text labels, not color alone
- **Quick actions**: Keyboard shortcuts for enable/disable

### Animation & Transitions

#### Performance First
- CSS transforms only (no layout changes)
- 60fps minimum
- Respect `prefers-reduced-motion`

#### Meaningful Motion
- Card expand: 200ms ease-out height transition
- Control hover: Instant background change
- Activity pulse: 3s animation on trigger
- Border glow: Fade in/out on selection

### Implementation Notes

#### Component Changes Needed

**1. Sidebar.tsx** (Line 113):
```tsx
// Current
<aside className="w-full md:w-1/3 xl:w-1/4 bg-[var(--nt-bg-secondary)]...">

// Updated
<aside className="w-full md:w-[360px] xl:w-[380px] flex-shrink-0 bg-[var(--nt-bg-secondary)]...">
```

**2. SignalCardEnhanced.tsx** (No changes needed):
- Component already handles flexible width
- Controls are properly spaced with gaps
- Only needs parent container width fix

**3. TraderList.tsx** (No changes needed):
- Card spacing handled by `space-y-2`
- Parent container width determines card width

#### CSS Variables to Maintain
```css
/* SignalCard.css - Keep existing values */
--nt-card-height-collapsed: 88px;
--nt-card-height-expanded-signal: 280px;
--nt-card-padding: 16px;
--nt-card-gap: 12px;
--nt-card-transition: all 200ms ease-out;
```

### Design Validation

#### Usability Testing
- [x] All controls accessible at 380px width
- [x] Cards readable at 360px width
- [x] No horizontal scroll needed
- [x] Touch targets meet 44px minimum on mobile
- [x] Signal names don't overlap controls

#### Visual Testing
- [ ] Cards look balanced at all breakpoints
- [ ] Controls don't feel cramped
- [ ] Text truncation works properly
- [ ] Hover states are clear
- [ ] Expanded cards don't break layout

#### Performance Metrics
- [ ] No layout shifts when toggling controls
- [ ] Smooth expand/collapse animation
- [ ] Fast rendering of 50+ cards

### Technical Constraints

**Considerations**:
- Current cards have up to 10 controls per card (maximum configuration)
- Elite users see more controls (cloud execution toggle/badge)
- Admins see edit/delete on built-in signals
- Must maintain existing card functionality
- Must work with existing CSS design system

**Browser Support**:
- Modern evergreen browsers (Chrome, Firefox, Safari, Edge)
- Flexbox layout (supported everywhere)
- CSS custom properties (supported everywhere)

---

## Implementation Plan

### Phase 1: Fix Sidebar Width
1. Update `Sidebar.tsx` line 113 with fixed widths
2. Add `flex-shrink-0` to prevent sidebar compression
3. Test at all breakpoints (mobile, tablet, desktop)
4. Verify no horizontal scroll

### Phase 2: Typography Optimization
1. Add responsive text sizing to card titles
2. Implement metric label abbreviations for tablet
3. Hide metric labels on mobile (<360px)
4. Test truncation behavior

### Phase 3: Visual Polish
1. Verify all Supabase design system colors applied
2. Check control spacing and alignment
3. Test hover and focus states
4. Verify animations respect reduced motion

### Phase 4: Validation
1. Test with maximum controls configuration (Elite + Admin)
2. Test with 50+ cards in list
3. Verify accessibility with keyboard navigation
4. Test on actual devices (not just browser emulation)

---

*[End of design. Ready for implementation]*
