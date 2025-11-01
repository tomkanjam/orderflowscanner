# Refactor Admin Components - Remove Custom Colors

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

Admin and utility components (AdminPanel, FirebaseTestButton, etc.) have custom colors that should use shadcn/ui defaults.

## Linked Items
- Part of: `context/issues/open/20251101-085600-001-PROJECT-default-shadcn-ui-cleanup.md`

## Progress

Not started

## Spec

### Components to Refactor

1. **AdminPanel.tsx** - Custom panel styling
2. **FirebaseTestButton.tsx** - Custom button colors
3. **DevTools.tsx** - Custom dev panel styling
4. **DebugPanel.tsx** - Custom debug colors

### Replace With

- **Card Component**: For admin panels
- **Button Component**: For all buttons (variant="default|secondary|destructive|outline")
- **Badge Component**: For status indicators
- **Alert Component**: For messages/warnings

### Implementation

1. Replace admin panels with shadcn Card
2. Replace custom buttons with shadcn Button variants
3. Replace status indicators with Badge
4. Use Alert for warnings/messages
5. Remove all hardcoded colors
6. Test admin functionality

### Success Criteria

- All admin components use shadcn primitives
- Button variants used correctly (destructive for dangerous actions)
- No hardcoded colors
- Admin functionality unchanged
- Consistent with default dark theme
