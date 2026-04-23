import { contextBridge, ipcRenderer } from 'electron';

/**
 * The single bridge exposed to the renderer as `window.zwaggen`. Mirrors the
 * `ZwaggenBridge` interface defined in `apps/web/src/types/zwaggen-bridge.ts`.
 * Keep this file in lock-step with that type — it's the only contract between
 * processes.
 */
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

// Test-only escape hatch — gated by an env var the main process sets when
// Playwright launches it. Production users never see this flag.
if (process.env.ZWAGGEN_TEST_HOOK === '1') {
  contextBridge.exposeInMainWorld('__ZWAGGEN_TEST_HOOK__', true);
}
