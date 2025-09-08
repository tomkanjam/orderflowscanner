# Langfuse + Supabase Edge Functions: Hybrid Implementation Plan

## Overview

This plan implements observability for the AI-powered crypto screener using a hybrid approach:
- **Gemini API calls**: Remain in the frontend using Firebase AI Logic (no latency impact)
- **Langfuse logging**: Proxied through Supabase Edge Functions for security

## Architecture

```
┌─────────────────┐                           ┌─────────────┐
│   Frontend      │──────── AI Calls ────────▶│   Gemini    │
│   (React)       │◀──────  Response ─────────│    API      │
│                 │         (via Firebase)     └─────────────┘
│                 │
│                 │         Async Logging                    
│                 │─────────────────────────┐
└─────────────────┘                         ▼
                                   ┌─────────────────┐
                                   │    Supabase     │
                                   │ Edge Functions  │
                                   └────────┬────────┘
                                           │
                                           ▼
                                   ┌─────────────────┐
                                   │    Langfuse     │
                                   │     Cloud       │
                                   └─────────────────┘
```

## Phase 1: Foundation (Day 1-2)

### 1.1 Langfuse Setup
**Time**: 1 hour
**Tasks**:
- Create Langfuse account at https://cloud.langfuse.com
- Create new project for crypto screener
- Generate API keys (public + secret)
- Document keys in secure location

### 1.2 Supabase Edge Functions Setup
**Time**: 2 hours
**Tasks**:
```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Initialize functions
supabase functions new langfuse-proxy
supabase functions new langfuse-batch
```

