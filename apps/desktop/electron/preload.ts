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
    const handler = (_e: unknown, action: unknown) => cb(String(action));
    ipcRenderer.on('zwaggen:menu', handler);
    return () => { ipcRenderer.removeListener('zwaggen:menu', handler); };
  },
  recentsList: () => ipcRenderer.invoke('zwaggen:recents:list'),
  recentsRecord: (path: string) => ipcRenderer.invoke('zwaggen:recents:record', path),
  // Note: no recentsClear on the bridge — Clear Recents lives in the native
  // File menu and dispatches inside main directly. Add this back if a
  // renderer-side "Clear" UI ever lands.
  onOpenFile: (cb: (payload: { path: string }) => void) => {
    const handler = (_e: unknown, payload: { path: string }) => cb(payload);
    ipcRenderer.on('zwaggen:open-file', handler);
    return () => { ipcRenderer.removeListener('zwaggen:open-file', handler); };
  },
};

contextBridge.exposeInMainWorld('zwaggen', bridge);
