import { app, BrowserWindow, Menu, session, shell } from 'electron';
import path from 'node:path';
import { STRICT_CSP } from './csp';
import { buildMenu } from './menu';
import { registerIpc } from './ipc';
import { extractSpecPath } from './argv';

const isDev = !!process.env.ZWAGGEN_DEV_URL;
// Hostnames the renderer is allowed to send the user to via shell.openExternal.
// Compared by exact hostname (NOT prefix) so e.g. github.com.attacker.example is rejected.
const ALLOWED_EXTERNAL_HOSTS = new Set(['docs.zwaggen.com', 'play.zwaggen.com', 'github.com']);

function isAllowedExternal(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return u.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

let mainWindow: BrowserWindow | null = null;
let pendingOpenPath: string | null = null;

// Single-instance lock — a second double-click while the app is running
// quits the new instance and routes the file path through `second-instance`
// to the existing window instead of opening a duplicate.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }

// macOS: Finder's "open with" can fire `open-file` BEFORE app is ready.
// Buffer the path until whenReady, then either send it to the renderer
// (if a window already exists) or use it as the initial spec.
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

function resolveRendererIndex(): string {
  if (app.isPackaged) {
    // electron-builder.yml extraResources places apps/web/dist at <Resources>/web/
    return path.join(process.resourcesPath, 'web', 'index.html');
  }
  // Unpacked dev/start: walk from apps/desktop/dist/ to apps/web/dist/
  return path.join(__dirname, '..', '..', 'web', 'dist', 'index.html');
}

function createWindow(initialPath: string | null) {
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

  // Lockdown navigation — never let the renderer load arbitrary URLs in-window.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) {
      void shell.openExternal(url);
    }
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

async function rebuildMenu() {
  Menu.setApplicationMenu(await buildMenu(() => mainWindow));
}

app.whenReady().then(async () => {
  registerIpc({ getWin: () => mainWindow, onRecentsChanged: rebuildMenu });
  await rebuildMenu();
  // Prefer a path buffered by `open-file` over `process.argv` (macOS path).
  // On Windows / Linux, double-clicked files arrive as `process.argv` entries.
  const initial = pendingOpenPath ?? extractSpecPath(process.argv);
  pendingOpenPath = null;
  createWindow(initial);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(null);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
