# Fly Machine Environment Variables Configuration

## Required Environment Variables

```bash
# Supabase Connection
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here

# Edge Function URL (optional - defaults to SUPABASE_URL + /functions/v1/ai-analysis)
SUPABASE_EDGE_FUNCTION_URL=https://your-project-ref.supabase.co/functions/v1/ai-analysis
```

## Set via Fly.io CLI

```bash
# Navigate to fly machine directory
cd server/fly-machine

# Set secrets (recommended for sensitive data)
fly secrets set \
  SUPABASE_URL="https://your-project-ref.supabase.co" \
  SUPABASE_SERVICE_KEY="your-service-role-key"

# Verify secrets
fly secrets list
```

## Where to Get These Values

### SUPABASE_URL
- Supabase Dashboard → Settings → API → Project URL

### SUPABASE_SERVICE_KEY
- Supabase Dashboard → Settings → API → Service Role Key (secret)

### GEMINI_API_KEY (for Edge Function)
- Get from: https://aistudio.google.com/app/apikey
- Set via: `supabase secrets set GEMINI_API_KEY=your-key`
