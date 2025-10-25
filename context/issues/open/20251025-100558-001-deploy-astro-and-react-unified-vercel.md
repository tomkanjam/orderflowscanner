# Deploy Astro Landing Page and React App on Unified Vercel Project

**Type:** feature
**Initiative:** none
**Created:** 2025-10-25 10:05:58

## Context
Currently only the React app (`apps/app`) is deployed to Vercel. We need to deploy both the Astro landing page (with signup/waitlist) at the root domain and the React app at `/app` path from a single Vercel project.

## Linked Items
- Related: Launch preparation

## Progress
Creating unified Vercel deployment configuration...

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
   - Change root directory to project root
   - Use root vercel.json
