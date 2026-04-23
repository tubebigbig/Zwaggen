import { app } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface RecentEntry { path: string; openedAt: number; }

const LIMIT = 10;
let cachePath: string | null = null;
let cache: RecentEntry[] | null = null;

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

export async function recordRecent(path: string): Promise<void> {
  const entries = await load();
  const filtered = entries.filter((e) => e.path !== path);
  const next: RecentEntry[] = [{ path, openedAt: Date.now() }, ...filtered].slice(0, LIMIT);
  await save(next);
  app.addRecentDocument(path);
}

export async function clearRecents(): Promise<void> {
  await save([]);
  app.clearRecentDocuments();
}

/** Test-only: reset module state so tests run hermetically. */
export function __resetForTests(testFile?: string): void {
  cachePath = testFile ?? null;
  cache = null;
}
