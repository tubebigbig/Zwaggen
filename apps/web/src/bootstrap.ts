import { setTransport, type Transport, fromJSON } from '@zwaggen/core';
import { getStorage, setStorage, type SpecStorage } from './storage/spec-storage';
import { useSpecStore } from './state/store';
import type { MultipartField, ZwaggenBridge } from './types/zwaggen-bridge';

/**
 * Per-file IPC ceiling for multipart uploads (v1.1). Mirrors the desktop
 * main-process cap (`MULTIPART_FILE_LIMIT_BYTES` in
 * `apps/desktop/electron/ipc.ts`). Throws here so the user sees a typed error
 * before the renderer pays for serializing the bytes across IPC.
 */
export const MULTIPART_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
/**
 * Total payload ceiling across all file fields in one IPC call.
 */
export const MULTIPART_TOTAL_LIMIT_BYTES = 100 * 1024 * 1024;

async function buildMultipartFields(fd: FormData): Promise<MultipartField[]> {
  const out: MultipartField[] = [];
  let total = 0;
  // Use Array.from(fd.entries()) so we can `await` between iterations under
  // strict TS settings without complaining about `for..of` of an iterator.
  for (const [k, v] of Array.from(fd.entries())) {
    if (typeof v === 'string') {
      out.push([k, v]);
    } else {
      const bytes = new Uint8Array(await v.arrayBuffer());
      if (bytes.byteLength > MULTIPART_FILE_LIMIT_BYTES) {
        const fileName = v instanceof File ? v.name : k;
        throw new Error(
          `File "${fileName}" is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB; max 50MB in v1.1.`,
        );
      }
      total += bytes.byteLength;
      if (total > MULTIPART_TOTAL_LIMIT_BYTES) {
        throw new Error(
          `Total multipart payload too large: ${(total / 1024 / 1024).toFixed(1)}MB. Max 100MB in v1.1.`,
        );
      }
      const name = v instanceof File ? v.name : k;
      const type = v.type || 'application/octet-stream';
      out.push([k, { kind: 'file', name, type, bytes }]);
    }
  }
  return out;
}

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
  // it to a flat MultipartField[] before invoking the bridge. The main
  // process reconstructs FormData from `multipartFields` before calling
  // fetch. File entries are read via arrayBuffer() and shipped as
  // Uint8Array; per-file 50MB and total 100MB caps throw before invoking IPC.
  const transport: Transport = async (req) => {
    if (req.bodyMultipart) {
      const fields = await buildMultipartFields(req.bodyMultipart);
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
