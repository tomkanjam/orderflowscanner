# Braintrust as Single Source of Truth for All Prompts

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-01 10:31:17

## Context

Current prompt management has multiple sources of truth, hardcoded fallbacks, and duplicated content across:
- Local markdown files (backend/go-screener/prompts/, supabase/functions/llm-proxy/prompts/)
- SQL migrations with embedded prompts (009, 020)
- Hardcoded prompts in TypeScript (upload-prompts/index.ts, ai-analysis/promptBuilder.ts, seedPrompts.ts)
- Supabase prompts table
- Braintrust (intended single source)

The Braintrust version of `regenerate-filter-go` is significantly shorter (88 lines) than the local reference file (731 lines) because it references the local file for "complete API documentation" instead of including it. **This was not intentional** - the full prompt content needs to be in Braintrust.

**Principle:** Braintrust must be the ONLY source of truth. No local files, no hardcoding, no backups, no fallbacks.

## Linked Items
- Related: Current initiative - End-to-end trader workflow implementation

## Sub-issues
- [ ] `context/issues/open/20251101-103117-001-upload-full-prompts-braintrust.md` - Upload complete prompt content to Braintrust
- [ ] `context/issues/open/20251101-103117-002-remove-prompt-duplicates.md` - Remove all duplicate prompt storage
- [ ] `context/issues/open/20251101-103117-003-remove-hardcoded-fallbacks.md` - Remove hardcoded fallbacks and dead code
- [ ] `context/issues/open/20251101-103117-004-env-var-braintrust-config.md` - Extract hardcoded Braintrust config to env vars
- [ ] `context/issues/open/20251101-103117-005-unify-ai-analysis-prompts.md` - Unify AI analysis prompt loading with llm-proxy

## Progress
Created project issue with comprehensive audit findings and sub-issues.

## Spec

### Findings from Comprehensive Audit

#### 1. Prompt Storage Locations (Multiple Sources of Truth)

**Local Markdown Files:**
- `backend/go-screener/prompts/regenerate-filter-go.md` (731 lines) - Complete reference
- `supabase/functions/llm-proxy/prompts/analyze-signal.md` (58 lines)

**Supabase Database:**
- `prompts` table with fields: system_instruction, user_prompt_template
- `prompt_versions` table for version history
- Migration 009: Hardcoded `generate-trader-metadata` prompt (2000+ lines)
- Migration 020: Hardcoded `regenerate-filter-go` prompt (800+ lines)

**Hardcoded in TypeScript:**
- `supabase/functions/upload-prompts/index.ts` Lines 14-101: HARDCODED regenerate-filter-go
- `supabase/functions/ai-analysis/promptBuilder.ts` Lines 24-70: Inline analysis prompt
- `apps/app/src/scripts/seedPrompts.ts` (150+ lines): All prompt definitions with full content

**Braintrust (Intended Single Source):**
- Currently has SHORT VERSION of regenerate-filter-go (88 lines)
- Missing complete indicator documentation
- References local .md file instead of being self-contained

#### 2. Prompt Loading Mechanisms

**PromptLoaderV2** (Active - supabase/functions/llm-proxy/promptLoader.v2.ts):
- Uses Braintrust REST API ONLY
- Comment claims "Supabase fallback" but **NO FALLBACK EXISTS**
- Throws error if prompt not found
- In-memory cache with 5-minute TTL
- Hardcoded project ID: `5df22744-d29c-4b01-b18b-e3eccf2ddbba`

**PromptLoaderV1** (Legacy - promptLoader.ts):
- Loads from Supabase prompts table
- **DEAD CODE** - not used by llm-proxy
- Should be deleted

**PromptBuilder** (ai-analysis/promptBuilder.ts):
- Builds prompt inline, NOT using Braintrust
- Separate system from llm-proxy
- Inconsistent with architecture

#### 3. Critical Issues

| Issue | Risk | Impact |
|-------|------|--------|
| Braintrust prompt missing full content | HIGH | LLM lacks complete indicator API docs |
| Multiple sources of truth | HIGH | Sync nightmare, version drift |
| Hardcoded Braintrust project ID (4 locations) | HIGH | Can't switch projects/environments |
| AI Analysis bypasses prompt loader | MEDIUM | Inconsistent prompt management |
| Misleading "fallback" comment | MEDIUM | False expectations about resilience |
| SQL migrations with embedded prompts | MEDIUM | Duplication, hard to update |
| Dead code (PromptLoaderV1) | LOW | Confusion, maintenance burden |

#### 4. Hardcoded Locations

**Braintrust Project ID:** `5df22744-d29c-4b01-b18b-e3eccf2ddbba`
- promptLoader.v2.ts:31
- upload-prompts/index.ts:11
- upload-prompt-to-braintrust.ts:17
- upload-analyze-signal-prompt.ts:11

