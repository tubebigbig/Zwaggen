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