### 1.3 Create Edge Function Implementation
**Time**: 3 hours
**File**: `supabase/functions/langfuse-proxy/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Langfuse } from 'https://esm.sh/langfuse@3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LangfuseEvent {
  type: 'generation' | 'stream-start' | 'stream-complete' | 'error'
  traceId?: string
  parentId?: string
  timestamp: number
  metadata: {
    model: string
    klineInterval: string
    klineLimit?: number
    prompt?: string
    response?: any
    error?: string
    usage?: {
      promptTokens?: number
      candidatesTokens?: number
      totalTokens?: number
    }
    duration?: number
    streamProgress?: string[]
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const authHeader = req.headers.get('Authorization')!
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Langfuse
    const langfuseSecretKey = Deno.env.get('LANGFUSE_SECRET_KEY')
    const langfusePublicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY')
    
    if (!langfuseSecretKey || !langfusePublicKey) {
      console.error('Langfuse credentials not configured')
      // Return success even if Langfuse is not configured (graceful degradation)
      return new Response(
        JSON.stringify({ success: true, warning: 'Observability not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const langfuse = new Langfuse({
      secretKey: langfuseSecretKey,
      publicKey: langfusePublicKey,
      baseUrl: 'https://cloud.langfuse.com',
    })

    // Parse request body
    const event: LangfuseEvent = await req.json()

    // Create or retrieve trace
    let trace
    if (event.traceId) {
      // Continue existing trace
      trace = langfuse.trace({
        id: event.traceId,
        userId: user.id,
        sessionId: `${user.id}-${new Date().toISOString().split('T')[0]}`,
      })
    } else {
      // Create new trace
      trace = langfuse.trace({
        name: `ai-${event.type}`,
        userId: user.id,
        sessionId: `${user.id}-${new Date().toISOString().split('T')[0]}`,
        metadata: {
          userEmail: user.email,
          timestamp: new Date(event.timestamp).toISOString(),
        }
      })
    }

    // Log based on event type
    switch (event.type) {
      case 'generation': {
        const generation = trace.generation({
          name: 'filter-generation',
          model: event.metadata.model,
          input: event.metadata.prompt ? {
            prompt: event.metadata.prompt.substring(0, 1000), // Truncate for privacy
            klineInterval: event.metadata.klineInterval,
            klineLimit: event.metadata.klineLimit,
          } : undefined,
          output: event.metadata.response ? {
            success: true,
            hasScreenerCode: !!event.metadata.response.screenerCode,
            indicatorCount: event.metadata.response.indicators?.length || 0,
            descriptionLines: event.metadata.response.description?.length || 0,
          } : undefined,
          usage: event.metadata.usage,
          level: event.metadata.error ? 'ERROR' : 'DEFAULT',
          statusMessage: event.metadata.error || 'Success',
          metadata: {
            duration: event.metadata.duration,
            timestamp: new Date(event.timestamp).toISOString(),
          }
        })
        generation.end()
        break
      }

      case 'stream-start': {
        trace.event({
          name: 'stream-started',
          level: 'DEFAULT',
          metadata: {
            model: event.metadata.model,
            klineInterval: event.metadata.klineInterval,
            timestamp: new Date(event.timestamp).toISOString(),
          }
        })
        break
      }

      case 'stream-complete': {
        const generation = trace.generation({
          name: 'filter-generation-stream',
          model: event.metadata.model,
          input: event.metadata.prompt ? {
            prompt: event.metadata.prompt.substring(0, 1000),
            klineInterval: event.metadata.klineInterval,
          } : undefined,
          output: event.metadata.response ? {
            success: true,
            progressSteps: event.metadata.streamProgress?.length || 0,
            finalResponse: {
              hasScreenerCode: !!event.metadata.response.screenerCode,
              indicatorCount: event.metadata.response.indicators?.length || 0,
            }
          } : undefined,
          usage: event.metadata.usage,
          level: event.metadata.error ? 'ERROR' : 'DEFAULT',
          statusMessage: event.metadata.error || 'Success',
          metadata: {
            duration: event.metadata.duration,
            streamProgress: event.metadata.streamProgress,
            timestamp: new Date(event.timestamp).toISOString(),
          }
        })
        generation.end()
        break
      }

      case 'error': {
        trace.event({
          name: 'ai-error',
          level: 'ERROR',
          metadata: {
            error: event.metadata.error,
            model: event.metadata.model,
            timestamp: new Date(event.timestamp).toISOString(),
          }
        })
        break
      }
    }

    // Flush the trace
    await langfuse.flush()

    return new Response(
      JSON.stringify({ 
        success: true, 
        traceId: trace.id,
        traceUrl: `https://cloud.langfuse.com/project/${langfusePublicKey}/traces/${trace.id}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Langfuse proxy error:', error)
    // Don't fail the request if logging fails
    return new Response(
      JSON.stringify({ success: true, error: 'Logging failed but request continued' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

### 1.4 Batch Logging Function
**Time**: 2 hours
**File**: `supabase/functions/langfuse-batch/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Langfuse } from 'https://esm.sh/langfuse@3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BatchEvent {
  events: Array<{
    type: string
    timestamp: number
    metadata: any
  }>
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Auth verification (same as single proxy)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Langfuse
    const langfuse = new Langfuse({
      secretKey: Deno.env.get('LANGFUSE_SECRET_KEY')!,
      publicKey: Deno.env.get('LANGFUSE_PUBLIC_KEY')!,
    })

    // Process batch
    const { events }: BatchEvent = await req.json()
    
    for (const event of events) {
      const trace = langfuse.trace({
        name: `batch-${event.type}`,
        userId: user.id,
        timestamp: new Date(event.timestamp),
        metadata: event.metadata
      })
    }

    await langfuse.flush()

    return new Response(
      JSON.stringify({ success: true, processed: events.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Batch logging error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

## Phase 2: Frontend Integration (Day 3-4)

### 2.1 Create Observability Service
**Time**: 3 hours
**File**: `services/observabilityService.ts`

```typescript
import { supabase } from '../config/supabase';

interface ObservabilityEvent {
  type: 'generation' | 'stream-start' | 'stream-complete' | 'error';
  traceId?: string;
  metadata: {
    model: string;
    klineInterval: string;
    klineLimit?: number;
    prompt?: string;
    response?: any;
    error?: string;
    usage?: any;
    duration?: number;
    streamProgress?: string[];
  };
}

class ObservabilityService {
  private batchQueue: ObservabilityEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private isEnabled: boolean = true;

  constructor() {
    // Check if observability should be enabled
    this.isEnabled = import.meta.env.VITE_LANGFUSE_ENABLED !== 'false';
  }

  async trackEvent(event: ObservabilityEvent): Promise<void> {
    if (!this.isEnabled) return;

    // Add timestamp
    const timestampedEvent = {
      ...event,
      timestamp: Date.now(),
    };

    // For critical events, send immediately
    if (event.type === 'error' || event.type === 'generation') {
      try {
        await supabase.functions.invoke('langfuse-proxy', {
          body: timestampedEvent,
        });
      } catch (error) {
        console.error('Failed to track event:', error);
        // Don't throw - observability should never break the app
      }
      return;
    }

    // For other events, batch them
    this.batchQueue.push(timestampedEvent);
    
    if (this.batchQueue.length >= 10) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), 5000);
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const events = [...this.batchQueue];
    this.batchQueue = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      await supabase.functions.invoke('langfuse-batch', {
        body: { events },
      });
    } catch (error) {
      console.error('Failed to flush batch:', error);
      // Could implement retry logic here
    }
  }

  // Helper methods for specific event types
  async trackGeneration(
    prompt: string,
    model: string,
    klineInterval: string,
    klineLimit: number,
    response: any,
    usage: any,
    duration: number,
    error?: string
  ): Promise<void> {
    await this.trackEvent({
      type: 'generation',
      metadata: {
        prompt,
        model,
        klineInterval,
        klineLimit,
        response,
        usage,
        duration,
        error,
      },
    });
  }

  async trackStreamStart(
    traceId: string,
    prompt: string,
    model: string,
    klineInterval: string
  ): Promise<void> {
    await this.trackEvent({
      type: 'stream-start',
      traceId,
      metadata: {
        prompt,
        model,
        klineInterval,
      },
    });
  }

  async trackStreamComplete(
    traceId: string,
    model: string,
    klineInterval: string,
    response: any,
    usage: any,
    duration: number,
    streamProgress: string[],
    error?: string
  ): Promise<void> {
    await this.trackEvent({
      type: 'stream-complete',
      traceId,
      metadata: {
        model,
        klineInterval,
        response,
        usage,
        duration,
        streamProgress,
        error,
      },
    });
  }

  // Ensure batch is flushed on page unload
  setupUnloadHandler(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.flushBatch();
      });
    }
  }
}

