# Braintrust Skill

This skill provides guidance on working with Braintrust prompts, experiments, and API operations in this project.

## Project Configuration

**Braintrust Project:**
- **Name**: `vyx` (set via `BRAINTRUST_PROJECT_NAME` environment variable)
- **Project ID**: `5df22744-d29c-4b01-b18b-e3eccf2ddbba`
- **Organization**: `vyx.app`
- **Dashboard URL**: `https://www.braintrust.dev/app/vyx.app/p/vyx/logs`
- **API Base URL**: `https://api.braintrust.dev/v1`

**API Key Storage:**
- Stored in Supabase secrets as `BRAINTRUST_API_KEY`
- Accessible to all edge functions automatically
- Current key: `sk-sMzyGvA7KFYChi6CH9mDz4MLrazIT0v11gpLdVxFGT1HibLG`

**Environment Variables Required:**
```bash
BRAINTRUST_API_KEY=sk-sMzyGvA7KFYChi6CH9mDz4MLrazIT0v11gpLdVxFGT1HibLG
BRAINTRUST_PROJECT_NAME=vyx  # Must match dashboard project name
```

## Common Operations

### 1. Uploading/Updating Prompts

Use the automated script for prompt management:

```bash
BRAINTRUST_API_KEY=sk-sMzyGvA7KFYChi6CH9mDz4MLrazIT0v11gpLdVxFGT1HibLG \
  deno run --allow-read --allow-net --allow-env scripts/upload-prompt-to-braintrust.ts
```

**Script location:** `scripts/upload-prompt-to-braintrust.ts`

**What it does:**
- Reads prompt content from `backend/go-screener/prompts/regenerate-filter-go.md`
- Uploads to Braintrust with correct configuration
- Uses HTTP PUT method (creates or replaces existing prompt)

**Current Prompt Configuration:**
- **Slug**: `regenerate-filter-go`
- **Model**: `google/gemini-2.5-flash` (can be changed to `anthropic/claude-haiku-4.5`)
- **Temperature**: 0.4
- **Max Tokens**: 4000

### 2. Creating New Prompts

To create a new prompt programmatically:

```typescript
const payload = {
  project_id: '5df22744-d29c-4b01-b18b-e3eccf2ddbba',
  name: 'Your Prompt Name',
  slug: 'your-prompt-slug',
  description: 'Description of what this prompt does',
  prompt_data: {
    prompt: {
      type: 'completion',
      content: 'Your prompt content here...'
    },
    options: {
      model: 'google/gemini-2.5-flash', // or 'anthropic/claude-haiku-4.5'
      params: {
        temperature: 0.4,
        max_tokens: 4000
      }
    }
  }
}

const response = await fetch('https://api.braintrust.dev/v1/prompt', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${BRAINTRUST_API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
})
```

### 3. Loading Prompts in Edge Functions

Prompts are loaded via `PromptLoaderV2` class in edge functions:

```typescript
// In supabase/functions/llm-proxy/index.ts
const promptLoader = new PromptLoaderV2(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BRAINTRUST_PROJECT_NAME,
  !!BRAINTRUST_API_KEY
);

// Load a prompt by slug
const promptContent = await promptLoader.loadPrompt('regenerate-filter-go');
```

**Loader behavior:**
1. First tries to load from Braintrust API (if `BRAINTRUST_API_KEY` is set)
2. Falls back to Supabase `prompts` table if Braintrust fails
3. Caches prompts in memory for 5 minutes

### 4. Updating Supabase Secrets

If the Braintrust API key needs to be updated:

```bash
supabase secrets set BRAINTRUST_API_KEY=sk-sMzyGvA7KFYChi6CH9mDz4MLrazIT0v11gpLdVxFGT1HibLG
```

**Important:** Edge functions automatically pick up new secret values, but you may need to redeploy them:

```bash
supabase functions deploy llm-proxy
```

## Braintrust REST API Reference

### Authentication

All API requests require Bearer token authentication:

```
Authorization: Bearer sk-sMzyGvA7KFYChi6CH9mDz4MLrazIT0v11gpLdVxFGT1HibLG
```

### Key Endpoints

**Create/Update Prompt:**
- **Method**: `PUT`
- **URL**: `https://api.braintrust.dev/v1/prompt`
- **Body**: JSON with `project_id`, `slug`, `name`, `prompt_data`

**Get Prompt:**
- **Method**: `GET`
- **URL**: `https://api.braintrust.dev/v1/prompt?project_id={id}&slug={slug}`

**List Prompts:**
- **Method**: `GET`
- **URL**: `https://api.braintrust.dev/v1/prompt?project_id={id}`

## Current Prompts in Braintrust

1. **regenerate-filter-go**
   - **ID**: `b1f76936-b5f2-4bea-ad17-bb88b02f4124`
   - **Purpose**: Generates Go filter code for trader creation
   - **Model**: `google/gemini-2.5-flash`
   - **Source File**: `backend/go-screener/prompts/regenerate-filter-go.md`
   - **Used By**: `llm-proxy` edge function (`generate-filter-code` operation)

## Integration Points

### Edge Functions Using Braintrust

