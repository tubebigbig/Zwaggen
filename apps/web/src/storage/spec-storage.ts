import { get, set } from 'idb-keyval';
import type { Spec } from '@zwaggen/core';
import * as drafts from './drafts';
import * as fileIo from './file';

export type FileRef = unknown;

export interface RecentFile {
  name: string;
  openedAt: number;
  /** Optional handle — browser default leaves this unset; desktop fills it with a path. */
  handle?: FileRef;
}

export interface OpenedFile {
  handle: FileRef;
  name: string;
  text: string;
}

export interface SpecStorage {
  loadDraft(): Promise<Spec | null>;
  saveDraft(spec: Spec): Promise<void>;
  clearDraft(): Promise<void>;

  supportsNativePicker(): boolean;
  pickOpen(): Promise<OpenedFile | null>;
  pickSave(suggestedName?: string): Promise<FileRef | null>;
  readFile(handle: FileRef): Promise<{ text: string; name: string }>;
  writeFile(handle: FileRef, text: string): Promise<void>;

  listRecent(): Promise<RecentFile[]>;
  recordRecent(entry: { name: string; handle?: FileRef }): Promise<void>;
}

const RECENTS_KEY = 'zwaggen:recents';
const RECENTS_LIMIT = 10;

async function listRecentImpl(): Promise<RecentFile[]> {
  return (await get<RecentFile[]>(RECENTS_KEY)) ?? [];
}

async function recordRecentImpl(entry: { name: string; handle?: FileRef }): Promise<void> {
  const current = await listRecentImpl();
  // Dedupe by name only — two files named `spec.json` from different folders collide
  // here. Acceptable for v1: there's no UI surface yet, and the desktop impl will
  // dedupe by full path instead.
  const filtered = current.filter((r) => r.name !== entry.name);
  const next: RecentFile[] = [
    { name: entry.name, openedAt: Date.now(), handle: entry.handle },
    ...filtered,
  ].slice(0, RECENTS_LIMIT);
  await set(RECENTS_KEY, next);
}

const browserDefault: SpecStorage = {
  loadDraft: drafts.loadDraft,
  saveDraft: drafts.saveDraft,
  clearDraft: drafts.clearDraft,

  supportsNativePicker: fileIo.supportsFileSystemAccess,

  async pickOpen() {
    const handle = await fileIo.pickOpen();
    if (!handle) return null;
    const { text, name } = await fileIo.readFile(handle);
    // Recents are best-effort UX: a quota or transient IDB failure must not
    // discard a file the user just successfully picked + read.
    try { await recordRecentImpl({ name }); } catch { /* swallow */ }
    return { handle, text, name };
  },
  pickSave: (suggestedName?: string) => fileIo.pickSave(suggestedName),
  readFile: (h: FileRef) => fileIo.readFile(h as FileSystemFileHandle),
  writeFile: (h: FileRef, text: string) => fileIo.writeFile(text, h as FileSystemFileHandle),

  listRecent: listRecentImpl,
  recordRecent: recordRecentImpl,
};

let active: SpecStorage = browserDefault;

export function getStorage(): SpecStorage { return active; }
export function setStorage(impl: SpecStorage): void { active = impl; }
export function resetStorage(): void { active = browserDefault; }
