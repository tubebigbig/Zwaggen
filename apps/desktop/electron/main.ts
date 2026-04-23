import { app, BrowserWindow, Menu, session, shell } from 'electron';
import path from 'node:path';
import { STRICT_CSP } from './csp';
import { buildMenu } from './menu';
import { registerIpc } from './ipc';

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

  // Lockdown navigation — never let the renderer load arbitrary URLs in-window.
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternal(url)) {
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
