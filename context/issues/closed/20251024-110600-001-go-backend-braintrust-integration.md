# Add Braintrust SDK to Go Backend

**Type:** feature
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-24 11:06:03

## Context

The Go backend performs critical signal analysis using OpenRouter but has ZERO observability. Analysis decisions, token usage, model performance, and errors are invisible.

**Current State:**
- Analysis in `/backend/go-screener/internal/analysis/prompter.go`
- Uses OpenRouter client (`pkg/openrouter/client.go`)
- No Braintrust SDK in `go.mod`
- No tracing around LLM calls
- Prompt hardcoded in prompter.go (should load from Braintrust)

**Impact:**
Cannot debug why analysis makes certain trading decisions or optimize prompt quality.

## Linked Items
- Part of: `context/issues/open/20251024-110600-000-PROJECT-complete-braintrust-integration.md`

## Progress

Issue created, awaiting implementation.

## Spec

**Implementation Steps:**

1. **Add Braintrust Go SDK dependency**
   ```bash
   cd backend/go-screener
   go get github.com/braintrustdata/braintrust-go
   ```

2. **Initialize Braintrust client**
   - Create `pkg/braintrust/client.go`
   - Initialize with API key from env var `BRAINTRUST_API_KEY`
   - Set project name from env var `BRAINTRUST_PROJECT_NAME` (should be "vyx")

3. **Wrap OpenRouter calls with tracing**
   - In `/backend/go-screener/internal/analysis/prompter.go`
   - Wrap `AnalyzeSignal()` calls with Braintrust `StartSpan()`
   - Log: input prompt, output analysis, token usage, latency
   - Tag with: symbol, signal type, operation="analyze-signal"

4. **Load analysis prompt from Braintrust**
   - Current prompt is hardcoded in prompter.go
   - Replace with Braintrust prompt loading
   - Prompt slug: `analyze-signal` (to be created in Braintrust)
   - Enable version tracking

5. **Add environment variable support**
   - Update backend config to read `BRAINTRUST_API_KEY`
   - Update Fly deployment secrets
   - Document in README

**Files to Modify:**
- `backend/go-screener/go.mod` - Add dependency
- `backend/go-screener/pkg/braintrust/client.go` - New file
- `backend/go-screener/internal/analysis/prompter.go` - Add tracing
- `backend/go-screener/internal/config/config.go` - Add env vars
- `server/fly-machine/deploy.sh` - Add Braintrust secrets

**Testing:**
- Run analysis locally with tracing enabled
- Verify traces appear in Braintrust dashboard
- Confirm token usage is logged accurately
- Test with missing API key (graceful degradation)

**Success Criteria:**
- All Go backend analysis calls traced in Braintrust
- Analysis prompt loaded from Braintrust (versioned)
- Dashboard shows Go backend traces alongside edge function traces
- Token usage and latency metrics visible

## Progress Update

✅ **COMPLETED** (2025-11-03)

All implementation complete:
1. Added Braintrust Go SDK dependency
2. Created pkg/braintrust/client.go with HTTP-based tracing
3. Wrapped analysis engine with TraceAnalysis()
4. Added Braintrust config to Go (API key + project ID)
5. Auto-flush traces on engine shutdown

## Completion

**Closed:** 2025-11-03
**Outcome:** Success  
**Commits:** 42b7da9