export const observability = new ObservabilityService();
```

### 2.2 Integrate with Gemini Service
**Time**: 4 hours
**File**: `services/geminiService.ts` (modifications)

```typescript
import { observability } from './observabilityService';

// Add to generateFilterAndChartConfig function
export async function generateFilterAndChartConfig(
  prompt: string,
  modelName: string,
  klineInterval: string,
  klineLimit: number
): Promise<AiFilterResponse> {
  const startTime = Date.now();
  
  try {
    // Existing implementation
    const model = getGenerativeModel(ai, {
      model: modelName,
      generationConfig: {
        responseMimeType: "application/json",
      }
    });
    
    const result = await model.generateContent(systemInstruction);
    const response = result.response;
    const text = response.text();
    
    // ... existing parsing logic ...
    
    // Track successful generation
    await observability.trackGeneration(
      prompt,
      modelName,
      klineInterval,
      klineLimit,
      parsedResult,
      response.usageMetadata,
      Date.now() - startTime
    );
    
    return parsedResult;
  } catch (error) {
    // Track error
    await observability.trackGeneration(
      prompt,
      modelName,
      klineInterval,
      klineLimit,
      null,
      null,
      Date.now() - startTime,
      error.message
    );
    throw error;
  }
}

// Add to generateFilterAndChartConfigStream function
export async function generateFilterAndChartConfigStream(
  prompt: string,
  modelName: string,
  klineInterval: string,
  klineLimit: number,
  onUpdate: (update: StreamingUpdate) => void
): Promise<AiFilterResponse> {
  const startTime = Date.now();
  const traceId = crypto.randomUUID();
  const progressUpdates: string[] = [];
  
  // Track stream start
  await observability.trackStreamStart(traceId, prompt, modelName, klineInterval);
  
  try {
    // ... existing implementation ...
    
    for await (const chunk of stream) {
      // ... existing chunk processing ...
      
      if (progressComment) {
        progressUpdates.push(progressComment);
      }
    }
    
    // ... existing parsing logic ...
    
    // Track stream completion
    await observability.trackStreamComplete(
      traceId,
      modelName,
      klineInterval,
      finalResponse,
      tokenUsage,
      Date.now() - startTime,
      progressUpdates
    );
    
    return finalResponse;
  } catch (error) {
    // Track stream error
    await observability.trackStreamComplete(
      traceId,
      modelName,
      klineInterval,
      null,
      null,
      Date.now() - startTime,
      progressUpdates,
      error.message
    );
    throw error;
  }
}

