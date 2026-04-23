# Spec — Zwaggen Desktop slice 1: local-dev Electron scaffold

## Problem

We've shipped the three Electron prep jobs (transport abstraction, storage abstraction, open-by-path). Nothing actually proves they work end-to-end until something consumes them. This slice builds the smallest Electron app that:

1. Loads the existing `apps/web` UI in a real desktop window.
2. Routes every HTTP request through Node's `fetch` so CORS is bypassed.
3. Reads + writes spec files via the OS file system through native dialogs.

This is **slice 1 of N**. The strategic spec at `docs/specs/active/2026-04-22-zwaggen-desktop.md` covers the whole desktop product; this slice carves out the dev-only experience so we can validate the architecture locally before investing in packaging/signing/distribution.

The user explicitly asked: "test local first." No `.dmg`/`.exe`/`.AppImage` targets, no code signing, no `.zwag` file association, no auto-update — those are later slices.

## Success criteria

- `pnpm --filter @zwaggen/desktop dev` launches an Electron window showing the existing `apps/web` UI, hot-reloading on web source changes.
- `pnpm --filter @zwaggen/desktop start` (after `pnpm -r build`) launches the same window against the built `apps/web` bundle on disk (preview mode — no dev server needed).
- A "Hello CORS" smoke proof: from inside the desktop window, opening a fresh spec, adding an endpoint pointing at `https://httpbin.org/get` (or another known cross-origin target), and clicking Run, returns the response without a CORS error. The same spec opened in `apps/web` running in a regular browser would fail with CORS — that's the whole point.
- Open / Save / Save As / Quit all work via the native menu bar with platform shortcuts (Cmd+O / Cmd+S / Cmd+Shift+S / Cmd+Q on macOS, Ctrl variants on Windows/Linux).
- Standard Edit menu (Undo/Redo/Cut/Copy/Paste/Select All) and View menu (Reload/Force Reload/Toggle DevTools) work with platform shortcuts.
- The renderer runs with Electron's strict security baseline:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - `sandbox: true`
  - `webviewTag: false`
  - Strict CSP header (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none';`) so the renderer cannot make outbound network requests directly.
  - All IPC handlers validate their payload shape before acting.
  - `webContents.on('will-navigate', preventDefault)` and `setWindowOpenHandler(() => ({ action: 'deny' }))` to block renderer-driven navigation/popups; external links open via `shell.openExternal()` with an allowlist.
- `apps/web/src/main.tsx` detects `window.zwaggen` (the preload bridge) at boot and, if present, calls `setStorage()` and `setTransport()` to swap in IPC-backed implementations BEFORE rendering `<App />`. If absent, behaviour is unchanged (browser users see today's playground).
- New tests:
  - `apps/desktop/electron/__tests__/ipc.test.ts` — pure unit tests for the IPC handler functions (mock `fetch`, `fs`, `dialog`; assert payload validation rejects malformed input; assert valid input is forwarded correctly).
  - `apps/desktop/e2e/smoke.spec.ts` — Playwright Electron e2e that boots the app, opens a fixture spec, runs an endpoint against a local stub server (real cross-origin via separate port), asserts the response renders.
- Existing `apps/web` and `@zwaggen/core` test suites pass unchanged.
- TODO entries ticked: the three Desktop entries (Transport / Storage / Open-by-path prep) are already ticked from prior work — only the new desktop scaffold entry needs a tick.

## Out of scope

- **Packaging** (`electron-builder`, .dmg / .exe / .AppImage builds). Slice 2 or 3.
- **Code signing / notarization**. User explicitly said: skip Apple license for now.
- **`.zwag` file extension + OS file association** ("open with Zwaggen"). Later.
- **Recents UI** — the data is recorded by the storage layer (already shipped); surfacing it in a "File → Open Recent" submenu is a follow-up.
- **App icons** — Electron's default for now. Real icons in a packaging slice.
- **Renaming `play.zwaggen.com` to "Zwaggen Web"** — branding/docs work, not part of the local-dev scaffold.
- **Auto-update / `electron-updater`** — only matters once we package.
- **Tabs / multi-window** — single window per process, like the strategic spec.
- **Telemetry / crash reporting** — none.
- **gRPC, GraphQL subscriptions, WebSocket transports** — additive future work.
- **Secrets in OS keychain (`keytar`)** — slice 1 keeps secrets in the existing IDB store like the browser does. The desktop window IS sandboxed but secrets at rest stay where the renderer already stores them. Keychain integration is a focused follow-up.
- **Drafts persistence on disk** — the existing IDB-backed draft store still works inside Electron's renderer (Chromium ships IndexedDB). Future slice can move drafts to disk for symmetry.
- **The macOS-app-of-apps app menu** beyond File/Edit/View. No Help, no Window, no About dialog yet.

## Approach

### Package layout

New workspace package `apps/desktop/`:

```
apps/desktop/
├── package.json                  # name: @zwaggen/desktop, private: true
├── tsconfig.json
├── electron/
│   ├── main.ts                   # main-process entry: window, menu, IPC wiring
│   ├── preload.ts                # contextBridge — exposes window.zwaggen
│   ├── ipc.ts                    # IPC handler implementations (HTTP, fs, dialog)
│   ├── menu.ts                   # native menu definitions
│   ├── csp.ts                    # CSP string constant
│   └── __tests__/
│       └── ipc.test.ts
├── e2e/
│   ├── smoke.spec.ts             # Playwright Electron smoke
│   └── stub-server.ts            # tiny http.createServer used in smoke test
└── README.md                     # how to run dev + start
```

The renderer is `apps/web` — no copy, no build duplication. In dev, the main process loads `http://localhost:5173` (Vite dev server). In preview/start mode, the main process loads `file://<repo>/apps/web/dist/index.html`.

### Renderer detection of the desktop bridge

`apps/web/src/main.tsx` (or a new `bootstrap.ts` it imports) checks `if (typeof window !== 'undefined' && (window as any).zwaggen)` once at startup. If the bridge is present:

1. Build a `Transport` adapter from `window.zwaggen.sendHttpRequest`, call `setTransport(transport)`. (Note: this requires `setTransport` / `getTransport` to be added to `@zwaggen/core` — see "API additions" below.)
2. Build a `SpecStorage` adapter from `window.zwaggen.{ pickOpen, pickSave, readFile, writeFile, openByPath }`, call `setStorage(adapter)`.

After those two calls, `<App />` renders. The rest of the codebase is unchanged — every consumer of `getStorage()` / the (newly added) `getTransport()` automatically routes through the desktop-shell impls.

### `window.zwaggen` API surface

```ts
// preload.ts (typed via apps/desktop/electron/types.ts, re-imported by apps/web)
interface ZwaggenBridge {
  sendHttpRequest(req: TransportRequest): Promise<TransportResponse>;
  pickOpen(): Promise<{ handle: string; name: string; text: string } | null>;
  pickSave(suggestedName?: string): Promise<string | null>;
  readFile(handle: string): Promise<{ text: string; name: string }>;
  writeFile(handle: string, text: string): Promise<void>;
  openByPath(path: string): Promise<{ handle: string; name: string; text: string } | null>;
}
```

Each method becomes a single `ipcRenderer.invoke(<channel>, payload)` call in the preload and a typed handler on the main side. Handle (the spec's `FileRef`) is the absolute filesystem path on desktop — opaque to the renderer.

### `@zwaggen/core` API additions

Currently `sendRequest` accepts `opts.transport`. To swap globally without touching every call site (RunPanel, batch.ts, cli/run.ts), add a singleton mirror to the storage pattern:

- New `setTransport(t: Transport)`, `getTransport(): Transport`, `resetTransport()` exported from `@zwaggen/core`.
- `sendRequest(req, opts?)` resolves transport order: explicit `opts.transport` > `getTransport()` > `fetchTransport`.
- Default is unchanged — all existing tests pass, browser playground unaffected.

This is a tiny addition to the transport module (~10 lines + 2 tests). Symmetric to what storage already has.

### Electron security baseline (non-negotiable)

```ts
new BrowserWindow({
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webviewTag: false,
  },
});
```

Plus a session-level CSP header (set via `webRequest.onHeadersReceived` so it applies to both `file://` and `http://localhost:5173`):

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'none';
```

`connect-src 'none'` is the heart of the CSP — the renderer cannot `fetch()` anything. All HTTP goes through the IPC bridge to the main process. (This is exactly what makes the architecture safe AND CORS-free.)

Dev-mode caveat: Vite's HMR uses WebSockets to `localhost:5173`. We need to relax `connect-src` in dev to `connect-src 'self' ws://localhost:5173` (or omit the CSP entirely in dev — the threat model is "untrusted spec author", and no untrusted content is loaded in dev). Decision: **omit the CSP in dev mode, enforce it strictly in preview/prod**. Document this clearly in main.ts.

### IPC handler design

Each handler:

1. Validates the payload with a small inline schema (zod or hand-written guards — zod is heavy; a 5-line type guard per handler is fine for v1).
2. Logs the operation kind (not the payload — payload may contain user data) to stderr in dev only.
3. Returns the typed response or throws — `ipcRenderer.invoke` propagates rejections.

Example:

```ts
ipcMain.handle('zwaggen:http', async (_evt, payload: unknown) => {
  if (!isTransportRequest(payload)) throw new Error('invalid payload');
  const resp = await fetch(payload.url, {
    method: payload.method,
    headers: payload.headers,
    body: payload.bodyText,
  });
  const rawText = await resp.text();
  const headers: Record<string, string> = {};
  resp.headers.forEach((v, k) => { headers[k] = v; });
  return {
    ok: resp.ok,
    status: resp.status,
    statusText: resp.statusText,
    headers,
    rawText,
  };
});
```

The HTTP handler is essentially `fetchTransport` from `@zwaggen/core` lifted into the main process. The fs handlers wrap `fs/promises.readFile`/`writeFile` and `dialog.showOpenDialog`/`showSaveDialog`.

### Native menu

Standard cross-platform menu via `Menu.setApplicationMenu(Menu.buildFromTemplate(...))`. File menu sends IPC events to the renderer ("trigger open dialog", "trigger save", "trigger save as") which the renderer's `AppHeader` already wires for button clicks. The menu items just call `webContents.send('zwaggen:menu', 'open' | 'save' | 'save-as')` and the renderer subscribes once at boot. Edit/View use Electron's built-in `role`-based items.

### Test plan

**Unit (`apps/desktop/electron/__tests__/ipc.test.ts`):**

- `isTransportRequest` rejects: missing fields, wrong types, non-http URL.
- `isTransportRequest` accepts: minimal valid request.
- HTTP handler with mocked `fetch` returns the right shape.
- Open/save/read/write handlers with mocked `fs` + `dialog` return right shapes.

**E2E (`apps/desktop/e2e/smoke.spec.ts`):**

- Boot the Electron app via Playwright's `_electron.launch`.
- Spin up a tiny `http.createServer` on a random port that returns `{ ok: true }` for `/echo`.
- Inside the app: open a hand-crafted spec fixture (`apps/desktop/e2e/fixtures/cors-test.zwag.json`) that has an endpoint pointing at `http://localhost:<port>/echo`. Click Run.
- Assert the response panel shows `200` and the body parses to `{ ok: true }`.
- Quit cleanly.

This is the meaningful proof: the request from the renderer reaches a localhost server (cross-origin from `file://` or `http://localhost:5173`) AND the response renders. Same flow in a real browser would block on CORS preflight.

### Risks & open questions

- **TypeScript build for the main process.** Electron's main runs Node CommonJS. The preload script must be CJS (Electron loads it before the renderer starts; ESM preload requires recent Electron versions). Use `tsup` (already a dep) to bundle main.ts and preload.ts into `dist/main.cjs` and `dist/preload.cjs`. The renderer (apps/web) keeps its existing Vite ESM build.
- **Vite HMR through Electron.** Loading `http://localhost:5173` in `BrowserWindow` is straightforward, but the renderer's CSP must not block the HMR WebSocket. Solution above: drop CSP in dev.
- **Preload path resolution.** `__dirname` in the bundled main.cjs needs to point at the bundled preload.cjs sitting next to it. tsup builds them both into `apps/desktop/dist/`.
- **Test environment.** Playwright's Electron support is stable but shy with `_electron.launch({ args: [main.cjs path] })`. A bootstrap script in package.json `scripts.e2e` builds the desktop bundle first, then runs Playwright pointed at the built path. Document the prereq.
- **Dev DX cost.** Two terminals (or `concurrently`): one for `pnpm --filter web dev` (Vite on :5173), one for `pnpm --filter desktop dev` (Electron loading :5173). Wrap them with a single root script `pnpm desktop:dev` that uses `concurrently` so the user only types one command.
- **`apps/web/src/main.tsx` mutation.** Adding a desktop-bridge probe is a small change but it's in the boot path. Cover with an existing or new test that asserts: with `window.zwaggen` undefined, behaviour is unchanged; with it defined, `setStorage` and `setTransport` are called.
- **Bundle size.** `@zwaggen/desktop` adds Electron (~140MB unpacked). That's fine; we're not packaging yet, and the user's local `node_modules` already has it once installed. No lock-file shocks for `apps/web` consumers because they don't depend on `@zwaggen/desktop`.

## Done definition

- New workspace package `@zwaggen/desktop` with main + preload + ipc + menu + CSP modules.
- `setTransport`/`getTransport`/`resetTransport` added to `@zwaggen/core` (symmetric to `setStorage`/`getStorage`/`resetStorage`); `sendRequest` resolves transport via the singleton when `opts.transport` is omitted.
- `apps/web/src/main.tsx` (or a new `apps/web/src/bootstrap.ts`) detects `window.zwaggen` and configures core + storage from the bridge before mounting.
- `pnpm --filter @zwaggen/desktop dev` runs the app pointed at `http://localhost:5173` with Vite HMR working.
- `pnpm --filter @zwaggen/desktop start` runs the app pointed at the built `apps/web/dist`.
- Native menu with File / Edit / View entries and platform-correct accelerators.
- Strict CSP enforced in preview mode (and disabled in dev with a clear comment).
- All Electron security defaults locked down (contextIsolation, sandbox, no nodeIntegration, will-navigate / window.open blocked).
- `pnpm --filter @zwaggen/desktop test` passes the new IPC unit tests.
- `pnpm --filter @zwaggen/desktop e2e` passes the Playwright smoke test against the localhost stub server.
- All existing `apps/web` and `@zwaggen/core` tests pass unchanged.
- A small `apps/desktop/README.md` explains how to run dev + start + test + e2e.
- TODO entry ticked, spec + plan moved to `done/`.
- Branch `plan/desktop-electron-scaffold` pushed; user opens PR.