**Prompt Slugs:**
- `generate-trader-metadata`
- `regenerate-filter-go`
- `analyze-signal`
- `generate-filter-code` (different name in upload script)

### Architecture Vision

```
Single Source of Truth Flow:

┌─────────────────────────────────────┐
│         Braintrust                   │
│  (Complete prompts with full docs)   │
│  - regenerate-filter-go (731 lines)  │
│  - generate-trader-metadata          │
│  - analyze-signal                    │
└──────────────┬──────────────────────┘
               │
               │ PromptLoaderV2 (REST API)
               │ No fallbacks, no cache to disk
               │
               ▼
┌─────────────────────────────────────┐
│    Edge Functions (llm-proxy)        │
│  - generateFilterCode.ts             │
│  - generateTraderMetadata.ts         │
│  - analyzeSignal.ts                  │
│  - generateTrader.ts                 │
└─────────────────────────────────────┘

NO MORE:
❌ Local .md files as source
❌ SQL migrations with prompt content
❌ Hardcoded prompts in TypeScript
❌ Supabase prompts table
❌ PromptLoaderV1
❌ Inline prompt building
```

### Migration Strategy

**Phase 1: Upload Complete Prompts to Braintrust**
1. Upload full `regenerate-filter-go.md` (731 lines) to Braintrust
2. Upload full `analyze-signal.md` to Braintrust
3. Upload `generate-trader-metadata` from migration 009 to Braintrust
4. Verify all prompts loaded correctly via API

**Phase 2: Remove Duplicates**
1. Delete local .md files (keep in git history)
2. Remove hardcoded prompt content from migrations (keep table structure)
3. Delete seedPrompts.ts script
4. Remove PROMPT_CONTENT constant from upload-prompts/index.ts
5. Drop Supabase prompts/prompt_versions tables (if not used elsewhere)

**Phase 3: Remove Fallbacks & Dead Code**
1. Delete PromptLoaderV1 (promptLoader.ts)
2. Remove misleading "Supabase fallback" comment from llm-proxy/index.ts:64
3. Remove prompt builder logic from ai-analysis, use promptLoader instead
4. Verify edge functions fail gracefully with clear errors if Braintrust unavailable

**Phase 4: Environment Variables**
1. Extract hardcoded project ID to `BRAINTRUST_PROJECT_ID`
2. Update all 4 files using hardcoded ID
3. Add env var to Supabase secrets
4. Update upload scripts to use env var

**Phase 5: Documentation & Testing**
1. Document Braintrust as single source in CLAUDE.md
2. Create upload script that reads from Braintrust API (audit trail)
3. Test all edge functions with Braintrust prompts
4. Verify error handling when prompts missing

### Success Criteria

- [ ] All prompts exist in Braintrust with complete content (no truncated docs)
- [ ] Zero local .md files containing prompts
- [ ] Zero hardcoded prompts in TypeScript/SQL
- [ ] PromptLoaderV2 is only loading mechanism
- [ ] Braintrust project ID comes from environment variable
- [ ] All edge functions use promptLoader (no inline building)
- [ ] Clear error messages if Braintrust unavailable
- [ ] Documentation updated to reflect single source of truth

### Risks & Mitigations

**Risk:** Braintrust API downtime breaks all LLM operations
- **Mitigation:** Accept this - simplicity over resilience. Monitor uptime, have incident response plan

**Risk:** Losing git history of prompt changes
- **Mitigation:** Create script to periodically export Braintrust prompts to git for audit trail (read-only)

**Risk:** Multiple engineers editing prompts simultaneously
- **Mitigation:** Use Braintrust's version history, establish prompt change review process

**Risk:** Accidental prompt deletion in Braintrust
- **Mitigation:** Braintrust has version history, can restore. Consider periodic backups via API

### Implementation Order

1. Sub-issue 001: Upload full prompts (SAFE - additive only)
2. Sub-issue 004: Environment variables (SAFE - config improvement)
3. Sub-issue 005: Unify AI analysis (MEDIUM RISK - changes working code)
4. Sub-issue 003: Remove fallbacks (MEDIUM RISK - removes safety nets)
5. Sub-issue 002: Remove duplicates (LOW RISK - cleanup after migration)

### Notes

- The local `regenerate-filter-go.md` file is excellent documentation. After upload to Braintrust, consider keeping ONE copy in `docs/` as reference (but clearly mark as not source of truth)
- Upload scripts should read from BRAINTRUST to sync to git for audit, not the reverse
- This aligns with "no local stuff" principle in CLAUDE.md
## Completion
**Closed:** 2025-11-01 10:35:00
**Outcome:** Success
**Commits:** 455242f
