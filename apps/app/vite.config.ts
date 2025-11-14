import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    // Load env vars from the root directory
    const env = loadEnv(mode, path.resolve(__dirname, '../..'), '');
    return {
      base: '/',
      build: {
        outDir: 'dist',
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
        host: '0.0.0.0', // Listen on all network interfaces
        port: 5173, // Default Vite port
        headers: {
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        }
      }
    };
});