import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('idb-keyval', () => {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    del: vi.fn(async (key: string) => { store.delete(key); }),
    __reset: () => store.clear(),
  };
});

import * as idb from 'idb-keyval';
import { getStorage, setStorage, resetStorage, type SpecStorage } from '../../src/storage/spec-storage';
import { emptySpec } from '@zwaggen/core';

beforeEach(() => {
  resetStorage();
  (idb as any).__reset();
  vi.clearAllMocks();
});
afterEach(() => { resetStorage(); });

test('default storage delegates draft load/save/clear to idb-keyval', async () => {
  const spec = emptySpec();
  await getStorage().saveDraft(spec);
  expect(idb.set).toHaveBeenCalledWith('zwaggen:draft', spec);

  const loaded = await getStorage().loadDraft();
  expect(loaded).toEqual(spec);

  await getStorage().clearDraft();
  expect(idb.del).toHaveBeenCalledWith('zwaggen:draft');
  expect(await getStorage().loadDraft()).toBeNull();
});

test('recordRecent adds a new entry to the front', async () => {
  await getStorage().recordRecent({ name: 'a.json' });
  const list = await getStorage().listRecent();
  expect(list).toHaveLength(1);
  expect(list[0]!.name).toBe('a.json');
  expect(typeof list[0]!.openedAt).toBe('number');
});

test('recordRecent dedupes by name with newest at front', async () => {
  await getStorage().recordRecent({ name: 'a.json' });
  await new Promise((r) => setTimeout(r, 1));
  await getStorage().recordRecent({ name: 'b.json' });
  await new Promise((r) => setTimeout(r, 1));
  await getStorage().recordRecent({ name: 'a.json' });

  const list = await getStorage().listRecent();
  expect(list.map((r) => r.name)).toEqual(['a.json', 'b.json']);
  expect(list[0]!.openedAt).toBeGreaterThanOrEqual(list[1]!.openedAt);
});

test('recordRecent caps the list at 10', async () => {
  for (let i = 0; i < 12; i++) {
    await getStorage().recordRecent({ name: `f${i}.json` });
  }
  const list = await getStorage().listRecent();
  expect(list).toHaveLength(10);
  expect(list[0]!.name).toBe('f11.json');
  expect(list[9]!.name).toBe('f2.json');
});

test('setStorage swaps the active impl; resetStorage restores the default', async () => {
  const calls: string[] = [];
  const fake: SpecStorage = {
    loadDraft: async () => { calls.push('loadDraft'); return null; },
    saveDraft: async () => { calls.push('saveDraft'); },
    clearDraft: async () => { calls.push('clearDraft'); },
    supportsNativePicker: () => false,
    pickOpen: async () => { calls.push('pickOpen'); return null; },
    pickSave: async () => { calls.push('pickSave'); return null; },
    readFile: async () => ({ text: '', name: '' }),
    writeFile: async () => { calls.push('writeFile'); },
    listRecent: async () => [],
    recordRecent: async () => { calls.push('recordRecent'); },
  };

  setStorage(fake);
  await getStorage().loadDraft();
  expect(calls).toEqual(['loadDraft']);

  resetStorage();
  await getStorage().loadDraft();
  expect(idb.get).toHaveBeenCalledWith('zwaggen:draft');
});
