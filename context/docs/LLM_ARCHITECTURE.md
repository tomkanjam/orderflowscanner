# LLM Architecture Documentation

## Overview

This document provides a comprehensive overview of all LLM (Large Language Model) integrations in the application, including OpenRouter calls, Braintrust observability, and the relationship between different components.

**Last Updated**: 2025-01-23

---

## 🎯 What We're Building

### The App Concept

An AI-powered cryptocurrency trading platform where users create **AI Traders** (agents with personality) that:

1. **Detect** - Find trading setups matching criteria (Go filter code execution on backend)
2. **Analyze** - Evaluate opportunities using AI with personality-driven reasoning (LLM calls)
3. **Execute** - (Elite tier only) Automatically trade based on AI decisions

### The "Trader" Concept (Critical)

**NOT** just filters/signals. **Traders are AI agents with personality**:

```typescript
{
  name: "The Patient Divergence Trader",
  personality: {
    style: "conservative",
    riskTolerance: "medium",
    patience: "high",
    philosophy: "I only trade high-probability setups"
  }
}
```

This enables:
- **Consistent AI behavior** (same trader = same decision style)
- **User emotional connection** (users bond with "their trader")
- **Better prompts** (personality = context = better LLM outputs)

---

## 🏗️ Architecture Principles

### 1. **Browser LLM Operations = MINIMAL**
The browser should ONLY perform trader/filter creation operations. All analysis should happen on the backend.

### 2. **All Browser LLM Calls = Edge Functions**
- ❌ NO direct Firebase AI calls
- ❌ NO direct OpenRouter calls from browser
- ✅ ALL calls go through `llm-proxy` edge function

### 3. **All LLM Operations = OpenRouter + Braintrust**
- ✅ OpenRouter for API calls
- ✅ Braintrust for observability/tracing
- ✅ Prompts managed in Braintrust

### 4. **Firebase AI Logic = MUST BE REMOVED**
Firebase AI Logic is legacy code that violates our architecture principles and must be completely removed (see issue #41).

---

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React/Browser)                       │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     geminiService.ts                              │  │
│  │  ┌──────────────────────────────────────────────────────────┐    │  │
│  │  │  ⚠️  LEGACY: Firebase AI Logic (Vertex AI)              │    │  │
│  │  │  • generateFilterAndChartConfig()                        │    │  │
│  │  │  • getMarketAnalysis()                                   │    │  │
│  │  │  • generateStructuredAnalysis()                          │    │  │
│  │  │  • getSymbolAnalysis()                                   │    │  │
│  │  │  Status: STILL IN USE (browser-based signals only)      │    │  │
│  │  └──────────────────────────────────────────────────────────┘    │  │
│  │                                                                    │  │
│  │  ┌──────────────────────────────────────────────────────────┐    │  │
│  │  │  ✅ MODERN: Calls to llm-proxy Edge Function            │    │  │
│  │  │  • generateTraderMetadata() → llm-proxy                  │    │  │
│  │  │  • generateFilterCode() → llm-proxy                      │    │  │
│  │  │  • generateTrader() → llm-proxy                          │    │  │
│  │  │  Status: ACTIVE (trader/filter creation)                │    │  │
│  │  └──────────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │
                   ┌───────────────┼───────────────┐
                   │               │               │
                   ▼               ▼               ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │ Firebase AI  │  │  llm-proxy   │  │  Go Backend  │
        │   (Vertex)   │  │ Edge Function│  │              │
        │              │  │              │  │              │
        │ ⚠️  LEGACY   │  │ ✅ MODERN    │  │ ✅ MODERN    │
        └──────────────┘  └──────┬───────┘  └──────┬───────┘
                                 │                  │
                                 ▼                  ▼
                    ┌────────────────────┐  ┌────────────────────┐
                    │   OpenRouter API   │  │   OpenRouter API   │
                    │                    │  │                    │
                    │   Braintrust ✓     │  │   Braintrust ✓     │
                    └────────┬───────────┘  └────────┬───────────┘
                             │                       │
                             └───────────┬───────────┘
                                         ▼
                             ┌───────────────────────┐
                             │  LLM Models           │
                             │  • Gemini 2.5 Flash   │
                             │  • Claude Haiku 4.5   │
                             │  • (configurable)     │
                             └───────────────────────┘
