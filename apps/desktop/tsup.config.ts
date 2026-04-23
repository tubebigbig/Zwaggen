import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outDir: 'dist',
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  external: ['electron'],
  outExtension: () => ({ js: '.cjs' }),
});
