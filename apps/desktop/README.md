# @zwaggen/desktop — Zwaggen Desktop (Electron)

Local-dev Electron wrapper for `apps/web`. CORS-free HTTP via Node `fetch` over IPC.

## Run

Dev (HMR — needs `apps/web` dev server in another terminal):

```
pnpm --filter @zwaggen/web dev       # terminal 1 — Vite on :5173
pnpm --filter @zwaggen/desktop dev   # terminal 2 — Electron loads :5173
```

Preview (built bundle, no dev server):

```
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop start
```

The `start` script needs `apps/web/dist/index.html` to exist on disk.

## Test

```
pnpm --filter @zwaggen/desktop test    # IPC unit tests
pnpm --filter @zwaggen/desktop e2e     # Playwright Electron smoke
```

## Architecture

- `electron/main.ts` — main process. Creates `BrowserWindow` with strict
  webPreferences (`contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`). Loads `ZWAGGEN_DEV_URL` in dev or
  `apps/web/dist/index.html` in start mode. Wires IPC + native menu.
- `electron/preload.ts` — runs in an isolated world. Calls
  `contextBridge.exposeInMainWorld('zwaggen', ...)` so the renderer sees a
  typed bridge instead of raw `ipcRenderer`. Mirrors the `ZwaggenBridge`
  interface in `apps/web/src/types/zwaggen-bridge.ts`.
- `electron/ipc.ts` — IPC handlers. `zwaggen:http` proxies HTTP via Node
  `fetch` (this is the CORS bypass); `zwaggen:pickOpen|pickSave|readFile|writeFile|openByPath`
  surface native dialogs and Node `fs`. Every handler validates its payload.
- `electron/menu.ts` — native File/Edit/View menu. File→Open/Save/Save As
  send `zwaggen:menu` events the renderer subscribes to.
- `electron/csp.ts` — strict CSP applied only in preview/start mode (Vite HMR
  uses ws:// in dev and would break under `connect-src 'none'`).

## Manual smoke (when the e2e is unavailable)

1. `pnpm --filter @zwaggen/web build`
2. `pnpm --filter @zwaggen/desktop start`
3. In the open window, click "Open" and pick any `.zwag.json` spec, OR use File→Open from the native menu.
4. Edit an endpoint to point at a public host (e.g. `https://httpbin.org/get`).
5. Click Run. Verify the response panel shows status 200 — no CORS error.
6. Click File→Save As and write the spec to a new file. Verify the file appears on disk.

## What this slice does NOT do

- No `.dmg` / `.exe` / `.AppImage` packaging — that's a follow-up slice.
- No code signing / notarization.
- No `.zwag` file association.
- No app icons (Electron default for now).
- No auto-update.
