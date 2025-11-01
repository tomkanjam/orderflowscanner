# Remove All Duplicate Prompt Storage

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 10:31:17

## Context

After uploading complete prompts to Braintrust, remove all duplicate storage locations. Braintrust is the single source of truth - no local files, no database tables, no hardcoded content.

This cleanup happens AFTER sub-issue 001 (upload to Braintrust) is complete.

## Linked Items
- Part of: `context/issues/open/20251101-103117-000-PROJECT-braintrust-single-source-truth.md`
- Depends on: `context/issues/open/20251101-103117-001-upload-full-prompts-braintrust.md`

## Progress
Issue created, awaiting prerequisite completion.

## Spec

### Files to Delete

**Local Markdown Prompt Files:**
```bash
# These are now in Braintrust
rm backend/go-screener/prompts/regenerate-filter-go.md
rm supabase/functions/llm-proxy/prompts/analyze-signal.md
rm -rf backend/go-screener/prompts/  # If directory is now empty
rm -rf supabase/functions/llm-proxy/prompts/  # If directory is now empty
```

**Seed Scripts:**
```bash
# Hardcoded prompt content
rm apps/app/src/scripts/seedPrompts.ts
rm apps/app/src/scripts/seedPrompts\ 3.ts  # Appears to be duplicate
```

**Upload Script with Hardcoded Content:**
```bash
# Remove PROMPT_CONTENT constant from upload-prompts/index.ts
# Or delete entire file if no longer needed
rm supabase/functions/upload-prompts/index.ts
```

### SQL Migrations to Modify

**Migration 009: generate-trader-metadata prompt**
- File: `supabase/migrations/009_update_generate_trader_metadata_prompt.sql`
- Current: 2000+ lines with embedded prompt content
- Action: Delete the entire migration (prompt is in Braintrust now)
- OR: Keep only the UPDATE statement structure but point to external reference

```sql
-- OLD (2000+ lines of prompt content)
UPDATE prompts SET system_instruction = 'HUGE_PROMPT_HERE' WHERE name = 'generate-trader-metadata';

-- DELETE THIS ENTIRE MIGRATION
```

**Migration 020: regenerate-filter-go prompt**
- File: `supabase/migrations/020_add_go_filter_prompt.sql`
- Current: 800+ lines with embedded prompt content
- Action: Delete the entire migration

```sql
-- DELETE THIS ENTIRE MIGRATION
```

**Migration 010: Seed prompts**
- File: `supabase/migrations/010_seed_prompts.sql`
- Current: Placeholder directing to seedPrompts.ts
- Action: Delete (seedPrompts.ts being deleted)

### Database Tables to Drop

**Evaluate if prompts/prompt_versions tables are used:**

1. **Check for other usage:**
   ```bash
   # Search for references to prompts table
   rg "from.*prompts" --type ts
   rg "prompts\..*" --type ts

   # Check if frontend PromptManager is used
   rg "PromptManager" --type ts
   ```

2. **If ONLY used for LLM proxy prompts:**
   ```sql
   -- Create migration to drop tables
   DROP TABLE IF EXISTS prompt_versions;
   DROP TABLE IF EXISTS prompts;
   ```

3. **If used elsewhere (e.g., admin UI):**
   - Keep tables but clear prompt data
   - Update any admin UI to read from Braintrust instead

### Code to Update

**Remove unused imports and references:**

```typescript
// supabase/functions/llm-proxy/index.ts
// Remove any Supabase client initialization related to prompts
// Remove supabaseUrl, supabaseServiceKey params if only used for prompts
```

**Update PromptLoaderV2 initialization:**

```typescript
// Old
const promptLoader = new PromptLoaderV2(
  braintrustApiKey,
  braintrustProjectId,
  supabaseUrl,      // REMOVE if only used for prompt fallback
  supabaseServiceKey // REMOVE if only used for prompt fallback
);

// New
const promptLoader = new PromptLoaderV2(
  braintrustApiKey,
  braintrustProjectId
);
```

### Implementation Steps

1. **Verify Braintrust prompts are complete** (from sub-issue 001)
2. **Test edge functions work with Braintrust** (smoke test all operations)
3. **Delete local prompt files** (.md files)
4. **Delete seed scripts** (seedPrompts.ts)
5. **Remove hardcoded content from upload-prompts/index.ts**
6. **Delete migrations with embedded prompts** (009, 020, 010)
7. **Evaluate dropping prompts tables** (or clear data)
8. **Update PromptLoaderV2 initialization** (remove unused params)
9. **Clean up imports** in llm-proxy/index.ts
10. **Test all edge functions again** (regression test)
11. **Commit changes with clear message**

### Testing Checklist

Before deleting files:
- [ ] Verify `generate-filter-code` operation works
- [ ] Verify `generate-trader-metadata` operation works
- [ ] Verify `analyze-signal` operation works
- [ ] Verify `generate-trader` operation works (combines above)
- [ ] Check Braintrust UI shows correct prompt content
- [ ] Verify prompt cache works (5-minute TTL)

After deleting files:
- [ ] Edge functions still work
- [ ] No broken imports
- [ ] No references to deleted files
- [ ] Database migrations apply cleanly to new projects
- [ ] Documentation updated (CLAUDE.md)

### Completion Criteria

- [ ] Zero local .md files with prompt content
- [ ] Zero hardcoded prompts in TypeScript
- [ ] Zero SQL migrations with embedded prompts
- [ ] prompts/prompt_versions tables dropped OR clearly documented as unused
- [ ] All edge functions pass smoke tests
- [ ] Git history preserved (files deleted, not lost)
- [ ] CLAUDE.md updated to document Braintrust as single source

### Rollback Plan

If issues discovered after cleanup:
1. Revert git commit
2. Restore deleted files
3. Re-run migrations if database tables were dropped
4. Investigate why Braintrust prompts didn't work
5. Fix issue before re-attempting cleanup

### Notes

- Keep upload scripts (`upload-prompt-to-braintrust.ts`, etc.) - needed for future updates
- Consider keeping ONE copy of regenerate-filter-go.md in `docs/reference/` as developer reference (but clearly mark as NOT source of truth)
- This is a one-way migration - after completion, all prompt changes happen in Braintrust UI or via API
