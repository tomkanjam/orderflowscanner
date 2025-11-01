# Extract Hardcoded Braintrust Config to Environment Variables

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 10:31:17

## Context

Braintrust project ID `5df22744-d29c-4b01-b18b-e3eccf2ddbba` is hardcoded in 4 locations:
1. promptLoader.v2.ts:31
2. upload-prompts/index.ts:11
3. upload-prompt-to-braintrust.ts:17
4. upload-analyze-signal-prompt.ts:11

This prevents:
- Using different Braintrust projects for dev/staging/prod
- Easy project switching
- Testing with alternate projects
- Reusing code across projects

## Linked Items
- Part of: `context/issues/open/20251101-103117-000-PROJECT-braintrust-single-source-truth.md`

## Progress
Issue created, ready for implementation.

## Spec

### Environment Variable to Add

**Variable Name:** `BRAINTRUST_PROJECT_ID`

**Value:** `5df22744-d29c-4b01-b18b-e3eccf2ddbba`

**Required In:**
- Supabase Edge Functions environment
- Local development environment
- Upload scripts environment

### Files to Update

**1. PromptLoaderV2** (`supabase/functions/llm-proxy/promptLoader.v2.ts`)

```typescript
// OLD (Line 31)
private readonly braintrustProjectId = '5df22744-d29c-4b01-b18b-e3eccf2ddbba';

// NEW
private readonly braintrustProjectId: string;

constructor(
  braintrustApiKey: string,
  braintrustProjectId: string  // Add parameter
) {
  this.braintrustApiKey = braintrustApiKey;
  this.braintrustProjectId = braintrustProjectId;

  if (!braintrustProjectId) {
    throw new Error('BRAINTRUST_PROJECT_ID is required');
  }
}
```

**Update initialization in llm-proxy/index.ts:**

```typescript
// OLD
const promptLoader = new PromptLoaderV2(
  braintrustApiKey,
  supabaseUrl,
  supabaseServiceKey
);

// NEW
const braintrustProjectId = Deno.env.get('BRAINTRUST_PROJECT_ID');
if (!braintrustProjectId) {
  throw new Error('Missing BRAINTRUST_PROJECT_ID environment variable');
}

const promptLoader = new PromptLoaderV2(
  braintrustApiKey,
  braintrustProjectId
);
```

**2. Upload Prompts Edge Function** (`supabase/functions/upload-prompts/index.ts`)

```typescript
// OLD (Line 11)
const BRAINTRUST_PROJECT_ID = '5df22744-d29c-4b01-b18b-e3eccf2ddbba';

// NEW
const BRAINTRUST_PROJECT_ID = Deno.env.get('BRAINTRUST_PROJECT_ID');
if (!BRAINTRUST_PROJECT_ID) {
  throw new Error('Missing BRAINTRUST_PROJECT_ID environment variable');
}
```

**3. Upload Script** (`scripts/upload-prompt-to-braintrust.ts`)

```typescript
// OLD (Line 17)
const BRAINTRUST_PROJECT_ID = "5df22744-d29c-4b01-b18b-e3eccf2ddbba";

// NEW
const BRAINTRUST_PROJECT_ID = Deno.env.get("BRAINTRUST_PROJECT_ID");
if (!BRAINTRUST_PROJECT_ID) {
  console.error("Error: BRAINTRUST_PROJECT_ID environment variable is required");
  Deno.exit(1);
}
```

**4. Analyze Signal Upload Script** (`scripts/upload-analyze-signal-prompt.ts`)

```typescript
// OLD (Line 11)
const BRAINTRUST_PROJECT_ID = "5df22744-d29c-4b01-b18b-e3eccf2ddbba";

// NEW
const BRAINTRUST_PROJECT_ID = Deno.env.get("BRAINTRUST_PROJECT_ID");
if (!BRAINTRUST_PROJECT_ID) {
  console.error("Error: BRAINTRUST_PROJECT_ID environment variable is required");
  Deno.exit(1);
}
```

### Environment Setup

**Supabase Secrets:**

```bash
# Add to production
supabase secrets set BRAINTRUST_PROJECT_ID=5df22744-d29c-4b01-b18b-e3eccf2ddbba

# Verify
supabase secrets list | grep BRAINTRUST
```

**Local Development:**

```bash
# Add to .env.local
echo "BRAINTRUST_PROJECT_ID=5df22744-d29c-4b01-b18b-e3eccf2ddbba" >> .env.local

# Verify
grep BRAINTRUST .env.local
```

**Upload Scripts:**

