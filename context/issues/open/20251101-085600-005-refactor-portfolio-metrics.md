# Refactor PortfolioMetrics - Remove 18 Custom Colors

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

`PortfolioMetrics.tsx` has 18 hardcoded colors for cards, badges, and metric displays. Needs conversion to shadcn/ui Card and Badge components.

## Linked Items
- Part of: `context/issues/open/20251101-085600-001-PROJECT-default-shadcn-ui-cleanup.md`

## Progress

Not started

## Spec

### Current Issues

- Custom background colors for metric cards
- Hardcoded badge colors (success, warning, error states)
- Custom hover effects
- Inline styles instead of Tailwind utilities

### Replace With shadcn Components

1. **Card Component**: Use `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`
2. **Badge Component**: Use `<Badge variant="default|secondary|destructive|outline">`
3. **Typography**: Use default text colors (`text-foreground`, `text-muted-foreground`)

### Color Mappings

| Current | Replace With |
|---------|--------------|
| Custom card backgrounds | `bg-card` |
| Custom metric backgrounds | `bg-muted/50` |
| Custom green (positive) | `text-green-500`, `bg-green-500/10` |
| Custom red (negative) | `text-destructive`, `bg-destructive/10` |
| Custom borders | `border-border` |

### Implementation

1. Import shadcn Card and Badge components
2. Replace custom card structure with shadcn Card
3. Replace custom badges with shadcn Badge variants
4. Convert inline styles to Tailwind utilities
5. Test responsive layout on mobile
6. Verify metric calculations remain accurate

### Success Criteria

- Zero hardcoded colors
- Uses shadcn Card and Badge
- Responsive mobile layout
- All metrics display correctly
- Visual consistency with shadcn dark theme
