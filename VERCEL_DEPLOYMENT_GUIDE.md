# Vercel Deployment Guide for TradeMind

This guide explains how to deploy both the marketing site and trading app to Vercel from your monorepo.

## Prerequisites

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

## Method 1: Deploy via Vercel CLI (Recommended)

### Deploy Marketing Site (trademind.ai)

```bash
# From the root directory
cd apps/web
vercel

# Follow prompts:
# - Set up and deploy: Y
# - Which scope: Select your account
# - Link to existing project?: N
# - Project name: trademind-web (or your preferred name)
# - Root directory: ./
# - Override settings?: N
```

### Deploy Trading App (app.trademind.ai)

```bash
# From the root directory
cd apps/app
vercel

# Follow prompts:
# - Set up and deploy: Y
# - Which scope: Select your account
# - Link to existing project?: N
# - Project name: trademind-app (or your preferred name)
# - Root directory: ./
# - Override settings?: N
```

## Method 2: Deploy via Vercel Dashboard

### 1. Import Repository

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your Git repository
3. You'll need to create **TWO separate projects** from the same repo

### 2. Deploy Marketing Site

**Project 1: Marketing Site**
- **Project Name**: `trademind-web`
- **Framework Preset**: Astro
- **Root Directory**: `apps/web`
- **Build Command**: `pnpm build`
- **Output Directory**: `dist`
- **Install Command**: `pnpm install`

**Environment Variables**:
```
PUBLIC_SUPABASE_URL=your_supabase_url
PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Deploy Trading App

**Project 2: Trading App**
- **Project Name**: `trademind-app`
- **Framework Preset**: Vite
- **Root Directory**: `apps/app`
- **Build Command**: `pnpm build`
- **Output Directory**: `dist`
- **Install Command**: `pnpm install`

**Environment Variables**:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_firebase_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_firebase_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
```

## Setting Up Custom Domains

### For Marketing Site (trademind.ai)

1. In Vercel Dashboard, go to your `trademind-web` project
2. Go to Settings → Domains
3. Add `trademind.ai` and `www.trademind.ai`
4. Update your DNS records:
   ```
   A     @     76.76.21.21
   CNAME www   cname.vercel-dns.com
   ```

### For Trading App (app.trademind.ai)

1. In Vercel Dashboard, go to your `trademind-app` project
2. Go to Settings → Domains
3. Add `app.trademind.ai`
4. Update your DNS records:
   ```
   CNAME app   cname.vercel-dns.com
   ```

## Production Deployment Commands

After initial setup, deploy updates with:

```bash
# Deploy marketing site
cd apps/web && vercel --prod

# Deploy trading app
cd apps/app && vercel --prod
```

## Monorepo Considerations

### Important Notes:

1. **Separate Projects**: Each app needs its own Vercel project
2. **Root Directory**: Must be set correctly for each project
3. **Dependencies**: Vercel automatically detects pnpm workspaces
4. **Shared Code**: Any code in `packages/*` will be available during build

### Build Optimization

To optimize build times, you can use Vercel's monorepo features:

1. **Ignored Build Step**: Add to each project's settings to skip builds when only the other app changes:
   
   For `trademind-web`:
   ```bash
   git diff HEAD^ HEAD --quiet apps/app packages
   ```
   
   For `trademind-app`:
   ```bash
   git diff HEAD^ HEAD --quiet apps/web packages
   ```

## Troubleshooting

### Common Issues:

1. **Build Fails**: Make sure all environment variables are set
2. **404 on Routes**: Ensure `vercel.json` has proper rewrites for SPA
3. **Module Not Found**: Check that `pnpm install` runs from the correct directory
4. **CSS Not Loading**: Verify that all imports use correct paths

### Debug Commands:

```bash
# Check build logs
vercel logs [deployment-url]

# List all deployments
vercel list

# Remove a deployment
vercel remove [deployment-url]
```

## GitHub Integration

For automatic deployments on push:

1. Connect your GitHub repo in Vercel Dashboard
2. Set up separate projects for each app
3. Configure branch deployments:
   - Production: `main` branch
   - Preview: All other branches

## Summary

You now have:
- Marketing site at `trademind.ai` (or your Vercel URL)
- Trading app at `app.trademind.ai` (or your Vercel URL)
- Automatic deployments on git push
- Proper monorepo handling

Both apps will build and deploy independently while sharing code from the monorepo structure.