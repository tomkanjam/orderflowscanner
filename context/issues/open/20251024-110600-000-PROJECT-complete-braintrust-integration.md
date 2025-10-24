# Complete Braintrust Integration (Phase 2)

**Type:** project
**Initiative:** End-to-end trader workflow implementation
**Created:** 2025-10-24 11:06:03

## Context

GitHub issue #9 implemented ~70% of the Braintrust integration for prompt management, observability, and evaluation. The foundation is solid but critical gaps remain that limit our ability to fully observe, debug, and optimize the AI trader workflow.

**Current State:**
- ✅ Braintrust SDK integrated in edge functions with tracing
- ✅ OpenRouter migration complete across all LLM call sites
- ✅ Unified `/llm-proxy` edge function architecture for browser calls
- ✅ Prompt loading from Braintrust REST API
- ❌ Go backend analysis has ZERO observability (no Braintrust)
- ❌ Signal analysis (`/ai-analysis`) separate from unified architecture
- ❌ Dual observability systems (Braintrust + Langfuse) causing confusion
- ❌ No prompt versioning or A/B testing capability
- ❌ No evaluation framework for quality monitoring

**Impact:**
Without complete Braintrust integration, we cannot:
- Debug analysis quality issues in production
- Compare prompt versions systematically
- Measure model performance over time
- Optimize for cost/quality tradeoffs
- A/B test improvements to trader generation

This blocks our ability to rapidly iterate on AI quality before launch.

## Linked Items
- Builds on: GitHub issue #9 (closed)
- Related: End-to-end trader workflow initiative
- Unblocks: AI quality optimization, production debugging

## Sub-issues
- [ ] `context/issues/open/20251024-110600-001-go-backend-braintrust-integration.md` - Add Braintrust SDK to Go backend
- [ ] `context/issues/open/20251024-110600-002-unify-signal-analysis.md` - Migrate ai-analysis to llm-proxy
- [ ] `context/issues/open/20251024-110600-003-prompt-versioning.md` - Implement prompt version tracking
- [ ] `context/issues/open/20251024-110600-004-consolidate-observability.md` - Choose Braintrust or Langfuse, remove the other
- [ ] `context/issues/open/20251024-110600-005-evaluation-framework.md` - Set up Braintrust evals and scorers

## Progress

Project created. Sub-issues to be created next.

## Spec

**Architecture Goal:**
Complete end-to-end Braintrust observability across the entire LLM pipeline:

```
Browser → Edge Functions → OpenRouter → Models
              ↓ Braintrust tracing

Go Backend → OpenRouter → Models
              ↓ Braintrust tracing

All operations visible in single Braintrust dashboard
All prompts versioned and A/B testable
Quality metrics tracked via evals
```

**Priority Order:**
1. **Go Backend Integration** (highest impact) - Unblocks analysis debugging
2. **Unify Signal Analysis** (architectural consistency) - Simplifies codebase
3. **Consolidate Observability** (remove confusion) - Pick one system
4. **Prompt Versioning** (enable iteration) - A/B test improvements
5. **Evaluation Framework** (quality monitoring) - Measure success

**Success Criteria:**
- All LLM calls across Go backend + edge functions traced in Braintrust
- Single observability platform (either Braintrust or Langfuse, not both)
- Prompt versions tracked and selectable per operation
- At least 3 evaluation scorers running on production data
- Braintrust dashboard shows complete trader workflow visibility

**Timeline:**
Target completion: 5 days (1 day per sub-issue)
