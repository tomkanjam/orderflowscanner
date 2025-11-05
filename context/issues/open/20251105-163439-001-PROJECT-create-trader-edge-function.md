# PROJECT: Create Trader Edge Function - Proper Backend Architecture

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-05 16:34:39

## Context

**Architecture Violation Discovered**: The frontend is currently writing directly to the database when creating traders, which violates the proper Supabase architecture pattern.

### Current (Incorrect) Flow
```
Frontend → LLM Proxy Edge Function (get data)
Frontend → Manually assemble trader object (loses fields)
Frontend → Write directly to database (incomplete data)
```

### Expected (Correct) Flow
```
Frontend → Create Trader Edge Function (send prompt)
Edge Function → Orchestrate LLM calls + assemble + validate + write to DB
Frontend ← Subscribe to DB changes via Realtime (receive complete trader)
```

### Root Cause of Indicator Bug
The missing indicator visualization bug occurred because:
1. LLM Proxy correctly returns `seriesCode` and `indicators` ✅
2. Frontend JavaScript destructures response and **discards these fields** ❌
3. Frontend manually builds trader object without `seriesCode` ❌
4. Frontend writes incomplete object to database ❌
5. Signals have no indicator data, charts show nothing ❌

**The fix deployed to LLM Proxy was correct, but frontend architecture prevents the fix from working.**

### Why This Architecture Matters
- **Single Source of Truth**: Edge function owns the complete trader schema
- **Data Integrity**: Backend validates and ensures completeness before writing
- **Maintainability**: Adding new fields doesn't require frontend changes
- **Separation of Concerns**: Frontend focuses on UI, backend handles data assembly
- **Best Practice**: Follows Supabase recommended patterns

## Linked Items
- Related: `context/issues/open/20251105-125847-001-PROJECT-custom-indicator-visualization.md`
- Blocks: Full indicator visualization feature until architecture is fixed

## Sub-issues
- [ ] `20251105-163439-002-create-trader-edge-function-implementation.md` - Implement create-trader edge function
- [ ] `20251105-163439-003-refactor-frontend-trader-creation.md` - Refactor frontend to use edge function
- [ ] `20251105-163439-004-add-realtime-subscription.md` - Add Supabase Realtime for trader updates

## Progress

**2025-11-05**: Project created after identifying architectural violation during indicator bug investigation.

## Spec

### Objectives
1. Create `create-trader` edge function that handles complete trader creation flow
2. Remove direct database writes from frontend
3. Implement Supabase Realtime subscription for trader updates
4. Ensure all LLM-generated fields reach the database intact

### Architecture Design

#### New Edge Function: `create-trader`

**Endpoint**: `/functions/v1/create-trader`

**Responsibilities**:
1. Receive user prompt and configuration from frontend
2. Call LLM Proxy for metadata generation
3. Call LLM Proxy for filter code generation (includes seriesCode & indicators)
4. Assemble complete trader object with ALL fields from LLM responses
5. Validate trader structure (required fields, types, constraints)
6. Write to `traders` table in database
7. Return trader ID or success status
8. Handle errors gracefully with proper error messages

**Input**:
```typescript
{
  userPrompt: string;
  klineInterval?: string;
  mode?: 'demo' | 'live';
  userId?: string;
  isBuiltIn?: boolean;
  // ... other config
}
```

**Output**:
```typescript
{
  success: boolean;
  traderId?: string;
  error?: {
    code: string;
    message: string;
  }
}
```

**Key Features**:
- Uses LLM Proxy internally (no direct LLM calls)
- Preserves ALL fields from LLM responses (filterCode, seriesCode, indicators, etc.)
- Applies default values for missing optional fields
- Validates filter structure before writing
- Uses service role key for database writes (bypasses RLS)
- Logs to Braintrust for observability

#### Frontend Changes

**Remove**:
- Direct Supabase client writes in `traderManager.createTrader()`
- Manual trader object assembly in `TraderForm.tsx`
- Field destructuring in `geminiService.ts` that loses data

**Add**:
- Call to `create-trader` edge function from `TraderForm`
- Supabase Realtime subscription in `traderManager` to listen for new traders
- Loading states while edge function processes
- Error handling for edge function failures

**Simplify**:
- Frontend only needs to send user prompt + config
- Frontend receives complete trader via Realtime
- No need for frontend to know database schema

#### Database Flow

```
1. User submits prompt in UI
2. Frontend calls create-trader edge function
3. Edge function:
   a. Calls LLM Proxy (generate-trader-metadata)
   b. Calls LLM Proxy (generate-filter-code)
   c. Assembles trader object:
      {
        name: metadata.suggestedName,
        filter: {
          code: filterCode,
          seriesCode: seriesCode,        // ✅ Preserved
          indicators: indicators,         // ✅ Preserved
          requiredTimeframes: timeframes,
          language: 'go'
        },
        strategy: { ... },
        // ... all other fields
      }
   d. Validates structure
   e. INSERT INTO traders
4. Database triggers Realtime event
5. Frontend subscription receives new trader
6. UI updates automatically
```

### Benefits

**Immediate**:
- Fixes indicator visualization bug (seriesCode reaches database)
- Prevents future data loss bugs
- Cleaner separation of concerns

**Long-term**:
- Easier to add new fields (change one place: edge function)
- Better error handling (backend validates before writing)
- Improved observability (Braintrust logs in one place)
- Follows Supabase best practices
- Easier to test (edge function is isolated unit)

### Migration Strategy

**Phase 1**: Create edge function (backward compatible)
- Implement `create-trader` edge function
- Keep existing frontend code working
- Test edge function independently

**Phase 2**: Add Realtime subscription
- Add subscription to `traderManager`
- Verify it receives new traders
- Don't remove old code yet

**Phase 3**: Switch frontend to use edge function
- Update `TraderForm` to call edge function
- Remove manual object assembly
- Remove direct DB writes
- Keep old code commented for rollback

**Phase 4**: Cleanup
- Remove old frontend code
- Update tests
- Update documentation

### Testing Strategy

**Edge Function Tests**:
- Unit test: Complete trader object assembly
- Unit test: Field preservation from LLM responses
- Integration test: End-to-end trader creation
- Error test: Invalid LLM responses
- Error test: Database write failures

**Frontend Tests**:
- Integration test: Edge function call succeeds
- Integration test: Realtime subscription receives trader
- UI test: Loading states during creation
- UI test: Error display on failure

**E2E Test**:
1. User enters prompt in UI
2. Trader created via edge function
3. Frontend receives trader via Realtime
4. Chart displays indicators correctly
5. Signals generate with indicator_data

## Completion Criteria

1. ✅ `create-trader` edge function implemented and deployed
2. ✅ Edge function preserves all LLM fields (seriesCode, indicators)
3. ✅ Frontend calls edge function instead of direct DB writes
4. ✅ Supabase Realtime subscription delivers new traders to frontend
5. ✅ Indicator visualization works end-to-end
6. ✅ Old direct-write code removed from frontend
7. ✅ Tests pass for edge function and frontend integration
8. ✅ Documentation updated with new architecture

---

## Notes

**Why This Wasn't Caught Earlier**:
- Frontend was tested in isolation (worked)
- Backend was tested in isolation (worked)
- Missing: Integration test that verified data flow from LLM → DB → Chart
- The architecture violation allowed data loss to occur silently

**Lessons Learned**:
- Frontend should NEVER assemble database records
- Edge functions should own data structure knowledge
- Always verify data flow end-to-end in integration tests
- JavaScript destructuring can silently lose data
