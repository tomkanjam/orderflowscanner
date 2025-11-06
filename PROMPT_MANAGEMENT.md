# Prompt Management System

## Overview

This project uses a **hybrid approach** for managing LLM prompts:
- **Git** = Source of truth (version controlled `.md` files)
- **Braintrust** = Runtime cache (where edge functions fetch prompts)
- **Automatic sync** = Pre-commit hooks + CI ensure they stay in sync

## Architecture

```
┌─────────────────┐
│   Git Source    │  ← Edit here
│  (prompt .md)   │
└────────┬────────┘
         │
         │ upload script
         ▼
┌─────────────────┐
│   Braintrust    │  ← Runtime fetches from here
│  (API + cache)  │
└─────────────────┘
         ▲
         │
    ┌────┴────┐
    │  Edge   │
    │Functions│
    └─────────┘
```

## Prompt Files

| File | Purpose |
|------|---------|
| `backend/go-screener/prompts/regenerate-filter-go.md` | Converts natural language to Go filter code |
| `supabase/functions/llm-proxy/prompts/analyze-signal.md` | Analyzes trading signals for AI trader decisions |

## Initial Setup

If you're setting up for the first time, download current prompts from Braintrust:

```bash
# Requires BRAINTRUST_API_KEY env var
# Get from: https://www.braintrust.dev/app/settings/api-keys

deno run --allow-net --allow-read --allow-write --allow-env \
  scripts/download-prompts-from-braintrust.ts
```

This creates/updates the local `.md` files with current Braintrust content.

## Updating Prompts

### Step 1: Edit Source File

Edit the markdown file directly in your editor:

```bash
# For filter code generation:
vim backend/go-screener/prompts/regenerate-filter-go.md

# For signal analysis:
vim supabase/functions/llm-proxy/prompts/analyze-signal.md
```

### Step 2: Upload to Braintrust

```bash
deno run --allow-net --allow-read --allow-env \
  scripts/upload-all-prompts-to-braintrust.ts
```

This:
- Reads local `.md` files
- Calculates SHA-256 hash
- Uploads to Braintrust with hash in metadata
- Verifies upload succeeded

### Step 3: Verify Sync

```bash
deno run --allow-net --allow-read --allow-env \
  scripts/verify-prompt-sync.ts
```

This compares file hashes between git and Braintrust. Exit code 0 = synced, 1 = out of sync.

### Step 4: Commit

```bash
git add backend/go-screener/prompts supabase/functions/llm-proxy/prompts
git commit -m "feat: improve signal analysis prompt"
```

The **pre-commit hook** will automatically verify sync and block the commit if you forgot step 2.

## Sync Enforcement

### Pre-commit Hook

Location: `.git/hooks/pre-commit`

When you try to commit changes to prompt files:
1. ✅ **Allows commit** if files unchanged OR already synced with Braintrust
2. ❌ **Blocks commit** if files changed but Braintrust not updated
3. 💡 Shows helpful error with upload command

**Override (not recommended):**
```bash
git commit --no-verify
```

### GitHub Actions CI

Workflow: `.github/workflows/verify-prompts.yml`

Runs on:
- All PRs touching prompt files
- All pushes to `main` with prompt changes

Fails the build if prompts are out of sync.

**Required secrets:**
- `BRAINTRUST_API_KEY`
- `BRAINTRUST_PROJECT_ID`

## Scripts

| Script | Purpose |
|--------|---------|
| `download-prompts-from-braintrust.ts` | Download Braintrust → Git (initial setup, emergency restore) |
| `upload-all-prompts-to-braintrust.ts` | Upload Git → Braintrust (after editing) |
| `verify-prompt-sync.ts` | Verify Git ↔ Braintrust sync (used by hooks/CI) |

All scripts require `BRAINTRUST_API_KEY` environment variable.

## Emergency Procedures

### Prompts Out of Sync

