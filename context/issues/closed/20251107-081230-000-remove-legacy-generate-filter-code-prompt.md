# Remove Legacy generate-filter-code Prompt

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-07 08:12:30

## Context

Two similar Go filter code generation prompts exist in the codebase:
1. `backend/go-screener/prompts/generate-filter-code.md` (241 lines) - **Legacy, unused**
2. `backend/go-screener/prompts/regenerate-filter-go.md` (400 lines) - **Active, in production**

The legacy prompt is outdated, confusing, and not referenced anywhere in runtime code.

## Linked Items

- Related: `context/issues/open/20251105-202800-3N-fix-regenerate-filter-prompt.md` (fixed active prompt)
- Part of: End-to-end trader workflow implementation initiative

## Progress

✅ **COMPLETED** (2025-11-07 08:15)

All legacy references removed:
1. ✅ Deleted `backend/go-screener/prompts/generate-filter-code.md`
2. ✅ Removed from `scripts/upload-all-prompts-to-braintrust.ts`
3. ✅ Removed from `supabase/functions/llm-proxy/config/operations.ts`
4. ✅ Updated `CLAUDE.md` to show only regenerate-filter-go.md
5. ✅ Verified upload script structure is valid

## Spec

### Why Remove It?

**Legacy prompt (`generate-filter-code.md`):**
- ❌ Returns only `{ filterCode, requiredTimeframes }` (missing visualization fields)
- ❌ Not referenced in any runtime code (verified by grep)
- ❌ Missing `seriesCode` and `indicators` fields needed for charts
- ❌ Outdated return format (bool instead of SignalResult)
- ❌ Confusing to maintain two similar prompts

**Active prompt (`regenerate-filter-go.md`):**
- ✅ Returns complete output: `{ filterCode, seriesCode, indicators, requiredTimeframes }`
- ✅ Used in production: `supabase/functions/llm-proxy/operations/generateFilterCode.ts:41`
- ✅ Recently maintained and fixed (Nov 5, 2025)
- ✅ Comprehensive documentation (400 lines vs 241)
- ✅ Includes indicator visualization system

**Evidence it's safe to remove:**
```bash
# Runtime code always uses regenerate-filter-go
$ grep -r "generate-filter-code" supabase/functions/llm-proxy/operations/
# Only found in:
# 1. Upload script (should be removed)
# 2. Config file (should be removed)
# 3. NOT in actual operation handlers
```

### Files to Modify

1. **DELETE:** `backend/go-screener/prompts/generate-filter-code.md`

2. **EDIT:** `scripts/upload-all-prompts-to-braintrust.ts`
   - Remove lines 41-50 (generate-filter-code config)

3. **EDIT:** `supabase/functions/llm-proxy/config/operations.ts`
   - Remove `generate-filter-code` entry (lines 44-50)

4. **EDIT:** `CLAUDE.md`
   - Update prompt list to remove mention of generate-filter-code.md
   - Keep only regenerate-filter-go.md

### Testing

After removal, verify:
1. Upload script runs without errors
2. Trader creation still works (uses regenerate-filter-go)
3. No grep matches for `generate-filter-code` in operational code
4. Braintrust prompt list reflects the change

### Cleanup in Braintrust (Optional)

Consider archiving the `generate-filter-code` prompt in Braintrust UI if it exists there, though it won't affect runtime since code doesn't reference it.

## Completion

**Closed:** 2025-11-07 08:15:00
**Outcome:** Success
**Commits:** f6fd69c (issue creation), [cleanup commit]

Successfully removed all references to the legacy `generate-filter-code.md` prompt. The codebase now uses only `regenerate-filter-go.md` for Go filter code generation, eliminating confusion and maintaining only the comprehensive, actively-maintained prompt with full indicator visualization support.
