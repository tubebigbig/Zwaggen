import { ipcMain, dialog, BrowserWindow } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

export interface TransportRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyText?: string;
}

export interface TransportResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  rawText: string;
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
  if (!/^https?:\/\//i.test(r.url)) return false;
  return true;
}

export async function handleHttp(payload: unknown): Promise<TransportResponse> {
  if (!isTransportRequest(payload)) throw new Error('invalid http payload');
  const resp = await fetch(payload.url, {
    method: payload.method,
    headers: payload.headers,
    body: payload.bodyText,
  });
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

/** Wire every `zwaggen:*` channel onto `ipcMain`. Called once from main on whenReady. */
export function registerIpc(getWin: () => BrowserWindow | null) {
  ipcMain.handle('zwaggen:http', (_e, payload) => handleHttp(payload));
  ipcMain.handle('zwaggen:pickOpen', () => handlePickOpen(getWin));
  ipcMain.handle('zwaggen:pickSave', (_e, suggested) => handlePickSave(getWin, suggested));
  ipcMain.handle('zwaggen:readFile', (_e, handle) => handleReadFile(handle));
  ipcMain.handle('zwaggen:writeFile', (_e, handle, text) => handleWriteFile(handle, text));
  ipcMain.handle('zwaggen:openByPath', (_e, path) => handleOpenByPath(path));
}
