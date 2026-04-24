#!/usr/bin/env node
// Bundled web server for `npx @zwaggen/web`. Serves the prebuilt SPA from
// ../dist and mounts the CORS proxy at `/proxy` on the same port (same-origin =
// no CORS preflight in the browser). Injects __ZWAGGEN_BUNDLED_PROXY__ into the
// served index.html so apps/web's runner auto-configures the proxy URL.
//
// Manual smoke (after a `pnpm --filter @zwaggen/web build`):
//   node apps/web/bin/zwaggen-web.js --no-open --port 9991 &
//   curl -s http://127.0.0.1:9991/ | grep __ZWAGGEN_BUNDLED_PROXY__   # hint present
//   curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9991/proxy   # 400
//   curl -s "http://127.0.0.1:9991/proxy?url=http://127.0.0.1:NN/echo"     # 200 round-trip
//   pkill -f 'zwaggen-web.js --no-open --port 9991'
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import sirv from 'sirv';
import open from 'open';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');
const distDir = resolve(__dirname, '..', 'dist');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

// Resolve the proxy module: prefer the bundled copy at ../dist/proxy/server.js
// (present in the published npm tarball, copied by scripts/copy-proxy.mjs at
// build time). Fall back to the workspace package for local dev so a fresh
// clone works without running copy:proxy first.
const bundledProxyPath = resolve(__dirname, '..', 'dist', 'proxy', 'server.js');
const proxySpecifier = existsSync(bundledProxyPath)
  ? pathToFileURL(bundledProxyPath).href
  : 'zwaggen-proxy/dist/server.js';
const { handle: proxyHandle } = await import(proxySpecifier);

function printHelp() {
  console.log(`zwaggen-web v${pkg.version} — run the Zwaggen web app locally

Usage: npx @zwaggen/web [options]

Options:
  --port <n>        Port to bind (default: 4173, scans upward if busy)
  --host <addr>     Host to bind (default: 127.0.0.1)
  --no-open         Do not open browser automatically
  -h, --help        Show this help
  -v, --version     Show version

Examples:
  npx @zwaggen/web                      # http://127.0.0.1:4173, opens browser
  npx @zwaggen/web --port 8080          # custom port
  npx @zwaggen/web --host 0.0.0.0       # bind all interfaces (LAN access)
  npx @zwaggen/web --no-open            # don't auto-open browser
`);
}

function parseArgs(argv) {
  const opts = { port: 4173, host: '127.0.0.1', open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { printHelp(); process.exit(0); }
    if (a === '-v' || a === '--version') { console.log(pkg.version); process.exit(0); }
    if (a === '--no-open') { opts.open = false; continue; }
    if (a === '--port') {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        console.error(`Invalid --port value: ${v}`);
        process.exit(2);
      }
      opts.port = n;
      continue;
    }
    if (a === '--host') {
      const v = argv[++i];
      if (!v) { console.error('--host requires a value'); process.exit(2); }
      opts.host = v;
      continue;
    }
    console.error(`Unknown argument: ${a}`);
    console.error(`Run 'npx @zwaggen/web --help' for usage.`);
    process.exit(2);
  }
  return opts;
}

function tryListen(server, port, host) {
  return new Promise((res) => {
    const onError = (err) => {
      server.removeListener('listening', onListen);
      if (err.code === 'EADDRINUSE') res(null);
      else { console.error(err); process.exit(1); }
    };
    const onListen = () => {
      server.removeListener('error', onError);
      res(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListen);
    server.listen(port, host);
  });
}

async function listenWithFallback(server, requestedPort, host) {
  if (requestedPort === 0) return tryListen(server, 0, host);
  for (let p = requestedPort; p < requestedPort + 100; p++) {
    const got = await tryListen(server, p, host);
    if (got !== null) return got;
  }
  console.error(`No free port in range ${requestedPort}–${requestedPort + 99}`);
  process.exit(1);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!existsSync(distDir)) {
    console.error(`Cannot find built assets at ${distDir}`);
    console.error(`If you installed from npm this is a packaging bug — please file an issue.`);
    process.exit(1);
  }

  const indexPath = join(distDir, 'index.html');
  if (!existsSync(indexPath)) {
    console.error(`Cannot find ${indexPath} — packaging bug.`);
    process.exit(1);
  }

  // Inject the bundled-proxy hint so the SPA configures the runner's proxy URL
  // to be same-origin (no CORS preflight). Hosted play.zwaggen.com is unaffected.
  const indexHtml = readFileSync(indexPath, 'utf8').replace(
    '</head>',
    `<script>window.__ZWAGGEN_BUNDLED_PROXY__ = '/proxy';</script></head>`,
  );

  const staticHandler = sirv(distDir, { single: true, dev: false, etag: true });
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/proxy' || url.startsWith('/proxy?') || url.startsWith('/proxy/')) {
      proxyHandle(req, res);
      return;
    }
    if (url === '/' || url === '/index.html' || url.startsWith('/index.html?')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(indexHtml);
      return;
    }
    staticHandler(req, res);
  });

  const port = await listenWithFallback(server, opts.port, opts.host);
  const url = `http://${opts.host}:${port}`;
  console.log(`Zwaggen web app running at ${url}`);
  console.log(`(Press Ctrl+C to stop)`);

  if (opts.open) {
    open(url).catch(() => {
      console.log(`(Could not open browser automatically — visit ${url} manually.)`);
    });
  }

  const shutdown = () => {
    console.log('\nShutting down...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
