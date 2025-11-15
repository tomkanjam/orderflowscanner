# White Page on Mobile Safari and Brave

**Type:** bug
**Initiative:** none
**Created:** 2025-11-15 08:03:05

## Context
Users are seeing a white page when accessing the app on mobile Safari and Brave browsers. This is a critical bug that prevents any mobile usage and violates the mobile-first design philosophy.

## Linked Items
- Related: None yet

## Progress
✅ Root cause identified and fixed

Key findings:
- SharedMarketData threw error when SharedArrayBuffer unavailable on mobile browsers
- Error occurred during initialization before any error boundary could catch it
- No fallback mechanism for browsers without SharedArrayBuffer support

Implementation completed:
- Added RootErrorBoundary component with mobile-friendly error UI
- Wrapped app with RootErrorBoundary in index.tsx
- Modified SharedMarketData to fall back to ArrayBuffer when SharedArrayBuffer unavailable
- Added error logging to localStorage for mobile debugging
- Added reload and report issue buttons to error UI

## Spec
Common causes for white page on mobile:
1. JavaScript errors during app initialization
2. Missing error boundary at root level
3. Environment variable issues
4. Build configuration problems (COOP/COEP headers)
5. Browser compatibility issues (SharedArrayBuffer support)

Investigation findings:
- SharedMarketData uses SharedArrayBuffer (apps/app/src/shared/SharedMarketData.ts)
- Vite config sets strict COOP/COEP headers for SharedArrayBuffer support
- These headers may not work correctly on all mobile browsers
- Mobile Safari has limited SharedArrayBuffer support

Implementation plan:
1. Add root-level error boundary with mobile-friendly error UI
2. Add feature detection for SharedArrayBuffer
3. Provide graceful degradation if SharedArrayBuffer not available
4. Add error logging to localStorage for debugging
5. Consider making COOP/COEP headers conditional (dev only)
6. Add initialization error tracking

## Completion
**Closed:** 2025-11-15 08:10:22
**Outcome:** Success
**Commits:** d00c735

Changes implemented:
1. Created RootErrorBoundary component (apps/app/src/components/RootErrorBoundary.tsx)
2. Wrapped app with error boundary in index.tsx
3. Modified SharedMarketData to gracefully handle missing SharedArrayBuffer
4. Added mobile-friendly error UI with recovery options

The app should now work on mobile Safari and Brave browsers. If SharedArrayBuffer is unavailable, the app will fall back to ArrayBuffer with a console warning. Any remaining initialization errors will be caught by the error boundary and displayed to the user with options to reload or report the issue.

Testing notes:
- Dev server confirmed running on http://localhost:5174
- User should test on actual mobile Safari and Brave to verify fix
- Error UI includes "Report Issue" button that creates pre-filled GitHub issue
