# Zwaggen Desktop slice 3 — `.zwag` file association + Recents UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Double-click a `.zwag` file in Finder/Explorer/file manager → opens in Zwaggen with that spec loaded. File menu gains an "Open Recent" submenu populated from an on-disk recents store.

**Architecture:** electron-builder `fileAssociations` registers the extension per-OS. Main process buffers macOS `open-file` events around `whenReady`, parses `process.argv` for Windows/Linux launch paths, single-instance-locks. The selected path is passed to the renderer as a `?specPath=` query param (already wired by the boot resolver in slice 1's prep). On second launch / open-file-while-running, main sends `zwaggen:open-file` IPC; the renderer subscribes and dispatches into `replaceSpec`. A new `recents.ts` main-process module owns `recents.json` at `app.getPath('userData')`, deduped by absolute path, capped at 10. New IPC channels (`zwaggen:recents:list` / `zwaggen:recents:record`) bridge the renderer's storage `listRecent` / `recordRecent`. `pickOpen` and `openByPath` IPC handlers automatically record on success.

**Tech Stack:** Electron, no new deps. Stacks on `plan/desktop-packaging`.

---

### Spec

See `docs/specs/active/2026-04-23-desktop-recents-and-fileassoc.md`. Key constraints:

- Stacked PR — base must be `plan/desktop-packaging`.
- Recents in main process (on-disk JSON + native `app.addRecentDocument`).
- Renderer side: bridge proxies IPC, bootstrap overrides `listRecent` / `recordRecent` / subscribes to `onOpenFile`.
- Menu rebuilt whenever recents change. `buildMenu` becomes async.

---

### Task 1: `recents.ts` module + tests

**Files:**
- Create: `apps/desktop/electron/recents.ts`
- Create: `apps/desktop/electron/__tests__/recents.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/desktop/electron/__tests__/recents.test.ts
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listRecents, recordRecent, clearRecents, __resetForTests } from '../recents';

let dir: string;
let storeFile: string;
let probe: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'zwag-recents-'));
  storeFile = join(dir, 'recents.json');
  probe = join(dir, 'a.zwag');
  await writeFile(probe, '{}');
  __resetForTests(storeFile);
  // stub out app.addRecentDocument so the test doesn't depend on Electron
  vi.mock('electron', () => ({
    app: { addRecentDocument: vi.fn(), clearRecentDocuments: vi.fn(), getPath: () => '/' },
  }));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  __resetForTests();
});

test('listRecents returns [] when no store file exists', async () => {
  expect(await listRecents()).toEqual([]);
});

test('recordRecent adds a new entry and persists JSON', async () => {
  await recordRecent(probe);
  const list = await listRecents();
  expect(list).toHaveLength(1);
  expect(list[0]!.path).toBe(probe);
  expect(typeof list[0]!.openedAt).toBe('number');
  const onDisk = JSON.parse(await readFile(storeFile, 'utf8'));
  expect(onDisk[0].path).toBe(probe);
});

test('recordRecent dedupes by absolute path; newest moves to front', async () => {
  const b = join(dir, 'b.zwag');
  await writeFile(b, '{}');
  await recordRecent(probe);
  await new Promise((r) => setTimeout(r, 1));
  await recordRecent(b);
  await new Promise((r) => setTimeout(r, 1));
  await recordRecent(probe);
  const list = await listRecents();
  expect(list.map((e) => e.path)).toEqual([probe, b]);
});

test('recordRecent caps at 10', async () => {
  const paths: string[] = [];
  for (let i = 0; i < 12; i++) {
    const p = join(dir, `f${i}.zwag`);
    await writeFile(p, '{}');
    paths.push(p);
    await recordRecent(p);
  }
  const list = await listRecents();
  expect(list).toHaveLength(10);
  expect(list[0]!.path).toBe(paths[11]);
  expect(list[9]!.path).toBe(paths[2]);
});

test('listRecents hides entries whose files no longer exist', async () => {
  const ghost = join(dir, 'ghost.zwag');
  await writeFile(ghost, '{}');
  await recordRecent(ghost);
  await rm(ghost);
  const list = await listRecents();
  expect(list.find((e) => e.path === ghost)).toBeUndefined();
});

test('clearRecents empties the store', async () => {
  await recordRecent(probe);
  await clearRecents();
  expect(await listRecents()).toEqual([]);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
pnpm --filter @zwaggen/desktop test -- recents.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit (red)**

```bash
git add apps/desktop/electron/__tests__/recents.test.ts
git commit -m "$(cat <<'EOF'
test(desktop): failing tests for the on-disk recents module

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Implement `apps/desktop/electron/recents.ts`**

```ts
import { app } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RecentEntry { path: string; openedAt: number; }

const LIMIT = 10;
let cachePath: string | null = null;
let cache: RecentEntry[] | null = null;

function file(): string {
  if (cachePath) return cachePath;
  cachePath = join(app.getPath('userData'), 'recents.json');
  return cachePath;
}

function isRecent(v: unknown): v is RecentEntry {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.path === 'string' && typeof r.openedAt === 'number';
}

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

async function save(entries: RecentEntry[]): Promise<void> {
  cache = entries;
  await writeFile(file(), JSON.stringify(entries, null, 2), 'utf8');
}

export async function listRecents(): Promise<RecentEntry[]> {
  const entries = await load();
  // Hide stale entries on every read (cheap for 10 items)
  return entries.filter((e) => existsSync(e.path));
}

export async function recordRecent(path: string): Promise<void> {
  const entries = await load();
  const filtered = entries.filter((e) => e.path !== path);
  const next: RecentEntry[] = [{ path, openedAt: Date.now() }, ...filtered].slice(0, LIMIT);
  await save(next);
  app.addRecentDocument(path);
}

export async function clearRecents(): Promise<void> {
  await save([]);
  app.clearRecentDocuments();
}

/** Test-only: reset module state so tests run hermetically. */
export function __resetForTests(testFile?: string): void {
  cachePath = testFile ?? null;
  cache = null;
}
```

- [ ] **Step 5: Tests pass**

```bash
pnpm --filter @zwaggen/desktop test -- recents.test.ts
```

Expected: 6/6 green.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/recents.ts
git commit -m "$(cat <<'EOF'
feat(desktop): on-disk recents store backed by app.getPath('userData')

Cap 10, dedupe by absolute path, hide stale entries on read. Calls
app.addRecentDocument so OS-native surfaces (mac dock, win jump list)
mirror the same data.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `argv.ts` extractor + tests

**Files:**
- Create: `apps/desktop/electron/argv.ts`
- Create: `apps/desktop/electron/__tests__/argv.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/desktop/electron/__tests__/argv.test.ts
import { afterEach, beforeEach, expect, test } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractSpecPath } from '../argv';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'zwag-argv-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

test('returns null when no spec-shaped arg is present', () => {
  expect(extractSpecPath(['/path/to/electron', '/path/to/main.cjs'])).toBeNull();
  expect(extractSpecPath(['/path/to/electron', '--flag'])).toBeNull();
});

test('returns the first existing .zwag file', async () => {
  const p = join(dir, 'spec.zwag');
  await writeFile(p, '{}');
  expect(extractSpecPath(['electron', 'main.cjs', p])).toBe(p);
});

test('also recognises .zwag.json and .json', async () => {
  const a = join(dir, 'spec.zwag.json');
  const b = join(dir, 'spec.json');
  await writeFile(a, '{}');
  await writeFile(b, '{}');
  expect(extractSpecPath(['electron', a])).toBe(a);
  expect(extractSpecPath(['electron', b])).toBe(b);
});

test('skips spec-shaped args that do not exist on disk', async () => {
  const real = join(dir, 'real.zwag');
  await writeFile(real, '{}');
  expect(extractSpecPath(['electron', '/nope/missing.zwag', real])).toBe(real);
});
```

- [ ] **Step 2: Run — verify they fail**

```bash
pnpm --filter @zwaggen/desktop test -- argv.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Commit (red)**

```bash
git add apps/desktop/electron/__tests__/argv.test.ts
git commit -m "$(cat <<'EOF'
test(desktop): failing tests for argv → spec path extractor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Implement `apps/desktop/electron/argv.ts`**

```ts
import { existsSync, statSync } from 'node:fs';

const SPEC_EXTENSIONS = /\.(zwag|zwag\.json|json)$/i;

export function extractSpecPath(argv: string[]): string | null {
  // argv[0] is the electron binary; argv[1..] may include the main script
  // path (unpacked) or be the user-supplied args (packaged). Skip argv[0]
  // and probe everything else for spec-shaped paths.
  const candidates = argv.slice(1).filter((a) => SPEC_EXTENSIONS.test(a));
  for (const c of candidates) {
    try {
      if (existsSync(c) && statSync(c).isFile()) return c;
    } catch { /* ignore */ }
  }
  return null;
}
```

- [ ] **Step 5: Tests pass**

```bash
pnpm --filter @zwaggen/desktop test -- argv.test.ts
```

Expected: 4/4 green.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/argv.ts
git commit -m "$(cat <<'EOF'
feat(desktop): extractSpecPath — first existing spec-shaped file in argv

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire main.ts (single-instance, open-file buffer, argv probe, IPC)

**Files:**
- Modify: `apps/desktop/electron/main.ts`
- Modify: `apps/desktop/electron/ipc.ts`

- [ ] **Step 1: Add new IPC handlers in `ipc.ts`**

Add at the bottom (after the existing exports), and modify `handlePickOpen` + `handleOpenByPath` to record + trigger menu rebuild via a callback the main process injects. To keep ipc.ts free of `Menu` knowledge, accept an optional `onRecentsChanged` callback in `registerIpc`.

Modify `registerIpc` signature:

```ts
import { recordRecent, listRecents } from './recents';

export interface RegisterIpcOpts {
  getWin: () => BrowserWindow | null;
  onRecentsChanged?: () => void | Promise<void>;
}

export function registerIpc(opts: RegisterIpcOpts) {
  const { getWin, onRecentsChanged } = opts;
  ipcMain.handle('zwaggen:http', (_e, payload) => handleHttp(payload));
  ipcMain.handle('zwaggen:pickOpen', async () => {
    const r = await handlePickOpen(getWin);
    if (r) { await recordRecent(r.handle); await onRecentsChanged?.(); }
    return r;
  });
  ipcMain.handle('zwaggen:pickSave', (_e, suggested) => handlePickSave(getWin, suggested));
  ipcMain.handle('zwaggen:readFile', (_e, handle) => handleReadFile(handle));
  ipcMain.handle('zwaggen:writeFile', (_e, handle, text) => handleWriteFile(handle, text));
  ipcMain.handle('zwaggen:openByPath', async (_e, path) => {
    const r = await handleOpenByPath(path);
    if (r) { await recordRecent(r.handle); await onRecentsChanged?.(); }
    return r;
  });
  ipcMain.handle('zwaggen:recents:list', () => listRecents());
  ipcMain.handle('zwaggen:recents:record', async (_e, p: unknown) => {
    if (typeof p !== 'string') throw new Error('invalid path');
    await recordRecent(p);
    await onRecentsChanged?.();
  });
  ipcMain.handle('zwaggen:recents:clear', async () => {
    const { clearRecents } = await import('./recents');
    await clearRecents();
    await onRecentsChanged?.();
  });
}
```

(Update existing call site in `main.ts` to pass the new opts shape — Step 3 below.)

- [ ] **Step 2: Update `main.ts` for single-instance + open-file + argv + initial path**

Replace the existing `app.whenReady().then(...)` and `createWindow()` block:

```ts
import { extractSpecPath } from './argv';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

let pendingOpenPath: string | null = null;

// macOS: 'open-file' may fire before whenReady. Buffer it.
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

async function rebuildMenu() {
  Menu.setApplicationMenu(await buildMenu(() => mainWindow));
}

app.whenReady().then(async () => {
  registerIpc({ getWin: () => mainWindow, onRecentsChanged: rebuildMenu });
  await rebuildMenu();
  const initial = pendingOpenPath ?? extractSpecPath(process.argv);
  pendingOpenPath = null;
  createWindow(initial);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
  });
});
```

Update `createWindow` to take the initial path and pass it as a query param:

```ts
function createWindow(initialPath: string | null) {
  mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { /* unchanged */ },
  });

  if (!isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      responseHeaders['Content-Security-Policy'] = [STRICT_CSP];
      callback({ responseHeaders });
    });
  }

  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    const base = process.env.ZWAGGEN_DEV_URL!;
    const url = initialPath ? `${base}/?specPath=${encodeURIComponent(initialPath)}` : base;
    void mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(resolveRendererIndex(), {
      search: initialPath ? `specPath=${encodeURIComponent(initialPath)}` : undefined,
    });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}
```

- [ ] **Step 3: Update `menu.ts` to be async + populate Open Recent**

Open `apps/desktop/electron/menu.ts`. Update its signature (it returns `Promise<Menu>` now) and rebuild as in the spec.

```ts
import { Menu, BrowserWindow } from 'electron';
import { basename } from 'node:path';
import { listRecents, clearRecents } from './recents';

export async function buildMenu(getMainWindow: () => BrowserWindow | null): Promise<Menu> {
  const isMac = process.platform === 'darwin';
  const send = (channel: string) => {
    const w = getMainWindow();
    if (w) w.webContents.send('zwaggen:menu', channel);
  };

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
  recentsItems.push({
    label: 'Clear Recents',
    enabled: recents.length > 0,
    click: async () => {
      await clearRecents();
      Menu.setApplicationMenu(await buildMenu(getMainWindow));
    },
  });

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { label: 'Open Recent', submenu: recentsItems },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
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

- [ ] **Step 4: Verify build + slice 1 e2e**

```bash
pnpm --filter @zwaggen/desktop build
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop e2e
```

Expected: build clean; slice 1 e2e green (it doesn't pass a path arg, so `initial` is null and behaviour is unchanged).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/main.ts apps/desktop/electron/ipc.ts apps/desktop/electron/menu.ts
git commit -m "$(cat <<'EOF'
feat(desktop): single-instance lock + open-file buffering + recents IPC

Main now buffers macOS open-file events, parses argv on launch, and
single-instance-locks so a second double-click focuses the running
window. New IPC channels for recents (list/record/clear) plus auto-
record inside pickOpen/openByPath. File menu gains Open Recent submenu.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Bridge + bootstrap changes (renderer side)

**Files:**
- Modify: `apps/desktop/electron/preload.ts`
- Modify: `apps/web/src/types/zwaggen-bridge.ts`
- Modify: `apps/web/src/bootstrap.ts`
- Modify: `apps/web/tests/bootstrap.test.ts`

- [ ] **Step 1: Extend the preload bridge**

```ts
// apps/desktop/electron/preload.ts (after the existing methods)
recentsList: () => ipcRenderer.invoke('zwaggen:recents:list'),
recentsRecord: (path: string) => ipcRenderer.invoke('zwaggen:recents:record', path),
recentsClear: () => ipcRenderer.invoke('zwaggen:recents:clear'),
onOpenFile: (cb: (payload: { path: string }) => void) => {
  ipcRenderer.on('zwaggen:open-file', (_e, payload) => cb(payload));
},
```

- [ ] **Step 2: Extend the bridge type**

```ts
// apps/web/src/types/zwaggen-bridge.ts
recentsList(): Promise<{ path: string; openedAt: number }[]>;
recentsRecord(path: string): Promise<void>;
recentsClear(): Promise<void>;
onOpenFile(cb: (payload: { path: string }) => void): void;
```

- [ ] **Step 3: Update `bootstrap.ts`**

```ts
// apps/web/src/bootstrap.ts
import { setTransport, type Transport, fromJSON } from '@zwaggen/core';
import { getStorage, setStorage, type SpecStorage } from './storage/spec-storage';
import { useSpecStore } from './state/store';
import type { ZwaggenBridge } from './types/zwaggen-bridge';

export function configureFromBridge(bridge: ZwaggenBridge): void {
  const transport: Transport = (req) => bridge.sendHttpRequest(req);
  setTransport(transport);

  const browserDefault = getStorage();
  const storage: SpecStorage = {
    ...browserDefault,
    supportsNativePicker: () => true,
    pickOpen: () => bridge.pickOpen(),
    pickSave: (suggestedName?: string) => bridge.pickSave(suggestedName),
    readFile: (handle) => bridge.readFile(handle as string),
    writeFile: (handle, text) => bridge.writeFile(handle as string, text),
    openByPath: (path) => bridge.openByPath(path),
    listRecent: async () => {
      const entries = await bridge.recentsList();
      return entries.map((e) => {
        const name = e.path.split('/').pop() ?? e.path;
        return { name, openedAt: e.openedAt, handle: e.path };
      });
    },
    recordRecent: async (entry) => {
      if (typeof entry.handle === 'string') await bridge.recentsRecord(entry.handle);
    },
  };
  setStorage(storage);

  bridge.onOpenFile(async ({ path }) => {
    const opened = await bridge.openByPath(path);
    if (!opened) return;
    try {
      const parsed = fromJSON(JSON.parse(opened.text));
      await useSpecStore.getState().replaceSpec(parsed, opened.handle);
    } catch (err) {
      console.error('Failed to open file from menu:', err);
    }
  });
}
```

(Removed the dynamic-import gymnastics — eager imports are simpler. `apps/web` already builds them all into the same bundle anyway.)

- [ ] **Step 4: Extend `bootstrap.test.ts`**

Append two tests after the existing ones:

```ts
test('configureFromBridge routes recents through the bridge', async () => {
  const recordCalls: string[] = [];
  const bridge: ZwaggenBridge = {
    sendHttpRequest: async () => ({ ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' }),
    pickOpen: async () => null,
    pickSave: async () => null,
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => {},
    openByPath: async () => null,
    recentsList: async () => [{ path: '/x.zwag', openedAt: 5 }],
    recentsRecord: async (p) => { recordCalls.push(p); },
    recentsClear: async () => {},
    onOpenFile: () => {},
  };
  configureFromBridge(bridge);
  const s = getStorage();
  expect(await s.listRecent()).toEqual([{ name: 'x.zwag', openedAt: 5, handle: '/x.zwag' }]);
  await s.recordRecent({ name: 'whatever', handle: '/y.zwag' });
  expect(recordCalls).toEqual(['/y.zwag']);
});

test('configureFromBridge subscribes to onOpenFile and replaceSpec routes through it', async () => {
  let registered: ((p: { path: string }) => void) | null = null;
  const bridge: ZwaggenBridge = {
    sendHttpRequest: async () => ({ ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' }),
    pickOpen: async () => null,
    pickSave: async () => null,
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => {},
    openByPath: async (p) => ({ handle: p, name: p, text: JSON.stringify({ schemaVersion: 4, info: { name: 'X' }, auth: { type: 'none' }, useProxyDefault: false, environments: { default: { variables: [] } }, activeEnvironment: 'default', types: {}, endpoints: [] }) }),
    recentsList: async () => [],
    recentsRecord: async () => {},
    recentsClear: async () => {},
    onOpenFile: (cb) => { registered = cb; },
  };
  configureFromBridge(bridge);
  expect(typeof registered).toBe('function');
  // Drive the open-file event the way the IPC layer would
  await registered!({ path: '/z.zwag' });
  // Allow the async pipeline to settle
  await new Promise((r) => setTimeout(r, 0));
  // The store should now hold the spec we returned from openByPath
  const { useSpecStore } = await import('../src/state/store');
  expect(useSpecStore.getState().spec.info.name).toBe('X');
});
```

(The second test depends on `useSpecStore` being importable from a test; it already is — see existing tests.)

- [ ] **Step 5: Run tests**

```bash
pnpm --filter web test -- bootstrap.test.ts
pnpm --filter web test
pnpm --filter web lint
```

Expected: all green (existing 311 + 2 new bootstrap tests = 313).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/preload.ts apps/web/src/types/zwaggen-bridge.ts apps/web/src/bootstrap.ts apps/web/tests/bootstrap.test.ts
git commit -m "$(cat <<'EOF'
feat(web,desktop): bridge recents + onOpenFile; bootstrap routes them

Renderer's storage listRecent/recordRecent now go through IPC to the
desktop's on-disk recents store. Bootstrap subscribes to open-file IPC
events (file-association double-clicks, Open Recent menu clicks) and
loads the spec via the existing openByPath + replaceSpec flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: electron-builder fileAssociations

**Files:**
- Modify: `apps/desktop/electron-builder.yml`

- [ ] **Step 1: Add `fileAssociations` block**

After the `extraResources` block, insert:

```yaml
fileAssociations:
  - ext: zwag
    name: Zwaggen Spec
    description: Zwaggen API specification
    role: Editor
    icon: build/icon.icns        # mac uses .icns; electron-builder maps win/linux automatically
    mimeType: application/x-zwaggen-spec
```

- [ ] **Step 2: Extend `builder-config.test.ts`**

Append:

```ts
test('electron-builder.yml registers .zwag file association', () => {
  const cfg = parse(readFileSync(cfgPath, 'utf8'));
  expect(cfg.fileAssociations).toEqual([
    {
      ext: 'zwag',
      name: 'Zwaggen Spec',
      description: 'Zwaggen API specification',
      role: 'Editor',
      icon: 'build/icon.icns',
      mimeType: 'application/x-zwaggen-spec',
    },
  ]);
});
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @zwaggen/desktop test
```

Expected: all green (slice 1 + slice 2 + recents + argv + builder-config + new fileAssociations test).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron-builder.yml apps/desktop/electron/__tests__/builder-config.test.ts
git commit -m "$(cat <<'EOF'
feat(desktop): register .zwag file association in electron-builder.yml

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Tick TODO + move spec/plan + update README

**Files:**
- Modify: `docs/TODO.md`
- Modify: `apps/desktop/README.md`
- Move: spec + plan from `active/` to `done/`

- [ ] **Step 1: Update README**

Append after the Package section:

```markdown
## File association + Recents

`.zwag` files double-click to open in Zwaggen after install:
- macOS: appears in Finder's Open With submenu after first install.
- Windows: NSIS installer registers the extension.
- Linux: AppImage's bundled `.desktop` declares `MimeType=application/x-zwaggen-spec`. Some desktops require `xdg-mime default Zwaggen.desktop application/x-zwaggen-spec` after first run.

The File → Open Recent submenu is populated from `<userData>/recents.json` (capped at 10, deduped by absolute path). Recent items are also pushed to the OS's native recent-docs surface (macOS dock right-click, Windows jump list).

Single-instance lock: a second double-click while the app is running focuses the existing window and opens the new file there (no second window).
```

- [ ] **Step 2: Tick TODO**

Find:
```
- [ ] Zwaggen Desktop slice 3 — `.zwag` file association + Recents UI (File → Open Recent).
```

Replace:
```
- [x] Zwaggen Desktop slice 3 — `.zwag` file association + Recents UI; single-instance lock; on-disk recents at <userData>/recents.json. See `docs/plans/done/2026-04-23-desktop-recents-and-fileassoc.md`.
```

Update "Last updated" stamp.

- [ ] **Step 3: Move spec + plan**

```bash
git mv docs/specs/active/2026-04-23-desktop-recents-and-fileassoc.md docs/specs/done/
git mv docs/plans/active/2026-04-23-desktop-recents-and-fileassoc.md docs/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md apps/desktop/README.md
git commit -m "$(cat <<'EOF'
docs: ship desktop slice 3 (file assoc + recents) — move spec+plan to done

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 6 tasks ticked.
- `pnpm --filter @zwaggen/desktop test` green (slice 1 + 2 + new recents/argv/fileAssociations tests).
- `pnpm --filter web test` green (slice 1 + 2 + new bootstrap tests).
- `pnpm --filter @zwaggen/desktop e2e` green (no behaviour change for the no-arg launch path).
- `pnpm --filter @zwaggen/desktop run pack` succeeds; the resulting `.app` has the file association declared.
- Branch `plan/desktop-recents-and-fileassoc` ready to push (PR base = `plan/desktop-packaging`).
