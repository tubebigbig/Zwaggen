import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => ({
  app: {
    addRecentDocument: vi.fn(),
    clearRecentDocuments: vi.fn(),
    getPath: () => '/',
  },
}));

import { listRecents, recordRecent, clearRecents, __resetForTests } from '../recents';

let dir: string;
let storeFile: string;
let probe: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'zwag-recents-'));
  storeFile = join(dir, 'recents.json');
  probe = join(dir, 'a.zwag');
  await writeFile(probe, '{}');
  __resetForTests(storeFile);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  __resetForTests();
});

test('listRecents returns [] when no store file exists', async () => {
  expect(await listRecents()).toEqual([]);
});

test('recordRecent adds a new entry and persists JSON', async () => {
  await recordRecent(probe);
  const list = await listRecents();
  expect(list).toHaveLength(1);
  expect(list[0]!.path).toBe(probe);
  expect(typeof list[0]!.openedAt).toBe('number');
  const onDisk = JSON.parse(await readFile(storeFile, 'utf8'));
  expect(onDisk[0].path).toBe(probe);
});

test('recordRecent dedupes by absolute path; newest moves to front', async () => {
  const b = join(dir, 'b.zwag');
  await writeFile(b, '{}');
  await recordRecent(probe);
  await new Promise((r) => setTimeout(r, 1));
  await recordRecent(b);
  await new Promise((r) => setTimeout(r, 1));
  await recordRecent(probe);
  const list = await listRecents();
  expect(list.map((e) => e.path)).toEqual([probe, b]);
});

test('recordRecent caps at 10', async () => {
  const paths: string[] = [];
  for (let i = 0; i < 12; i++) {
    const p = join(dir, `f${i}.zwag`);
    await writeFile(p, '{}');
    paths.push(p);
    await recordRecent(p);
  }
  const list = await listRecents();
  expect(list).toHaveLength(10);
  expect(list[0]!.path).toBe(paths[11]);
  expect(list[9]!.path).toBe(paths[2]);
});

test('listRecents hides entries whose files no longer exist', async () => {
  const ghost = join(dir, 'ghost.zwag');
  await writeFile(ghost, '{}');
  await recordRecent(ghost);
  await rm(ghost);
  const list = await listRecents();
  expect(list.find((e) => e.path === ghost)).toBeUndefined();
});

test('clearRecents empties the store', async () => {
  await recordRecent(probe);
  await clearRecents();
  expect(await listRecents()).toEqual([]);
});