```bash
# Option 1: Export in shell
export BRAINTRUST_PROJECT_ID="5df22744-d29c-4b01-b18b-e3eccf2ddbba"

# Option 2: Create .env file for scripts
cat > scripts/.env << EOF
BRAINTRUST_API_KEY=sk-OS6ksPJXNJJOaXBwPHmd0H3JfkYoucoCCTzKn6a69LsNmG3v
BRAINTRUST_PROJECT_ID=5df22744-d29c-4b01-b18b-e3eccf2ddbba
EOF

# Load in scripts
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
await load({ envPath: "./scripts/.env" });
```

### Implementation Steps

1. **Add env var to Supabase**
   ```bash
   supabase secrets set BRAINTRUST_PROJECT_ID=5df22744-d29c-4b01-b18b-e3eccf2ddbba
   ```

2. **Add to .env.local**
   ```bash
   echo "BRAINTRUST_PROJECT_ID=5df22744-d29c-4b01-b18b-e3eccf2ddbba" >> .env.local
   ```

3. **Update PromptLoaderV2 constructor**
   - Add parameter
   - Remove hardcoded value
   - Add validation

4. **Update llm-proxy/index.ts initialization**
   - Read from env
   - Pass to constructor
   - Add validation

5. **Update upload scripts (3 files)**
   - Read from env instead of hardcoded
   - Add error handling
   - Test locally

6. **Test edge functions**
   ```bash
   # Local test
   supabase functions serve llm-proxy --env-file .env.local

   # Test operation
   curl -X POST http://localhost:54321/functions/v1/llm-proxy \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -d '{"operation":"generate-filter-code","params":{"conditions":["RSI below 30"],"klineInterval":"15m"}}'
   ```

7. **Test upload scripts**
   ```bash
   # Set env var
   export BRAINTRUST_PROJECT_ID="5df22744-d29c-4b01-b18b-e3eccf2ddbba"

   # Run script
   deno run --allow-net --allow-read --allow-env scripts/upload-prompt-to-braintrust.ts
   ```

8. **Deploy and verify production**
   ```bash
   # Deploy edge function
   supabase functions deploy llm-proxy

   # Test production
   curl -X POST https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/llm-proxy \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -d '{"operation":"generate-filter-code","params":{"conditions":["RSI below 30"],"klineInterval":"15m"}}'
   ```

9. **Update documentation**
   - Add BRAINTRUST_PROJECT_ID to environment variables list
   - Document how to find project ID in Braintrust UI
   - Add to setup instructions

### Completion Criteria

- [ ] `BRAINTRUST_PROJECT_ID` added to Supabase secrets
- [ ] `BRAINTRUST_PROJECT_ID` added to .env.local
- [ ] PromptLoaderV2 reads from constructor parameter
- [ ] llm-proxy/index.ts reads from env and passes to loader
- [ ] All 3 upload scripts read from env
- [ ] No hardcoded project IDs remain in codebase
- [ ] Edge functions work locally with env var
- [ ] Edge functions work in production
- [ ] Upload scripts work with env var
- [ ] Documentation updated

### Testing Checklist

**Local Development:**
- [ ] Edge function starts without errors
- [ ] Prompt loading works
- [ ] Operations succeed
- [ ] Upload scripts work

**Production:**
- [ ] Edge function deployed successfully
- [ ] Secrets are set correctly
- [ ] Operations succeed
- [ ] No hardcoded values in logs

**Error Handling:**
- [ ] Missing env var throws clear error
- [ ] Invalid project ID fails gracefully
- [ ] Error messages mention BRAINTRUST_PROJECT_ID

### Documentation Updates

**CLAUDE.md - Add to Development Environment section:**

```markdown
## Environment Variables

Required for all environments:
- `BRAINTRUST_API_KEY` - Braintrust API authentication
- `BRAINTRUST_PROJECT_ID` - Braintrust project ID (default: 5df22744-d29c-4b01-b18b-e3eccf2ddbba)
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase admin key
- `OPENROUTER_API_KEY` - OpenRouter API key for LLM calls

To find your Braintrust project ID:
1. Go to https://www.braintrust.dev/app
2. Select your project
3. Copy ID from URL: https://www.braintrust.dev/app/PROJECT_NAME/p/logs
4. Or use API: `curl -H "Authorization: Bearer $BRAINTRUST_API_KEY" https://api.braintrust.dev/v1/project | jq '.objects[] | {id, name}'`
```

### Notes

- This is a safe refactor - no behavior changes
- Enables future multi-environment setup (dev/staging/prod projects)
- Makes code reusable across different Braintrust projects
- Follows 12-factor app principles
- Can deploy immediately without breaking changes
## Completion
**Closed:** 2025-11-01 10:35:00
**Outcome:** Success
**Commits:** 455242f
