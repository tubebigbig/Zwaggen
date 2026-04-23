# Spec — Zwaggen Desktop slice 3: `.zwag` file association + Recents UI

## Problem

Two related OS-integration concerns the desktop app needs to feel native:

1. **File association** — double-clicking a `.zwag` file in Finder/Explorer/file manager should open Zwaggen with that file loaded. Today the user has to launch the app and pick the file via the Open dialog, which is a worse experience than every editor they're used to.

2. **Recents UI** — File → Open Recent should list the last N files the user opened. Slice prep #2 added a `recordRecent` data plumbing in IDB; nothing surfaces it. Now that the desktop has a native menu, this is the obvious place.

Both concerns are tightly coupled: the file-association flow opens a file → records it as recent → the next launch's File → Open Recent reflects it. They share IPC channels and a JSON-on-disk recents store.

This is **slice 3 of N**, stacked on `plan/desktop-packaging` (slice 2).

## Success criteria

- **`.zwag` file association registered** via electron-builder's `fileAssociations` in `electron-builder.yml`. Per-OS:
  - macOS: appears in Finder's "Open with" submenu after first install. `Cmd+Click → Open with → Zwaggen`.
  - Windows: NSIS installer registers `.zwag` → Zwaggen in HKCR; double-click Just Works.
  - Linux: AppImage's `.desktop` integration includes `MimeType=application/x-zwaggen-spec`. (Browser MIME `application/json` not associated — too aggressive.)
- **Launch-time path handling**:
  - macOS: `app.on('open-file', ...)` fires when the OS hands a path to a non-running app or a running one. Buffer paths received before `app.whenReady()`; once ready, use them.
  - Windows / Linux: parse `process.argv` for the first `*.zwag` or `*.json` path argument.
  - **Second-instance**: `app.requestSingleInstanceLock()` + `app.on('second-instance', (_, argv) => ...)`. Second double-click while app is running focuses the existing window and opens the new file in it (no second window).
- **Renderer receives the intent**:
  - On first launch with a path: the main window loads `index.html?specPath=<encoded-path>` (existing boot URL param from prep job 3). The renderer's existing boot logic dispatches to `getStorage().openByPath(path)` and `replaceSpec(...)`.
  - On second-instance / open-file-while-running: main process sends `webContents.send('zwaggen:open-file', { path })`; the renderer subscribes once at boot and calls the same `getStorage().openByPath(path)` + `replaceSpec(...)` chain.
