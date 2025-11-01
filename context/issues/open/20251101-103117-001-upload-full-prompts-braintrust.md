# Upload Complete Prompt Content to Braintrust

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 10:31:17

## Context

The Braintrust version of `regenerate-filter-go` is only 88 lines and references the local .md file for "complete API documentation". This is incorrect - Braintrust prompts must be complete and self-contained with NO external references.

Current Braintrust prompt says:
> "See the full prompt in backend/go-screener/prompts/regenerate-filter-go.md for complete API documentation."

This defeats the purpose of Braintrust as single source of truth.

## Linked Items
- Part of: `context/issues/open/20251101-103117-000-PROJECT-braintrust-single-source-truth.md`

## Progress
Issue created, ready for implementation.

## Spec

### Prompts to Upload (Complete Content)

**1. regenerate-filter-go**
- Source: `backend/go-screener/prompts/regenerate-filter-go.md` (731 lines)
- Current Braintrust: 88 lines (INCOMPLETE)
- Target: Full 731 lines with all indicator documentation
- Slug: `regenerate-filter-go`
- Model: anthropic/claude-haiku-4.5
- Temperature: 0.4
- Max tokens: 4000
- Variables: `{{conditions}}`, `{{klineInterval}}`

**2. analyze-signal**
- Source: `supabase/functions/llm-proxy/prompts/analyze-signal.md` (58 lines)
- Current Braintrust: May exist, verify completeness
- Slug: `analyze-signal`
- Model: google/gemini-2.5-flash
- Temperature: 0.2
- Max tokens: 2000
- Variables: `{{symbol}}`, `{{price}}`, `{{strategy}}`, `{{timestamp}}`

**3. generate-trader-metadata**
- Source: `supabase/migrations/009_update_generate_trader_metadata_prompt.sql` (2000+ lines)
- Current Braintrust: Unknown, likely missing
- Slug: `generate-trader-metadata`
- Model: google/gemini-2.5-flash
- Temperature: 0.7
- Max tokens: 2000
- Variables: `{{userDescription}}`

### Implementation Steps

1. **Extract prompt from migration 009**
   ```bash
   # Extract SQL string content to temp file
   grep -A 5000 "system_instruction = " supabase/migrations/009_update_generate_trader_metadata_prompt.sql | \
     sed "s/.*system_instruction = '\(.*\)'.*/\1/" > /tmp/generate-trader-metadata.txt
   ```

2. **Create upload script for all three prompts**
   - Read each source file
   - Upload to Braintrust with correct config
   - Verify upload success
   - Compare line counts to ensure complete upload

3. **Use existing upload scripts as reference**
   - `scripts/upload-prompt-to-braintrust.ts` (regenerate-filter-go)
   - `scripts/upload-analyze-signal-prompt.ts` (analyze-signal)
   - Modify to use full content, not truncated versions

4. **Create unified upload script**
   ```typescript
   // scripts/upload-all-prompts-to-braintrust.ts
   const prompts = [
     {
       slug: 'regenerate-filter-go',
       source: './backend/go-screener/prompts/regenerate-filter-go.md',
       model: 'anthropic/claude-haiku-4.5',
       temperature: 0.4,
       maxTokens: 4000
     },
     {
       slug: 'analyze-signal',
       source: './supabase/functions/llm-proxy/prompts/analyze-signal.md',
       model: 'google/gemini-2.5-flash',
       temperature: 0.2,
       maxTokens: 2000
     },
     {
       slug: 'generate-trader-metadata',
       source: './backend/go-screener/prompts/generate-trader-metadata.md', // Extract from migration first
       model: 'google/gemini-2.5-flash',
       temperature: 0.7,
       maxTokens: 2000
     }
   ];
   ```

5. **Verify uploads via API**
   ```bash
   # Check regenerate-filter-go
   curl -s -H "Authorization: Bearer $BRAINTRUST_API_KEY" \
     "https://api.braintrust.dev/v1/prompt?project_id=5df22744-d29c-4b01-b18b-e3eccf2ddbba&slug=regenerate-filter-go" | \
     jq -r '.objects[0].prompt_data.prompt.content' | wc -l
   # Should output: 731 (or close to it)

   # Check analyze-signal
   curl -s -H "Authorization: Bearer $BRAINTRUST_API_KEY" \
     "https://api.braintrust.dev/v1/prompt?project_id=5df22744-d29c-4b01-b18b-e3eccf2ddbba&slug=analyze-signal" | \
     jq -r '.objects[0].prompt_data.prompt.content' | wc -l
   # Should output: 58

   # Check generate-trader-metadata
   curl -s -H "Authorization: Bearer $BRAINTRUST_API_KEY" \
     "https://api.braintrust.dev/v1/prompt?project_id=5df22744-d29c-4b01-b18b-e3eccf2ddbba&slug=generate-trader-metadata" | \
     jq -r '.objects[0].prompt_data.prompt.content' | wc -l
   # Should output: 2000+
   ```

6. **Test edge functions**
   ```bash
   # Test generate-filter-code
   curl -X POST https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/llm-proxy \
     -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
     -d '{"operation":"generate-filter-code","params":{"conditions":["RSI below 30"],"klineInterval":"15m"}}'

   # Verify response contains Go code with proper indicator usage
   ```

### Completion Criteria

- [ ] All three prompts uploaded to Braintrust with complete content
- [ ] `regenerate-filter-go` is 731 lines (full indicator docs)
- [ ] `analyze-signal` is 58 lines (complete)
- [ ] `generate-trader-metadata` is 2000+ lines (complete)
- [ ] No references to external files in prompt content
- [ ] Edge functions successfully load and use prompts
- [ ] Braintrust UI shows correct version numbers
- [ ] Upload script can be re-run for updates

### Notes

- This is SAFE to do - purely additive, doesn't break existing code
- Existing edge functions will automatically pick up complete prompts
- Cache TTL is 5 minutes, so changes visible quickly
- Keep upload scripts for future prompt updates
