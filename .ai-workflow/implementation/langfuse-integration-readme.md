# Langfuse Observability Integration

This document describes how to set up and test the Langfuse observability integration for the AI-powered crypto screener.

## Overview

The integration uses a hybrid approach:
- **Gemini API calls** remain in the frontend (no latency impact)
- **Langfuse logging** is proxied through Supabase Edge Functions for security

## Setup Steps

### 1. Langfuse Account Setup

1. Create an account at [https://cloud.langfuse.com](https://cloud.langfuse.com)
2. Create a new project for the crypto screener
3. Get your API keys from the project settings:
   - Public Key (pk-lf-...)
   - Secret Key (sk-lf-...)

### 2. Supabase Edge Functions Configuration

Deploy the Edge Functions and set the Langfuse credentials:

```bash
# Navigate to project root
cd /path/to/project

# Login to Supabase CLI (if not already logged in)
supabase login

# Link to your Supabase project
supabase link --project-ref your-project-ref

# Set the Langfuse secrets
supabase secrets set LANGFUSE_SECRET_KEY=sk-lf-...
supabase secrets set LANGFUSE_PUBLIC_KEY=pk-lf-...
supabase secrets set LANGFUSE_BASE_URL=https://cloud.langfuse.com

# Deploy the Edge Functions
supabase functions deploy langfuse-proxy
supabase functions deploy langfuse-batch
```

### 3. Frontend Environment Configuration

Create a `.env.local` file based on `.env.example`:

```env
# Supabase Configuration (already set up for auth)
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Enable Langfuse observability
VITE_LANGFUSE_ENABLED=true
```

### 4. Testing the Integration

#### Test 1: Basic Filter Generation
1. Start the development server: `pnpm dev`
2. Sign in with your email (required for observability)
3. Enter a simple AI prompt: "Show me coins with RSI below 30"
4. Check Langfuse dashboard for the trace

#### Test 2: Streaming Generation
1. Use a more complex prompt: "Find coins with bullish divergence and near support levels"
2. Watch for progress updates in the UI
3. Verify in Langfuse:
   - Stream start event
   - Progress updates captured
   - Stream completion with token usage

#### Test 3: Error Handling
1. Try an invalid prompt to trigger an error
2. Check Langfuse for error tracking
3. Verify the app continues working despite logging failure

#### Test 4: Analysis Functions
1. Click on a coin to get symbol analysis
2. Run market analysis (if enabled)
3. Check both appear in Langfuse traces

## Verifying in Langfuse Dashboard

Navigate to your Langfuse project dashboard and check:

1. **Traces View**
   - Each AI call should create a trace
   - Traces should show user ID from Supabase auth
   - Token usage should be tracked

2. **Metrics**
   - Average generation time by model
   - Token usage trends
   - Error rates

3. **Sessions**
   - Sessions grouped by user and date
   - Multiple traces per session

## Troubleshooting

### No traces appearing in Langfuse
1. Check browser console for errors
2. Verify user is authenticated (observability only works for signed-in users)
3. Check Supabase Edge Function logs:
   ```bash
   supabase functions logs langfuse-proxy
   ```

### Authentication errors
- Ensure you're signed in before using AI features
- Check Supabase auth is working properly

### Edge Function errors
- Verify Langfuse credentials are set correctly
- Check CORS headers if getting network errors
- Review function logs for detailed error messages

## Cost Considerations

- **Langfuse**: Free tier includes 50k observations/month
- **Supabase Edge Functions**: 500k invocations free, then $0.10/million
- Current implementation only logs for authenticated users, reducing volume

## Security Notes

- Langfuse secret keys are never exposed to the frontend
- All logging goes through authenticated Supabase Edge Functions
- User prompts are truncated to 1000 chars for privacy
- Observability fails gracefully without breaking the app

## Future Enhancements

1. **Sampling**: Implement sampling for high-volume periods
2. **Custom Metrics**: Track business-specific metrics (popular indicators, filter complexity)
3. **Alerting**: Set up alerts for high error rates or unusual patterns
4. **Prompt Management**: Use Langfuse's prompt versioning features