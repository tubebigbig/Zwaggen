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

test('setTypeFolder returns { ok: false, reason: "unknown" } for missing typeKey', async () => {
  const res = await useSpecStore.getState().setTypeFolder('does/not/exist', 'x');
  expect(res).toEqual({ ok: false, reason: 'unknown' });
});

test('setTypeFolder returns { ok: false, reason: "noop" } when target equals current', async () => {
  await useSpecStore.getState().setSpec({
    ...emptySpec(),
    types: { 'auth/User': { kind: 'object', fields: [] } },
  });
  const res = await useSpecStore.getState().setTypeFolder('auth/User', 'auth');
  expect(res).toEqual({ ok: false, reason: 'noop' });
});

test('setTypeFolder returns { ok: false, reason: "collision" } when target key exists', async () => {
  await useSpecStore.getState().setSpec({
    ...emptySpec(),
    types: {
      'auth/User': { kind: 'object', fields: [] },
      'admin/User': { kind: 'object', fields: [] },
    },
  });
  const res = await useSpecStore.getState().setTypeFolder('auth/User', 'admin');
  expect(res).toEqual({ ok: false, reason: 'collision' });
  expect(useSpecStore.getState().spec.types['auth/User']).toBeDefined();
  expect(useSpecStore.getState().spec.types['admin/User']).toBeDefined();
});

test('setTypeFolder returns { ok: true } on success and renames the key', async () => {
  await useSpecStore.getState().setSpec({
    ...emptySpec(),
    types: { 'auth/User': { kind: 'object', fields: [] } },
  });
  const res = await useSpecStore.getState().setTypeFolder('auth/User', 'admin');
  expect(res).toEqual({ ok: true });
  expect(useSpecStore.getState().spec.types['admin/User']).toBeDefined();
  expect(useSpecStore.getState().spec.types['auth/User']).toBeUndefined();
});

test('setEndpointFolder returns { ok: false, reason: "unknown" } for missing id', async () => {
  const res = await useSpecStore.getState().setEndpointFolder('nope', 'x');
  expect(res).toEqual({ ok: false, reason: 'unknown' });
});

test('setEndpointFolder returns { ok: false, reason: "noop" } when target equals current', async () => {
  await useSpecStore.getState().setSpec({
    ...emptySpec(),
    endpoints: [{
      id: 'e1', method: 'GET', path: '/', folder: 'x',
      pathParams: [], queryParams: [], headers: [],
      requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
    }],
  });
  const res = await useSpecStore.getState().setEndpointFolder('e1', 'x');
  expect(res).toEqual({ ok: false, reason: 'noop' });
});

test('setEndpointFolder returns { ok: true } on success', async () => {
  await useSpecStore.getState().setSpec({
    ...emptySpec(),
    endpoints: [{
      id: 'e1', method: 'GET', path: '/',
      pathParams: [], queryParams: [], headers: [],
      requestBody: null, responses: [],
      auth: 'inherit', useProxy: 'inherit',
    }],
  });
  const res = await useSpecStore.getState().setEndpointFolder('e1', 'tools');
  expect(res).toEqual({ ok: true });
  expect(useSpecStore.getState().spec.endpoints[0]!.folder).toBe('tools');
});
