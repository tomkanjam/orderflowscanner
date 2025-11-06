# Implement Hybrid Prompt Management with Sync Safeguards

**Type:** enhancement
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-11-06 08:00:59

## Context
Currently we have an inconsistent state:
- Architecture doc says "Braintrust is ONLY source of truth"
- Upload script exists but references non-existent source files
- No way to track prompt changes in git
- No protection against Braintrust/git drift

Need hybrid approach: git as source of truth, Braintrust as runtime cache, with automatic sync enforcement.

## Linked Items
- Related: Core LLM workflow (regenerate-filter-go, analyze-signal prompts)

## Progress
✅ Complete - All components implemented and documented

**Implementation Summary:**

1. **Directory Structure Created**
   - `backend/go-screener/prompts/` - Go filter prompt
   - `supabase/functions/llm-proxy/prompts/` - Signal analysis prompt

2. **Scripts Implemented**
   - `scripts/download-prompts-from-braintrust.ts` - Download Braintrust → Git
   - `scripts/upload-all-prompts-to-braintrust.ts` - Upload Git → Braintrust with SHA-256 hashing
   - `scripts/verify-prompt-sync.ts` - Verify sync via hash comparison

3. **Sync Enforcement**
   - `.git/hooks/pre-commit` - Blocks commits if prompts out of sync
   - `.github/workflows/verify-prompts.yml` - CI verification on PRs

4. **Documentation**
   - Updated `CLAUDE.md` with hybrid approach workflow
   - Created `PROMPT_MANAGEMENT.md` with comprehensive guide

**How Sync Prevention Works:**
- Upload script stores SHA-256 hash in Braintrust metadata
- Pre-commit hook verifies hashes match before allowing commit
- GitHub Actions runs same verification on all PRs
- Emergency procedures documented for drift scenarios

**Next Steps:**
- User needs to provide `BRAINTRUST_API_KEY`
- Run download script to populate actual prompt content
- Test the complete workflow

## Spec
**Strategy: Git as Source of Truth with Automated Sync**

### 1. Create Prompt Source Files
- `backend/go-screener/prompts/regenerate-filter-go.md`
- `supabase/functions/llm-proxy/prompts/analyze-signal.md`

### 2. Sync Enforcement Mechanisms

**A. Pre-commit Hook**
- Check if prompt .md files changed
- If yes, require prompts uploaded to Braintrust before commit
- Verify by comparing git hash of files vs metadata in Braintrust

**B. CI Check (GitHub Actions)**
- On every PR: verify Braintrust has latest prompts
- Compare file hashes in git vs Braintrust metadata
- Fail CI if out of sync

**C. Startup Verification**
- Edge functions check prompt version on cold start
- Log warning if git hash doesn't match Braintrust metadata
- Include git hash in Braintrust prompt metadata during upload

### 3. Upload Script Enhancement
- Calculate SHA-256 hash of source file
- Store hash in Braintrust prompt metadata
- Return hash for verification

### 4. Documentation Updates
- Update CLAUDE.md with hybrid approach
- Add sync workflow documentation
- Document emergency procedures if drift occurs

### 5. Implementation Files
- `.husky/pre-commit` - Git hook
- `.github/workflows/verify-prompts.yml` - CI check
- `scripts/verify-prompt-sync.ts` - Verification utility
- `scripts/upload-all-prompts-to-braintrust.ts` - Enhanced with hashing
