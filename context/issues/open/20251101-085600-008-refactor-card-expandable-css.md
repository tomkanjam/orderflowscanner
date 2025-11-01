# Refactor CardExpandable.css - Convert 81 Lines to shadcn/ui

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

`CardExpandable.css` contains 81 lines of custom transitions and fade effects for expandable card components. Should use shadcn Collapsible component with default transitions.

## Linked Items
- Part of: `context/issues/open/20251101-085600-001-PROJECT-default-shadcn-ui-cleanup.md`

## Progress

Not started

## Spec

### Current Issues

- Custom CSS for expand/collapse transitions
- Custom fade effects
- Not using shadcn Collapsible component

### Replace With shadcn Components

1. **Collapsible Component**: Use `<Collapsible>`, `<CollapsibleTrigger>`, `<CollapsibleContent>`
2. **Card Component**: Wrap in shadcn `<Card>`
3. **Transitions**: Use default Collapsible animations

### Implementation

1. Delete `CardExpandable.css` file
2. Refactor CardExpandable to use shadcn Collapsible + Card
3. Replace custom transition CSS with Collapsible defaults
4. Remove custom fade classes
5. Test expand/collapse on mobile
6. Verify smooth animations

### Success Criteria

- `CardExpandable.css` deleted (81 lines removed)
- Uses shadcn Collapsible component
- Uses shadcn Card component
- Default transition animations
- Mobile-friendly expand/collapse (44px+ touch target)