```

---

## 📍 LLM Call Paths

### 1. **Browser → Firebase AI Logic** (❌ LEGACY - MUST BE REMOVED)

**Location**: `apps/app/services/geminiService.ts`

**Functions Using Firebase AI** (ALL VIOLATE ARCHITECTURE):
- ❌ `generateFilterAndChartConfig()` - Generates JavaScript filter code
- ❌ `generateFilterAndChartConfigStream()` - Streaming version
- ❌ `getMarketAnalysis()` - Market analysis (should be backend-only)
- ❌ `generateStructuredAnalysis()` - Signal analysis (should be backend-only)
- ❌ `getSymbolAnalysis()` - Symbol analysis (should be backend-only)

**Flow**:
```
Browser (geminiService.ts)
  → Firebase AI SDK (getGenerativeModel)
    → Google Vertex AI
      → Gemini models (NO BRAINTRUST TRACING)
```

**Configuration**: `apps/app/config/firebase.ts`
```typescript
export const ai = getAI(app, { backend: new VertexAIBackend() });
```

**Why This Violates Architecture**:
1. Browser performing analysis operations (should be backend)
2. No Braintrust observability
3. Direct LLM calls from browser (should use edge functions)
4. Duplicate integration path (we already have OpenRouter)

**Status**: ❌ **MUST BE REMOVED** (see issue #41)

**Migration Plan**:
- Delete all these functions (analysis should be backend-only)
- Remove `config/firebase.ts` entirely
- Remove Firebase AI package dependencies
- Browser should ONLY call trader creation functions

---

### 2. **Browser → llm-proxy Edge Function** (✅ MODERN PATH)

**Location**: `apps/app/services/geminiService.ts`

**Functions Using llm-proxy**:
- `generateTraderMetadata()` - Step 1 of trader creation
- `generateFilterCode()` - Step 2 of trader creation (Go code)
- `generateTrader()` - Combines both steps

**Flow**:
```
Browser (geminiService.ts)
  → Supabase Edge Function (llm-proxy)
    → PromptLoaderV2 (loads from Braintrust)
    → OpenRouterClient (makes API call)
      → Braintrust (tracing/logging)
      → OpenRouter API
        → LLM (Gemini/Claude)
```

**Edge Function**: `supabase/functions/llm-proxy/index.ts`

**Operations Supported**:
1. `generate-trader-metadata` - Extract strategy info from user prompt
2. `generate-filter-code` - Generate Go code from conditions
3. `generate-trader` - Full trader generation (metadata + filter)

**Configuration**: `supabase/functions/llm-proxy/config/operations.ts`
```typescript
export const OPERATION_CONFIGS = {
  'generate-trader-metadata': {
    modelId: 'google/gemini-2.5-flash',
    temperature: 0.7,
    maxTokens: 2000
  },
  'generate-filter-code': {
    modelId: 'google/gemini-2.5-flash',  // Can be switched to Claude
    temperature: 0.4,
    maxTokens: 4000
  },
  // ...
};
```

**Status**: ✅ **Active and preferred** for trader/filter creation

---

### 3. **Go Backend → OpenRouter** (✅ MODERN PATH)

**Location**: `backend/go-screener/pkg/openrouter/client.go`

**Purpose**: AI analysis of trading signals on the backend

**Functions**:
- Signal analysis (post-creation)
- Market condition analysis
- Trade decision generation

**Flow**:
```
Go Backend (analysis/engine.go)
  → OpenRouter Client (pkg/openrouter/client.go)
    → OpenRouter API
      → LLM (Gemini/Claude)
```

**Usage Example** (`backend/go-screener/internal/analysis/engine.go`):
```go
func (e *Engine) AnalyzeSignal(ctx context.Context, req *AnalysisRequest) (*AnalysisResult, error) {
    // Build prompt
    prompt := e.prompter.BuildAnalysisPrompt(req)

    // Call OpenRouter via client
    response, err := e.openRouter.Chat(ctx, &openrouter.ChatRequest{
        SystemPrompt: prompt.System,
        UserPrompt:   prompt.User,
        Model:        e.config.DefaultModel,
        Temperature:  e.config.Temperature,
    })

    // Process and store result
    return e.processAnalysisResponse(response)
}
```

**Status**: ✅ **Active** for signal analysis

---

## 🔍 Braintrust Integration

Braintrust provides observability and tracing for all OpenRouter calls.

### Integration Points

#### 1. **llm-proxy Edge Function**

**File**: `supabase/functions/llm-proxy/index.ts`

```typescript
import { initLogger } from "npm:braintrust@0.0.157";

