// Minimal `electron` module stub for unit tests. The IPC handlers under test
// only reference `ipcMain.handle`, `dialog.show*`, and `BrowserWindow` as a
// type — none of which the unit tests actually exercise (they call the
// handler functions directly with mock payloads). The real Electron runtime
// is only needed for e2e and the actual app.

export const ipcMain = {
  handle: (_channel: string, _listener: (...args: unknown[]) => unknown) => {},
};

export const dialog = {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
};

export class BrowserWindow {}

// `recents.ts` imports `app` for `addRecentDocument` / `clearRecentDocuments`
// / `getPath`. Tests that exercise recents either install their own
// `vi.mock('electron', ...)` (overriding this stub for that file) or call
// `__resetForTests(file)` first so `app.getPath` is never reached.
export const app = {
  addRecentDocument: (_path: string) => {},
  clearRecentDocuments: () => {},
  getPath: (_name: string) => '/',
};

// `Menu` is exercised only via menu.ts at module-load time in unit tests.
// The actual menu construction calls `Menu.buildFromTemplate` which we stub
// to return a marker object — sufficient for any test that doesn't assert
// on the menu shape.
export const Menu = {
  buildFromTemplate: (_template: unknown) => ({}),
  setApplicationMenu: (_menu: unknown) => {},
};
