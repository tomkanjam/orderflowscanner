# Unify AI Analysis Prompt Loading with LLM Proxy

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 10:31:17

## Context

The `ai-analysis` edge function builds prompts inline using `PromptBuilder` instead of loading from Braintrust via `PromptLoaderV2`. This creates architectural inconsistency:

- **llm-proxy**: Uses PromptLoaderV2 → Braintrust → Consistent prompt management
- **ai-analysis**: Uses PromptBuilder → Hardcoded inline prompt → Separate system

Both functions do similar work (LLM analysis) but use different prompt strategies. This violates the "Braintrust as single source of truth" principle.

## Linked Items
- Part of: `context/issues/open/20251101-103117-000-PROJECT-braintrust-single-source-truth.md`

## Progress
Issue created, ready for implementation.

## Spec

### Current Architecture

**ai-analysis/index.ts:**
```typescript
// Lines 54-57
const promptBuilder = new PromptBuilder();
const systemPrompt = promptBuilder.buildAnalysisPrompt(signalData, traderMetadata);

// Uses hardcoded prompt from promptBuilder.ts
```

**ai-analysis/promptBuilder.ts:**
```typescript
// Lines 24-70
buildAnalysisPrompt(signalData, traderMetadata): string {
  // Hardcoded prompt content
  return `You are an AI trading analyst...

  Analyze the following signal and provide a trading decision...

  Return a JSON object with: decision, confidence, reasoning, tradePlan
  ...`;
}
```

### Target Architecture

**Option A: Use llm-proxy for All LLM Operations**

Deprecate `ai-analysis` edge function entirely. Use `llm-proxy` with `analyze-signal` operation.

```typescript
// Instead of calling ai-analysis
fetch('/functions/v1/ai-analysis', { ... })

// Call llm-proxy with analyze-signal operation
fetch('/functions/v1/llm-proxy', {
  body: JSON.stringify({
    operation: 'analyze-signal',
    params: {
      symbol: 'BTCUSDT',
      price: 50000,
      strategy: 'RSI oversold',
      timestamp: new Date().toISOString()
    }
  })
})
```

**Option B: Use PromptLoaderV2 in ai-analysis**

Keep separate edge function but use PromptLoaderV2.

```typescript
// ai-analysis/index.ts
import { PromptLoaderV2 } from '../llm-proxy/promptLoader.v2.ts';

const braintrustApiKey = Deno.env.get('BRAINTRUST_API_KEY');
const braintrustProjectId = Deno.env.get('BRAINTRUST_PROJECT_ID');

const promptLoader = new PromptLoaderV2(braintrustApiKey, braintrustProjectId);

// Load prompt from Braintrust
const prompt = await promptLoader.loadPromptWithVariables('analyze-signal', {
  symbol: signalData.symbol,
  price: signalData.price,
  strategy: traderMetadata.strategy,
  timestamp: signalData.timestamp
});

// Use with Gemini client
const result = await geminiClient.generateStructuredResponse(prompt, { ... });
```

### Recommendation: Option A (Consolidate to llm-proxy)

**Reasons:**
1. **Single LLM gateway** - All LLM operations go through one edge function
2. **Consistent observability** - All Braintrust tracing in one place
3. **Easier to maintain** - One codebase for all LLM ops
4. **Reduced duplication** - Don't need Gemini client in two places
5. **Consistent error handling** - One place to handle LLM failures
6. **Unified configuration** - operations.ts config applies to all

**Tradeoffs:**
- Need to migrate callers of ai-analysis to use llm-proxy
- Slight change in request/response format
- Need to verify backward compatibility

### Implementation Steps (Option A)

1. **Verify analyze-signal operation in llm-proxy**
   ```typescript
   // supabase/functions/llm-proxy/operations/analyzeSignal.ts
   // Already exists and uses PromptLoaderV2
   ```

2. **Find all callers of ai-analysis edge function**
   ```bash
   rg "functions/v1/ai-analysis" --type ts
   rg "ai-analysis" apps/app/src --type ts
   ```

