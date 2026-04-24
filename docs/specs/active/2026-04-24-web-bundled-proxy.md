# Spec — Bundle the CORS proxy into `npx @zwaggen/web` (single port)

## Problem

Devs running `npx @zwaggen/web` get a CORS-bound playground. To use the proxy, they have to ALSO run `npx @zwaggen/proxy` in another terminal AND configure the runner's proxy URL. That's three steps to get to "click Run, no CORS error":

1. `npx @zwaggen/web` (terminal 1)
2. `npx @zwaggen/proxy` (terminal 2)
3. Toggle "Use proxy" in the UI per-request

The Electron desktop app solves this by bypassing CORS at the OS level — but it requires downloading a 100+ MB binary and dealing with code-signing warnings. For devs comfortable with `npx`, a simpler answer exists: bundle the proxy into the same Node process that serves the web app, on the same port.

End state: `npx @zwaggen/web` boots a single server that:
- Serves the SPA from `/`
- Proxies cross-origin requests via `/proxy?url=<target>` (same-origin path — no CORS preflight at all)
- Auto-configures the runner so flipping "Use proxy" routes through `/proxy` instead of `localhost:4801`

This doesn't replace the Electron desktop app — they serve different audiences (devs vs designers/PMs/QA). It's the dev-facing quick win that ships CORS-free testing TODAY without waiting for desktop signing/distribution.

## Success criteria

- `npx @zwaggen/web` (no flags, no extra terminals) boots a server where:
  - `GET /` and any SPA route → `apps/web/dist/index.html`
  - `GET /assets/*` → static asset
  - Any method on `/proxy?url=<absolute-http(s)-url>` → forwards the request to the target with CORS-bypass behaviour identical to standalone `@zwaggen/proxy`
  - Any method on `/proxy?url=<missing>` → 400
  - Any other unknown path → SPA fallback (`index.html`) — preserves client-side routing for `?spec=<url>` etc.
- Same-origin: the browser hits `/proxy?url=https://api.example.com/users` and sees no CORS preflight (proxy lives at the same origin as the page).
- The runner's default `proxyUrl` is auto-configured to `/proxy` (same-origin) when the page detects it's running under the bundled bin. The "Use proxy" toggle stays user-controlled — defaults from the spec — so the user flips it per-request as today.
- Standalone `@zwaggen/proxy` keeps working unchanged for users who want to run the proxy on a different machine, or for power users who pair it with `play.zwaggen.com`.
- The hosted `play.zwaggen.com` is unaffected — no `/proxy` endpoint at that origin, runner default stays `http://localhost:4801` for that case.
- Tests:
  - `packages/proxy` exports `handle(req, res)` directly so it can be mounted into any HTTP server. Existing `createServer()` continues to work.
  - `apps/web/bin/zwaggen-web.js` smoke test: boots the server, GETs `/`, asserts SPA HTML; POSTs `/proxy?url=<localhost-stub>`, asserts the proxied response comes back.
  - `@zwaggen/core`'s `setProxyUrl`/`getProxyUrl` singleton + `sendRequest` honors the configured default.
  - Web bootstrap test: `window.__ZWAGGEN_BUNDLED_PROXY__` triggers `setProxyUrl(...)` before render.
- Quickstart docs (en + zh-TW) updated: `npx @zwaggen/web` now ships CORS bypass out of the box; "Use proxy" toggle is the on/off switch.
- TODO entry added (and ticked); follow-up "auto-enable Use proxy on first cross-origin failure" logged.

## Out of scope

- **Killing the Electron desktop app.** Slices 1–4 stay; `--proxy` flag is the dev-facing alternative. Both can coexist.
- **A `--no-proxy` flag** to disable the bundled proxy. The /proxy route only does work when called; zero cost when ignored. No need for an opt-out.
- **Changing standalone `@zwaggen/proxy`'s port (4801) or behaviour.**
- **WebSocket proxying.** `handle` only forwards HTTP; WebSocket upgrade is a future feature.
- **Auto-enabling the "Use proxy" toggle.** That risks unintended proxying for endpoints the user wanted to test directly. Stays user-controlled.
- **Renaming `--port` flag** of the existing `bin/zwaggen-web.js`. Keeps the existing single-port semantic; the proxy lives on the same port.
- **HTTPS for the bundled bin.** Local dev only; HTTPS is `play.zwaggen.com`'s concern.
- **Auth on the `/proxy` endpoint.** It binds to `127.0.0.1` by default like the existing standalone proxy; if the user passes `--host 0.0.0.0` they're explicitly opting into LAN access for both web and proxy.

