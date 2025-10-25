# Deploy Astro Landing Page and React App on Unified Vercel Project

**Type:** feature
**Initiative:** none
**Created:** 2025-10-25 10:05:58

## Context
Currently only the React app (`apps/app`) is deployed to Vercel. We need to deploy both the Astro landing page (with signup/waitlist) at the root domain and the React app at `/app` path from a single Vercel project.

## Linked Items
- Related: Launch preparation

## Progress
✅ All configuration complete and tested:
- Created root vercel.json with path-based routing
- Configured build outputs: Astro → dist/, React → dist/app/
- Updated React Router with /app basename
- Local build test successful
- Committed changes (a7b5318)

Next: Update Vercel project settings via dashboard

## Spec
**Architecture:**
- Unified build output in single `dist/` directory at root
- Astro site builds to `dist/` (root)
- React app builds to `dist/app/` (nested)
- Root `vercel.json` handles routing and headers
- Path-based routing: `/` → Astro, `/app/*` → React SPA

**Implementation:**
1. Create root `vercel.json` with:
   - Unified build command
   - Path-based routing rules
   - COOP/COEP headers for both apps
   - SPA fallback for React app at `/app`

2. Update build configuration:
   - Astro: output to `../../dist/`
   - React: output to `../../dist/app/`
   - Root build script orchestrates both

3. Update app configurations:
   - Astro: Configure for root path
   - React: Configure base path as `/app`
   - React Router: Add basename `/app`

4. Update Vercel project settings:
   - Change root directory to project root (remove "apps/app")
   - Framework preset: "Other"
   - Build command: pnpm build
   - Output directory: dist
   - Install command: corepack enable && pnpm install

## Completion
**Closed:** 2025-10-25 10:13:00
**Outcome:** Success
**Commits:** a7b5318

**Manual Step Required:**
Go to Vercel project settings and update:
1. Settings > General > Root Directory: Change from "apps/app" to "." (root)
2. Settings > General > Framework Preset: Change to "Other"
3. Build & Development Settings will be read from vercel.json

Then redeploy to test the unified deployment.
