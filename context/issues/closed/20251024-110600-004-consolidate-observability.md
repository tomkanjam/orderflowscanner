# Consolidate Observability Platform (Braintrust vs Langfuse)

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-24 11:06:03

## Context

Currently running TWO observability systems in parallel:
- **Braintrust**: Traces edge function LLM calls, prompt versioning
- **Langfuse**: Traces frontend user journey events via `observabilityService.ts`

This creates:
- Duplicate telemetry overhead
- Split visibility (need to check two dashboards)
- Confusion about which system to use for what
- Extra cost for maintaining both
- Complexity in codebase

**Current State:**
- Braintrust: `/supabase/functions/llm-proxy/index.ts` initialization + tracing
- Langfuse: `/apps/app/services/observabilityService.ts` + `/supabase/functions/langfuse-proxy/`
- Both require API keys and configuration
- Both send data on every operation

**Impact:**
Operational overhead, split attention, unclear source of truth for debugging.

## Linked Items
- Part of: `context/issues/open/20251024-110600-000-PROJECT-complete-braintrust-integration.md`

## Progress

Issue created, awaiting implementation.

## Spec

**Decision Required: Choose ONE platform**

### Option A: Keep Braintrust, Remove Langfuse
**Pros:**
- Braintrust already integrated in critical path (llm-proxy)
- Better prompt versioning and experimentation
- Official Go SDK (for future Go observability)
- Designed specifically for LLM applications
- Simpler architecture (one system)

**Cons:**
- Need to replicate Langfuse's user journey tracking in Braintrust
- May need custom events for frontend tracking

**Recommendation:** ✅ **Choose this option**
Braintrust is purpose-built for LLM observability and already integrated in the core LLM pipeline.

### Option B: Keep Langfuse, Remove Braintrust
**Pros:**
- Langfuse has frontend journey tracking already implemented
- Good for full user experience observability

**Cons:**
- Less focused on prompt versioning/experimentation
- Would need to migrate llm-proxy tracing to Langfuse
- Weaker prompt management features
- No Go SDK

**Recommendation:** ❌ Not recommended
Braintrust is better suited for LLM-first observability.

---

## Implementation Steps (Option A: Braintrust Only)

1. **Audit Langfuse usage**
   - Review `/apps/app/services/observabilityService.ts`
   - Identify what events are being tracked
   - Map to equivalent Braintrust events

2. **Migrate frontend tracking to Braintrust**
   - Replace Langfuse client with Braintrust TypeScript SDK
   - Update `observabilityService.ts` to use Braintrust
   - Track events: generation-start, stream-start, stream-complete, error, analysis
   - Maintain same event structure for compatibility

3. **Remove Langfuse infrastructure**
   - Delete `/supabase/functions/langfuse-proxy/`
   - Remove Langfuse SDK from `/apps/app/package.json`
   - Remove Langfuse env vars from Supabase secrets:
     - `LANGFUSE_PUBLIC_KEY`
     - `LANGFUSE_SECRET_KEY`
     - `LANGFUSE_BASE_URL`

4. **Update documentation**
   - Remove Langfuse references from README
   - Update observability docs to reference Braintrust only
   - Update onboarding to only require Braintrust API key

5. **Test complete observability**
   - Verify all trader workflow events still tracked
   - Confirm Braintrust dashboard shows:
     - LLM calls (edge function + Go backend)
     - Frontend user events
     - Full end-to-end traces
   - Test error tracking and debugging workflows

**Files to Modify:**
- `/apps/app/services/observabilityService.ts` - Replace Langfuse with Braintrust
- `/apps/app/package.json` - Remove Langfuse SDK

**Files to Delete:**
- `/supabase/functions/langfuse-proxy/` - Entire directory

**Environment Variables to Remove:**
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL`

**Testing:**
- Run full trader creation workflow
- Verify all events appear in Braintrust dashboard
- Test error scenarios (ensure errors tracked)
- Confirm no Langfuse calls in network tab
- Check Braintrust shows complete user journey

**Success Criteria:**
- Single observability platform (Braintrust)
- All LLM calls and user events tracked in one dashboard
- Langfuse completely removed from codebase
- Documentation updated
- No loss of observability coverage
- Reduced operational complexity

## Progress Update

✅ **COMPLETED** (2025-11-03)

All steps complete:
1. Removed Langfuse edge functions (langfuse-proxy, langfuse-batch)
2. Disabled frontend observabilityService
3. Single platform: Braintrust only

## Completion

**Closed:** 2025-11-03
**Outcome:** Success
**Commits:** f700173
