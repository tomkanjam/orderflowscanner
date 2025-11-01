# Remove Hardcoded Fallbacks and Dead Code

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 10:31:17

## Context

PromptLoaderV2 is the active prompt loader using Braintrust REST API. However:
1. Comment in llm-proxy/index.ts:64 claims "Supabase fallback" but V2 has NONE
2. PromptLoaderV1 still exists but is unused (dead code)
3. AI Analysis function builds prompts inline instead of using loader
4. No clear error handling when Braintrust unavailable

Clean up architecture to match reality: Braintrust-only, no fallbacks.

## Linked Items
- Part of: `context/issues/open/20251101-103117-000-PROJECT-braintrust-single-source-truth.md`
- Related: `context/issues/open/20251101-103117-005-unify-ai-analysis-prompts.md`

## Progress
Issue created, ready for implementation.

## Spec

### Dead Code to Remove

**1. PromptLoaderV1 (Legacy)**
- File: `supabase/functions/llm-proxy/promptLoader.ts`
- Lines: Entire file (~150 lines)
- Status: Not imported or used anywhere
- Action: Delete entire file

```bash
rm supabase/functions/llm-proxy/promptLoader.ts
```

**2. Remove unused imports:**

```typescript
// supabase/functions/llm-proxy/index.ts
// After removing PromptLoaderV1, check for orphaned imports
```

### Misleading Comments to Fix

**Location:** `supabase/functions/llm-proxy/index.ts:64`

```typescript
// OLD (MISLEADING)
console.log('✓ Prompt loading: Braintrust enabled with Supabase fallback');

// NEW (ACCURATE)
console.log('✓ Prompt loading: Braintrust only (no fallback)');
```

### Error Handling to Improve

**PromptLoaderV2** should have clear error messages when Braintrust fails:

```typescript
// supabase/functions/llm-proxy/promptLoader.v2.ts

async loadFromBraintrustAPI(slug: string): Promise<any> {
  try {
    // ... existing code ...
  } catch (error) {
    // IMPROVE ERROR MESSAGE
    throw new Error(
      `Failed to load prompt '${slug}' from Braintrust. ` +
      `Ensure prompt exists in Braintrust and BRAINTRUST_API_KEY is valid. ` +
      `No fallback available - Braintrust is the single source of truth. ` +
      `Error: ${error.message}`
    );
  }
}
```

**Edge function error handling:**

```typescript
// supabase/functions/llm-proxy/operations/*.ts

// Each operation should catch prompt loading errors with clear messages
try {
  const prompt = await promptLoader.loadPrompt('slug-name');
} catch (error) {
  console.error(`[OperationName] Prompt loading failed:`, error);
  return new Response(
    JSON.stringify({
      error: 'Prompt unavailable',
      message: 'Could not load required prompt from Braintrust. Please contact support.',
      details: error.message
    }),
    { status: 503, headers: { 'Content-Type': 'application/json' } }
  );
}
```

### Testing Failure Scenarios

**1. Invalid API Key:**
```bash
# Test with invalid key
export BRAINTRUST_API_KEY="invalid-key"
supabase functions serve llm-proxy --env-file .env.local

# Expected: Clear error about invalid API key, 503 response
```

**2. Missing Prompt:**
```bash
# Test with non-existent slug
curl -X POST https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/llm-proxy \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"operation":"generate-filter-code","params":{"conditions":["test"],"klineInterval":"15m"}}'

# Delete prompt from Braintrust first, then test
# Expected: Clear error about missing prompt, 503 response
```

**3. Braintrust API Downtime:**
```bash
# Simulate by blocking API access (hosts file or firewall)
# Expected: Clear error about API unavailable, 503 response
```

### Implementation Steps

1. **Delete PromptLoaderV1**
   ```bash
   rm supabase/functions/llm-proxy/promptLoader.ts
   ```

2. **Update llm-proxy/index.ts**
   - Fix misleading comment about fallback
   - Remove any imports related to V1
   - Verify initialization only uses V2

3. **Improve error messages in PromptLoaderV2**
   - Update loadFromBraintrustAPI error handling
   - Add context about no fallback available
   - Include troubleshooting hints

4. **Add error handling to operations**
   - Wrap prompt loading in try/catch
   - Return 503 with clear error message
   - Log detailed error for debugging

5. **Test failure scenarios**
   - Invalid API key
   - Missing prompt
   - Simulated API downtime
   - Verify error messages are clear

6. **Update documentation**
   - CLAUDE.md: Document Braintrust-only architecture
   - Add troubleshooting section for prompt loading failures
   - Document expected errors and solutions

7. **Commit changes**
   ```bash
   git add -A
   git commit -m "Remove prompt fallbacks and dead code

   - Delete unused PromptLoaderV1
   - Fix misleading fallback comment
   - Improve error messages for Braintrust failures
   - Add proper error handling (503 responses)
   - Document Braintrust-only architecture"
   ```

### Completion Criteria

- [ ] PromptLoaderV1 deleted
- [ ] No misleading comments about fallbacks
- [ ] Clear error messages when Braintrust unavailable
- [ ] Operations return 503 with helpful error details
- [ ] All failure scenarios tested
- [ ] Documentation updated
- [ ] No dead code or unused imports

### Expected Behavior After Changes

**Success Case:**
- Braintrust available → Prompt loads → Operation succeeds

**Failure Cases:**
- Braintrust down → Clear 503 error → "Prompt service unavailable"
- Prompt missing → Clear 503 error → "Prompt 'X' not found in Braintrust"
- Invalid API key → Clear 503 error → "Braintrust authentication failed"

**No More:**
- Silent fallbacks to Supabase
- Confusing error messages
- Unclear failure modes
- Dead code paths

### Notes

- Accepting Braintrust-only is a deliberate architectural choice
- Simplicity and single source of truth > resilience to Braintrust outages
- Braintrust has good uptime SLA
- Can implement monitoring/alerting for Braintrust API failures if needed
- This makes debugging easier - only one place to look for prompts
