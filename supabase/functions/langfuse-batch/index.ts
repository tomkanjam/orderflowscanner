import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Langfuse } from 'https://esm.sh/langfuse@3'
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts'
import { validateAuth, checkRateLimit, rateLimitResponse, logAuthSuccess, unauthorizedResponse } from '../_shared/auth.ts'

interface BatchEvent {
  events: Array<{
    type: string
    timestamp: number
    metadata: any
  }>
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
    // Validate authentication
    const authResult = await validateAuth(req, {
      requireAuth: true,
      allowAnonymous: false
    })

    if (!authResult.success) {
      return unauthorizedResponse(authResult.error || 'Authentication required', corsHeaders)
    }

    const authContext = authResult.context!

    // Check rate limits
    if (!checkRateLimit(authContext, 'langfuse-batch')) {
      return rateLimitResponse(authContext, corsHeaders)
    }

    // Log successful authentication
    logAuthSuccess(authContext, 'langfuse-batch')

    // Initialize Langfuse
    const langfuseSecretKey = Deno.env.get('LANGFUSE_SECRET_KEY')
    const langfusePublicKey = Deno.env.get('LANGFUSE_PUBLIC_KEY')
    const langfuseBaseUrl = Deno.env.get('LANGFUSE_BASE_URL') || 'https://cloud.langfuse.com'
    
    if (!langfuseSecretKey || !langfusePublicKey) {
      console.error('Langfuse credentials not configured')
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

    // Process batch
    const { events }: BatchEvent = await req.json()
    
    // Create a single trace for the batch
    const batchTrace = langfuse.trace({
      name: 'batch-events',
      userId: authContext.userId || 'anonymous',
      sessionId: `${authContext.userId || 'anon'}-${new Date().toISOString().split('T')[0]}`,
      metadata: {
        eventCount: events.length,
        userTier: authContext.userTier,
        timestamp: new Date().toISOString(),
      }
    })

    // Log each event
    for (const event of events) {
      batchTrace.event({
        name: `batch-${event.type}`,
        timestamp: new Date(event.timestamp),
        metadata: event.metadata,
        level: 'DEFAULT',
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