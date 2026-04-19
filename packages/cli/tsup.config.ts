import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  outDir: 'dist',
  target: 'node20',
  platform: 'node',
  // Bundle workspace packages so dist/cli.js is runtime-self-contained
  // (consumers don't need @zwaggen/* installed).
  noExternal: [/^@zwaggen\//],
  // Commander uses CJS dynamic requires of Node built-ins; it cannot be
  // bundled into ESM without errors. Keep it as a runtime dependency instead.
  external: ['commander'],
  splitting: false,
  sourcemap: false,
  clean: true,
});