// Initialize on edge function startup
initLogger({
  projectName: 'AI Trader',
  apiKey: BRAINTRUST_API_KEY
});
```

**Tracing Wrapper** (`supabase/functions/llm-proxy/openRouterClient.ts`):
```typescript
import { traced } from "npm:braintrust@0.0.157";

async chat(messages: any[], options: any = {}): Promise<any> {
  return await traced(async (span) => {
    // Log inputs
    span.log({
      input: messages,
      metadata: { model, temperature, max_tokens }
    });

    // Make API call
    const response = await this.makeRequest(requestBody);

    // Log outputs
    span.log({
      output: content,
      metrics: { prompt_tokens, completion_tokens, total_tokens }
    });

    return { content, usage, rawResponse };
  }, { name: "openrouter_chat", type: "llm" });
}
```

#### 2. **Prompt Management**

**File**: `supabase/functions/llm-proxy/promptLoader.v2.ts`

Prompts are loaded from Braintrust:
```typescript
async loadPrompt(slug: string): Promise<string> {
  const url = `https://api.braintrust.dev/v1/prompt?project_id=${projectId}&slug=${slug}`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  // Extract and cache prompt content
  return promptContent;
}
```

**Prompt Slugs**:
- `regenerate-filter-go` - Go filter code generation
- `generate-trader-metadata` - Trader metadata extraction
- (Note: These need to be uploaded to Braintrust - see issue #38)

---

## 🔧 Model Configuration

Models are configured per-operation in `supabase/functions/llm-proxy/config/operations.ts`:

```typescript
export const OPERATION_CONFIGS = {
  'generate-trader-metadata': {
    modelId: 'google/gemini-2.5-flash',
    promptVersion: 'v1.2',
    temperature: 0.7,
    maxTokens: 2000
  },
  'generate-filter-code': {
    modelId: 'google/gemini-2.5-flash',  // ← Configurable (issue #37)
    promptVersion: 'v1.0',                // ← Needs Braintrust prompt (issue #38)
    temperature: 0.4,
    maxTokens: 4000
  },
  'generate-trader': {
    modelId: 'google/gemini-2.5-flash',
    promptVersion: 'v1.1',
    temperature: 0.6,
    maxTokens: 6000
  }
};
```

**Benefits of Config-Based Approach**:
- Change models without frontend deployments
- A/B test different models via Braintrust evaluations
- Centralized control over LLM parameters

---

## ⚠️ Critical Issues

### 1. **Firebase AI Logic MUST BE REMOVED** (Issue #41)

**Problem**: `geminiService.ts` still uses Firebase AI Logic which violates architecture principles.

**Impact**:
- ❌ Two different LLM integration paths (confusion)
- ❌ No Braintrust tracing for Firebase calls
- ❌ Browser performing analysis (should be backend-only)
- ❌ Direct LLM calls from browser (violates edge function requirement)
- ❌ Duplicate dependencies and code

**Functions to DELETE** (not migrate - analysis should be backend-only):
- ❌ `generateFilterAndChartConfig()` - Delete
- ❌ `generateFilterAndChartConfigStream()` - Delete
- ❌ `getMarketAnalysis()` - Delete (backend handles this)
- ❌ `generateStructuredAnalysis()` - Delete (backend handles this)
- ❌ `getSymbolAnalysis()` - Delete (backend handles this)

**Files to DELETE**:
- ❌ `apps/app/config/firebase.ts` - Remove entirely
- ❌ Remove `firebase` and `@firebase/ai` packages

**Required Action**:
Complete removal of all Firebase AI code. Browser should ONLY perform trader creation via llm-proxy edge function.

### 2. **Prompt Not in Braintrust**

**Problem**: `regenerate-filter-go` prompt not uploaded to Braintrust (issue #38)

**Impact**:
- Filter code generation fails with 500 error
- Cannot switch to Claude Haiku (issue #37 blocked)

**Solution**:
Upload prompt from `backend/go-screener/prompts/regenerate-filter-go.md` to Braintrust UI

### 3. **Model Switching Blocked**

**Problem**: Cannot switch `generate-filter-code` to Claude Haiku until prompt exists in Braintrust

**Tracking**: Issue #37

---

## 🚀 Required Actions

### Phase 1: Foundation (CRITICAL - Do First)

1. **Upload ALL Prompts to Braintrust** (issue #38)
   - ⚠️ BLOCKS ALL OTHER WORK
   - Upload `regenerate-filter-go` from `backend/go-screener/prompts/`
   - Upload `generate-trader-metadata` prompt
   - Verify prompts load correctly from Braintrust API
   - Test prompt versioning strategy

### Phase 2: Remove Firebase AI (Issue #41)

2. **DELETE Firebase AI Code** (HIGH PRIORITY)
   - ❌ Delete `apps/app/config/firebase.ts` entirely
   - ❌ Delete all Firebase AI functions from `geminiService.ts`:
     - `generateFilterAndChartConfig()`
     - `generateFilterAndChartConfigStream()`
     - `getMarketAnalysis()`
     - `generateStructuredAnalysis()`
     - `getSymbolAnalysis()`
   - ❌ Remove Firebase AI imports
   - ❌ Remove `firebase` and `@firebase/ai` packages
   - ✅ Keep ONLY trader creation functions (already use llm-proxy)

3. **Verify Browser Operations are Minimal**
   - Browser should ONLY call trader creation operations
   - All analysis should be backend-only
   - Test that trader creation still works
   - Remove any UI that called deleted functions

### Phase 3: Optimization

4. **Test Model Switching** (issue #37)
   - Once prompts are uploaded, test Claude Haiku
   - Compare quality/performance vs Gemini
   - Update config if Claude performs better

5. **Unified Observability**
   - Verify all LLM calls traced in Braintrust
   - Monitor token usage across all operations
   - Set up alerts for errors/high costs

---

## 📊 Current State Summary

| Component | LLM Provider | Observability | Status | Action Required |
|-----------|-------------|---------------|---------|-----------------|
| **Browser Signals** | Firebase AI (Vertex) | ❌ None | ❌ VIOLATION | **DELETE** (Issue #41) |
| **Trader Creation** | OpenRouter (via llm-proxy) | ✅ Braintrust | ✅ Correct | Keep |
| **Signal Analysis** | OpenRouter (Go backend) | ✅ Braintrust | ✅ Correct | Keep |

**Target State**:
- Browser: ONLY trader creation via llm-proxy
- Backend: ALL analysis operations
- All LLM calls: OpenRouter + Braintrust
- Zero Firebase AI code

---

## 🔗 Related Files

**Frontend**:
- `apps/app/services/geminiService.ts` - Main LLM service (mixed legacy/modern)
- `apps/app/config/firebase.ts` - Firebase AI configuration

**Edge Functions**:
- `supabase/functions/llm-proxy/index.ts` - Main proxy handler
- `supabase/functions/llm-proxy/openRouterClient.ts` - OpenRouter client
- `supabase/functions/llm-proxy/promptLoader.v2.ts` - Braintrust prompt loader
- `supabase/functions/llm-proxy/config/operations.ts` - Model configuration
- `supabase/functions/llm-proxy/operations/` - Operation handlers

**Backend (Go)**:
- `backend/go-screener/pkg/openrouter/client.go` - OpenRouter client
- `backend/go-screener/internal/analysis/engine.go` - Analysis engine
- `backend/go-screener/internal/analysis/prompter.go` - Prompt builder

**Prompts**:
- `backend/go-screener/prompts/regenerate-filter-go.md` - Go filter generation prompt
- `docs/BRAINTRUST_PROMPT_SETUP.md` - Braintrust setup instructions

---

## 📝 Related Issues

- **#37** - Switch filter generation to Claude Haiku 4.5
- **#38** - Upload `regenerate-filter-go` prompt to Braintrust
