import type { TransportRequest, TransportResponse } from '@zwaggen/core';
import type { OpenedFile } from '../storage/spec-storage';

/**
 * Shape of `window.zwaggen` — the typed bridge exposed by the Electron preload
 * script via `contextBridge.exposeInMainWorld('zwaggen', ...)`. Browser builds
 * leave `window.zwaggen` undefined; the renderer's `bootstrap.ts` only swaps
 * impls when this object is present.
 */
export interface ZwaggenBridge {
  sendHttpRequest(req: TransportRequest): Promise<TransportResponse>;
  pickOpen(): Promise<OpenedFile | null>;
  pickSave(suggestedName?: string): Promise<string | null>;
  readFile(handle: string): Promise<{ text: string; name: string }>;
  writeFile(handle: string, text: string): Promise<void>;
  openByPath(path: string): Promise<OpenedFile | null>;
  /** Optional native menu subscription. Renderer no-ops when absent. */
  onMenuAction?(cb: (action: string) => void): void;
}

declare global {
  interface Window { zwaggen?: ZwaggenBridge }
}

export {};
