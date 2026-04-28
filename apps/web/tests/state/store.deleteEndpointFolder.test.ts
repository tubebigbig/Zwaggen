import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '@zwaggen/core';

function mkEndpoint(id: string, folder?: string) {
  return {
    id,
    method: 'GET' as const,
    path: '/x',
    pathParams: [],
    requestBody: null,
    responses: [],
    auth: 'inherit' as const,
    useProxy: 'inherit' as const,
    folder,
  };
}

beforeEach(async () => {
  const s = emptySpec();
  s.endpoints = [
    mkEndpoint('a', 'auth'),
    mkEndpoint('b', 'auth/oauth'),
    mkEndpoint('c', 'public'),
    mkEndpoint('d'),
  ];
  await useSpecStore.getState().replaceSpec(s, null);
});

test('deleteEndpointFolder removes endpoints in path and subfolders', async () => {
  await useSpecStore.getState().deleteEndpointFolder('auth');
  const ids = useSpecStore.getState().spec.endpoints.map((e) => e.id);
  expect(ids).toEqual(['c', 'd']);
});

test('deleteEndpointFolder clears selection when selected endpoint is in folder', async () => {
  useSpecStore.getState().selectEndpoint('b');
  await useSpecStore.getState().deleteEndpointFolder('auth');
  expect(useSpecStore.getState().selectedEndpointId).toBeNull();
});

test('deleteEndpointFolder no-op when folder has no matches', async () => {
  await useSpecStore.getState().deleteEndpointFolder('nonexistent');
  expect(useSpecStore.getState().spec.endpoints).toHaveLength(4);
});
