# Rollback Analysis - Cleanup Issues

## What Happened
The cleanup commit (0f94001) broke the app initialization. After investigation, the issue was NOT with the cleanup itself, but it exposed an existing bug in App.tsx.

## The Real Problem
In `App.tsx`, the `loadInitialData` function was calling `fetchTopPairsAndInitialKlines` multiple times for different intervals:

```typescript
// Line 548 - problematic code
for (const interval of otherIntervals) {
  const { klinesData: intervalData } = await fetchTopPairsAndInitialKlines(interval, klineLimit);
  // ...
}
```

This is inefficient and error-prone because:
1. It fetches tickers from the API multiple times
2. Each call could return different symbols (if API data changes)
3. If any call fails or returns empty, symbols become undefined
4. Rate limiting could cause subsequent calls to fail

## Why It Broke After Cleanup
The cleanup removed the old implementation files but kept the modified App.tsx that was trying to use only SharedMarketData. However, the initialization flow wasn't properly updated to handle the SharedMarketData-only approach.

## Current Status
- Rolled back to commit cb4647e (before cleanup)
- App should be working with the old implementation
- Performance mode selection still available (individual/batched/shared)

## Proper Fix Strategy
To properly implement the cleanup without breaking the app:

1. **Fix the multi-interval fetching first**:
   - Fetch tickers and symbols only once
   - Reuse the symbols list for all interval fetches
   - Handle errors gracefully per symbol

2. **Then apply cleanup incrementally**:
   - Phase 1: Fix the fetching logic
   - Phase 2: Remove old hooks one by one
   - Phase 3: Clean up debug statements
   - Phase 4: Extract constants
   - Test after each phase

3. **Ensure backward compatibility**:
   - Keep performance mode selection working
   - Maintain fallbacks during transition
   - Test thoroughly before removing old code

## Next Steps
1. Fix the fetchTopPairsAndInitialKlines multi-call issue
2. Test that the fix works properly
3. Re-apply cleanup changes incrementally
4. Test after each cleanup phase
5. Only proceed when app is stable

## Lessons Learned
- Cleanup can expose hidden bugs in existing code
- Always test incrementally when removing code
- The multi-interval fetching pattern was fundamentally flawed
- Need better error handling in data initialization