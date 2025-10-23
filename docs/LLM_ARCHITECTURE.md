# LLM Architecture Documentation

## Overview

This document provides a comprehensive overview of all LLM (Large Language Model) integrations in the application, including OpenRouter calls, Braintrust observability, and the relationship between different components.

**Last Updated**: 2025-01-23

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

### 1. **Browser → Firebase AI Logic** (⚠️ LEGACY PATH)

**Location**: `apps/app/services/geminiService.ts`

**Functions Still Using Firebase AI**:
- `generateFilterAndChartConfig()` - Generates JavaScript filter code
- `generateFilterAndChartConfigStream()` - Streaming version
- `getMarketAnalysis()` - Market analysis for browser
- `generateStructuredAnalysis()` - AI analysis for signals
- `getSymbolAnalysis()` - Per-symbol AI analysis

**Flow**:
```
Browser (geminiService.ts)
  → Firebase AI SDK (getGenerativeModel)
    → Google Vertex AI
      → Gemini models
```

**Configuration**: `apps/app/config/firebase.ts`
```typescript
export const ai = getAI(app, { backend: new VertexAIBackend() });
```

**Why Still in Use**:
- Used for browser-based signal creation (legacy flow)
- Analysis functions for existing signals
- JavaScript code generation (not Go)

**Status**: ⚠️ **Should be migrated** to OpenRouter for consistency

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

## ⚠️ Issues & Technical Debt

### 1. **Firebase AI Logic Still in Use**

**Problem**: `geminiService.ts` still uses Firebase AI Logic for browser-based operations.

**Impact**:
- Two different LLM integration paths (confusing)
- No Braintrust tracing for Firebase calls
- Different API quota management

**Functions to Migrate**:
- `generateFilterAndChartConfig()`
- `getMarketAnalysis()`
- `generateStructuredAnalysis()`
- `getSymbolAnalysis()`

**Recommendation**:
Create new llm-proxy operations for these functions to achieve consistent OpenRouter + Braintrust integration.

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

## 🚀 Recommendations

### Short Term

1. **Upload Prompts to Braintrust** (issue #38)
   - Upload `regenerate-filter-go`
   - Upload any other prompts referenced in code
   - Verify prompt versioning strategy

2. **Test Model Switching** (issue #37)
   - Once prompts are uploaded, test Claude Haiku
   - Compare quality/performance vs Gemini
   - Update config if Claude performs better

### Long Term

3. **Migrate Firebase AI Logic Calls**
   - Create llm-proxy operations for analysis functions
   - Add Braintrust tracing to all LLM calls
   - Remove Firebase AI dependencies

4. **Consolidate Prompt Management**
   - All prompts should be in Braintrust
   - Remove hardcoded prompts from code
   - Implement prompt versioning strategy

5. **Unified Observability**
   - All LLM calls (browser, edge, backend) traced in Braintrust
   - Consistent token usage tracking
   - Error monitoring and alerting

---

## 📊 Current State Summary

| Component | LLM Provider | Observability | Status |
|-----------|-------------|---------------|---------|
| **Browser Signals** | Firebase AI (Vertex) | ❌ None | ⚠️ Legacy |
| **Trader Creation** | OpenRouter (via llm-proxy) | ✅ Braintrust | ✅ Modern |
| **Signal Analysis** | OpenRouter (Go backend) | ✅ Braintrust | ✅ Modern |

**Goal**: Migrate all paths to OpenRouter + Braintrust for consistency and observability.

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
