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
    // Auth verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
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
      userId: user.id,
      sessionId: `${user.id}-${new Date().toISOString().split('T')[0]}`,
      metadata: {
        eventCount: events.length,
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