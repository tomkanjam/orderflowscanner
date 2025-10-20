import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Langfuse } from 'https://esm.sh/langfuse@3'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { validateAuth, checkRateLimit, rateLimitResponse, logAuthSuccess, unauthorizedResponse } from '../_shared/auth.ts'

interface LangfuseEvent {
  type: 'generation' | 'stream-start' | 'stream-complete' | 'error' | 'analysis'
  traceId?: string
  parentId?: string
  timestamp: number
  metadata: {
    model: string
    klineInterval?: string
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
    analysisType?: 'market' | 'symbol'
    symbol?: string
  }
}

serve(async (req) => {
  // Handle CORS preflight
  const preflightResponse = handleCorsPreflightRequest(req)
  if (preflightResponse) {
    return preflightResponse
  }

  // Get CORS headers for this request
  const corsHeaders = getCorsHeaders(req)

  try {
    // Validate authentication - langfuse logging requires authentication
    const authResult = await validateAuth(req, {
      requireAuth: true,
      allowAnonymous: false
    })

    if (!authResult.success) {
      return unauthorizedResponse(authResult.error || 'Authentication required', corsHeaders)
    }

    const authContext = authResult.context!

    // Check rate limits
    if (!checkRateLimit(authContext, 'langfuse-proxy')) {
      return rateLimitResponse(authContext, corsHeaders)
    }

    // Log successful authentication
    logAuthSuccess(authContext, 'langfuse-proxy')

    // Initialize Langfuse
    const langfuseSecretKey = Deno.env.get('LANGFUSE_SECRET_KEY')
    const langfusePublicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY')
    const langfuseBaseUrl = Deno.env.get('LANGFUSE_BASE_URL') || 'https://cloud.langfuse.com'
    
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
      baseUrl: langfuseBaseUrl,
    })

    // Parse request body
    const event: LangfuseEvent = await req.json()

    // Create or retrieve trace
    let trace
    if (event.traceId) {
      // Continue existing trace
      trace = langfuse.trace({
        id: event.traceId,
        userId: authContext.userId || 'anonymous',
        sessionId: `${authContext.userId || 'anon'}-${new Date().toISOString().split('T')[0]}`,
      })
    } else {
      // Create new trace
      trace = langfuse.trace({
        name: `ai-${event.type}`,
        userId: authContext.userId || 'anonymous',
        sessionId: `${authContext.userId || 'anon'}-${new Date().toISOString().split('T')[0]}`,
        metadata: {
          userEmail: authContext.email,
          userTier: authContext.userTier,
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

      case 'analysis': {
        const generation = trace.generation({
          name: `${event.metadata.analysisType}-analysis`,
          model: event.metadata.model,
          input: {
            type: event.metadata.analysisType,
            symbol: event.metadata.symbol,
            prompt: event.metadata.prompt?.substring(0, 500),
          },
          output: event.metadata.response ? {
            success: true,
            responseLength: event.metadata.response.length,
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
        traceUrl: `${langfuseBaseUrl}/project/${langfusePublicKey}/traces/${trace.id}`
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