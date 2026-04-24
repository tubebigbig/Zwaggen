// Copy zwaggen-proxy's built server.js into apps/web/dist/proxy/server.js so
// the published @zwaggen/web npm tarball is self-contained — `npx @zwaggen/web`
// works without a runtime npm dep on zwaggen-proxy. The bin script imports the
// bundled location at runtime; standalone `npx @zwaggen/proxy` is unaffected.
import { mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxyDistDir = resolve(__dirname, '..', '..', '..', 'packages', 'proxy', 'dist');
const proxyEntry = join(proxyDistDir, 'server.js');
const outDir = resolve(__dirname, '..', 'dist', 'proxy');

if (!existsSync(proxyEntry)) {
  console.error(`error: ${proxyEntry} not found. Run "pnpm --filter zwaggen-proxy build" first.`);
  process.exit(1);
}

// Copy server.js + every chunk-*.js sibling tsup splits the bundle into.
// Skip CLI artifacts and .d.ts (the bin only imports server.js at runtime).
mkdirSync(outDir, { recursive: true });
const copied = [];
for (const name of readdirSync(proxyDistDir)) {
  if (name === 'cli.js' || name === 'cli.d.ts') continue;
  if (!(name === 'server.js' || name.startsWith('chunk-')) || !name.endsWith('.js')) continue;
  copyFileSync(join(proxyDistDir, name), join(outDir, name));
  copied.push(name);
}
console.log(`Copied bundled proxy → ${outDir} (${copied.join(', ')})`);
