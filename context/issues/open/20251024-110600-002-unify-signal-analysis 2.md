# Migrate Signal Analysis to Unified llm-proxy

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-24 11:06:03

## Context

The `/ai-analysis` edge function exists as a separate code path from the unified `/llm-proxy` architecture. This creates:
- Duplicate OpenRouter client code
- No Braintrust tracing on signal analysis
- Inconsistent configuration (model/params not in operations.ts)
- Harder to maintain two separate edge functions

**Current State:**
- `/supabase/functions/ai-analysis/index.ts` - Separate edge function
- Not integrated with Braintrust tracing
- Model configuration hardcoded
- Works, but isolated from main LLM pipeline

**Impact:**
Signal analysis quality is invisible, can't A/B test prompts, architectural inconsistency.

## Linked Items
- Part of: `context/issues/open/20251024-110600-000-PROJECT-complete-braintrust-integration.md`

## Progress

Issue created, awaiting implementation.

## Spec

**Implementation Steps:**

1. **Add signal analysis operation to llm-proxy**
   - Update `/supabase/functions/llm-proxy/config/operations.ts`
   - Add operation: `analyze-signal`
   - Configure: model (google/gemini-2.5-flash), temperature (0.2), promptSlug
   ```typescript
   'analyze-signal': {
     modelId: 'google/gemini-2.5-flash',
     temperature: 0.2,
     maxTokens: 1000,
     promptSlug: 'analyze-signal',
     promptVersion: 'latest'
   }
   ```

2. **Create operation handler**
   - Create `/supabase/functions/llm-proxy/operations/analyzeSignal.ts`
   - Accept params: symbol, signal data, market context
   - Build messages array from params
   - Return structured analysis JSON

3. **Update frontend to use llm-proxy**
   - Find all calls to `/ai-analysis` edge function
   - Replace with calls to `/llm-proxy` with operation="analyze-signal"
   - Maintain response structure compatibility

4. **Upload prompt to Braintrust**
   - Extract current prompt from `/ai-analysis` implementation
   - Upload to Braintrust with slug `analyze-signal`
   - Use `/scripts/upload-prompt-to-braintrust.ts`

5. **Test and verify tracing**
   - Run signal analysis through new path
   - Verify traces appear in Braintrust dashboard
   - Confirm analysis quality matches old implementation

6. **Deprecate old edge function**
   - Once verified, delete `/supabase/functions/ai-analysis/`
   - Remove from deployment

**Files to Modify:**
- `/supabase/functions/llm-proxy/config/operations.ts` - Add operation
- `/supabase/functions/llm-proxy/operations/analyzeSignal.ts` - New file
- Frontend files calling `/ai-analysis` - Update endpoint
- Braintrust prompts - Upload `analyze-signal` prompt

**Files to Delete:**
- `/supabase/functions/ai-analysis/` - Entire directory (after migration)

**Testing:**
- Compare analysis output between old and new paths
- Verify Braintrust traces capture signal analysis
- Test error handling
- Confirm frontend receives expected response structure

**Success Criteria:**
- All signal analysis goes through `/llm-proxy`
- Signal analysis traced in Braintrust
- Old `/ai-analysis` edge function deleted
- Analysis quality maintained or improved
- Configuration unified in operations.ts
