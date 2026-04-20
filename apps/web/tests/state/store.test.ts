import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';
import { clearDraft, loadDraft } from '../../src/storage/drafts';

beforeEach(async () => {
  await clearDraft();
  useSpecStore.setState({
    spec: emptySpec(),
    fileHandle: null,
    dirty: false,
    selectedEndpointId: null,
  });
});

test('setSpec marks dirty and writes draft', async () => {
  const next = emptySpec('Renamed');
  await useSpecStore.getState().setSpec(next);
  expect(useSpecStore.getState().dirty).toBe(true);
  expect(await loadDraft()).toEqual(next);
});

test('newSpec resets state and clears draft', async () => {
  await useSpecStore.getState().setSpec(emptySpec('X'));
  await useSpecStore.getState().newSpec();
  expect(useSpecStore.getState().spec.info.name).toBe('Untitled API');
  expect(await loadDraft()).toBeNull();
});

test('discardDraft clears draft and resets spec when no file handle', async () => {
  await useSpecStore.getState().setSpec(emptySpec('Dirty'));
  const res = await useSpecStore.getState().discardDraft();
  expect(res.reloadedFromFile).toBe(false);
  expect(useSpecStore.getState().spec.info.name).toBe('Untitled API');
  expect(await loadDraft()).toBeNull();
});