// Similar modifications for getMarketAnalysis and getSymbolAnalysis
```

### 2.3 Initialize Observability in App
**Time**: 1 hour
**File**: `App.tsx` (modification at top)

```typescript
import { observability } from './services/observabilityService';

// Initialize observability
observability.setupUnloadHandler();
```

## Phase 3: Testing & Deployment (Day 5)

### 3.1 Local Testing
**Time**: 2 hours
**Tasks**:
```bash
# Start local Supabase
supabase start

# Test Edge Functions locally
supabase functions serve langfuse-proxy --env-file .env.local

# In another terminal
curl -X POST http://localhost:54321/functions/v1/langfuse-proxy \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"generation","metadata":{"model":"gemini-1.5-flash"}}'
```

### 3.2 Deploy Edge Functions
**Time**: 1 hour
**Tasks**:
```bash
# Set secrets in Supabase
supabase secrets set LANGFUSE_SECRET_KEY=sk-lf-...
supabase secrets set LANGFUSE_PUBLIC_KEY=pk-lf-...

# Deploy functions
supabase functions deploy langfuse-proxy
supabase functions deploy langfuse-batch
```

### 3.3 Frontend Environment Setup
**Time**: 1 hour
**File**: `.env.local`
```env
VITE_LANGFUSE_ENABLED=true
```

### 3.4 Integration Testing
**Time**: 3 hours
**Test Scenarios**:
1. Generate filter with non-streaming model
2. Generate filter with streaming model
3. Handle API errors gracefully
4. Verify batch logging works
5. Check Langfuse dashboard for traces

## Phase 4: Monitoring & Optimization (Day 6)

### 4.1 Create Langfuse Dashboard
**Time**: 2 hours
**Tasks**:
- Set up custom views for:
  - Average generation time by model
  - Token usage by model
  - Error rates
  - Most common prompts
  - Streaming vs non-streaming performance

### 4.2 Add Custom Metrics
**Time**: 2 hours
**Additional tracking**:
```typescript
// Track filter complexity
const filterComplexity = {
  indicatorCount: response.indicators?.length || 0,
  hasCustomLogic: response.screenerCode?.includes('custom'),
  descriptionLength: response.description?.join(' ').length || 0,
};

// Track user patterns
const userPattern = {
  timeOfDay: new Date().getHours(),
  dayOfWeek: new Date().getDay(),
  previousPromptSimilarity: calculateSimilarity(prompt, lastPrompt),
};
```

### 4.3 Performance Optimization
**Time**: 2 hours
**Optimizations**:
- Implement sampling for high-volume periods
- Add circuit breaker for Edge Function failures
- Optimize batch sizes based on usage patterns

## Rollback Plan

### Feature Flag Control
```typescript
// Quick disable via environment variable
if (import.meta.env.VITE_LANGFUSE_ENABLED === 'false') {
  return; // Skip all logging
}
```

### Graceful Degradation
- If Edge Functions fail, app continues working
- If Langfuse is down, logging silently fails
- No user-facing errors from observability

## Success Metrics

1. **Technical Metrics**
   - Zero impact on AI generation latency
   - <100ms overhead for logging calls
   - 99.9% logging success rate

2. **Business Metrics**
   - Identify most popular indicators
   - Reduce debugging time by 50%
   - Optimize prompts for 20% better success rate

3. **Operational Metrics**
   - Complete visibility into AI usage
   - Accurate cost tracking
   - Early warning for errors

## Timeline Summary

- **Day 1-2**: Foundation setup (Langfuse + Edge Functions)
- **Day 3-4**: Frontend integration
- **Day 5**: Testing and deployment
- **Day 6**: Monitoring setup and optimization

Total: 6 working days for production-ready implementation

## Next Steps

1. Get Langfuse account created
2. Confirm Supabase project details
3. Begin Edge Function implementation
4. Schedule testing with PM

This hybrid approach provides secure, comprehensive observability while maintaining the simplicity of frontend AI calls.