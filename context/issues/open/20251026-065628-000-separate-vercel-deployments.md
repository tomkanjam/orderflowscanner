# Separate Vercel Deployments for Landing Page and Screener App

**Type:** enhancement
**Initiative:** none
**Created:** 2025-10-26 06:56:28

## Context
Currently, the monorepo has two apps but only one is deployed to Vercel:
- `apps/web/` - Astro landing page (should be at root `/`)
- `apps/app/` - React screener app (currently at `/app/`)

The Vercel project is configured with `rootDirectory: "apps/app"`, causing:
- Landing page not deployed → https://vyx.vercel.app/ returns 404
- React app works → https://vyx.vercel.app/app/ returns 200

## Linked Items
- Related: Quick fix for blocking issue - users can't access landing page

## Progress
[Track progress here]

## Spec
Create two separate Vercel projects for independent deployments:

### 1. Landing Page (apps/web)
- **Purpose**: Marketing/waitlist page at root domain
- **Framework**: Astro (static site)
- **Build**: `pnpm --filter web build`
- **Output**: `apps/web/dist/` (configured in apps/web/astro.config.mjs:17)
- **Domain**: https://vyx.app
- **Vercel settings**:
  - Root Directory: `apps/web`
  - Build Command: `corepack enable && pnpm install && pnpm build`
  - Output Directory: `dist`
  - Framework Preset: Astro

### 2. Screener App (apps/app)
- **Purpose**: Main application
- **Framework**: Vite + React
- **Build**: `pnpm --filter app build`
- **Output**: `apps/app/dist/` (but currently outputs to `../../dist/app` - see vite.config.ts:10)
- **Domain**: https://app.vyx.app
- **Vercel settings**:
  - Root Directory: `apps/app`
  - Build Command: `corepack enable && pnpm install && pnpm build`
  - Output Directory: `dist`
  - Framework Preset: Vite
  - **Note**: Need to update vite.config.ts to change `base: '/app/'` to `base: '/'` and `outDir: 'dist'`

### Implementation Steps
1. **Fix Vite config** (apps/app/vite.config.ts)
   - Change `base: '/app/'` → `base: '/'`
   - Change `outDir: '../../dist/app'` → `outDir: 'dist'`

2. **Create new Vercel project for landing page**
   - Connect to same GitHub repo
   - Configure root directory: `apps/web`
   - Add domain: trademind.ai (or vyx.vercel.app)
   - Deploy and verify

3. **Update existing Vercel project for screener**
   - Keep root directory: `apps/app`
   - Add subdomain: app.trademind.ai
   - Redeploy with updated config
   - Verify app works at root path

4. **Update routing/links**
   - Landing page CTA links to screener subdomain
   - Update any hardcoded `/app/` paths in React app

### Verification
- [ ] https://vyx.app/ → Landing page (Astro)
- [ ] https://app.vyx.app/ → Screener app (React)
- [ ] Both deployments independent
- [ ] No 404s on either domain

### Complexity Assessment
**Small to Medium** - Not a project, straightforward task:
- 1 file change (vite.config.ts)
- 1 new Vercel project setup (~5 min)
- 1 existing project update (~2 min)
- Domain configuration (if using app.trademind.ai)
- Testing/verification

**Time estimate**: 30-45 minutes
