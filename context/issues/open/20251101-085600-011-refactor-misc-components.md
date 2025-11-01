# Refactor Miscellaneous Components - Remove Custom Colors

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 08:56:00

## Context

Remaining 10+ component files with custom colors (5-10 violations each). Final cleanup to achieve zero hardcoded colors.

## Linked Items
- Part of: `context/issues/open/20251101-085600-001-PROJECT-default-shadcn-ui-cleanup.md`

## Progress

Not started

## Spec

### Components to Refactor

1. **Header.tsx** - Custom header backgrounds
2. **Footer.tsx** - Custom footer styling
3. **Modal components** - Custom overlay colors
4. **Form components** - Custom input styling
5. **Chart components** - Custom chart backgrounds
6. **Loading components** - Custom spinner colors
7. **Error components** - Custom error styling
8. **Toast notifications** - Custom toast colors
9. **Dropdown menus** - Custom menu styling
10. **Tabs/navigation** - Custom tab colors

### General Replacement Pattern

| Element | Use shadcn Component |
|---------|---------------------|
| Modals | Dialog |
| Forms | Form + Input + Label |
| Dropdowns | DropdownMenu |
| Tabs | Tabs |
| Toasts | Toast/Sonner |
| Loading | Default Tailwind spin |

### Implementation

1. Audit each component for hardcoded colors
2. Replace with appropriate shadcn component
3. Use default Tailwind utilities for spacing/layout
4. Test functionality
5. Verify mobile responsiveness
6. Check dark theme consistency

### Success Criteria

- All remaining components use shadcn primitives
- Zero hardcoded hex colors in entire codebase
- All modals use Dialog component
- All forms use Form component
- All dropdowns use DropdownMenu
- All toasts use Toast/Sonner
- Mobile-responsive throughout
