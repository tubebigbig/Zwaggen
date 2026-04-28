import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

function mkEndpoint(id: string) {
  return {
    id, method: 'GET' as const, path: `/${id}`,
    pathParams: [], requestBody: null, responses: [],
    auth: 'inherit' as const, useProxy: 'inherit' as const,
  };
}

beforeEach(async () => {
  const s = emptySpec();
  s.endpoints = [mkEndpoint('a'), mkEndpoint('b'), mkEndpoint('c')];
  s.types['User'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  s.types['auth/Token'] = { kind: 'object', fields: [{ name: 'value', required: true, type: { kind: 'string' } }] };
  await useSpecStore.getState().replaceSpec(s, null);
});

test('duplicateEndpoint creates a fresh ID and inserts after the source', async () => {
  const newId = await useSpecStore.getState().duplicateEndpoint('b');
  const ids = useSpecStore.getState().spec.endpoints.map((e) => e.id);
  expect(ids).toEqual(['a', 'b', newId, 'c']);
  expect(newId).not.toBe('b');
  expect(useSpecStore.getState().selectedEndpointId).toBe(newId);
});

test('duplicateEndpoint deep-clones (mutating the copy does not affect the original)', async () => {
  const newId = await useSpecStore.getState().duplicateEndpoint('a');
  const eps = useSpecStore.getState().spec.endpoints;
  const orig = eps.find((e) => e.id === 'a')!;
  const copy = eps.find((e) => e.id === newId)!;
  copy.path = '/changed';
  expect(orig.path).toBe('/a');
});

test('duplicateType uses Copy suffix and preserves folder', async () => {
  const newKey = await useSpecStore.getState().duplicateType('auth/Token');
  expect(newKey).toBe('auth/TokenCopy');
  expect(useSpecStore.getState().spec.types[newKey]).toBeDefined();
});

test('duplicateType cascades to Copy2 on collision', async () => {
  await useSpecStore.getState().duplicateType('User');
  const second = await useSpecStore.getState().duplicateType('User');
  expect(second).toBe('UserCopy2');
});

test('duplicateType inserts after the source preserving spec.types order', async () => {
  const newKey = await useSpecStore.getState().duplicateType('User');
  const keys = Object.keys(useSpecStore.getState().spec.types);
  // Original order: ['User', 'auth/Token']; after: ['User', newKey, 'auth/Token']
  expect(keys).toEqual(['User', newKey, 'auth/Token']);
});
