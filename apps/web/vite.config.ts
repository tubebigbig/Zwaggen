import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Resolve @zwaggen/core to its TS source so dev + vitest don't need a prebuilt dist.
// (The CLI still consumes the tsup-built dist/ via package.json main; that's unaffected.)
const coreSrc = fileURLToPath(new URL('../../packages/core/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@zwaggen/core': coreSrc,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
});
