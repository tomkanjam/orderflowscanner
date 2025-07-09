# TradeMind Marketing Site

This is the marketing site for TradeMind AI, built with Astro for optimal performance and SEO.

## Features

- ⚡ Lightning-fast static site generation
- 🎯 Optimized for Lighthouse 100 score
- 📝 Waitlist signup with Supabase integration
- 🎨 Uses TradeMind design system
- 📱 Fully responsive design
- 🔍 SEO optimized with meta tags and structured data

## Setup

1. Copy `.env.example` to `.env.local` and add your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Run the development server:
   ```bash
   pnpm dev
   ```

## Development

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm preview` - Preview production build

## Environment Variables

- `PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anonymous key

## Deployment

The site is configured for static hosting and can be deployed to:
- Vercel
- Netlify
- Cloudflare Pages
- Any static hosting provider

## Performance

This site is optimized to achieve perfect Lighthouse scores:
- Performance: 100
- Accessibility: 100
- Best Practices: 100
- SEO: 100

Key optimizations:
- Zero JavaScript by default (only waitlist form is hydrated)
- Optimized images and fonts
- Minimal CSS with critical styles inlined
- Static generation for instant loading
