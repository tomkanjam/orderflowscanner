import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { loadPrompt } from "npm:braintrust@0.0.157";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { slug = 'regenerate-filter-go', projectName = 'AI Trader' } = await req.json().catch(() => ({}));

    console.log('=== BRAINTRUST SDK TEST ===');
    console.log(`Testing loadPrompt with:`);
    console.log(`  projectName: ${projectName}`);
    console.log(`  slug: ${slug}`);

    const start = Date.now();
    const prompt = await loadPrompt({
      projectName,
      slug
    });
    const duration = Date.now() - start;

    console.log(`\nSDK returned after ${duration}ms`);
    console.log(`Type: ${typeof prompt}`);
    console.log(`Is null: ${prompt === null}`);
    console.log(`Is undefined: ${prompt === undefined}`);

    if (prompt) {
      console.log(`Keys: ${Object.keys(prompt).join(', ')}`);
      console.log(`Full object:`, JSON.stringify(prompt, null, 2));
    }

    return new Response(JSON.stringify({
      success: true,
      result: {
        type: typeof prompt,
        isNull: prompt === null,
        keys: prompt ? Object.keys(prompt) : null,
        hasContent: prompt && 'content' in prompt,
        hasPrompt: prompt && 'prompt' in prompt,
        hasMessages: prompt && 'messages' in prompt,
        duration,
        fullObject: prompt
      }
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('ERROR:', error);
    console.error('Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('Error message:', error instanceof Error ? error.message : String(error));
    console.error('Error stack:', error instanceof Error ? error.stack : 'N/A');

    return new Response(JSON.stringify({
      success: false,
      error: {
        type: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null
      }
    }, null, 2), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