## Approach

### `@zwaggen/proxy` — expose `handle` as a named export

`packages/proxy/src/server.ts` already has `function handle(req, res)` internally. Just add an `export`:

```ts
export async function handle(req: IncomingMessage, res: ServerResponse) { /* existing body */ }

export function createServer() { return http.createServer(handle); }
```

Update `packages/proxy/package.json` to re-export both. tsup already builds `cli.ts` + `server.ts` separately. Verify the dist bundle exposes `handle`.

### `@zwaggen/core` — proxyUrl singleton

Add to `packages/core/src/runner/transport.ts` (or a new `proxyConfig.ts`):

```ts
let activeProxyUrl: string = 'http://localhost:4801';
export function getProxyUrl(): string { return activeProxyUrl; }
export function setProxyUrl(url: string): void { activeProxyUrl = url; }
export function resetProxyUrl(): void { activeProxyUrl = 'http://localhost:4801'; }
```

Update `packages/core/src/runner/send.ts`:

```ts
const proxy = req.proxyUrl ?? getProxyUrl();
```

Existing per-request `proxyUrl` overrides still win.

### `apps/web/bin/zwaggen-web.js` — mount proxy + inject hint

```js
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sirv from 'sirv';
import open from 'open';
import { handle as proxyHandle } from 'zwaggen-proxy/dist/server.js';

// ... existing arg parsing ...

const indexPath = join(distDir, 'index.html');
const indexHtml = readFileSync(indexPath, 'utf8').replace(
  '</head>',
  `<script>window.__ZWAGGEN_BUNDLED_PROXY__ = '/proxy';</script></head>`,
);

const staticHandler = sirv(distDir, { single: true, dev: false });

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/proxy')) {
    return proxyHandle(req, res);
  }
  if (req.url === '/' || req.url === '/index.html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(indexHtml);
    return;
  }
  staticHandler(req, res);
});

// ... existing port-scan + listen + open logic ...
```

Add `zwaggen-proxy` to `apps/web/package.json` `dependencies` (workspace protocol):

```json
"dependencies": {
  "zwaggen-proxy": "workspace:*"
}
```

When `@zwaggen/web` publishes to npm, the published tarball must include the proxy code. Two options:
- **Option A (preferred)**: bundle the proxy into the published package via tsup or rollup at publish time.
- **Option B**: list `zwaggen-proxy` as a regular npm dep with a published version, then publish `zwaggen-proxy` to npm too (currently private per TODO).

Option A keeps the proxy private + simpler ops (one npm package). Option B opens the door for power users to consume the proxy library directly. Pick A for v1; Option B is a logical follow-up if there's demand for the standalone proxy.

For Option A: extend `apps/web/scripts/release` (or its build pipeline) to run `tsup` on the proxy's `server.ts` and copy the output into `apps/web/dist/proxy/`. The bin imports from there. The proxy stays a workspace dep at dev time and a bundled artifact at publish time.

### Web app — read the hint, configure runner

`apps/web/src/main.tsx` (before `ReactDOM.createRoot(...).render(...)`):

```ts
import { setProxyUrl } from '@zwaggen/core';

const bundledProxy = (window as { __ZWAGGEN_BUNDLED_PROXY__?: string }).__ZWAGGEN_BUNDLED_PROXY__;
if (bundledProxy) {
  setProxyUrl(bundledProxy);
}
```

That's all. The runner's per-request `proxyUrl` (today undefined for most calls) now defaults to `/proxy` instead of `http://localhost:4801`.

### Documentation

