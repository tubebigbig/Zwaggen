import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { recordRecent, listRecents, clearRecents } from './recents';

export const HTTP_TIMEOUT_MS = 30_000;
// Indirection so tests can override the timeout via `__setHttpTimeoutMs`
// — `AbortSignal.timeout` ignores vitest fake timers, so the test runs on
// real time against a small value instead of the production 30s.
let httpTimeoutMs = HTTP_TIMEOUT_MS;
export function __setHttpTimeoutMsForTests(ms: number): void { httpTimeoutMs = ms; }
export function __resetHttpTimeoutMsForTests(): void { httpTimeoutMs = HTTP_TIMEOUT_MS; }

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',
  '100.100.100.200',
  'metadata.google.internal',
]);

function isBlockedHost(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return true;
    if (host.startsWith('[fd00:ec2:') || host.startsWith('fd00:ec2:')) return true;
    return false;
  } catch {
    return true;   // malformed URL — already covered by other checks, but be safe
  }
}

/**
 * Per-file IPC ceiling for multipart uploads (v1.1). Files larger than this
 * are rejected before `fetch`. Streaming / temp-file uploads land in v1.2.
 */
export const MULTIPART_FILE_LIMIT_BYTES = 50 * 1024 * 1024;
/**
 * Total payload ceiling across all file fields in a single IPC call.
 */
export const MULTIPART_TOTAL_LIMIT_BYTES = 100 * 1024 * 1024;

/**
 * File entry shape used by `multipartFields`. Bytes travel as a `Uint8Array`
 * because `File`/`Blob` aren't structured-cloneable across Electron IPC.
 * Reconstructed into a `File` before being appended to `FormData`.
 */
export interface MultipartFilePayload {
  kind: 'file';
  name: string;
  type: string;
  bytes: Uint8Array;
}

export type MultipartField = [string, string] | [string, MultipartFilePayload];

export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
  /**
   * Multipart form data, serialized as `MultipartField[]` because `FormData`
   * isn't structured-cloneable across Electron IPC. The main process
   * reconstructs a `FormData` before calling `fetch`. Body UX v1.1 supports
   * either a plain string value or a `MultipartFilePayload` for file fields.
   */
  multipartFields?: MultipartField[];
}

export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawText: string;
}

function isFilePayload(v: unknown): v is MultipartFilePayload {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.kind !== 'file') return false;
  if (typeof r.name !== 'string' || typeof r.type !== 'string') return false;
  if (!(r.bytes instanceof Uint8Array)) return false;
  // Per-file cap enforced here so isTransportRequest fails fast — handleHttp
  // also re-checks the total cap before invoking fetch.
  if (r.bytes.byteLength > MULTIPART_FILE_LIMIT_BYTES) return false;
  return true;
}

function isMultipartField(v: unknown): v is MultipartField {
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'string') return false;
  if (typeof v[1] === 'string') return true;
  return isFilePayload(v[1]);
}

/**
 * Validate a payload received over IPC before passing it to `fetch`. Rejects
 * non-string fields, non-object headers, and any URL whose scheme isn't
 * http(s) — preventing a compromised renderer from coercing the main process
 * into reading `file://` or executing `javascript:` URLs.
 */
export function isTransportRequest(v: unknown): v is TransportRequest {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r.method !== 'string' || typeof r.url !== 'string') return false;
  if (typeof r.headers !== 'object' || r.headers === null) return false;
  if (r.bodyText !== undefined && typeof r.bodyText !== 'string') return false;
  if (r.multipartFields !== undefined) {
    if (!Array.isArray(r.multipartFields)) return false;
    for (const item of r.multipartFields) {
      if (!isMultipartField(item)) return false;
    }
  }
  if (!/^https?:\/\//i.test(r.url)) return false;
  if (isBlockedHost(r.url)) return false;
  return true;
}

