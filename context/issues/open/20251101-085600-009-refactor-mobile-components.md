# Refactor Mobile Components - Remove Custom Colors

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

Mobile-specific components (ActivityPanel, MobileActivityPanel, MobileSidebar) have custom colors and styling that should use shadcn/ui patterns.

## Linked Items
- Part of: `context/issues/open/20251101-085600-001-PROJECT-default-shadcn-ui-cleanup.md`

## Progress

Not started

## Spec

### Components to Refactor

1. **ActivityPanel.tsx** - Custom panel backgrounds and borders
2. **MobileActivityPanel.tsx** - Custom mobile-specific styling
3. **MobileSidebar.tsx** - Custom sidebar colors
4. **MobileNavbar.tsx** - Custom navbar styling
5. **SidebarHeader.tsx** - Custom header backgrounds

### Replace With

- **Sheet Component**: For mobile sidebar/panels
- **Card Component**: For activity panels
- **Default Colors**: `bg-background`, `bg-card`, `border-border`

### Implementation

1. Import shadcn Sheet for mobile overlays
2. Replace custom panel backgrounds with `bg-card`
3. Replace custom borders with `border-border`
4. Use Sheet for MobileSidebar
5. Test mobile interactions (swipe, tap, scroll)
6. Verify 44px+ touch targets
7. Test on multiple screen sizes

### Success Criteria

- All mobile components use shadcn primitives
- No hardcoded colors
- 44px+ touch targets throughout
- Smooth mobile transitions
- Sheet component for overlays
- Responsive across phone/tablet sizes