1. **llm-proxy** (`supabase/functions/llm-proxy/`)
   - Loads prompts via PromptLoaderV2
   - Traces LLM calls via Braintrust SDK
   - Operations: `generate-trader`, `generate-trader-metadata`, `generate-filter-code`

2. **upload-prompts** (`supabase/functions/upload-prompts/`)
   - Uploads prompts to Braintrust programmatically
   - Uses BRAINTRUST_API_KEY from environment

### Configuration Files

**LLM Operations Config:**
- **File**: `supabase/functions/llm-proxy/config/operations.ts`
- **Defines**: Model mappings, prompt versions, parameters for each operation

Example:
```typescript
'generate-filter-code': {
  modelId: 'google/gemini-2.5-flash',
  promptVersion: 'v1.0',
  temperature: 0.4,
  maxTokens: 4000,
  description: 'Generate Go filter code from trading conditions'
}
```

## Troubleshooting

### Issue: Prompt not found (500 error)

**Cause:** Prompt doesn't exist in Braintrust

**Solution:**
1. Upload the prompt using `scripts/upload-prompt-to-braintrust.ts`
2. Verify it appears in Braintrust UI at https://www.braintrust.dev/

### Issue: Invalid authorization token

**Cause:** API key is incorrect or expired

**Solution:**
1. Get a fresh API key from Braintrust UI (Settings → API Keys)
2. Update Supabase secret: `supabase secrets set BRAINTRUST_API_KEY=<new_key>`
3. Update this skill document with the new key

### Issue: Edge function can't load prompt

**Cause:** Either Braintrust or Supabase fallback failed

**Solution:**
1. Check edge function logs: `supabase functions logs llm-proxy`
2. Verify BRAINTRUST_API_KEY is set: `supabase secrets list | grep BRAINTRUST`
3. Ensure prompt exists in both Braintrust AND Supabase `prompts` table

### Issue: Traces not appearing in Braintrust dashboard

**Cause:** Wrong project name configured - traces going to different project

**Symptoms:**
- Braintrust tracing code is working (no errors)
- BRAINTRUST_API_KEY is set correctly
- Traces appear in Braintrust but in wrong project
- Dashboard at `https://www.braintrust.dev/app/{org}/p/{project}/logs` shows no recent traces

**Root Cause:**
The `BRAINTRUST_PROJECT_NAME` environment variable must match the **exact project name** shown in your Braintrust dashboard URL.

**Example:**
- Dashboard URL: `https://www.braintrust.dev/app/vyx.app/p/vyx/logs`
- Required project name: `vyx` (NOT "AI Trader" or any other name)

**Solution:**
1. Check your Braintrust dashboard URL to find the correct project name
2. Set the environment variable in Supabase secrets:
   ```bash
   supabase secrets set BRAINTRUST_PROJECT_NAME=vyx
   ```
3. Redeploy llm-proxy edge function to pick up the new value:
   ```bash
   supabase functions deploy llm-proxy
   ```
4. Test by triggering a trace (create a trader, generate filter code, etc.)
5. Verify traces appear in the correct dashboard

**How the code uses this:**
```typescript
// supabase/functions/llm-proxy/index.ts
const BRAINTRUST_PROJECT_NAME = Deno.env.get('BRAINTRUST_PROJECT_NAME') || 'AI Trader';

initLogger({
  projectName: BRAINTRUST_PROJECT_NAME,  // Must match Braintrust dashboard project
  apiKey: BRAINTRUST_API_KEY
});
```

**Important Notes:**
- The default value `'AI Trader'` is used if `BRAINTRUST_PROJECT_NAME` is not set
- This is different from the project **ID** (`5df22744-d29c-4b01-b18b-e3eccf2ddbba`)
- PromptLoaderV2 uses the project **ID** (hardcoded)
- initLogger uses the project **NAME** (from environment variable)
- Both must be correct for full functionality

## Best Practices

1. **Always use the upload script** for prompt updates (maintains consistency)
2. **Keep prompt source files in `backend/go-screener/prompts/`** (single source of truth)
3. **Update this skill** when adding new prompts or changing configuration
4. **Test prompts in Braintrust UI** before deploying to production
5. **Version prompts** using the `promptVersion` field in operations config

## Related Documentation

- Braintrust API Docs: https://www.braintrust.dev/docs/reference/api
- Braintrust Prompts Guide: https://www.braintrust.dev/docs/guides/prompts
- Project's LLM Architecture: `docs/LLM_ARCHITECTURE.md`
- Prompt Setup Guide: `docs/BRAINTRUST_PROMPT_SETUP.md`

## Quick Reference

**Get to Braintrust UI:**
```
https://www.braintrust.dev/
→ Projects → AI Trader → Prompts
```

**Upload a prompt:**
```bash
BRAINTRUST_API_KEY=sk-sMzyGvA7KFYChi6CH9mDz4MLrazIT0v11gpLdVxFGT1HibLG \
  deno run --allow-read --allow-net --allow-env scripts/upload-prompt-to-braintrust.ts
```

**Update API key everywhere:**
```bash
supabase secrets set BRAINTRUST_API_KEY=<new_key>
```

**Check if edge function has the key:**
```bash
supabase secrets list | grep BRAINTRUST_API_KEY
```
