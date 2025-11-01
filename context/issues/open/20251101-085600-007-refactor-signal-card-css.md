# Refactor SignalCard.css - Convert 311 Lines to shadcn/ui

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

`SignalCard.css` contains 311 lines of custom styling including hardcoded activity state colors (#FF8C00), custom animations, and custom transitions. Should use shadcn Card component.

## Linked Items
- Part of: `context/issues/open/20251101-085600-001-PROJECT-default-shadcn-ui-cleanup.md`

## Progress

Not started

## Spec

### Current Issues

- Hardcoded `#FF8C00` for "active" signal state
- Custom animations (signal-fade, pulse, etc.)
- Custom transition effects
- Activity state styling not using shadcn patterns

### Replace With shadcn Patterns

1. **Card Component**: Use `<Card>` with variants
2. **Activity States**: Use Badge variants (default, secondary, outline, destructive)
3. **Animations**: Use default Tailwind transitions
4. **Status Colors**: Use semantic colors (text-green, text-destructive, text-amber)

### Color Mappings

| Current | Replace With |
|---------|--------------|
| `#FF8C00` (orange active) | `text-amber-500`, `border-amber-500/50` |
| Custom pulse animation | `animate-pulse` (Tailwind default) |
| Custom fade effects | `transition-opacity duration-200` |

### Implementation

1. Delete `SignalCard.css` file
2. Refactor SignalCard component to use shadcn Card
3. Replace custom activity classes with Badge variants
4. Use Tailwind animation utilities
5. Convert custom transitions to Tailwind utilities
6. Test signal state transitions
7. Verify mobile tap interactions

### Success Criteria

- `SignalCard.css` deleted (311 lines removed)
- Uses shadcn Card component
- Activity states use Badge variants
- No hardcoded colors
- Smooth transitions with Tailwind utilities
- Mobile-responsive card interactions
