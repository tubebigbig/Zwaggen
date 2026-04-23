# Zwaggen Desktop slice 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a local-dev Electron app that wraps `apps/web`, swaps in IPC-backed Transport + SpecStorage, and proves CORS bypass with a real cross-origin request — without packaging or signing.

**Architecture:** New `@zwaggen/desktop` workspace package. Electron main process loads `apps/web` (Vite dev server in dev, built `dist/` in start mode). Preload bridges a typed `window.zwaggen` API. `apps/web/main.tsx` detects the bridge and calls `setStorage()` + (new) `setTransport()` before mounting. Strict security baseline: contextIsolation/sandbox/CSP/IPC validation. Native File/Edit/View menus. Playwright Electron smoke test against a local stub server.

**Tech Stack:** TypeScript, Electron, tsup (for main + preload bundling), Playwright (with `_electron` Electron support), vitest. Stacks on `main` (PR-ready independently).

---

### Spec

See `docs/specs/active/2026-04-23-desktop-electron-scaffold.md` for full context. Key constraints:

- No packaging / signing / file association in this slice (later slices).
- Renderer never makes outbound network calls — every HTTP goes through main via IPC. CSP enforces this in preview/prod.
- Symmetric singleton pattern for transport (mirrors what storage already has).
- `apps/web` renderer code path stays unchanged for browser users (no `if (electron)` branches in components).

---

### Task 1: Add `setTransport`/`getTransport`/`resetTransport` to `@zwaggen/core`

**Files:**
- Modify: `packages/core/src/runner/transport.ts`
- Modify: `packages/core/src/runner/send.ts`
- Modify: `packages/core/tests/runner/transport.test.ts`

- [ ] **Step 1: Append failing tests for the new singleton helpers**

