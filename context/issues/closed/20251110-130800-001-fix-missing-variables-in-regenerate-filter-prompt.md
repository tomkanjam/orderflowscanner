# Fix Missing Variables in regenerate-filter-go Prompt

**Type:** bug
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-10 13:08:00

## Context

When users create traders via TraderForm, the AI-generated filter code does NOT match their input conditions. Instead, the LLM returns example code from the prompt template (e.g., "two green candles") regardless of what the user requested.

### Root Cause

The `regenerate-filter-go` prompt stored in Braintrust is missing variable placeholders (`{{conditions}}` and `{{klineInterval}}`), so user's trading conditions are never passed to the LLM.

**Evidence:**
1. Code expects to replace variables: `supabase/functions/llm-proxy/operations/generateFilterCode.ts:45`
   ```typescript
   const prompt = await promptLoader.loadPromptWithVariables('regenerate-filter-go', {
     conditions: conditionsList,  // ← Trying to replace {{conditions}}
     klineInterval                // ← Trying to replace {{klineInterval}}
   }, config.promptVersion);
   ```

2. Database shows NO placeholders:
   ```sql
   SELECT user_prompt_template FROM prompts WHERE id = 'regenerate-filter-go';
   -- Result: NULL (no user template)

   SELECT system_instruction FROM prompts WHERE id = 'regenerate-filter-go';
   -- Result: 11,316 chars with NO {{conditions}} or {{klineInterval}} anywhere
   ```

3. Upload script uses `type: "completion"` with single `content` field:
   ```typescript
   // scripts/upload-all-prompts-to-braintrust.ts:95
   prompt_data: {
     prompt: {
       type: "completion",
       content: promptContent  // Single string, no template variables
     }
   }
   ```

### Impact

**User Experience:**
- User creates "1m Stoch RSI Reversal" trader
- LLM generates "two green candles" code instead
- `indicators: []` (empty array)
- Charts don't show Stoch RSI indicator
- User confusion and broken functionality

**Technical Debt:**
- File `backend/go-screener/prompts/regenerate-filter-go.md` and Braintrust are out of sync
- No mechanism to pass user conditions to LLM
- Prompt versioning is ineffective without variables

## Linked Items
- Part of: End-to-end trader workflow implementation
- Blocks: Correct indicator chart display for custom traders
- Related: `context/issues/open/20251105-202800-3N-fix-regenerate-filter-prompt.md`

## Research: Braintrust Variable Syntax

**Official Documentation:** https://www.braintrust.dev/docs/guides/functions/prompts

### Mustache Template Syntax

Braintrust uses **mustache templating** for variables:
- **Double braces:** `{{variable}}` (escaped)
- **Triple braces:** `{{{variable}}}` (unescaped, preserves formatting)

### Chat Format (Recommended)

```typescript
prompt_data: {
  prompt: {
    type: "chat",
    messages: [
      {
        role: "system",
        content: "You are an AI that converts trading conditions into Go code..."
      },
      {
        role: "user",
        content: "Generate code for:\n{{{conditions}}}\n\nTimeframe: {{klineInterval}}"
      }
    ]
  }
}
```

### Completion Format (Alternative)

```typescript
prompt_data: {
  prompt: {
    type: "completion",
    content: "System instructions...\n\n## User Request\n{{{conditions}}}\nTimeframe: {{klineInterval}}"
  }
}
```

### Passing Variables at Runtime

```typescript
// When invoking prompt via Braintrust
await invoke({
  projectName: "AI Trader",
  slug: "regenerate-filter-go",
  input: {
    conditions: "1. RSI below 30\n2. Price above 50 EMA",
    klineInterval: "15m"
  }
});
```

**Our Implementation:** The `loadPromptWithVariables()` method does string replacement client-side:
```typescript
// supabase/functions/llm-proxy/promptLoader.v2.ts:155
async loadPromptWithVariables(slug: string, variables: Record<string, string>) {
  let prompt = await this.loadPrompt(slug);
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    prompt = prompt.replace(new RegExp(placeholder, 'g'), value);
  }
  return prompt;
}
```

This works IF the prompt contains `{{conditions}}` and `{{klineInterval}}` placeholders.

## Spec

### 1. Update Prompt File

**File:** `backend/go-screener/prompts/regenerate-filter-go.md`

Add variable section at the beginning:

```markdown
# Go Filter Code Generation Prompt (with SeriesCode)

You are an AI assistant that converts human-readable trading conditions into **Go code**.

## User's Trading Conditions

{{{conditions}}}

**Target Timeframe:** {{klineInterval}}

---

You will receive an array of conditions (shown above) that describe a trading filter. Generate a JSON object with:
...
```

### 2. Update Upload Script (Optional)

The current upload script works fine - it will upload the new content with placeholders intact. No changes needed to `scripts/upload-all-prompts-to-braintrust.ts`.

### 3. Re-upload to Braintrust

```bash
deno run --allow-net --allow-read --allow-env scripts/upload-all-prompts-to-braintrust.ts
```

