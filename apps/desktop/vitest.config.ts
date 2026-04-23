import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Playwright e2e specs live in e2e/ and use their own runner.
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    // electron's main JS just throws "Electron failed to install" when imported
    // outside an electron runtime — we don't need its real surface for unit tests
    // of pure handlers, so alias the import to a tiny stub.
    alias: {
      electron: new URL('./electron/__tests__/electron-stub.ts', import.meta.url).pathname,
    },
  },
});