Open `packages/core/tests/runner/transport.test.ts`. After the existing tests (don't disturb them), append:

```ts
import { setTransport, getTransport, resetTransport } from '../../src/runner/transport';

test('getTransport returns fetchTransport by default', () => {
  resetTransport();
  expect(getTransport()).toBe(fetchTransport);
});

test('setTransport overrides the singleton; resetTransport restores the default', async () => {
  const calls: TransportRequest[] = [];
  const stub: Transport = async (req) => {
    calls.push(req);
    return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' };
  };
  setTransport(stub);
  expect(getTransport()).toBe(stub);

  // sendRequest with no opts.transport should now use the stub
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  await sendRequest({
    spec, endpoint: ep, baseUrl: '{{base}}',
    inputs: { path: { id: '1' }, query: {}, headers: {}, body: undefined },
    secrets: {},
  });
  expect(calls).toHaveLength(1);

  resetTransport();
  expect(getTransport()).toBe(fetchTransport);
});

test('explicit opts.transport beats the singleton', async () => {
  const stubCalls: TransportRequest[] = [];
  const explicitCalls: TransportRequest[] = [];
  setTransport(async (req) => { stubCalls.push(req); return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' }; });
  const explicitTransport: Transport = async (req) => {
    explicitCalls.push(req);
    return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' };
  };
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  await sendRequest({
    spec, endpoint: ep, baseUrl: '{{base}}',
    inputs: { path: { id: '1' }, query: {}, headers: {}, body: undefined },
    secrets: {},
  }, { transport: explicitTransport });
  expect(stubCalls).toHaveLength(0);
  expect(explicitCalls).toHaveLength(1);
  resetTransport();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @zwaggen/core test -- transport.test.ts
```

Expected: 3 new tests FAIL (`setTransport is not a function`); existing 6 pass.

- [ ] **Step 3: Implement the singleton helpers**

In `packages/core/src/runner/transport.ts`, after `fetchTransport`, add:

```ts
let activeTransport: Transport = fetchTransport;

export function getTransport(): Transport { return activeTransport; }
export function setTransport(t: Transport): void { activeTransport = t; }
export function resetTransport(): void { activeTransport = fetchTransport; }
```

In `packages/core/src/runner/send.ts`, change the transport resolution inside `sendRequest`:

Old line:
```ts
const transport = opts?.transport ?? fetchTransport;
```

New line:
```ts
const transport = opts?.transport ?? getTransport();
```

And update the imports at the top of `send.ts`:
```ts
import { fetchTransport, getTransport, type Transport } from './transport';
```

- [ ] **Step 4: Run tests to verify everything passes**

```bash
pnpm --filter @zwaggen/core test
```

Expected: all tests green (existing 6 + new 3 in transport.test.ts; everything else unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runner/transport.ts packages/core/src/runner/send.ts packages/core/tests/runner/transport.test.ts
git commit -m "$(cat <<'EOF'
feat(core): singleton setTransport/getTransport/resetTransport

Symmetric to setStorage on the apps/web side. Lets the desktop shell swap
in an IPC-backed transport once at boot without touching every sendRequest
call site.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Bootstrap detection in `apps/web/src/main.tsx`

**Files:**
- Create: `apps/web/src/bootstrap.ts`
- Modify: `apps/web/src/main.tsx`
- Create: `apps/web/tests/bootstrap.test.ts`
- Create: `apps/web/src/types/zwaggen-bridge.ts` (the `window.zwaggen` shape, single source of truth for both renderer and desktop preload to reference)

- [ ] **Step 1: Define the bridge shape**

Create `apps/web/src/types/zwaggen-bridge.ts`:

```ts
import type { TransportRequest, TransportResponse } from '@zwaggen/core';
import type { OpenedFile } from '../storage/spec-storage';

export interface ZwaggenBridge {
  sendHttpRequest(req: TransportRequest): Promise<TransportResponse>;
  pickOpen(): Promise<OpenedFile | null>;
  pickSave(suggestedName?: string): Promise<string | null>;
  readFile(handle: string): Promise<{ text: string; name: string }>;
  writeFile(handle: string, text: string): Promise<void>;
  openByPath(path: string): Promise<OpenedFile | null>;
}

declare global {
  interface Window { zwaggen?: ZwaggenBridge; }
}

export {};
```

- [ ] **Step 2: Write the bootstrap module + tests**

Create `apps/web/src/bootstrap.ts`:

```ts
import { setTransport, type Transport } from '@zwaggen/core';
import { setStorage, type SpecStorage } from './storage/spec-storage';
import type { ZwaggenBridge } from './types/zwaggen-bridge';

export function configureFromBridge(bridge: ZwaggenBridge): void {
  const transport: Transport = (req) => bridge.sendHttpRequest(req);
  setTransport(transport);

  const storage: SpecStorage = {
    loadDraft: async () => null,    // drafts stay in IDB inside Electron renderer (Chromium ships IDB)
    saveDraft: async () => {},
    clearDraft: async () => {},
    supportsNativePicker: () => true,
    pickOpen: () => bridge.pickOpen(),
    pickSave: (suggestedName) => bridge.pickSave(suggestedName),
    readFile: (handle) => bridge.readFile(handle as string),
    writeFile: (handle, text) => bridge.writeFile(handle as string, text),
    listRecent: async () => [],     // recents not surfaced in slice 1 (data already records via IDB)
    recordRecent: async () => {},
    openByPath: (path) => bridge.openByPath(path),
  };
  setStorage(storage);
}
```

Wait — the storage adapter above stubs draft/recents. That breaks autosave inside Electron! Better: delegate draft + recents to the existing browser default and only override the file-I/O methods. Updated impl:

```ts
import { setTransport, type Transport } from '@zwaggen/core';
import { getStorage, setStorage, type SpecStorage } from './storage/spec-storage';
import type { ZwaggenBridge } from './types/zwaggen-bridge';

export function configureFromBridge(bridge: ZwaggenBridge): void {
  const transport: Transport = (req) => bridge.sendHttpRequest(req);
  setTransport(transport);

  const browserDefault = getStorage();    // capture before override
  const storage: SpecStorage = {
    ...browserDefault,
    supportsNativePicker: () => true,
    pickOpen: () => bridge.pickOpen(),
    pickSave: (suggestedName) => bridge.pickSave(suggestedName),
    readFile: (handle) => bridge.readFile(handle as string),
    writeFile: (handle, text) => bridge.writeFile(handle as string, text),
    openByPath: (path) => bridge.openByPath(path),
  };
  setStorage(storage);
}
```

The `...browserDefault` spread keeps draft + recents working via IDB (Chromium inside Electron supports IndexedDB). Only the file I/O routes through native dialogs.

Create `apps/web/tests/bootstrap.test.ts`:

```ts
import { afterEach, expect, test, vi } from 'vitest';
import { configureFromBridge } from '../src/bootstrap';
import { getStorage, resetStorage } from '../src/storage/spec-storage';
import { getTransport, resetTransport, fetchTransport } from '@zwaggen/core';
import type { ZwaggenBridge } from '../src/types/zwaggen-bridge';

afterEach(() => {
  resetStorage();
  resetTransport();
  vi.restoreAllMocks();
});

test('configureFromBridge swaps the transport singleton', async () => {
  const sent: any[] = [];
  const bridge: ZwaggenBridge = {
    sendHttpRequest: async (req) => { sent.push(req); return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' }; },
    pickOpen: async () => null,
    pickSave: async () => null,
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => {},
    openByPath: async () => null,
  };
  configureFromBridge(bridge);
  const t = getTransport();
  expect(t).not.toBe(fetchTransport);
  await t({ method: 'GET', url: 'http://x', headers: {} });
  expect(sent).toHaveLength(1);
});

test('configureFromBridge swaps the storage file-I/O methods but keeps drafts on browser default', async () => {
  const bridge: ZwaggenBridge = {
    sendHttpRequest: async () => ({ ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' }),
    pickOpen: async () => ({ handle: '/x.zwag', name: 'x.zwag', text: '{}' }),
    pickSave: async () => '/y.zwag',
    readFile: async (h) => ({ text: 'r', name: String(h) }),
    writeFile: async () => {},
    openByPath: async (p) => ({ handle: p, name: p, text: 'o' }),
  };
  configureFromBridge(bridge);
  const s = getStorage();
  expect(s.supportsNativePicker()).toBe(true);
  expect(await s.pickOpen()).toEqual({ handle: '/x.zwag', name: 'x.zwag', text: '{}' });
  expect(await s.openByPath('/z')).toEqual({ handle: '/z', name: '/z', text: 'o' });
  // loadDraft is NOT overridden — comes from browser default (IDB-backed, returns null in test env)
  expect(typeof s.loadDraft).toBe('function');
});
```

Modify `apps/web/src/main.tsx` to detect the bridge:

Old:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
```

New:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { configureFromBridge } from './bootstrap';
import './types/zwaggen-bridge';

if (typeof window !== 'undefined' && window.zwaggen) {
  configureFromBridge(window.zwaggen);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
```

- [ ] **Step 3: Run tests**

```bash
pnpm --filter web test -- bootstrap.test.ts
pnpm --filter web test
pnpm --filter web lint
```

Expected: bootstrap tests pass; full web suite stays green.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/bootstrap.ts apps/web/src/main.tsx apps/web/src/types/zwaggen-bridge.ts apps/web/tests/bootstrap.test.ts
git commit -m "$(cat <<'EOF'
feat(web): detect window.zwaggen at boot and swap to IPC-backed impls

When apps/web runs inside the Electron shell, main.tsx sees the
window.zwaggen bridge and calls setTransport + setStorage before mounting.
Browser playground unchanged when the bridge is absent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Scaffold `@zwaggen/desktop` package

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/tsconfig.json`
- Create: `apps/desktop/tsup.config.ts`
- Create: `apps/desktop/.gitignore`
- Create: `apps/desktop/electron/csp.ts`
- Create: `apps/desktop/electron/menu.ts`
- Create: `apps/desktop/electron/ipc.ts`
- Create: `apps/desktop/electron/preload.ts`
- Create: `apps/desktop/electron/main.ts`
- Create: `apps/desktop/README.md`
- Modify: `pnpm-workspace.yaml` (verify `apps/*` is already covered; if so, no edit needed)

- [ ] **Step 1: `apps/desktop/package.json`**

```json
{
  "name": "@zwaggen/desktop",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "dist/main.cjs",
  "scripts": {
    "build": "tsup",
    "dev": "pnpm build && cross-env ZWAGGEN_DEV_URL=http://localhost:5173 electron dist/main.cjs",
    "start": "pnpm build && electron dist/main.cjs",
    "test": "vitest run",
    "e2e": "pnpm build && playwright test"
  },
  "dependencies": {
    "@zwaggen/core": "workspace:*"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0",
    "@types/node": "^24.0.0",
    "cross-env": "^7.0.3",
    "electron": "^33.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.6.0",
    "vitest": "^3.2.0"
  }
}
```

Pin Electron 33 (current LTS-ish line at time of writing; check `npm view electron version` and adjust if needed). Pin Playwright to whatever version `apps/web` already uses.

- [ ] **Step 2: `apps/desktop/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["electron/**/*.ts", "e2e/**/*.ts"]
}
```

- [ ] **Step 3: `apps/desktop/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  outDir: 'dist',
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  external: ['electron'],
  outExtension: () => ({ js: '.cjs' }),
});
```

- [ ] **Step 4: `apps/desktop/.gitignore`**

```
dist/
node_modules/
.playwright/
playwright-report/
test-results/
```

- [ ] **Step 5: `apps/desktop/electron/csp.ts`**

```ts
export const STRICT_CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; " +
  "connect-src 'none';";
