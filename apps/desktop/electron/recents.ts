import { app } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RecentEntry { path: string; openedAt: number; }

const LIMIT = 10;
let cachePath: string | null = null;
let cache: RecentEntry[] | null = null;

// Single in-flight chain so concurrent recordRecent / clearRecents calls
// can't race the on-disk JSON. Each mutation `await`s the previous one.
let serialQueue: Promise<unknown> = Promise.resolve();

function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = serialQueue.then(fn, fn);
  serialQueue = next.catch(() => undefined);   // don't let a rejection poison the chain
  return next;
}

function file(): string {
  if (cachePath) return cachePath;
  cachePath = join(app.getPath('userData'), 'recents.json');
  return cachePath;
}

function isRecent(v: unknown): v is RecentEntry {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.path === 'string' && typeof r.openedAt === 'number';
}

async function load(): Promise<RecentEntry[]> {
  if (cache) return cache;
  try {
    const text = await readFile(file(), 'utf8');
    const parsed = JSON.parse(text);
    cache = Array.isArray(parsed) ? parsed.filter(isRecent) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(entries: RecentEntry[]): Promise<void> {
  cache = entries;
  await writeFile(file(), JSON.stringify(entries, null, 2), 'utf8');
}

export async function listRecents(): Promise<RecentEntry[]> {
  const entries = await load();
  // Hide stale entries on every read (cheap for 10 items)
  return entries.filter((e) => existsSync(e.path));
}

export function recordRecent(path: string): Promise<void> {
  return serial(async () => {
    // Skip silently for paths that no longer exist — a malicious renderer
    // can no longer pollute the on-disk store or the OS recent-docs surface
    // with bogus entries.
    if (!existsSync(path)) return;
    const entries = await load();
    const filtered = entries.filter((e) => e.path !== path);
    const next: RecentEntry[] = [{ path, openedAt: Date.now() }, ...filtered].slice(0, LIMIT);
    await save(next);
    app.addRecentDocument(path);
  });
}

export function clearRecents(): Promise<void> {
  return serial(async () => {
    await save([]);
    app.clearRecentDocuments();
  });
}

/** Test-only: reset module state so tests run hermetically. */
export function __resetForTests(testFile?: string): void {
  cachePath = testFile ?? null;
  cache = null;
  serialQueue = Promise.resolve();
}