`apps/docs/quickstart.md` (en + zh-TW): update to mention `npx @zwaggen/web` ships the bundled proxy.

```markdown
## Quickstart

```bash
npx @zwaggen/web
```

Opens the spec builder + runner in your browser at `http://127.0.0.1:4173`. **The CORS-bypass proxy is bundled in** — flip the "Use proxy" toggle on any endpoint to route the request through the local proxy. No second terminal, no second port, no extra install.

### When you don't need the proxy

- Hosted at [play.zwaggen.com](https://play.zwaggen.com) — same builder UI, but cross-origin requests hit browser CORS. Use this for spec authoring; switch to `npx @zwaggen/web` (or [Zwaggen Desktop](/guide/desktop) when it ships) to actually run requests.
- Standalone `npx @zwaggen/proxy` — same proxy on `http://localhost:4801`. Useful when running the playground on a different machine from the proxy.
```

Same shape in zh-TW.

### Tests

- `packages/proxy/tests/handle.test.ts` — quick smoke that the named export works (mount on a tiny http.createServer, fire a request, assert the proxied response shape).
- `packages/core/tests/runner/proxyUrl.test.ts` — `setProxyUrl` / `getProxyUrl` / `resetProxyUrl` work; `sendRequest` uses the configured value when no per-request override.
- `apps/web/tests/main.bundledProxy.test.ts` — `window.__ZWAGGEN_BUNDLED_PROXY__` triggers `setProxyUrl` before render. (Verify via importing main.tsx's side-effect path.)
- `apps/web/bin/zwaggen-web.js` smoke test — start the bin via subprocess, hit `/` and `/proxy?url=<localhost-stub>`, assert both work. Mirror the existing bin tests if they exist; create a new file if not.

### Risks

- **Bundling proxy into `@zwaggen/web` at publish time** is the trickiest piece. The simplest implementation: run `pnpm --filter zwaggen-proxy build` BEFORE `pnpm --filter @zwaggen/web build`, then COPY `packages/proxy/dist/server.js` into `apps/web/dist/proxy/server.js` (or include via the `files` field). The bin then imports `'./proxy/server.js'` relative to its own location.
- **`window.__ZWAGGEN_BUNDLED_PROXY__` collision** with future test hooks: the underscore-prefixed name is sufficiently unique.
- **The same-origin proxy still triggers a real network request to the target.** Browsers may surface this as a generic network error if the target is down — same as today. Error UX unchanged.
- **`npx @zwaggen/web` opens browser auto** by default. The injected `<script>` hint runs before any other script — verify ordering in the served HTML.
- **`play.zwaggen.com` regression**: the production build doesn't have `__ZWAGGEN_BUNDLED_PROXY__` injected, so `setProxyUrl` is never called, default stays `http://localhost:4801`. Verified by leaving the injection in the bin script only (not in vite's index.html template).
- **Edge case**: if a user runs `npx @zwaggen/web --port 8080` AND ALSO has a separate `zwaggen-proxy` running on 4801, both are valid options. The runner uses whichever URL was last set. With the injected hint, `/proxy` (same origin = `localhost:8080`) wins. User can override per-request via the existing `proxyUrl` field.

## Done definition

- `@zwaggen/proxy` exports `handle(req, res)`.
- `@zwaggen/core` exports `setProxyUrl`/`getProxyUrl`/`resetProxyUrl`; `sendRequest` honors the configured default.
- `apps/web/bin/zwaggen-web.js` mounts the proxy at `/proxy` and injects `__ZWAGGEN_BUNDLED_PROXY__` into the served index.html.
- `apps/web/src/main.tsx` detects the hint and calls `setProxyUrl` before render.
- Proxy code is bundled into `@zwaggen/web` at publish time so `npx @zwaggen/web` works without `zwaggen-proxy` as a runtime npm dep.
- Quickstart updated in both locales.
- All tests green; smoke test for the bin proves single-port end-to-end works.
- TODO ticked; "auto-enable Use proxy on first cross-origin failure" follow-up logged.
- Spec + plan moved to `done/`.
- Branch `plan/web-bundled-proxy` pushed.