If verification fails, you have two options:

**Option 1: Git is correct, update Braintrust**
```bash
deno run --allow-net --allow-read --allow-env \
  scripts/upload-all-prompts-to-braintrust.ts
```

**Option 2: Braintrust is correct, update Git**
```bash
deno run --allow-net --allow-read --allow-write --allow-env \
  scripts/download-prompts-from-braintrust.ts
```

### Pre-commit Hook Blocking Falsely

If the hook blocks you but you're certain prompts are synced:

1. **Best**: Fix the sync
   ```bash
   deno run --allow-net --allow-read --allow-env scripts/upload-all-prompts-to-braintrust.ts
   ```

2. **If urgent**: Skip the hook (use sparingly)
   ```bash
   git commit --no-verify
   ```

3. **Investigate**: Check what changed
   ```bash
   git diff HEAD backend/go-screener/prompts
   git diff HEAD supabase/functions/llm-proxy/prompts
   ```

## How It Works

### File Hashing

Each upload calculates a SHA-256 hash of the file content and stores it in Braintrust metadata:

```typescript
{
  "metadata": {
    "git_source_hash": "a1b2c3d4...",
    "git_source_path": "backend/go-screener/prompts/regenerate-filter-go.md",
    "uploaded_at": "2025-11-06T08:00:00Z"
  }
}
```

Verification compares this hash with the current git file hash.

### Why Hybrid?

**Why not Braintrust-only?**
- ❌ No version control
- ❌ No code review for prompt changes
- ❌ No local editing workflow
- ❌ Hard to track history

**Why not Git-only?**
- ❌ Edge functions need fast access
- ❌ Braintrust provides caching, versioning, UI
- ❌ Braintrust tracks usage metrics

**Hybrid = Best of both worlds**
- ✅ Version control in git
- ✅ Fast runtime access via Braintrust
- ✅ Automatic sync enforcement
- ✅ Code review workflow

## Best Practices

### DO
- ✅ Edit prompts in git source files
- ✅ Upload to Braintrust after editing
- ✅ Verify sync before committing
- ✅ Review prompt changes in PRs
- ✅ Test prompts after updates

### DON'T
- ❌ Edit prompts in Braintrust UI (they'll get overwritten)
- ❌ Hardcode prompts in code
- ❌ Create prompt tables in database
- ❌ Skip pre-commit hook without good reason
- ❌ Commit without uploading to Braintrust

## Troubleshooting

### "BRAINTRUST_API_KEY not set"

Get your API key:
1. Visit https://www.braintrust.dev/app/settings/api-keys
2. Create new key or copy existing
3. Export: `export BRAINTRUST_API_KEY='your-key-here'`

Add to your shell profile for persistence:
```bash
echo 'export BRAINTRUST_API_KEY="your-key"' >> ~/.zshrc
source ~/.zshrc
```

### "Prompt not found in Braintrust"

The prompt doesn't exist in Braintrust yet. Upload it:
```bash
deno run --allow-net --allow-read --allow-env \
  scripts/upload-all-prompts-to-braintrust.ts
```

### "Hash mismatch"

Git and Braintrust have different content. Decide which is correct:
- Git is correct? Upload to Braintrust
- Braintrust is correct? Download to git

### CI Failing on PR

The GitHub Actions check failed. Fix:
1. Checkout the PR branch locally
2. Upload prompts: `deno run ... upload-all-prompts-to-braintrust.ts`
3. Verify: `deno run ... verify-prompt-sync.ts`
4. Push empty commit to re-trigger CI:
   ```bash
   git commit --allow-empty -m "chore: trigger CI after prompt upload"
   git push
   ```

## Related Documentation

- Main project docs: `CLAUDE.md`
- Issue tracking this work: `context/issues/open/20251106-080059-001-hybrid-prompt-management.md`
- Braintrust project: https://www.braintrust.dev/app/AI%20Trader/p/prompts
