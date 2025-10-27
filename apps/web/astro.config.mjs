// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  site: 'https://trademind.ai',
  integrations: [
    react(),
    tailwind(),
  ],
  output: 'static',
  build: {
    inlineStylesheets: 'auto',
  },
  // Output to dist when building from apps/web (Vercel deployment)
  // When building from root, use pnpm build:web which handles the path
});
