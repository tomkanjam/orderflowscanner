/**
 * LLM Proxy Edge Function
 *
 * Unified edge function for all LLM operations via OpenRouter
 * Supports: trader generation, analysis, filter code generation, market analysis
 *
 * Issue: #12 - Phase 1b
 * Phase 2a: Integrated with Braintrust for tracing
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { initLogger } from "npm:braintrust@0.0.157";
import { OpenRouterClient } from "./openRouterClient.ts";
import { PromptLoaderV2 } from "./promptLoader.v2.ts";
import { handleGenerateTrader } from "./operations/generateTrader.ts";
import { handleGenerateTraderMetadata } from "./operations/generateTraderMetadata.ts";
import { handleGenerateFilterCode } from "./operations/generateFilterCode.ts";
import { handleAnalyzeSignal } from "./operations/analyzeSignal.ts";
import { getOperationConfig } from "./config/operations.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// Initialize services
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const APP_URL = Deno.env.get('APP_URL') || 'https://vyx.app';
const BRAINTRUST_API_KEY = Deno.env.get('BRAINTRUST_API_KEY') || '';
const BRAINTRUST_PROJECT_NAME = Deno.env.get('BRAINTRUST_PROJECT_NAME') || 'AI Trader';

// Initialize Braintrust logger
if (BRAINTRUST_API_KEY) {
  console.log('[LLM Proxy] Initializing Braintrust logger...');
  initLogger({
    projectName: BRAINTRUST_PROJECT_NAME,
    apiKey: BRAINTRUST_API_KEY
  });
  console.log(`[LLM Proxy] Braintrust logger initialized for project: ${BRAINTRUST_PROJECT_NAME}`);
} else {
  console.warn('[LLM Proxy] BRAINTRUST_API_KEY not set - tracing disabled');
}

// Initialize OpenRouter client
// Note: Default model is overridden per-operation via getOperationConfig()
const openRouterClient = new OpenRouterClient(
  OPENROUTER_API_KEY,
  'google/gemini-2.5-flash',
  APP_URL
);

// Initialize PromptLoaderV2 with Braintrust + Supabase fallback
const promptLoader = new PromptLoaderV2(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  BRAINTRUST_PROJECT_NAME,
  !!BRAINTRUST_API_KEY // Only use Braintrust if API key is set
);

console.log('[LLM Proxy] Edge function initialized');
console.log(`[LLM Proxy] Prompt loading: Braintrust ${BRAINTRUST_API_KEY ? 'enabled' : 'disabled'} with Supabase fallback`);

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Health check
  if (req.method === 'GET' && req.url.endsWith('/health')) {
    return new Response(JSON.stringify({
      status: 'healthy',
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Validate request
    if (req.method !== 'POST') {
      throw new Error('Method not allowed');
    }

    const body = await req.json();
    const { operation, params, stream = false } = body;

    if (!operation) {
      throw new Error('Missing required field: operation');
    }

    // Route to appropriate handler
    const result = await routeOperation(operation, params, stream);

    // If result is a Response (SSE stream), return directly
    if (result instanceof Response) {
      return result;
    }

    // Otherwise, return JSON response
    return new Response(JSON.stringify({
      success: true,
      data: result.data,
      usage: result.usage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[LLM Proxy] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

/**
 * Route operation to appropriate handler
 *
 * NOTE: analyze-signal is called by database triggers (service role), not by browser.
 * Browser should only call trader creation operations.
 *
 * All LLM configuration (model, temperature, etc.) is determined by config/operations.ts
 * based on the operation type. This allows changing models via config without frontend deploys.
 */
async function routeOperation(
  operation: string,
  params: any,
  stream: boolean
): Promise<any> {
  // Validate operation is known
  const validOperations = [
    'generate-trader',
    'generate-trader-metadata',
    'generate-filter-code',
    'analyze-signal' // Called by database trigger (service role)
  ];

  if (!validOperations.includes(operation)) {
    throw new Error(`Unknown operation: ${operation}. Valid operations: ${validOperations.join(', ')}`);
  }

  // Get operation config
  const config = getOperationConfig(operation);

  switch (operation) {
    case 'generate-trader':
      return await handleGenerateTrader(params, openRouterClient, promptLoader, stream, config);

    case 'generate-trader-metadata':
      return await handleGenerateTraderMetadata(params, openRouterClient, promptLoader, stream, config);

    case 'generate-filter-code':
      return await handleGenerateFilterCode(params, openRouterClient, promptLoader, config);

    case 'analyze-signal':
      return await handleAnalyzeSignal(params, openRouterClient, promptLoader, config);

    default:
      throw new Error(`Unknown operation: ${operation}. Valid operations: ${validOperations.join(', ')}`);
  }
}
