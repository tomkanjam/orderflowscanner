# Clean Tailwind Config - Remove Custom Colors

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

`tailwind.config.js` defines 7 custom color scales and custom border settings that override Tailwind/shadcn defaults. These must be removed to use default dark theme.

## Linked Items
- Part of: `context/issues/open/20251101-085600-001-PROJECT-default-shadcn-ui-cleanup.md`

## Progress

**Completed** - Removed all 7 custom color scales, restored to default shadcn/ui theme

## Completion
**Closed:** 2025-11-01 08:58:00
**Outcome:** Success
**Commits:** Pending (will be in Phase 1 commit)

## Spec

### Custom Colors to Remove (168 lines)

1. **electricLime**: 11 shades from 50-950 (#C6FF00 based)
2. **amber**: 11 shades (#FF7A1A based)
3. **cyan**: 11 shades (#3399FF based)
4. **green**: 11 shades (#00FF88 based)
5. **red**: 11 shades (#FF0040 based)
6. **yellow**: 11 shades (#FFD700 based)
7. **border**: Custom `rgba(90, 90, 87, 0.3)`
8. **borderRadius**: All values overridden with CSS variables

### Implementation

1. Open `apps/app/tailwind.config.js`
2. Remove all custom color definitions under `colors: {}`
3. Remove custom `borderRadius` CSS variable overrides
4. Keep only shadcn/ui theme variables (from globals.css)
5. Ensure default Tailwind colors are available
6. Test build

### After Cleanup

Config should have:
- Default Tailwind colors only
- shadcn/ui CSS variables for theming (--background, --foreground, etc.)
- No custom color scales
- Default border-radius values

### Success Criteria

- 168 lines of custom color definitions removed
- Tailwind config uses defaults only
- Build succeeds
- shadcn/ui components render correctly with default theme
