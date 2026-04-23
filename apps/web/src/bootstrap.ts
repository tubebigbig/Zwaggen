import { setTransport, type Transport } from '@zwaggen/core';
import { getStorage, setStorage, type SpecStorage } from './storage/spec-storage';
import type { ZwaggenBridge } from './types/zwaggen-bridge';

/**
 * Wire `window.zwaggen` (the Electron preload bridge) into core's transport
 * singleton and the apps/web storage layer. Drafts + recents intentionally
 * stay on the browser default (Chromium inside Electron supports IndexedDB) —
 * only file I/O routes through native dialogs and Node fs.
 *
 * Call once, before any other setStorage call. The `getStorage()` snapshot
 * below captures whatever impl is active at call time; a later setStorage
 * would not feed back into this spread.
 */
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
  };
  setStorage(storage);
}
