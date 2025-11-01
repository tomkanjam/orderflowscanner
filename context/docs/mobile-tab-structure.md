# Mobile Tab Structure

**Last Updated:** 2025-10-31

## Overview

The mobile layout uses a 3-tab bottom navigation system designed for optimal trading workflow on mobile devices.

## Tab Configuration

### 1. Activity Tab (Default)
**Purpose:** Primary trading view with chart analysis and signal monitoring

**Layout:**
```
┌─────────────────────────┐
│   Mobile Header         │ (56px)
├─────────────────────────┤
│                         │
│   Chart Display         │ (45vh - fixed)
│   - Price action        │
│   - Indicators          │
│   - Touch controls      │
│                         │
├─────────────────────────┤
│   Signals Table         │ (Remaining space)
│   - Active signals      │ (Scrollable)
│   - Historical data     │
│   - Trader filters      │
│                         │
└─────────────────────────┘
│   Bottom Navigation     │ (64px)
└─────────────────────────┘
```

**Features:**
- Chart and signals **on the same page**
- Chart takes 45% of viewport height
- Signals section scrollable in remaining space
- No tab switching needed for core trading activity
- Badge shows active signal count

### 2. Traders Tab
**Purpose:** Browse and manage trading signal providers

**Layout:**
- Grid of trader cards (like desktop sidebar)
- Each card shows:
  - Trader name and description
  - Enable/disable toggle
  - Performance metrics
  - Filter settings access

**Status:** To be implemented

### 3. Create Tab
**Purpose:** Create new custom trading signals

**Layout:**
- Mobile-optimized signal creation form
- Natural language input
- Code editor (simplified for mobile)
- Template selection

**Status:** To be implemented

## Navigation Components

### Bottom Navigation
- **Location:** Fixed at bottom of screen
- **Height:** 64px
- **Tabs:** Activity (lime), Traders (cyan), Create (purple)
- **Interactions:** Tap to switch, active state highlighted

### Side Drawer
- **Trigger:** Hamburger menu in header
- **Content:** Full sidebar content (portfolio, positions, settings)
- **Animation:** Slide from left with backdrop overlay

### Mobile Header
- **Height:** 56px
- **Left:** Hamburger menu button
- **Center:** Connection status indicator
- **Right:** User menu/avatar

## Design Rationale

### Why Activity Tab is Default
- Most users open app to check signals and chart
- Combined view eliminates tab switching
- Faster time to actionable information

### Why Chart + Signals Together
- Users need context: see signal AND its chart
- Reduces cognitive load (no mental model of "where am I?")
- Better for quick decision making

### Why Separate Traders Tab
- Trader management is secondary task
- Cards need more space than bottom sheet
- Cleanly separates "monitoring" from "configuration"

## Implementation Files

- `apps/app/src/components/mobile/BottomNavigation.tsx` - Tab bar component
- `apps/app/components/MainContent.tsx` - Tab content routing (line 119-216)
- `apps/app/App.tsx` - Active tab state management (line 141)

## Mobile Breakpoint

- Applies when: `viewport width < 768px`
- Detected via: `useIsMobile()` hook
- Toggle between mobile/desktop layout is automatic

## Future Enhancements

1. **Traders Tab**
   - Implement trader card grid
   - Quick enable/disable controls
   - Performance sorting/filtering

2. **Create Tab**
   - Multi-step form wizard
   - Voice input for natural language
   - Code editor with syntax highlighting

3. **Activity Tab**
   - Swipe gestures to switch between chart timeframes
   - Pull-to-refresh for signals
   - Landscape mode optimization

## Related Documentation

- Mobile Layout Redesign: `context/issues/closed/20251030-051514-000-mobile-layout-redesign.md`
- Component Architecture: `context/docs/component-hierarchy.md` (if exists)
