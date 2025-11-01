# Remove Legacy Design System Files

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

The codebase has 4 competing design system CSS files totaling 1,474 lines of custom CSS that should be replaced with shadcn/ui defaults. These files define custom colors, components, and utilities that violate the shadcn/ui-only mandate.

## Linked Items
- Part of: `context/issues/open/20251101-085600-001-PROJECT-default-shadcn-ui-cleanup.md`

## Progress

**Completed** - All 6 legacy design system CSS files deleted (1,474+ lines removed)

## Completion
**Closed:** 2025-11-01 08:58:00
**Outcome:** Success
**Commits:** Pending (will be in Phase 1 commit)

## Spec

### Files to Delete

1. **`/apps/app/public/neon-terminal-design-system.css`** (633 lines)
   - 100+ CSS custom properties defining colors
   - 50+ custom component classes (.nt-button, .nt-card, .nt-input, etc.)
   - 15+ custom animations (shimmer, pulse, glow, signal-fade)
   - Custom Electric Lime (#C6FF00) color system

2. **`/apps/app/public/trademind-design-system.css`** (447 lines)
   - Older duplicate system with competing green (#8efbba vs #C6FF00)
   - Custom component classes (.tm-btn, .tm-card, etc.)
   - Conflicting color definitions

3. **`/apps/app/public/trademind-to-neon-migration.css`** (77 lines)
   - Migration shim mapping old custom system to new custom system
   - No longer needed after cleanup

4. **`/apps/app/public/supabase-design-system.css`** (317 lines)
   - 24 oklch color scales
   - Custom utilities and patterns
   - Incomplete Supabase styling attempt

### Implementation

1. Verify no components import these CSS files
2. Remove any `<link>` tags in HTML/index files
3. Delete all 4 CSS files
4. Test app builds successfully
5. Verify no visual regressions (components should fall back to default styles temporarily)

### Success Criteria

- All 4 legacy CSS files deleted
- No import/link references remain
- App builds without errors
- 1,474 lines of custom CSS removed
