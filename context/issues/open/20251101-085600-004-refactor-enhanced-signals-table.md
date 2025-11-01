# Refactor EnhancedSignalsTable - Remove 50+ Custom Colors

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

`EnhancedSignalsTable.tsx` has 50+ hardcoded hex colors including #0d1421 (dark bg), #1a2332 (medium bg), #8efbba (green), #64748b (gray), #e2e8f0 (light gray). This is the highest-violation component in the codebase.

## Linked Items
- Part of: `context/issues/open/20251101-085600-001-PROJECT-default-shadcn-ui-cleanup.md`

## Progress

Not started

## Spec

### Replace Custom Colors With shadcn/ui Classes

| Current Custom | Replace With |
|----------------|--------------|
| `#0d1421`, `#1a2332` | `bg-background`, `bg-card`, `bg-muted` |
| `#8efbba` (green) | `text-green-500`, `bg-green-500/10` |
| `#64748b` (gray) | `text-muted-foreground` |
| `#e2e8f0` (light gray) | `text-foreground`, `border-border` |
| Custom hover states | `hover:bg-muted/50` |
| Custom borders | `border-border` |

### Component Structure Changes

1. Use shadcn Table component primitives:
   - `<Table>`, `<TableHeader>`, `<TableRow>`, `<TableHead>`, `<TableBody>`, `<TableCell>`
2. Use shadcn Badge for status indicators
3. Use shadcn Button for actions
4. Remove all inline style objects with hardcoded colors
5. Replace with Tailwind utility classes using shadcn tokens

### Implementation Steps

1. Import shadcn Table components
2. Replace table structure with shadcn primitives
3. Convert all background colors to `bg-*` utilities
4. Convert all text colors to `text-*` utilities
5. Convert all borders to `border-*` utilities
6. Test responsive behavior on mobile
7. Verify dark theme consistency

### Success Criteria

- Zero hardcoded hex colors
- Uses shadcn Table components
- Maintains all functionality
- Responsive on mobile (44px+ touch targets)
- Passes visual comparison with default shadcn dark theme
