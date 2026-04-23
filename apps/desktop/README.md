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

## Package

Build platform-specific artifacts under `release/`. Slice 2 ships unsigned — users will see Gatekeeper / SmartScreen warnings until a future slice adds code signing.

Quick local smoke (unpacked, fastest):

```
pnpm --filter @zwaggen/desktop run pack
```

Note the `run` — pnpm's built-in `pnpm pack` (tarball) shadows the script name otherwise.

Output: `release/<platform>-<arch>/Zwaggen.app` (mac), `release/win-unpacked/Zwaggen.exe`, or `release/linux-unpacked/`.
On macOS, `open release/mac-arm64/Zwaggen.app`.

Real installers:

```
pnpm --filter @zwaggen/desktop run release
```

Output:
- macOS: `release/Zwaggen-<version>-arm64.dmg` and `release/Zwaggen-<version>.dmg`.
- Windows: `release/Zwaggen Setup <version>.exe` and `release/Zwaggen-<version>-win.zip`.
- Linux: `release/Zwaggen-<version>.AppImage`.

### Cross-build constraints

- macOS targets (`.dmg`) build only on macOS.
- Windows targets build natively on Windows; on macOS/Linux electron-builder uses Wine (slow, occasionally flaky).
- Linux AppImage builds on macOS and Linux.

For now, build on the host OS that matches your target. CI matrix is a future slice.

### Icons

Brand icons live at `build/icon.{png,ico,icns}`, generated from `apps/docs/public/favicon.svg`. Regenerate with:

```
pnpm --filter @zwaggen/desktop build:icons
```

The generated PNG + ICO are committed so non-mac contributors don't need `sharp` / `iconutil` to build. The .icns is regenerated on macOS only via Xcode's `iconutil`; off-mac builds fall back to electron-builder deriving an .icns from `icon.png`.

## File association + Recents

`.zwag` files double-click to open in Zwaggen after install:
- macOS: appears in Finder's Open With submenu after first install.
- Windows: NSIS installer registers the extension.
- Linux: AppImage's bundled `.desktop` declares `MimeType=application/x-zwaggen-spec`. Some desktops require `xdg-mime default Zwaggen.desktop application/x-zwaggen-spec` after first run.

The File → Open Recent submenu is populated from `<userData>/recents.json` (capped at 10, deduped by absolute path). Recent items are also pushed to the OS's native recent-docs surface (macOS dock right-click, Windows jump list).

Single-instance lock: a second double-click while the app is running focuses the existing window and opens the new file there (no second window).

## What this slice does NOT do

- No code signing / notarization.
- No auto-update.