- **Recents store moves to disk** in the desktop context:
  - New main-process module owns `path.join(app.getPath('userData'), 'recents.json')` — capped at 10, deduped by absolute path (NOT by basename — the desktop has full paths so two `spec.json` from different folders don't collide).
  - New IPC channels `zwaggen:recents:list` and `zwaggen:recents:record` route the renderer's `getStorage().listRecent()` / `getStorage().recordRecent()` calls through to the on-disk store.
  - On every record, also call `app.addRecentDocument(path)` so the OS's native recent-docs surface (macOS dock right-click, Windows jump list) reflects the same data.
  - The `bootstrap.ts` storage adapter overrides `listRecent`/`recordRecent` (not just file I/O) when running in Electron.
- **File menu gets an "Open Recent" submenu**:
  - Populated dynamically from the on-disk recents store at menu-build time.
  - Each item shows the basename (with full path as tooltip / submenu hint).
  - Clicking an item triggers the same "open this file" path used by file-association.
  - "Clear Recents" item at the bottom calls `app.clearRecentDocuments()` + clears the on-disk store; the menu rebuilds on next show.
  - The menu rebuilds whenever the recents store mutates.
- **Tests**:
  - Unit tests for the new main-process recents module (`apps/desktop/electron/recents.ts`): record adds to front, dedupe by absolute path, cap at 10, list returns sorted newest-first, clear empties the store.
  - Unit tests for the IPC handlers `zwaggen:recents:list` / `zwaggen:recents:record` (mock the recents module).
  - Unit test for argv parsing: extract a `.zwag` or `.json` arg from various platform-shaped argv arrays, ignore non-spec args.
  - Smoke test (or manual runbook in README, gracefully degraded): launch packaged app with a path argument; verify the spec loads.
- Existing slice 1 + slice 2 tests still pass.
- TODO entry "Zwaggen Desktop slice 3" ticked.

## Out of scope

- **Multi-document interface (tabs)** — single window per file at a time, like the strategic spec.
- **Drag-drop a `.zwag` file onto the running window** — separate UI work; file-association covers the OS launch path.
- **Recents with thumbnails / previews / search** — flat list of paths is fine for v1.
- **Pinning recents** / favorites / project workspaces — future work.
- **Custom file icon for `.zwag` files** in Finder/Explorer — uses the app icon by default; per-extension custom icons need separate art and ICNS embedding tricks. Defer.
- **`application/x-zwaggen-spec` MIME registration in `xdg-mime`** for Linux — AppImage's bundled `.desktop` declares it, but installing it system-wide for non-AppImage paths is out of scope.
- **Recents UI in the renderer (a "Recent Files" landing screen / picker dialog)** — only the native File → Open Recent menu in this slice.
- **Encrypted recents store** — same trust model as slice 1; the recents file is plain JSON.
- **Migration from IDB recents written by slice prep #2** — the IDB recents are renderer-side and the desktop never had any (the bridge wasn't even shipped); start fresh on disk.
- **Code signing**, still deferred.

## Approach

### Files

**Create:**
- `apps/desktop/electron/recents.ts` — pure module: `addRecent(path)`, `listRecent()`, `clearRecents()`, all backed by JSON-on-disk at `app.getPath('userData')/recents.json`. Pure enough to unit-test by injecting a path resolver.
- `apps/desktop/electron/argv.ts` — `extractSpecPath(argv: string[]): string | null`. Returns the first arg ending in `.zwag` or `.json` that exists on disk (skips arg[0] which is electron itself, arg[1] which is the app's own main path when running unpacked).
- `apps/desktop/electron/__tests__/recents.test.ts` — unit tests against a tmpdir-backed store.
- `apps/desktop/electron/__tests__/argv.test.ts` — unit tests for the argv parser.

**Modify:**
- `apps/desktop/electron-builder.yml` — add `fileAssociations` block.
- `apps/desktop/electron/main.ts` —
  - `app.requestSingleInstanceLock()` (quit if already running, otherwise handle `second-instance`).
  - Buffer + flush `open-file` events around `app.whenReady()`.
  - Parse `process.argv` via `extractSpecPath` to seed the initial path.
  - Pass the initial path to `createWindow` as a query param: `loadFile(indexHtml, { search: 'specPath=...' })` for unpacked, or `loadFile(indexHtml, { search })` for packaged. (`loadFile` accepts a `search` option — preferred over manual URL building.)
  - Register `zwaggen:recents:list`, `zwaggen:recents:record` IPC handlers.
  - Send `zwaggen:open-file` to the renderer when a second instance opens or `open-file` fires after a window already exists.
- `apps/desktop/electron/menu.ts` — add a recents submenu builder; rebuild the menu when recents change.
- `apps/desktop/electron/preload.ts` — expose `recentsList`, `recentsRecord`, `onOpenFile` on the bridge.
- `apps/web/src/types/zwaggen-bridge.ts` — extend `ZwaggenBridge` with the new methods.
- `apps/web/src/bootstrap.ts` — override `listRecent` / `recordRecent` in the storage adapter; subscribe to `onOpenFile` and dispatch into `replaceSpec` / `getStorage().openByPath`.
- `apps/web/src/App.tsx` — already has the boot effect that resolves `BootIntent` (URL params); no change needed for the launch flow because `?specPath=` is already handled. Subscribing to `onOpenFile` belongs in `bootstrap.ts` or a new effect (TBD during impl — bootstrap is simpler since it has the storage adapter).

**Untouched:**
- The IDB-backed recents in `apps/web/src/storage/spec-storage.ts` browser default. That stays for browser users (`play.zwaggen.com`); the desktop's `bootstrap.ts` overrides only when the bridge is present.

### `recents.ts` shape

```ts
import { app } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RecentEntry { path: string; openedAt: number; }

const LIMIT = 10;
let cachePath: string | null = null;
function file() {
  if (cachePath) return cachePath;
  cachePath = join(app.getPath('userData'), 'recents.json');
  return cachePath;
}

let cache: RecentEntry[] | null = null;
async function load(): Promise<RecentEntry[]> {
  if (cache) return cache;
  try {
    const text = await readFile(file(), 'utf8');
    const parsed = JSON.parse(text);
    cache = Array.isArray(parsed) ? parsed.filter(isRecent) : [];
  } catch {
    cache = [];
  }
  return cache;
}
function isRecent(v: unknown): v is RecentEntry {
  return typeof v === 'object' && v !== null && typeof (v as any).path === 'string' && typeof (v as any).openedAt === 'number';
}
async function save(entries: RecentEntry[]): Promise<void> {
  cache = entries;
  await writeFile(file(), JSON.stringify(entries, null, 2), 'utf8');
}

export async function listRecents(): Promise<RecentEntry[]> {
  const entries = await load();
  return entries.filter((e) => existsSync(e.path));   // hide entries that have since been deleted/moved
}
export async function recordRecent(path: string): Promise<void> {
  const entries = await load();
  const filtered = entries.filter((e) => e.path !== path);
  const next = [{ path, openedAt: Date.now() }, ...filtered].slice(0, LIMIT);
  await save(next);
  app.addRecentDocument(path);
}
export async function clearRecents(): Promise<void> {
  await save([]);
  app.clearRecentDocuments();
}
// Test-only: reset module state so tests run hermetically.
export function __resetForTests(testFile?: string) { cachePath = testFile ?? null; cache = null; }
```

The `existsSync` filter in `listRecents` is the right balance — cheap on every menu open, hides moved/deleted files automatically without rewriting the store.

### `argv.ts` shape

```ts
import { existsSync, statSync } from 'node:fs';

export function extractSpecPath(argv: string[]): string | null {
  // Skip argv[0] (electron) and argv[1] (the main script when unpacked).
  // In packaged mode argv layout differs; play it safe by inspecting all args.
  const candidates = argv.slice(1).filter((a) =>
    a.endsWith('.zwag') || a.endsWith('.json') || a.endsWith('.zwag.json')
  );
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch { /* ignore */ }
  }
  return null;
}
```

### `main.ts` integration sketch

```ts
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let pendingOpenPath: string | null = null;
app.on('open-file', (e, p) => {
  e.preventDefault();
  if (mainWindow) mainWindow.webContents.send('zwaggen:open-file', { path: p });
  else pendingOpenPath = p;
});

app.on('second-instance', (_e, argv) => {
  const p = extractSpecPath(argv);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    if (p) mainWindow.webContents.send('zwaggen:open-file', { path: p });
  }
});

app.whenReady().then(() => {
  registerIpc(() => mainWindow);
  registerRecentsIpc();           // new
  Menu.setApplicationMenu(buildMenu(() => mainWindow));
  const initial = pendingOpenPath ?? extractSpecPath(process.argv);
  createWindow(initial);
});

function createWindow(initialPath: string | null) {
  // ... webPreferences as before ...
  if (isDev) {
    const devUrl = process.env.ZWAGGEN_DEV_URL!;
    void mainWindow.loadURL(initialPath ? `${devUrl}/?specPath=${encodeURIComponent(initialPath)}` : devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(resolveRendererIndex(), {
      search: initialPath ? `specPath=${encodeURIComponent(initialPath)}` : undefined,
    });
  }
}
```

### Recents IPC + menu rebuild

```ts
// In ipc.ts (or a new recents-ipc.ts):
ipcMain.handle('zwaggen:recents:list', () => listRecents());
ipcMain.handle('zwaggen:recents:record', async (_e, path: unknown) => {
  if (typeof path !== 'string') throw new Error('invalid path');
  await recordRecent(path);
  Menu.setApplicationMenu(await buildMenu(() => mainWindow));   // rebuild to reflect new recent
});
```

In `menu.ts`, the recents submenu becomes async (the menu builder gains `await`):

```ts
export async function buildMenu(getMainWindow: () => BrowserWindow | null): Promise<Menu> {
  const recents = await listRecents();
  const recentsItems: Electron.MenuItemConstructorOptions[] = recents.length === 0
    ? [{ label: '(no recent files)', enabled: false }]
    : recents.map((r) => ({
        label: basename(r.path),
        toolTip: r.path,
        click: () => {
          const w = getMainWindow();
          if (w) w.webContents.send('zwaggen:open-file', { path: r.path });
        },
      }));
  recentsItems.push({ type: 'separator' });
  recentsItems.push({ label: 'Clear Recents', enabled: recents.length > 0, click: async () => {
    await clearRecents();
    Menu.setApplicationMenu(await buildMenu(getMainWindow));
  }});

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send(getMainWindow, 'open') },
        { label: 'Open Recent', submenu: recentsItems },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send(getMainWindow, 'save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send(getMainWindow, 'save-as') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ];
  return Menu.buildFromTemplate(template);
}
```

`buildMenu` was previously sync; making it async ripples to its caller (`Menu.setApplicationMenu(await buildMenu(...))`). Mechanical.

### Bridge + bootstrap changes

Bridge (`apps/web/src/types/zwaggen-bridge.ts`) gains:

```ts
recentsList(): Promise<{ path: string; openedAt: number }[]>;
recentsRecord(path: string): Promise<void>;
onOpenFile(cb: (payload: { path: string }) => void): void;
```

Preload exposes them as IPC `invoke` / `on` proxies.

Bootstrap (`apps/web/src/bootstrap.ts`) extends the storage override:

```ts
const storage: SpecStorage = {
  ...browserDefault,
  supportsNativePicker: () => true,
  pickOpen: () => bridge.pickOpen(),
  pickSave: (n) => bridge.pickSave(n),
  readFile: (h) => bridge.readFile(h as string),
  writeFile: (h, t) => bridge.writeFile(h as string, t),
  openByPath: (p) => bridge.openByPath(p),
  // NEW: recents now go through the desktop's on-disk store
  listRecent: async () => {
    const entries = await bridge.recentsList();
    return entries.map((e) => ({ name: basename(e.path), openedAt: e.openedAt, handle: e.path }));
  },
  recordRecent: async (entry) => {
    if (typeof entry.handle === 'string') await bridge.recentsRecord(entry.handle);
  },
};
setStorage(storage);

// NEW: subscribe to "open file from menu / file association"
bridge.onOpenFile(async ({ path }) => {
  const opened = await bridge.openByPath(path);
  if (!opened) return;
  const { fromJSON } = await import('@zwaggen/core');
  const { useSpecStore } = await import('./state/store');
  const parsed = fromJSON(JSON.parse(opened.text));
  await useSpecStore.getState().replaceSpec(parsed, opened.handle);
});
```

(The dynamic `import` for `useSpecStore` keeps the `bootstrap.ts` module's eager imports lean; revisit if it complicates testing.)

### Recents-recording timing

`recordRecent` should fire whenever the user successfully **opens** a spec — not on every save. The renderer's current flow:

1. `pickOpen` (slice 2 storage browser default already records on success — but the desktop bridge's `pickOpen` is a different function and DOES NOT record automatically; we need to add a record call here).
2. `openByPath` (boot URL param flow) — should also record after success.
3. `onOpenFile` (file-association menu invocation) — should also record.

Option A: have the desktop's `pickOpen` and `openByPath` IPC handlers record on success (inside main process).
Option B: have the renderer record after each successful open.

Option A keeps the recording centralized in main and doesn't depend on every renderer call site remembering. Pick A.

```ts
// In ipc.ts
async function handlePickOpen(...) {
  const result = await dialog.showOpenDialog(...);
  if (result.canceled) return null;
  const path = result.filePaths[0]!;
  const text = await readFile(path, 'utf8');
  await recordRecent(path);                  // <-- new
  Menu.setApplicationMenu(await buildMenu(...));   // refresh recents submenu
  return { handle: path, name: basename(path), text };
}

async function handleOpenByPath(path: string) {
  const text = await readFile(path, 'utf8');
  await recordRecent(path);                  // <-- new
  Menu.setApplicationMenu(await buildMenu(...));
  return { handle: path, name: basename(path), text };
}
```

That keeps the renderer dumb about recents accounting.

### Risks

- **Single-instance lock breaks concurrent dev/test runs**. If you run `pnpm dev` twice, the second instance no-ops. Acceptable; document in README. The Playwright e2e launches via `_electron.launch` which uses a separate executable args path so the lock should be per-app-id; if it conflicts, the e2e tests may need to acquire a unique app-id at runtime. Test and adjust.
- **Buffering `open-file` before `whenReady`**. macOS may fire the event very early. The `pendingOpenPath` variable + reading `extractSpecPath(process.argv)` in `whenReady` covers both paths but be careful about overwrite ordering (process.argv loses to open-file because open-file is more authoritative on macOS).
- **`existsSync` in listRecents** is sync I/O on the menu-show hot path. For 10 entries it's cheap (~microseconds). Watch for menus feeling slow on slow filesystems; not a concern v1.
- **Linux .desktop integration**. AppImage with a `.desktop` file declaring MimeType is the standard path; some desktops require user re-login or explicit `xdg-mime default Zwaggen.desktop application/x-zwaggen-spec` to pick up the association. Document the limitation.
- **`Menu.setApplicationMenu(await buildMenu(...))`** rebuilds the entire menu (cheap, ~10ms) on every recents change. Acceptable. If users complain about menu flicker, switch to mutating just the submenu items.
- **Stacked branches**. PR for slice 3 must use base `plan/desktop-packaging`. Once slices 1 + 2 merge in order, GitHub auto-rebases.

## Done definition

- electron-builder.yml has `fileAssociations` for `.zwag` on all three OSes.
- Main process buffers `open-file`, parses argv, single-instance-locks.
- `recents.ts` module ships with hermetic tests.
- `argv.ts` extractor ships with tests.
- IPC channels `zwaggen:recents:list` / `zwaggen:recents:record` registered.
- Bridge exposes `recentsList` / `recentsRecord` / `onOpenFile`.
- Bootstrap routes recents through the bridge and subscribes to `onOpenFile`.
- File menu has "Open Recent" submenu, populated from on-disk recents, with "Clear Recents".
- Desktop `pickOpen` and `openByPath` automatically record on success.
- Slice 1 + slice 2 tests still pass.
- Spec + plan moved to `done/`. TODO entry ticked.
- Branch pushed; user opens PR with base = `plan/desktop-packaging`.