3. **Update callers to use llm-proxy**
   ```typescript
   // OLD
   const response = await fetch(`${supabaseUrl}/functions/v1/ai-analysis`, {
     headers: {
       'Authorization': `Bearer ${supabaseKey}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({ signalData, traderMetadata })
   });

   // NEW
   const response = await fetch(`${supabaseUrl}/functions/v1/llm-proxy`, {
     headers: {
       'Authorization': `Bearer ${supabaseKey}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       operation: 'analyze-signal',
       params: {
         symbol: signalData.symbol,
         price: signalData.price,
         strategy: traderMetadata.strategy,
         timestamp: signalData.timestamp
       }
     })
   });
   ```

4. **Verify analyze-signal prompt in Braintrust**
   ```bash
   curl -s -H "Authorization: Bearer $BRAINTRUST_API_KEY" \
     "https://api.braintrust.dev/v1/prompt?project_id=$BRAINTRUST_PROJECT_ID&slug=analyze-signal" | \
     jq '.objects[0].name'
   ```

5. **Test llm-proxy analyze-signal operation**
   ```bash
   curl -X POST https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/llm-proxy \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "operation": "analyze-signal",
       "params": {
         "symbol": "BTCUSDT",
         "price": 50000,
         "strategy": "RSI oversold + Volume spike",
         "timestamp": "2025-11-01T10:00:00Z"
       }
     }'
   ```

6. **Update frontend to use llm-proxy**
   - Find signal analysis trigger points
   - Update to use llm-proxy operation
   - Handle response format changes

7. **Deprecate ai-analysis edge function**
   ```bash
   # Add deprecation notice
   echo "// DEPRECATED: Use llm-proxy with analyze-signal operation instead" > supabase/functions/ai-analysis/DEPRECATED.md

   # Or delete entirely after migration
   rm -rf supabase/functions/ai-analysis/
   ```

8. **Test end-to-end signal analysis workflow**
   - Create trader
   - Trigger signal
   - Verify analysis runs via llm-proxy
   - Check Braintrust traces

### Implementation Steps (Option B - If Keeping Separate)

1. **Add PromptLoaderV2 to ai-analysis**
   ```typescript
   import { PromptLoaderV2 } from '../llm-proxy/promptLoader.v2.ts';
   ```

2. **Initialize loader in ai-analysis/index.ts**
   ```typescript
   const braintrustApiKey = Deno.env.get('BRAINTRUST_API_KEY');
   const braintrustProjectId = Deno.env.get('BRAINTRUST_PROJECT_ID');
   const promptLoader = new PromptLoaderV2(braintrustApiKey, braintrustProjectId);
   ```

3. **Replace PromptBuilder usage**
   ```typescript
   // OLD
   const prompt = promptBuilder.buildAnalysisPrompt(signalData, traderMetadata);

   // NEW
   const prompt = await promptLoader.loadPromptWithVariables('analyze-signal', {
     symbol: signalData.symbol,
     price: signalData.price,
     strategy: traderMetadata.strategy,
     timestamp: signalData.timestamp
   });
   ```

4. **Delete PromptBuilder**
   ```bash
   rm supabase/functions/ai-analysis/promptBuilder.ts
   ```

5. **Test ai-analysis with Braintrust prompts**

### Completion Criteria (Option A)

- [ ] All ai-analysis callers identified
- [ ] Callers updated to use llm-proxy
- [ ] analyze-signal prompt verified in Braintrust
- [ ] End-to-end signal analysis works via llm-proxy
- [ ] ai-analysis edge function deprecated or deleted
- [ ] PromptBuilder deleted
- [ ] Braintrust traces show analyze-signal operations
- [ ] No regressions in signal analysis functionality

### Completion Criteria (Option B)

- [ ] PromptLoaderV2 integrated into ai-analysis
- [ ] PromptBuilder deleted
- [ ] ai-analysis loads from Braintrust
- [ ] End-to-end signal analysis works
- [ ] analyze-signal prompt in Braintrust
- [ ] No regressions in functionality

### Testing Checklist

**Before Migration:**
- [ ] Document current ai-analysis request/response format
- [ ] Identify all callers
- [ ] Capture current behavior (screenshots/recordings)

**After Migration:**
- [ ] Signal analysis still works
- [ ] Response format matches expectations
- [ ] Braintrust traces appear
- [ ] No performance regressions
- [ ] Error handling works correctly

### Rollback Plan

If issues after migration:
1. Revert callers to use ai-analysis
2. Restore ai-analysis edge function
3. Investigate llm-proxy analyze-signal issues
4. Fix before re-attempting migration

### Notes

- **Recommendation:** Go with Option A (consolidate to llm-proxy)
- llm-proxy already has analyze-signal operation that works
- This achieves true "single source of truth" for all LLM operations
- Reduces maintenance burden
- Improves observability (all LLM ops in one place)
- If Option A proves too risky, Option B is acceptable fallback
