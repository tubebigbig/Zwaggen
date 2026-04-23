import type { TransportResponse } from '@zwaggen/core';
import type { OpenedFile } from '../storage/spec-storage';

/**
 * Wire-format payload sent across IPC to `zwaggen:http`. `FormData` isn't
 * structured-cloneable across Electron IPC, so the renderer's bootstrap
 * adapter serializes any `bodyMultipart` to `multipartFields` (a flat
 * `[name, value][]`) before invoking the bridge. The main process
 * reconstructs `FormData` before calling fetch.
 */
export interface BridgeHttpRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
  multipartFields?: [string, string][];
}

/**
 * Shape of `window.zwaggen` — the typed bridge exposed by the Electron preload
 * script via `contextBridge.exposeInMainWorld('zwaggen', ...)`. Browser builds
 * leave `window.zwaggen` undefined; the renderer's `bootstrap.ts` only swaps
 * impls when this object is present.
 */
export interface ZwaggenBridge {
  sendHttpRequest(req: BridgeHttpRequest): Promise<TransportResponse>;
  pickOpen(): Promise<OpenedFile | null>;
  pickSave(suggestedName?: string): Promise<string | null>;
  readFile(handle: string): Promise<{ text: string; name: string }>;
  writeFile(handle: string, text: string): Promise<void>;
  openByPath(path: string): Promise<OpenedFile | null>;
  /** Optional native menu subscription. Renderer no-ops when absent.
   *  Returns an unsubscribe — required so React StrictMode's double-effect
   *  doesn't accumulate handlers. */
  onMenuAction?(cb: (action: string) => void): () => void;
  /** On-disk recents store backed by `<userData>/recents.json` in the main process. */
  recentsList(): Promise<{ path: string; openedAt: number }[]>;
  recentsRecord(path: string): Promise<void>;
  /** Subscribe to file-association double-clicks + Open Recent menu clicks.
   *  Returns an unsubscribe; bootstrap captures and discards (it lives for
   *  the app's lifetime). */
  onOpenFile(cb: (payload: { path: string }) => void): () => void;
}

declare global {
  interface Window { zwaggen?: ZwaggenBridge }
}

export {};