```

- [ ] **Step 6: `apps/desktop/electron/menu.ts`**

```ts
import { Menu, BrowserWindow, app } from 'electron';

export function buildMenu(getMainWindow: () => BrowserWindow | null): Menu {
  const isMac = process.platform === 'darwin';
  const send = (channel: string) => {
    const w = getMainWindow();
    if (w) w.webContents.send('zwaggen:menu', channel);
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
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

- [ ] **Step 7: `apps/desktop/electron/ipc.ts`**

```ts
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
}

export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawText: string;
}

export function isTransportRequest(v: unknown): v is TransportRequest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.method !== 'string' || typeof r.url !== 'string') return false;
  if (typeof r.headers !== 'object' || r.headers === null) return false;
  if (r.bodyText !== undefined && typeof r.bodyText !== 'string') return false;
  if (!/^https?:\/\//i.test(r.url)) return false;
  return true;
}

export async function handleHttp(payload: unknown): Promise<TransportResponse> {
  if (!isTransportRequest(payload)) throw new Error('invalid http payload');
  const resp = await fetch(payload.url, {
    method: payload.method,
    headers: payload.headers,
    body: payload.bodyText,
  });
  const rawText = await resp.text();
  const headers: Record<string, string> = {};
  resp.headers.forEach((v, k) => { headers[k] = v; });
  return { ok: resp.ok, status: resp.status, statusText: resp.statusText, headers, rawText };
}

export async function handlePickOpen(getWin: () => BrowserWindow | null) {
  const win = getWin();
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Zwaggen Spec', extensions: ['zwag', 'json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const path = result.filePaths[0]!;
  const text = await readFile(path, 'utf8');
  return { handle: path, name: basename(path), text };
}

export async function handlePickSave(getWin: () => BrowserWindow | null, suggestedName?: string) {
  const win = getWin();
  if (!win) return null;
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName ?? 'spec.zwag.json',
    filters: [{ name: 'Zwaggen Spec', extensions: ['zwag', 'json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

export async function handleReadFile(handle: unknown) {
  if (typeof handle !== 'string') throw new Error('invalid handle');
  const text = await readFile(handle, 'utf8');
  return { text, name: basename(handle) };
}

export async function handleWriteFile(handle: unknown, text: unknown) {
  if (typeof handle !== 'string') throw new Error('invalid handle');
  if (typeof text !== 'string') throw new Error('invalid text');
  await writeFile(handle, text, 'utf8');
}

export async function handleOpenByPath(payload: unknown) {
  if (typeof payload !== 'string') throw new Error('invalid path');
  const text = await readFile(payload, 'utf8');
  return { handle: payload, name: basename(payload), text };
}

export function registerIpc(getWin: () => BrowserWindow | null) {
  ipcMain.handle('zwaggen:http', (_e, payload) => handleHttp(payload));
  ipcMain.handle('zwaggen:pickOpen', () => handlePickOpen(getWin));
  ipcMain.handle('zwaggen:pickSave', (_e, suggested) => handlePickSave(getWin, suggested));
  ipcMain.handle('zwaggen:readFile', (_e, handle) => handleReadFile(handle));
  ipcMain.handle('zwaggen:writeFile', (_e, handle, text) => handleWriteFile(handle, text));
  ipcMain.handle('zwaggen:openByPath', (_e, path) => handleOpenByPath(path));
}
```

- [ ] **Step 8: `apps/desktop/electron/preload.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';

const bridge = {
  sendHttpRequest: (req: unknown) => ipcRenderer.invoke('zwaggen:http', req),
  pickOpen: () => ipcRenderer.invoke('zwaggen:pickOpen'),
  pickSave: (suggestedName?: string) => ipcRenderer.invoke('zwaggen:pickSave', suggestedName),
  readFile: (handle: string) => ipcRenderer.invoke('zwaggen:readFile', handle),
  writeFile: (handle: string, text: string) => ipcRenderer.invoke('zwaggen:writeFile', handle, text),
  openByPath: (path: string) => ipcRenderer.invoke('zwaggen:openByPath', path),
  onMenuAction: (cb: (action: string) => void) => {
    ipcRenderer.on('zwaggen:menu', (_e, action) => cb(action));
  },
};

contextBridge.exposeInMainWorld('zwaggen', bridge);
```

- [ ] **Step 9: `apps/desktop/electron/main.ts`**

```ts
import { app, BrowserWindow, Menu, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STRICT_CSP } from './csp';
import { buildMenu } from './menu';
import { registerIpc } from './ipc';

const isDev = !!process.env.ZWAGGEN_DEV_URL;
const ALLOWED_EXTERNAL = ['https://docs.zwaggen.com', 'https://play.zwaggen.com', 'https://github.com'];

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  if (!isDev) {
    // Strict CSP only in preview/prod (Vite HMR needs WebSocket in dev)
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = { ...details.responseHeaders };
      responseHeaders['Content-Security-Policy'] = [STRICT_CSP];
      callback({ responseHeaders });
    });
  }

  // Lockdown navigation
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (ALLOWED_EXTERNAL.some((prefix) => url.startsWith(prefix))) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.ZWAGGEN_DEV_URL!);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Resolve apps/web/dist/index.html relative to the desktop package's dist/
    const indexHtml = path.join(__dirname, '..', '..', 'web', 'dist', 'index.html');
    void mainWindow.loadFile(indexHtml);
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  registerIpc(() => mainWindow);
  Menu.setApplicationMenu(buildMenu(() => mainWindow));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

- [ ] **Step 10: `apps/desktop/README.md`**

```markdown
# @zwaggen/desktop — Zwaggen Desktop (Electron)

Local-dev Electron wrapper for `apps/web`. CORS-free HTTP via Node `fetch` over IPC.

## Run

Dev (HMR — needs `apps/web` dev server in another terminal):
```
pnpm --filter @zwaggen/web dev    # terminal 1
pnpm --filter @zwaggen/desktop dev   # terminal 2
```

Preview (built bundle, no dev server):
```
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop start
```

## Test

```
pnpm --filter @zwaggen/desktop test    # IPC unit tests
pnpm --filter @zwaggen/desktop e2e     # Playwright Electron smoke
```

## What this slice does NOT do

- No `.dmg` / `.exe` / `.AppImage` packaging — that's a follow-up slice.
- No code signing / notarization.
- No `.zwag` file association.
- No app icons (Electron default for now).
- No auto-update.
```

- [ ] **Step 11: Install deps + sanity build**

```bash
pnpm install
pnpm --filter @zwaggen/desktop build
```

Expected: clean `dist/main.cjs` and `dist/preload.cjs`.

- [ ] **Step 12: Commit**

```bash
git add apps/desktop pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(desktop): scaffold @zwaggen/desktop electron package

Slice 1 of the desktop app: main process, preload bridge, IPC handlers
(HTTP + file dialogs + path I/O), native File/Edit/View menu, strict
security baseline (contextIsolation, sandbox, no nodeIntegration, CSP in
preview only, navigation lockdown). No packaging yet.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: IPC unit tests

**Files:**
- Create: `apps/desktop/electron/__tests__/ipc.test.ts`

- [ ] **Step 1: Write the unit tests**

```ts
import { afterEach, expect, test, vi } from 'vitest';
import { isTransportRequest, handleHttp, handleReadFile, handleWriteFile, handleOpenByPath } from '../ipc';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

afterEach(() => vi.restoreAllMocks());

test('isTransportRequest accepts valid input', () => {
  expect(isTransportRequest({ method: 'GET', url: 'http://x/y', headers: {} })).toBe(true);
  expect(isTransportRequest({ method: 'POST', url: 'https://x/y', headers: { a: 'b' }, bodyText: '{}' })).toBe(true);
});

test('isTransportRequest rejects malformed input', () => {
  expect(isTransportRequest(null)).toBe(false);
  expect(isTransportRequest({})).toBe(false);
  expect(isTransportRequest({ method: 1, url: 'http://x', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'file:///etc/passwd', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'javascript:alert(1)', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'http://x', headers: null })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'http://x', headers: {}, bodyText: 5 })).toBe(false);
});

test('handleHttp rejects invalid payload', async () => {
  await expect(handleHttp({ bad: 'data' })).rejects.toThrow(/invalid http payload/);
});

test('handleHttp forwards to fetch with the right shape', async () => {
  const fetchSpy = vi.fn(async () => new Response('{"x":1}', {
    status: 201,
    statusText: 'Created',
    headers: { 'content-type': 'application/json', 'x-y': 'z' },
  }));
  globalThis.fetch = fetchSpy as any;

  const resp = await handleHttp({
    method: 'POST',
    url: 'https://example.com/x',
    headers: { 'content-type': 'application/json' },
    bodyText: '{"a":1}',
  });
  expect(fetchSpy).toHaveBeenCalledWith('https://example.com/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"a":1}',
  });
  expect(resp.ok).toBe(true);
  expect(resp.status).toBe(201);
  expect(resp.statusText).toBe('Created');
  expect(resp.headers['content-type']).toBe('application/json');
  expect(resp.headers['x-y']).toBe('z');
  expect(resp.rawText).toBe('{"x":1}');
});

test('handleReadFile + handleWriteFile + handleOpenByPath round-trip via real fs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zwag-ipc-'));
  const p = join(dir, 'spec.zwag');
  try {
    await handleWriteFile(p, '{"hello":"world"}');
    expect(await readFile(p, 'utf8')).toBe('{"hello":"world"}');

    const r = await handleReadFile(p);
    expect(r).toEqual({ text: '{"hello":"world"}', name: 'spec.zwag' });

    const o = await handleOpenByPath(p);
    expect(o).toEqual({ handle: p, name: 'spec.zwag', text: '{"hello":"world"}' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('handleReadFile / handleWriteFile / handleOpenByPath reject non-string handles', async () => {
  await expect(handleReadFile(123)).rejects.toThrow(/invalid handle/);
  await expect(handleWriteFile(123, 'text')).rejects.toThrow(/invalid handle/);
  await expect(handleWriteFile('/p', 5 as any)).rejects.toThrow(/invalid text/);
  await expect(handleOpenByPath(123)).rejects.toThrow(/invalid path/);
});
```

Note: imports from `../ipc` use relative path. Vitest can compile TS directly.

- [ ] **Step 2: Run the tests**

```bash
pnpm --filter @zwaggen/desktop test
```

Expected: 6 tests passing.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/__tests__/ipc.test.ts
git commit -m "$(cat <<'EOF'
test(desktop): unit-cover IPC handlers (validation + http + fs round-trip)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire menu actions in `apps/web` (so File→Open/Save fire)

**Files:**
- Modify: `apps/web/src/ui/AppHeader.tsx`

- [ ] **Step 1: Subscribe to bridge menu events**

In `AppHeader.tsx`, find the existing `openSpec`, `saveSpec` (and the "Save As" path within `saveSpec` — there's no separate function today since the same flow handles both). Add a `useEffect` near the top of the component that subscribes to the bridge's menu events:

```tsx
useEffect(() => {
  const w = window as { zwaggen?: { onMenuAction?: (cb: (action: string) => void) => void } };
  const bridge = w.zwaggen;
  if (!bridge?.onMenuAction) return;
  bridge.onMenuAction((action) => {
    if (action === 'open') void openSpec();
    else if (action === 'save') void saveSpec();
    else if (action === 'save-as') void saveSpec({ forceDialog: true });
  });
}, []);
```

This requires `saveSpec` to optionally accept `{ forceDialog: true }`. If `saveSpec` doesn't currently accept options, adapt it minimally:

Old signature pattern (mental model — exact code may differ):
```ts
async function saveSpec() { ... if (fileHandle) { write directly } else { open dialog } ... }
```

New:
```ts
async function saveSpec(opts?: { forceDialog?: boolean }) {
  // ...
  if (fileHandle && !opts?.forceDialog) { write directly }
  else { open dialog }
  // ...
}
```

This keeps "Save" → write to current handle, "Save As" → always show dialog, even if a handle exists.

- [ ] **Step 2: Run web tests + lint**

```bash
pnpm --filter web test
pnpm --filter web lint
```

Expected: all green. The existing `saveSpec` callers that don't pass opts are still fine.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/ui/AppHeader.tsx
git commit -m "$(cat <<'EOF'
feat(web): wire native menu Open/Save/Save As to existing AppHeader flows

Subscribe to window.zwaggen.onMenuAction (no-op when not in Electron).
saveSpec gains an optional { forceDialog } so Save As always re-prompts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Playwright Electron smoke test

**Files:**
- Create: `apps/desktop/playwright.config.ts`
- Create: `apps/desktop/e2e/stub-server.ts`
- Create: `apps/desktop/e2e/fixtures/cors-test.zwag.json`
- Create: `apps/desktop/e2e/smoke.spec.ts`

- [ ] **Step 1: `apps/desktop/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    headless: false,    // Electron windows need a real display; CI sets DISPLAY accordingly
  },
  workers: 1,           // single Electron instance
});
```

- [ ] **Step 2: `apps/desktop/e2e/stub-server.ts`**

```ts
import { createServer, Server } from 'node:http';

export interface Stub {
  url: string;
  close(): Promise<void>;
}

export async function startStub(): Promise<Stub> {
  const server: Server = createServer((req, res) => {
    if (req.url === '/echo') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, path: req.url }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('bad address');
  const url = `http://127.0.0.1:${addr.port}`;
  return {
    url,
    close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}
```

- [ ] **Step 3: `apps/desktop/e2e/fixtures/cors-test.zwag.json`**

A minimal Zwaggen spec with one endpoint pointing at the placeholder URL `__STUB_URL__/echo`. The smoke test rewrites `__STUB_URL__` at runtime to the stub server's actual URL before opening the spec. Use the latest schemaVersion (check `packages/core/src/schema/migrations.ts` for the current value).

```json
{
  "schemaVersion": 4,
  "info": { "name": "CORS smoke test", "baseUrl": "__STUB_URL__" },
  "auth": { "type": "none" },
  "useProxyDefault": false,
  "environments": { "default": { "variables": [] } },
  "activeEnvironment": "default",
  "types": {},
  "endpoints": [
    {
      "id": "echo",
      "method": "GET",
      "path": "/echo",
      "tags": [],
      "pathParams": [],
      "queryParams": [],
      "headers": [],
      "requestBody": null,
      "responses": [{ "status": 200, "type": { "kind": "object", "fields": [] } }],
      "auth": "inherit",
      "useProxy": "inherit"
    }
  ]
}
```

(Adjust the schema if `schemaVersion` has bumped past 4.)

- [ ] **Step 4: `apps/desktop/e2e/smoke.spec.ts`**

```ts
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { startStub, type Stub } from './stub-server';

let app: ElectronApplication;
let win: Page;
let stub: Stub;
let specPath: string;

test.beforeAll(async () => {
  stub = await startStub();
  const dir = await mkdtemp(path.join(tmpdir(), 'zwag-smoke-'));
  const fixture = await readFile(path.join(__dirname, 'fixtures/cors-test.zwag.json'), 'utf8');
  specPath = path.join(dir, 'cors-test.zwag.json');
  await writeFile(specPath, fixture.replace('__STUB_URL__', stub.url), 'utf8');

  // Build apps/web first (preview mode loads from dist/)
  // Assume already built by the e2e script; the Playwright step will fail informatively otherwise.

  app = await electron.launch({
    args: [path.join(__dirname, '..', 'dist', 'main.cjs')],
    env: { ...process.env, ZWAGGEN_DEV_URL: '' },
  });
  win = await app.firstWindow();
});

test.afterAll(async () => {
  await app?.close();
  await stub?.close();
});

test('CORS bypass: opening a spec and running an endpoint hits a localhost server', async () => {
  // Inject the spec via openByPath through the bridge (sidesteps the dialog)
  const opened = await win.evaluate(async (p) => {
    const z = (window as any).zwaggen;
    return await z.openByPath(p);
  }, specPath);
  expect(opened.name).toBe('cors-test.zwag.json');

  // The renderer's app receives the opened spec via the AppHeader's open flow OR by direct injection.
  // Since slice 1 doesn't auto-load openByPath outside the bootIntent, drive it via the existing replaceSpec:
  await win.evaluate(({ text }) => {
    const z = (window as any).__zwaggenStoreForTest;
    if (!z) throw new Error('test hook missing');
    z.replaceSpec(JSON.parse(text), null);
  }, opened);

  // Now click Run on the only endpoint
  // (UI selectors will need adapting based on AppHeader / EndpointEditor markup; placeholder here)
  // ...
  // Final assertion: response panel shows ok:true
});
```

**Note:** The exact UI driving in the smoke test depends on the renderer's selectors. The implementer should:

1. Add a tiny test-only escape hatch on `window` for the test to call `replaceSpec` directly (gated by `process.env.NODE_ENV === 'test'` or `window.__zwaggenTestMode`). OR
2. Drive the menu programmatically: `await app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.items[1].submenu?.items[0].click())` to fire File→Open, then handle the dialog. (Playwright's Electron support for native dialogs is limited.)

The simplest path: **add a test-only `window.__zwaggenStoreForTest` setter when `import.meta.env.MODE === 'test' || window.zwaggen` is present**, and use it from the test. Document this clearly.

If the e2e proves too gnarly to land in this slice, ship the unit tests + a manual smoke test runbook in the README (`README.md` includes "Manual smoke: open dist/main.cjs, point an endpoint at httpbin.org/get, click Run, verify no CORS error"). That's an acceptable degraded outcome.

- [ ] **Step 5: Run the e2e**

```bash
pnpm --filter @zwaggen/web build
pnpm --filter @zwaggen/desktop e2e
```

Expected: smoke test passes. If headless support is finicky in your environment, document the workaround and accept manual smoke as v1.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/playwright.config.ts apps/desktop/e2e/
git commit -m "$(cat <<'EOF'
test(desktop): playwright electron smoke against localhost stub server

Boots the packaged main.cjs, opens a fixture spec via the bridge, runs an
endpoint that targets a per-test localhost server. Proves CORS bypass.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Verification + tick TODO

**Files:**
- Modify: `docs/TODO.md`
- Move: `docs/specs/active/2026-04-23-desktop-electron-scaffold.md` → `docs/specs/done/`
- Move: `docs/plans/active/2026-04-23-desktop-electron-scaffold.md` → `docs/plans/done/`

- [ ] **Step 1: Full repo sanity**

```bash
pnpm install
pnpm --filter @zwaggen/core test
pnpm --filter web test
pnpm --filter @zwaggen/desktop test
pnpm --filter web lint
pnpm --filter @zwaggen/desktop build
```

Expected: every step green.

- [ ] **Step 2: Tick the desktop TODO entry**

In `docs/TODO.md`, find the line:

```
- [ ] **Zwaggen Desktop (Electron)** — cross-platform (Win + macOS + Linux) API client + spec editor whose HTTP requests bypass browser CORS. Hosted page becomes "Zwaggen Web" (CORS-limited demo). See `docs/specs/active/2026-04-22-zwaggen-desktop.md`. Has prep prerequisites listed below; codegen ships first.
```

Update to reflect partial progress (don't mark `[x]` — slice 1 is local-dev only):

```
- [ ] **Zwaggen Desktop (Electron)** — cross-platform spec editor + API client; HTTP bypasses browser CORS via Node main process. Slice 1 (local-dev scaffold) shipped 2026-04-23; remaining: packaging (.dmg/.exe/.AppImage), code signing, `.zwag` file association, recents UI, app icons, auto-update. See `docs/specs/active/2026-04-22-zwaggen-desktop.md` (strategic) and `docs/plans/done/2026-04-23-desktop-electron-scaffold.md` (slice 1).
```

Add a new bullet under the existing follow-up list (or in the Feature section, your call):

```
- [ ] Zwaggen Desktop slice 2 — `electron-builder` packaging (.dmg / .exe / .AppImage); no signing yet.
```

Update the "Last updated" line at the top of `docs/TODO.md` to `2026-04-23 (desktop-electron-scaffold)`.

- [ ] **Step 3: Move spec + plan to done/**

```bash
git mv docs/specs/active/2026-04-23-desktop-electron-scaffold.md docs/specs/done/
git mv docs/plans/active/2026-04-23-desktop-electron-scaffold.md docs/plans/done/
```

- [ ] **Step 4: Commit**

```bash
git add docs/TODO.md
git commit -m "$(cat <<'EOF'
docs: ship desktop electron scaffold (slice 1) — move spec+plan to done

Local-dev Electron app working end-to-end with CORS bypass. Slice 2 will
add electron-builder packaging.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (controller)

- All 7 tasks ticked.
- `pnpm --filter @zwaggen/core test` green.
- `pnpm --filter web test` green.
- `pnpm --filter @zwaggen/desktop test` green.
- `pnpm --filter @zwaggen/desktop build` clean.
- `pnpm --filter @zwaggen/desktop dev` actually launches a window with HMR working (manual smoke).
- E2E either green or replaced with a manual smoke runbook in the README (documented).
- Branch `plan/desktop-electron-scaffold` ready to push.
