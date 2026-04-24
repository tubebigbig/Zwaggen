# Bundle the CORS proxy into `npx @zwaggen/web` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npx @zwaggen/web` boots a single Node server that serves the SPA AND mounts the CORS proxy at `/proxy`, on the same port. Same-origin proxy = no CORS preflight. Configures the runner so flipping "Use proxy" routes through `/proxy` instead of `localhost:4801`.

**Architecture:** Proxy module exposes `handle(req, res)` for mounting. `@zwaggen/core` gains a `setProxyUrl` singleton mirroring setStorage/setTransport. Bin script wraps sirv with a thin router that delegates `/proxy*` to the proxy handle and injects a `__ZWAGGEN_BUNDLED_PROXY__` hint into the served `index.html`. Web app reads the hint before render and configures the runner. Standalone `@zwaggen/proxy` and hosted `play.zwaggen.com` are unaffected.

**Tech Stack:** Existing Node http, sirv, @zwaggen/core. No new deps.

---

### Spec

See `docs/specs/active/2026-04-24-web-bundled-proxy.md`. Key constraints:

- Single port — proxy lives at `/proxy` on the same origin as the web app.
- "Use proxy" toggle stays user-controlled — bundled mode auto-fills the URL only.
- Standalone `@zwaggen/proxy` keeps working unchanged.
- `play.zwaggen.com` unaffected (no `__ZWAGGEN_BUNDLED_PROXY__` hint in the prod build).
- Proxy code BUNDLES into `@zwaggen/web` at publish time so `npx @zwaggen/web` has no extra runtime npm deps.

---

### Task 1: Export `handle` from `@zwaggen/proxy`

**Files:**
- Modify: `packages/proxy/src/server.ts` — add `export` to `handle`.
- Create: `packages/proxy/tests/handle.test.ts`.

- [ ] **Step 1: Add the named export**

In `packages/proxy/src/server.ts`, change:
```ts
async function handle(req: IncomingMessage, res: ServerResponse) { /* ... */ }
```
to:
```ts
export async function handle(req: IncomingMessage, res: ServerResponse) { /* ... */ }
```

(Already exported via `createServer()`'s closure; this just makes it consumable as a named export.)

- [ ] **Step 2: Smoke test**

Create `packages/proxy/tests/handle.test.ts`:

```ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { handle } from '../src/server';

let upstream: http.Server;
let upstreamUrl: string;

beforeEach(async () => {
  upstream = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, method: req.method }));
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const addr = upstream.address() as AddressInfo;
  upstreamUrl = `http://127.0.0.1:${addr.port}/echo`;
});

afterEach(async () => {
  await new Promise<void>((r) => upstream.close(() => r()));
});

