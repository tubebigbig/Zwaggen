import { setTransport, type Transport, fromJSON } from '@zwaggen/core';
import { getStorage, setStorage, type SpecStorage } from './storage/spec-storage';
import { useSpecStore } from './state/store';
import type { ZwaggenBridge } from './types/zwaggen-bridge';

/**
 * Wire `window.zwaggen` (the Electron preload bridge) into core's transport
 * singleton and the apps/web storage layer. Drafts intentionally stay on the
 * browser default (Chromium inside Electron supports IndexedDB) — only file
 * I/O + the recents store route through native dialogs / Node fs.
 *
 * Call once, before any other setStorage call. The `getStorage()` snapshot
 * below captures whatever impl is active at call time; a later setStorage
 * would not feed back into this spread.
 *
 * Subscribes to the `zwaggen:open-file` IPC channel so that Finder/Explorer
 * double-clicks AND Open Recent menu clicks both flow through `replaceSpec`.
 */
export function configureFromBridge(bridge: ZwaggenBridge): void {
  // FormData is NOT structured-cloneable across Electron IPC, so we serialize
  // it to a flat [name, value][] before invoking the bridge. The main process
  // reconstructs FormData from `multipartFields` before calling fetch.
  // v1 is text-fields-only; file uploads land in Body UX v1.1.
  const transport: Transport = (req) => {
    if (req.bodyMultipart) {
      const fields: [string, string][] = [];
      req.bodyMultipart.forEach((value, name) => {
        if (typeof value === 'string') fields.push([name, value]);
      });
      return bridge.sendHttpRequest({
        method: req.method,
        url: req.url,
        headers: req.headers,
        multipartFields: fields,
      });
    }
    return bridge.sendHttpRequest({
      method: req.method,
      url: req.url,
      headers: req.headers,
      bodyText: req.bodyText,
    });
  };
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
        // basename without depending on a Node module — `/` and `\\` cover both
        // POSIX and Windows paths the main process might forward.
        const name = e.path.split(/[\\/]/).pop() ?? e.path;
        return { name, openedAt: e.openedAt, handle: e.path };
      });
    },
    recordRecent: async (entry) => {
      if (typeof entry.handle === 'string') await bridge.recentsRecord(entry.handle);
    },
  };
  setStorage(storage);

  // Bootstrap runs once per process — discard the unsubscribe; the listener
  // lives for the app's lifetime.
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
