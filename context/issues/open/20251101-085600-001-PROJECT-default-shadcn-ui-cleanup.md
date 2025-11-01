# Default shadcn/ui Dark Theme Cleanup

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

The codebase currently has **180+ instances of custom coloring across 28+ files** with 4 competing design systems and 1,474 lines of custom CSS. This violates the project mandate to use shadcn/ui components exclusively and prevents consistent, professional mobile-first design.

### Current State
- **4 design system CSS files** (TradeMind, Neon Terminal, Supabase, Migration)
- **7 custom color scales** in Tailwind config (Electric Lime, Amber, Cyan, Green, Red, Yellow, Custom border)
- **100+ CSS color variables** defining custom palettes
- **50+ custom component classes** (.nt-button, .tm-card, etc.) that should use shadcn/ui
- **180+ hardcoded hex colors** across components

### Design System Evolution
1. **Original**: TradeMind design system (#8efbba green)
2. **Attempted**: Neon Terminal design system (#C6FF00 electric lime)
3. **Incomplete**: Supabase design system (oklch colors)
4. **Expected**: shadcn/ui adoption (NEVER COMPLETED)

Result: **Multiple overlapping custom systems** instead of shadcn/ui standards.

## Linked Items
- Initiative: End-to-end trader workflow implementation (requires consistent UI)
- Related: Mobile-first design philosophy, shadcn/ui mandate

## Sub-issues

### Phase 1: Configuration & Foundation
- [ ] `context/issues/open/20251101-085600-002-remove-legacy-design-systems.md` - Delete 4 legacy design system CSS files
- [ ] `context/issues/open/20251101-085600-003-clean-tailwind-config.md` - Remove 7 custom color scales, restore defaults

### Phase 2: Critical Components (50+ violations)
- [ ] `context/issues/open/20251101-085600-004-refactor-enhanced-signals-table.md` - Replace 50+ hardcoded colors with shadcn/ui
- [ ] `context/issues/open/20251101-085600-005-refactor-portfolio-metrics.md` - Replace 18 hardcoded colors with shadcn/ui

### Phase 3: CSS Files
- [ ] `context/issues/open/20251101-085600-006-refactor-tiers-css.md` - Convert 567 lines of custom tier styling to shadcn/ui
- [ ] `context/issues/open/20251101-085600-007-refactor-signal-card-css.md` - Convert 311 lines to shadcn/ui patterns
- [ ] `context/issues/open/20251101-085600-008-refactor-card-expandable-css.md` - Convert 81 lines to shadcn/ui transitions

### Phase 4: Remaining Components (15+ files)
- [ ] `context/issues/open/20251101-085600-009-refactor-mobile-components.md` - ActivityPanel, MobileActivityPanel, MobileSidebar
- [ ] `context/issues/open/20251101-085600-010-refactor-admin-components.md` - AdminPanel, FirebaseTestButton, etc.
- [ ] `context/issues/open/20251101-085600-011-refactor-misc-components.md` - Remaining 10+ files with custom colors

## Progress

**Status:** Phase 2 Complete - All component hex colors removed

**Completed:**
- ✅ Phase 1: Removed 6 legacy design system CSS files (1,474+ lines deleted)
- ✅ Phase 1: Cleaned Tailwind config (removed all 7 custom color scales)
- ✅ Phase 1: Created default shadcn/ui dark theme in main.css
- ✅ Phase 2: Removed ALL 46 hex colors from component files:
  - PositionManager.tsx (28 instances) → shadcn tokens
  - StrategyManager.tsx (8 instances) → shadcn tokens
  - TradeExecutionModal.tsx (8 instances) → shadcn tokens
  - EnhancedAnalysis.tsx (1 instance) → shadcn tokens
  - ActivityIndicator.tsx (1 instance) → shadcn tokens
  - CardExpandable.tsx → Pure Tailwind with shadcn tokens
- ✅ Deleted CardExpandable.css (80 lines) - component uses inline utilities
- ✅ Build verified successful ✓

**Remaining Work (Phase 3):**
- **CSS Files (877 lines):** Components work but use old CSS variables
  - SignalCard.css (310 lines) - needs conversion to shadcn patterns
  - tiers.css (567 lines) - needs conversion to shadcn components

**Note:** All hex colors in components removed. Remaining CSS files use old variables and need component-level refactoring to use shadcn/ui Card and Badge components.

## Spec

### Audit Complete ✓

**Key Findings:**
- **Configuration**: 7 custom color scales, 100+ CSS variables, custom border-radius
- **CSS Files**: 1,474 total lines across 4 design systems + component CSS
- **Components**: 180+ hardcoded hex colors, 50+ custom classes
- **Impact**: Cannot launch with competing systems, high maintenance burden

### Implementation Strategy

**Phase 1: Foundation (Config)**
Remove dead weight first - legacy CSS and Tailwind overrides. This unblocks everything.

**Phase 2: Critical Components**
Highest-impact components with 50+ violations. These are user-facing and set the pattern.

**Phase 3: CSS Refactor**
Convert custom component CSS (tiers, cards) to shadcn/ui patterns and variants.

**Phase 4: Long Tail**
Systematic cleanup of remaining 15+ files following established patterns.

**Success Criteria:**
- Zero custom color definitions in Tailwind config
- Zero custom CSS design system files
- Zero hardcoded hex colors in components
- All UI uses default Tailwind/shadcn dark theme
- All components use shadcn/ui primitives

**Testing Strategy:**
- Use Chrome DevTools MCP to verify visual consistency
- Test mobile responsiveness on all refactored components
- Verify dark theme appearance matches shadcn/ui defaults
- Check for accessibility issues (contrast, focus states)

**Risk Mitigation:**
- Work incrementally - one sub-issue at a time
- Test after each phase
- Keep commits small and focused
- Document any shadcn variants needed for functionality