test('handle proxies a GET request to the target URL', async () => {
  const server = http.createServer(handle);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/proxy?url=${encodeURIComponent(upstreamUrl)}`);
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toEqual({ ok: true, method: 'GET' });
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test('handle returns 400 when url query param is missing', async () => {
  const server = http.createServer(handle);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/proxy`);
    expect(r.status).toBe(400);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
```

- [ ] **Step 3: Tests pass**

```bash
pnpm --filter zwaggen-proxy build
pnpm --filter zwaggen-proxy test
```

- [ ] **Step 4: Commit**

```bash
git add packages/proxy/src/server.ts packages/proxy/tests/handle.test.ts
git commit -m "$(cat <<'EOF'
feat(proxy): expose handle(req, res) as a named export

Allows mounting the proxy as a route in any HTTP server (the bundled
@zwaggen/web bin in the next commit). createServer() unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `setProxyUrl` / `getProxyUrl` singleton in `@zwaggen/core`

**Files:**
- Create: `packages/core/src/runner/proxyConfig.ts`
- Modify: `packages/core/src/index.ts` — re-export
- Modify: `packages/core/src/runner/send.ts` — use `getProxyUrl()` as default
- Create: `packages/core/tests/runner/proxyConfig.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { afterEach, expect, test, vi } from 'vitest';
import { getProxyUrl, setProxyUrl, resetProxyUrl } from '../../src/runner/proxyConfig';
import { sendRequest, emptySpec } from '../../src';
import type { Endpoint } from '../../src';

afterEach(() => resetProxyUrl());

test('default is http://localhost:4801', () => {
  expect(getProxyUrl()).toBe('http://localhost:4801');
});

test('setProxyUrl swaps the active default', () => {
  setProxyUrl('/proxy');
  expect(getProxyUrl()).toBe('/proxy');
  resetProxyUrl();
  expect(getProxyUrl()).toBe('http://localhost:4801');
});

test('sendRequest uses the configured proxyUrl when no per-request override', async () => {
  setProxyUrl('/proxy');
  const captured: { url?: string } = {};
  globalThis.fetch = vi.fn(async (url: string) => {
    captured.url = url;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as any;
  const ep: Endpoint = {
    id: 'e', method: 'GET', path: '/x',
    pathParams: [],
    requestBody: null, responses: [],
    auth: 'inherit', useProxy: true,
  } as any;
  await sendRequest({
    spec: { ...emptySpec(), useProxyDefault: false },
    endpoint: ep, baseUrl: 'http://api.example.com',
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
    secrets: {},
  });
  expect(captured.url).toBe('/proxy/proxy?url=' + encodeURIComponent('http://api.example.com/x'));
});

test('per-request proxyUrl still wins over the configured default', async () => {
  setProxyUrl('/proxy');
  const captured: { url?: string } = {};
  globalThis.fetch = vi.fn(async (url: string) => {
    captured.url = url;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as any;
  const ep: Endpoint = {
    id: 'e', method: 'GET', path: '/x',
    pathParams: [],
    requestBody: null, responses: [],
    auth: 'inherit', useProxy: true,
  } as any;
  await sendRequest({
    spec: { ...emptySpec(), useProxyDefault: false },
    endpoint: ep, baseUrl: 'http://api.example.com',
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
    secrets: {},
    proxyUrl: 'http://other-host:9999',
  });
  expect(captured.url).toBe('http://other-host:9999/proxy?url=' + encodeURIComponent('http://api.example.com/x'));
});
```

- [ ] **Step 2: Implement `proxyConfig.ts`**

```ts
let activeProxyUrl: string = 'http://localhost:4801';

/** Returns the active default proxy URL. */
export function getProxyUrl(): string {
  return activeProxyUrl;
}

/**
 * Replace the active default proxy URL. Mirrors `setStorage` / `setTransport`
 * — `apps/web` calls this once at boot when running under the bundled
 * `npx @zwaggen/web` server (proxyUrl = '/proxy', same-origin).
 */
export function setProxyUrl(url: string): void {
  activeProxyUrl = url;
}

/** Restore the standalone-proxy default. Useful in tests. */
export function resetProxyUrl(): void {
  activeProxyUrl = 'http://localhost:4801';
}
```

- [ ] **Step 3: Update `send.ts`**

In `packages/core/src/runner/send.ts`, change the proxy URL resolution:

```ts
import { getProxyUrl } from './proxyConfig';

// ...

const proxy = req.proxyUrl ?? getProxyUrl();
target = `${proxy}/proxy?url=${encodeURIComponent(built.url)}`;
```

- [ ] **Step 4: Re-export from `packages/core/src/index.ts`**

```ts
export * from './runner/proxyConfig';
```

- [ ] **Step 5: Tests pass**

```bash
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/core build
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/runner/proxyConfig.ts packages/core/src/runner/send.ts packages/core/src/index.ts packages/core/tests/runner/proxyConfig.test.ts
git commit -m "$(cat <<'EOF'
feat(core): setProxyUrl singleton for runtime proxy default

Mirrors the setStorage / setTransport pattern. apps/web's bootstrap
calls setProxyUrl('/proxy') when running under the bundled
`npx @zwaggen/web` server so the runner's proxy URL becomes
same-origin (no CORS preflight). Per-request opts.proxyUrl still wins.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `apps/web/bin/zwaggen-web.js` — mount proxy + inject hint

**Files:**
- Modify: `apps/web/bin/zwaggen-web.js`
- Modify: `apps/web/package.json` — add `zwaggen-proxy` as a workspace dep + ensure files include the bundled proxy.

- [ ] **Step 1: Add `zwaggen-proxy` workspace dep**

In `apps/web/package.json` `dependencies`:

```json
"zwaggen-proxy": "workspace:*"
```

Run `pnpm install` to wire it.

- [ ] **Step 2: Update the bin to route + inject**

In `apps/web/bin/zwaggen-web.js`, replace the current sirv-only server with a routing shim:

```js
#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import open from 'open';
import { handle as proxyHandle } from 'zwaggen-proxy/dist/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '..', 'package.json');
const distDir = resolve(__dirname, '..', 'dist');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

// ... existing arg parsing for --port, --host, --no-open, --help, --version ...

if (!existsSync(distDir)) {
  console.error(`error: ${distDir} not found. Run "pnpm --filter @zwaggen/web build" first.`);
  process.exit(1);
}

const indexPath = join(distDir, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`error: ${indexPath} not found.`);
  process.exit(1);
}

