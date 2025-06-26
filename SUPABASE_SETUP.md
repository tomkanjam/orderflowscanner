# Supabase Setup Instructions

To enable authentication features, you need to add Supabase credentials to your `.env.local` file.

## Required Environment Variables

Add these lines to your `.env.local` file:

```
# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Getting Your Supabase Credentials

1. Go to [supabase.com](https://supabase.com) and create a new project (or use existing)
2. In your project dashboard, go to Settings > API
3. Copy your project URL and anon/public key
4. Add them to your `.env.local` file

## Optional: Configure Redirect URL

If running locally, you may want to add:

```
VITE_APP_URL=http://localhost:5173
```

This ensures magic links redirect to the correct URL during development.

## Note

The application will work without Supabase credentials, but authentication features will be disabled. A warning will appear in the console if credentials are missing.