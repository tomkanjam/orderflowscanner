import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // Load env vars from the root directory
    const env = loadEnv(mode, path.resolve(__dirname, '../..'), '');
    return {
      base: '/app/',
      build: {
        outDir: '../../dist/app',
        emptyOutDir: true,
      },
      define: {
        // Firebase AI Logic handles API keys securely on the server side
        // No need to expose API keys in the frontend
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // Enable SharedArrayBuffer support (required by SharedMarketData)
      server: {
        headers: {
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        }
      }
    };
});