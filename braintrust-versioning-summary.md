# Braintrust Prompt Versioning & Tracking

## Current State

### Prompt Version Info
- **ID**: b1f76936-b5f2-4bea-ad17-bb88b02f4124 (stable)
- **Version**: 1000196066061731042 (transaction ID)
- **Created**: 2025-11-01 09:48:10
- **Slug**: regenerate-filter-go

### How Versioning Works

1. **Transaction-based versioning** (`_xact_id`)
   - Each update gets a new transaction ID
   - This is a monotonically increasing number (timestamp-based)
   - Previous version: 1000196066042524138 (from our upload earlier today)
   - Current version: 1000196066061731042

2. **Single prompt per slug**
   - API returns only 1 object per slug query
   - When you PUT to update, it creates a new version
   - Old version is not directly accessible via simple API queries

## Tracking Changes

### Via Braintrust UI
- **Prompts page**: https://www.braintrust.dev/app/AI%20Trader/p/prompts
- **Logs/Traces**: https://www.braintrust.dev/app/AI%20Trader/p/logs

### Via API - Traces

Our llm-proxy already logs to Braintrust with `traced()`:
```typescript
// supabase/functions/llm-proxy/operations/generateFilterCode.ts
return await traced(async (span) => {
  span.log({
    input: { conditions, klineInterval },
    metadata: {
      operation: 'generate-filter-code',
      modelId: config.modelId,
      promptVersion: config.promptVersion,  // <-- This tracks which prompt version
      conditionCount: conditions?.length || 0
    }
  });
  
  // ... operation ...
  
  span.log({
    output: filterResult,
    metrics: {
      total_tokens: result.tokensUsed,
      code_length: result.data.filterCode.length,
      timeframes_count: result.data.requiredTimeframes.length
    }
  });
}, { name: "generate_filter_code", type: "task" });
```

### What Gets Tracked Automatically

For every filter generation request:
- ✅ Input conditions
- ✅ Output filter code
- ✅ Token usage
- ✅ Model used
- ✅ Temperature
- ✅ Timestamp
- ✅ Success/failure
- ✅ Error messages (if any)

## Tracking Effectiveness

### Method 1: Braintrust Traces (Already Working)

View in UI:
1. Go to https://www.braintrust.dev/app/AI%20Trader/p/logs
2. Filter by operation: "generate_filter_code"
3. See all requests with:
   - Input: User's conditions
   - Output: Generated code
   - Metrics: Tokens, code length
   - Success rate

### Method 2: Query Traces via API

```bash
# Get recent traces
curl -H "Authorization: Bearer $BRAINTRUST_API_KEY" \
  "https://api.braintrust.dev/v1/experiment?project_id=$PROJECT_ID"
```

### Method 3: Manual Version Tracking

Since Braintrust doesn't expose full version history via simple API:

**Option A: Git-based tracking**
- Keep prompt versions in git (docs/)
- Upload to Braintrust on changes
- Git history = version history

**Option B: Metadata field**
- Add version tag to prompt metadata
- Update on each change

**Option C: Changelog in prompt**
```markdown
# Version History
- v3.0 (2025-11-01): Restructured to emphasize unlimited capability
- v2.1 (2025-11-01): Added template variables
- v2.0 (2025-11-01): Full prompt with indicator docs
```

## Measuring Effectiveness

### A. Success Rate Metrics
From Braintrust traces:
- Total requests
- Successful generations
- Failed generations
- Error types

### B. Quality Metrics
- Average code length (complexity indicator)
- Token usage (efficiency)
- Required timeframes count
- Indicator diversity

### C. User-reported Issues
- Track: "Wrong indicator generated" (like Stochastic vs StochRSI)
- Track: "Code doesn't compile"
- Track: "Filter too slow"

### D. A/B Testing Approach

1. Create prompt variant with slug: `regenerate-filter-go-v3-unlimited`
2. Route 50% of traffic to each variant
3. Compare traces:
   - Which generates more correct code?
   - Which has better token efficiency?
   - Which handles edge cases better?

## Current Issue: Version Tracking Gap

**Problem**: When we update the prompt, we lose explicit version history.

**Solution Options**:

### Option 1: Changelog in Prompt (Simplest)
Add to top of prompt:
```markdown
<!-- 
VERSION: 3.0
DATE: 2025-11-01
CHANGES: Restructured for unlimited capability emphasis
-->
```

### Option 2: Git as Source of Truth
- Keep prompts in `docs/prompts/`
- Version with git
- Upload to Braintrust from git
- Git commit hash = version

### Option 3: Use Braintrust Metadata
```typescript
// When uploading
{
  metadata: {
    version: "3.0",
    changelog: "Restructured for unlimited capability",
    git_commit: "49f5611"
  }
}
```

## Recommendation

**Hybrid approach**:
1. ✅ Keep using Braintrust traces (already working)
2. ✅ Add version metadata to prompts
3. ✅ Document major changes in git commits
4. ✅ Create A/B test variants for major rewrites
5. ✅ Monitor Braintrust UI weekly for issues

**For this specific case** (Stoch RSI bug):
1. Current version: 1000196066061731042 (has the limitation bug)
2. Create new version with metadata: `{"version": "3.0", "fix": "unlimited-capability-emphasis"}`
3. Upload and test
4. Compare traces before/after to verify improvement
