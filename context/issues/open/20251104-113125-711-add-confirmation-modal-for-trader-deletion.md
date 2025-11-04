# Add Confirmation Modal for Trader Deletion

**Type:** enhancement
**Initiative:** none
**Created:** 2025-11-04 11:31:25

## Context
Currently, when users delete a trader, the app uses a browser `window.confirm()` dialog. This provides basic confirmation but doesn't align with our design system and mobile-first philosophy. We need a proper confirmation modal that:

1. Matches our shadcn/ui design system
2. Provides clear, mobile-friendly touch targets (44px+)
3. Shows the trader name being deleted
4. Uses our color scheme and styling
5. Works well on all screen sizes

This is a UX improvement identified after fixing the trader deletion bug (commit 1155f33).

## Linked Items
- Related: Trader deletion fix (commit 1155f33)

## Spec
1. Create a reusable `ConfirmDialog` component using shadcn/ui Alert Dialog
2. Replace `window.confirm()` in TraderList.tsx:146 with the new component
3. Display trader name in confirmation message
4. Ensure proper mobile touch targets (44px+ buttons)
5. Use destructive styling for delete action
6. Add keyboard navigation support (Escape to cancel, Enter to confirm)

Design requirements:
- Title: "Delete Trader?"
- Message: "Are you sure you want to delete '{traderName}'? This action cannot be undone."
- Buttons: "Cancel" (secondary) and "Delete" (destructive/red)
- Mobile-first: Stack buttons vertically on small screens, horizontal on larger
- Animation: Smooth fade-in/out

Reference: TraderList.tsx:145-156 for current implementation

## Progress
✅ Completed implementation:
1. Installed shadcn/ui AlertDialog component
2. Created reusable ConfirmDialog component with:
   - Mobile-first design with 44px+ touch targets
   - Destructive styling for delete action
   - Smooth animations
   - Keyboard navigation support
3. Replaced window.confirm() in TraderList.tsx
4. Displays trader name in confirmation message
5. Improved error handling (shows error message from backend)
6. Successfully built and tested

## Completion
**Closed:** 2025-11-04 13:20:01
**Outcome:** Success
**Commits:** TBD (pending commit)
