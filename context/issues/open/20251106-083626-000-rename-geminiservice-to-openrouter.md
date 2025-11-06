# Rename geminiService.ts to reflect OpenRouter migration

**Type:** refactor
**Initiative:** none
**Created:** 2025-11-06 08:36:26

## Context
The codebase has migrated from using Gemini directly to using OpenRouter for LLM API calls. However, the service file is still named `geminiService.ts`, which is misleading and doesn't reflect the current implementation.

## Linked Items
- Related: OpenRouter migration work

## Progress
Deep dive complete - ready to implement

## Spec

### Analysis Summary
The file `apps/app/services/geminiService.ts` (498 lines) no longer uses Gemini directly - all LLM calls now route through the `llm-proxy` Edge Function which uses OpenRouter. The filename is a legacy artifact that misleads developers.

### Files Requiring Changes

**1. Rename Service File:**
- `apps/app/services/geminiService.ts` → `apps/app/services/llmService.ts`
  - Better reflects current implementation (calls llm-proxy, not Gemini directly)
  - More future-proof if we change providers again

**2. Code Imports (2 files):**
- `apps/app/src/components/TraderForm.tsx:3` - Import statement
- `apps/app/App.tsx.backup:9` - Import statement (backup file, low priority)

**3. Documentation Files (11+ files):**
- `.claude/agents/ai-trader-expert.md:20` - Service reference
- `.claude/agents/ai-cognitive-architecture-expert.md:14,52` - Service references
- `.claude/agents/gemini-prompt-expert.md:7,60` - Service references and descriptions
- `context/docs/architecture.md:602` - Architecture documentation
- `context/docs/automated-trading-workflows.md:437,488` - Pseudocode examples
- `context/issues/open/20251105-163439-001-PROJECT-create-trader-edge-function.md:116` - Issue reference
- `apps/app/architecture/two-step-trader-generation.md:72` - Code example
- Several closed issues and .ai-workflow docs (historical references, lower priority)

### Implementation Steps
1. Rename `apps/app/services/geminiService.ts` → `llmService.ts` (using git mv)
2. Update import in `apps/app/src/components/TraderForm.tsx`
3. Update all agent files in `.claude/agents/`
4. Update active docs in `context/docs/` and `apps/app/architecture/`
5. Update open issues in `context/issues/open/`
6. Verify build passes with `pnpm build`
7. Test TraderForm functionality (primary user of this service)
8. Commit with message: "refactor: rename geminiService to llmService to reflect OpenRouter migration"

### Risk Assessment
- **Low Risk**: No runtime logic changes, only naming
- **Test Surface**: TraderForm trader generation flow
- **Rollback**: Simple git revert if issues arise