// Inject the bundled-proxy hint so the SPA configures the runner's proxy URL.
const indexHtml = readFileSync(indexPath, 'utf8').replace(
  '</head>',
  `<script>window.__ZWAGGEN_BUNDLED_PROXY__ = '/proxy';</script></head>`,
);

const staticHandler = sirv(distDir, { single: true, dev: false });

const server = createServer((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/proxy')) {
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

// ... existing port-scan + listen + console.log + open logic ...
```

(Keep the existing port-scan, host, no-open behaviour — only the request handler changes.)

- [ ] **Step 3: Smoke-test the bin**

Build first:
```bash
pnpm --filter @zwaggen/web build
pnpm install   # in case the workspace dep needs re-linking
```

Manually start it (in a real shell, not within tests since the bin scans for a free port):
```bash
node apps/web/bin/zwaggen-web.js --no-open --port 9999 &
PID=$!
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:9999/        # expect 200 (HTML)
curl -s "http://127.0.0.1:9999/proxy?url=https://httpbin.org/get" | head -3    # expect a JSON body (skip if offline; use a localhost stub)
curl -s "http://127.0.0.1:9999/proxy" -o /dev/null -w "%{http_code}\n"  # expect 400
kill $PID
```

(If the Playwright e2e runner can drive this, formalize as an integration test. If not, document the manual smoke in the bin script's comment.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/bin/zwaggen-web.js apps/web/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(web): bundle CORS proxy into npx @zwaggen/web (single port)

The bin now wraps sirv with a tiny router that delegates /proxy* to
zwaggen-proxy's handle() and injects __ZWAGGEN_BUNDLED_PROXY__ into
the served index.html. Same-origin proxy = no CORS preflight; one
port; no extra terminals.

Standalone `npx @zwaggen/proxy` keeps working unchanged for users
who want the proxy on a different machine.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Web app reads the hint + configures the runner

**Files:**
- Modify: `apps/web/src/main.tsx`
- Create: `apps/web/tests/main.bundledProxy.test.tsx` (or extend an existing main.tsx test)

- [ ] **Step 1: Add the bootstrap probe**

In `apps/web/src/main.tsx`, BEFORE `ReactDOM.createRoot(...).render(...)`:

```tsx
import { setProxyUrl } from '@zwaggen/core';

// `npx @zwaggen/web` injects this in the served index.html so the runner's
// proxy URL becomes same-origin (e.g. '/proxy') instead of the standalone
// 'http://localhost:4801'. Hosted play.zwaggen.com leaves it undefined.
const bundledProxy =
  typeof window !== 'undefined' &&
  typeof (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__ === 'string'
    ? (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__
    : null;
if (bundledProxy) setProxyUrl(bundledProxy);
```

- [ ] **Step 2: Test**

```ts
// apps/web/tests/main.bundledProxy.test.ts
import { afterEach, beforeEach, expect, test } from 'vitest';
import { getProxyUrl, resetProxyUrl } from '@zwaggen/core';

beforeEach(() => resetProxyUrl());
afterEach(() => {
  delete (window as Record<string, unknown>).__ZWAGGEN_BUNDLED_PROXY__;
  resetProxyUrl();
});

test('main.tsx reads __ZWAGGEN_BUNDLED_PROXY__ and calls setProxyUrl before render', async () => {
  (window as Record<string, unknown>).__ZWAGGEN_BUNDLED_PROXY__ = '/proxy';
  // Re-importing main.tsx is messy; instead, replicate the probe here:
  const bundledProxy = (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__;
  if (bundledProxy) {
    const { setProxyUrl } = await import('@zwaggen/core');
    setProxyUrl(bundledProxy);
  }
  expect(getProxyUrl()).toBe('/proxy');
});

test('without the hint, getProxyUrl stays at default', async () => {
  expect(getProxyUrl()).toBe('http://localhost:4801');
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter web test
pnpm --filter web lint
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/main.tsx apps/web/tests/main.bundledProxy.test.ts
git commit -m "$(cat <<'EOF'
feat(web): main.tsx reads __ZWAGGEN_BUNDLED_PROXY__ and calls setProxyUrl

The bundled `npx @zwaggen/web` server injects the hint into the served
index.html. main.tsx detects it and configures the runner so the
"Use proxy" toggle routes through /proxy (same-origin) instead of
http://localhost:4801. Hosted play.zwaggen.com is unaffected.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Bundle proxy into `@zwaggen/web`'s published artifact

**Files:**
- Modify: `apps/web/package.json` — `files` field includes the bundled proxy
- Modify: `apps/web/scripts/release.sh` (or its build step) OR a new `apps/web/scripts/copy-proxy.mjs` — copy `packages/proxy/dist/server.js` into `apps/web/dist/proxy/server.js` after build.
- Modify: `apps/web/bin/zwaggen-web.js` — import path falls back to the bundled location at runtime.

- [ ] **Step 1: Survey the existing publish flow**

Read `apps/web/package.json` `scripts.build` and `apps/web/scripts/` to understand how `apps/web` gets published.

- [ ] **Step 2: Choose copy strategy**

Simplest: a postbuild script that runs after `pnpm --filter @zwaggen/web build`. Add to `apps/web/package.json`:

```json
"scripts": {
  "build": "tsc -b && vite build && pnpm copy:proxy",
  "copy:proxy": "node scripts/copy-proxy.mjs"
}
```

`apps/web/scripts/copy-proxy.mjs`:

```js
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxyBuilt = resolve(__dirname, '..', '..', '..', 'packages', 'proxy', 'dist', 'server.js');
const out = resolve(__dirname, '..', 'dist', 'proxy', 'server.js');

if (!existsSync(proxyBuilt)) {
  console.error(`error: ${proxyBuilt} not found. Run "pnpm --filter zwaggen-proxy build" first.`);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
copyFileSync(proxyBuilt, out);
console.log(`Copied bundled proxy → ${out}`);
```

- [ ] **Step 3: Update bin import**

In `apps/web/bin/zwaggen-web.js`, change the proxy import:

```js
// In dev: zwaggen-proxy is a workspace dep, resolves via node_modules.
// In published `@zwaggen/web`: dist/proxy/server.js is bundled in.
const proxyImport = existsSync(resolve(__dirname, '..', 'dist', 'proxy', 'server.js'))
  ? resolve(__dirname, '..', 'dist', 'proxy', 'server.js')
  : 'zwaggen-proxy/dist/server.js';
const { handle: proxyHandle } = await import(proxyImport);
```

(Or simpler: ALWAYS import from the bundled path; require dev to run `pnpm copy:proxy` once. Pick whichever the maintainer prefers.)

- [ ] **Step 4: Update `files` field**

In `apps/web/package.json`:

```json
"files": [
  "bin",
  "dist",
  "README.md"
]
```

`dist/proxy/` is already covered by `dist`.

- [ ] **Step 5: Verify**

```bash
pnpm --filter zwaggen-proxy build
pnpm --filter @zwaggen/web build
ls apps/web/dist/proxy/server.js
```

Should exist.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json apps/web/scripts/copy-proxy.mjs apps/web/bin/zwaggen-web.js
git commit -m "$(cat <<'EOF'
build(web): bundle proxy/server.js into apps/web/dist for npm publish

Proxy code is copied into apps/web/dist/proxy/ as part of the build.
Published @zwaggen/web ships with the bundled proxy — `npx @zwaggen/web`
works without zwaggen-proxy as a runtime npm dep. Standalone
`npx @zwaggen/proxy` is still its own package for users who want it
on a different host.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Documentation update

**Files:**
- Modify: `apps/docs/quickstart.md`
- Modify: `apps/docs/zh-TW/quickstart.md`

- [ ] **Step 1: en quickstart**

Find the `npx @zwaggen/web` section. Update to mention bundled proxy. Suggested wording in the spec.

- [ ] **Step 2: zh-TW quickstart**

Mirror the en wording.

- [ ] **Step 3: Verify docs build**

```bash
pnpm --filter docs build
```

- [ ] **Step 4: Commit**

```bash
git add apps/docs/
git commit -m "$(cat <<'EOF'
docs: quickstart now mentions bundled proxy in npx @zwaggen/web

Both locales updated to highlight that CORS bypass ships out of the
box — no second terminal, no second port.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Tick TODO + log follow-up + move spec/plan + final sweep

**Files:**
- Modify: `docs/TODO.md`
- Move: spec + plan to `done/`

- [ ] **Step 1: Final sweep**

```bash
pnpm install
pnpm --filter zwaggen-proxy build
pnpm --filter zwaggen-proxy test
pnpm --filter @zwaggen/core test
pnpm --filter @zwaggen/core build
pnpm --filter @zwaggen/web build
pnpm --filter web test
pnpm --filter web lint
pnpm --filter @zwaggen/cli build
pnpm --filter @zwaggen/cli test
pnpm --filter docs build
```

All green.

- [ ] **Step 2: Tick TODO + log follow-up**

Add a ticked entry in the appropriate section:

```
- [x] Bundled CORS proxy in `npx @zwaggen/web` — single Node process serves the SPA AND mounts the proxy at `/proxy` (same-origin = no CORS preflight). Runner's default proxy URL auto-configures via a `__ZWAGGEN_BUNDLED_PROXY__` hint injected into the served index.html. Standalone `npx @zwaggen/proxy` and hosted `play.zwaggen.com` unaffected. See `docs/plans/done/2026-04-24-web-bundled-proxy.md`.
```

Add a follow-up:

```
- [ ] Auto-enable "Use proxy" on first cross-origin failure — when the runner gets a TypeError on a cross-origin request and a proxy URL is configured (bundled or otherwise), surface a one-click "Retry through proxy" suggestion. Avoids the user having to know about the toggle in the first place. Surfaced from web-bundled-proxy.
```

Update "Last updated" stamp.

- [ ] **Step 3: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-24-web-bundled-proxy.md docs/specs/done/
git mv docs/plans/active/2026-04-24-web-bundled-proxy.md docs/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship web-bundled-proxy — tick TODO, log retry-on-CORS-failure follow-up

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 7 tasks ticked.
- `@zwaggen/proxy` exports `handle`; smoke test passes.
- `@zwaggen/core` exposes `setProxyUrl`/`getProxyUrl`/`resetProxyUrl`; `sendRequest` honors the configured default.
- `apps/web/bin/zwaggen-web.js` mounts the proxy at `/proxy` and injects `__ZWAGGEN_BUNDLED_PROXY__` into the served index.html.
- `apps/web/src/main.tsx` reads the hint and calls `setProxyUrl` before render.
- Proxy code is copied into `apps/web/dist/proxy/` at build time so the published `@zwaggen/web` is self-contained.
- Quickstart updated in both locales.
- All tests green.
- Branch `plan/web-bundled-proxy` ready to push.