This will:
- Read `backend/go-screener/prompts/regenerate-filter-go.md` (with new placeholders)
- Upload to Braintrust as `type: "completion"` with placeholders intact
- Braintrust will store `{{conditions}}` and `{{klineInterval}}` as-is

### 4. Runtime Behavior

When `generateFilterCode()` is called:

1. `promptLoader.loadPromptWithVariables('regenerate-filter-go', {conditions, klineInterval})`
2. Loads prompt from Braintrust (with placeholders)
3. Replaces `{{conditions}}` → actual conditions list
4. Replaces `{{klineInterval}}` → `"1m"`, `"5m"`, etc.
5. Sends complete prompt to OpenRouter/Gemini
6. LLM sees actual user conditions and generates correct code

### 5. Verification

**Test Case:** Create trader with description:
```
Entry: When the 1-minute Stochastic RSI K line crosses below 40, initiate a long position.
Exit: Set a take profit at 0.5% above entry.
```

**Expected Result:**
```json
{
  "filterCode": "// Contains StochRSI calculation and K < 40 check",
  "seriesCode": "// Returns StochRSI K and D series data",
  "indicators": [
    {
      "id": "stoch_rsi",
      "name": "Stochastic RSI",
      "type": "line",
      "panel": true,
      "params": {"kPeriod": 14, "dPeriod": 3}
    }
  ],
  "requiredTimeframes": ["1m"]
}
```

**Test Signal Display:**
- Click signal in UI
- Candlestick chart appears ✓
- Stoch RSI indicator panel appears below ✓
- K and D lines show correct data ✓

### 6. Alternative: Chat Format (Future Enhancement)

For better prompt management, consider migrating to chat format:

```typescript
// In upload script
prompt_data: {
  prompt: {
    type: "chat",
    messages: [
      {
        role: "system",
        content: await Deno.readTextFile("./backend/go-screener/prompts/regenerate-filter-go-system.md")
      },
      {
        role: "user",
        content: "Trading conditions:\n{{{conditions}}}\n\nTimeframe: {{klineInterval}}"
      }
    ]
  }
}
```

This separates system instructions from user input, making it clearer where variables go.

## Implementation Steps

1. **Add placeholders to prompt file**
   - Edit `backend/go-screener/prompts/regenerate-filter-go.md`
   - Add `{{{conditions}}}` and `{{klineInterval}}` at top
   - Keep triple braces for conditions (preserves newlines)
   - Keep double braces for klineInterval (simple string)

2. **Re-upload to Braintrust**
   ```bash
   deno run --allow-net --allow-read --allow-env scripts/upload-all-prompts-to-braintrust.ts
   ```

3. **Clear Braintrust cache in production**
   - Prompt loader has 5-minute cache TTL
   - Either wait 5 minutes OR restart Edge Function container
   - Verify with test trader creation

4. **Test end-to-end**
   - Create new trader: "RSI below 30 on 15m"
   - Verify generated code contains RSI logic
   - Verify `indicators` array includes RSI
   - Create signal and check chart display

5. **Update existing broken traders**
   - Delete "1m Stoch RSI Reversal" trader
   - Recreate from TraderForm
   - Verify new version generates correct code

## Progress

✅ **COMPLETED** - 2025-11-10 14:35

### Implementation

1. **Added placeholders to prompt file**
   - File: `backend/go-screener/prompts/regenerate-filter-go.md`
   - Added `{{conditions}}` (double braces, works with our promptLoader)
   - Added `{{klineInterval}}`
   - Note: Used double braces instead of triple because `promptLoader.v2.ts` only handles `{{var}}` syntax

2. **Uploaded to Braintrust**
   - Version: `1000196117919554297`
   - All 4 prompts uploaded successfully
   - Verified placeholders present in Braintrust

3. **Tested variable replacement**
   - Confirmed `{{conditions}}` → actual conditions list
   - Confirmed `{{klineInterval}}` → actual interval value
   - Newlines preserved correctly

### Changes Made

- `backend/go-screener/prompts/regenerate-filter-go.md`: Added variable placeholders
- Braintrust prompt version: `1000196117919554297`

## Completion

**Closed:** 2025-11-10 14:35:00
**Outcome:** Success
**Commits:** `28fb761`

### Next Steps

1. **Wait for cache clear** (5 minutes) or restart Edge Function
2. **Test trader creation** with "Stochastic RSI K below 40"
3. **Verify indicators array** is populated in generated code
4. **Delete broken traders** ("1m Stoch RSI Reversal") and recreate

### Verification Commands

```bash
# Check prompt version in Braintrust
curl -s -H "Authorization: Bearer $BRAINTRUST_API_KEY" \
  "https://api.braintrust.dev/v1/prompt?project_id=5df22744-d29c-4b01-b18b-e3eccf2ddbba&slug=regenerate-filter-go" | \
  jq '{version: .objects[0]._xact_id, has_conditions: (.objects[0].prompt_data.prompt.content | contains("{{conditions}}"))}

# Test variable replacement
node -e "const p='{{conditions}}'; const v='test'; console.log(p.replace(/\{\{conditions\}\}/g, v))"
```
