# White Page on Mobile Safari and Brave

**Type:** bug
**Initiative:** none
**Created:** 2025-11-15 08:03:05

## Context
Users are seeing a white page when accessing the app on mobile Safari and Brave browsers. This is a critical bug that prevents any mobile usage and violates the mobile-first design philosophy.

## Linked Items
- Related: None yet

## Progress
Investigating root cause. Key findings:
- App uses SharedArrayBuffer which requires COOP/COEP headers
- Vite config sets strict headers that may not work on all mobile browsers
- No root-level error boundary to catch initialization failures
- Multiple environment variable dependencies

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
(To be filled when closing)