export async function handleHttp(payload: unknown): Promise<TransportResponse> {
  if (!isTransportRequest(payload)) throw new Error('invalid http payload');
  const init: RequestInit = {
    method: payload.method,
    headers: payload.headers,
    signal: AbortSignal.timeout(httpTimeoutMs),
  };
  if (payload.multipartFields) {
    let totalBytes = 0;
    for (const [, v] of payload.multipartFields) {
      if (typeof v !== 'string') totalBytes += v.bytes.byteLength;
    }
    if (totalBytes > MULTIPART_TOTAL_LIMIT_BYTES) {
      throw new Error(
        `Total multipart payload too large: ${(totalBytes / 1024 / 1024).toFixed(1)}MB. Max ${MULTIPART_TOTAL_LIMIT_BYTES / 1024 / 1024}MB in v1.1.`,
      );
    }
    const fd = new FormData();
    for (const [k, v] of payload.multipartFields) {
      if (typeof v === 'string') {
        fd.append(k, v);
      } else {
        // Wrap bytes in a fresh Uint8Array tied to a plain ArrayBuffer so the
        // File constructor accepts it under both Node and Electron's main-side
        // `undici` Blob implementation.
        const buf = new Uint8Array(v.bytes);
        fd.append(k, new File([buf], v.name, { type: v.type || 'application/octet-stream' }));
      }
    }
    init.body = fd;
  } else if (payload.bodyText !== undefined) {
    init.body = payload.bodyText;
  }
  const resp = await fetch(payload.url, init);
  const rawText = await resp.text();
  const headers: Record<string, string> = {};
  resp.headers.forEach((v, k) => { headers[k] = v; });
  return { ok: resp.ok, status: resp.status, statusText: resp.statusText, headers, rawText };
}

export async function handlePickOpen(getWin: () => BrowserWindow | null) {
  const win = getWin();
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Zwaggen Spec', extensions: ['zwag', 'json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const path = result.filePaths[0]!;
  const text = await readFile(path, 'utf8');
  return { handle: path, name: basename(path), text };
}

export async function handlePickSave(getWin: () => BrowserWindow | null, suggestedName?: string) {
  const win = getWin();
  if (!win) return null;
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName ?? 'spec.zwag.json',
    filters: [{ name: 'Zwaggen Spec', extensions: ['zwag', 'json'] }],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

export async function handleReadFile(handle: unknown) {
  if (typeof handle !== 'string') throw new Error('invalid handle');
  const text = await readFile(handle, 'utf8');
  return { text, name: basename(handle) };
}

export async function handleWriteFile(handle: unknown, text: unknown) {
  if (typeof handle !== 'string') throw new Error('invalid handle');
  if (typeof text !== 'string') throw new Error('invalid text');
  await writeFile(handle, text, 'utf8');
}

export async function handleOpenByPath(payload: unknown) {
  if (typeof payload !== 'string') throw new Error('invalid path');
  const text = await readFile(payload, 'utf8');
  return { handle: payload, name: basename(payload), text };
}

export interface RegisterIpcOpts {
  getWin: () => BrowserWindow | null;
  /** Fires after any operation that mutates the recents store. Main passes
   *  a closure that rebuilds + reapplies the application menu. */
  onRecentsChanged?: () => void | Promise<void>;
}

/** Wire every `zwaggen:*` channel onto `ipcMain`. Called once from main on whenReady. */
export function registerIpc(opts: RegisterIpcOpts) {
  const { getWin, onRecentsChanged } = opts;
  ipcMain.handle('zwaggen:http', (_e, payload) => handleHttp(payload));
  ipcMain.handle('zwaggen:pickOpen', async () => {
    const r = await handlePickOpen(getWin);
    if (r) { await recordRecent(r.handle); await onRecentsChanged?.(); }
    return r;
  });
  ipcMain.handle('zwaggen:pickSave', (_e, suggested) => handlePickSave(getWin, suggested));
  ipcMain.handle('zwaggen:readFile', (_e, handle) => handleReadFile(handle));
  ipcMain.handle('zwaggen:writeFile', (_e, handle, text) => handleWriteFile(handle, text));
  ipcMain.handle('zwaggen:openByPath', async (_e, path) => {
    const r = await handleOpenByPath(path);
    if (r) { await recordRecent(r.handle); await onRecentsChanged?.(); }
    return r;
  });
  ipcMain.handle('zwaggen:recents:list', () => listRecents());
  ipcMain.handle('zwaggen:recents:record', async (_e, p: unknown) => {
    if (typeof p !== 'string') throw new Error('invalid path');
    await recordRecent(p);
    await onRecentsChanged?.();
  });
  ipcMain.handle('zwaggen:recents:clear', async () => {
    await clearRecents();
    await onRecentsChanged?.();
  });
}
