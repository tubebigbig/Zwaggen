import 'fake-indexeddb/auto';
import { beforeEach, expect, test } from 'vitest';
import { del } from 'idb-keyval';
import { useSpecStore } from '../../src/state/store';
import { emptySpec } from '../../src/schema/defaults';
import { clearDraft } from '../../src/storage/drafts';
import { loadHistory, pushHistory, type HistoryEntry } from '../../src/storage/history';
import type { Endpoint } from '../../src/schema/types';

const HISTORY_KEY = 'zwaggen:history';

function addEndpoint(id: string): Endpoint {
  return {
    id,
    method: 'GET',
    path: `/${id}`,
    pathParams: [],
    queryParams: [],
    headers: [],
    requestBody: null,
    responses: [],
    auth: 'inherit',
    useProxy: 'inherit',
  };
}

async function pushTestEntry(endpointId: string): Promise<void> {
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    at: Date.now(),
    endpointId,
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
    baseUrlUsed: 'https://api.example.com',
    useProxyUsed: false,
    result: { ok: true, status: 200, statusText: 'OK', validationErrors: [] },
  };
  await pushHistory(entry);
}

beforeEach(async () => {
  await clearDraft();
  await del(HISTORY_KEY);
  useSpecStore.setState({
    spec: emptySpec(),
    fileHandle: null,
    dirty: false,
    selectedEndpointId: null,
  });
});

test('deleteEndpoint removes endpoint and clears its history bucket', async () => {
  const specWithAB = {
    ...emptySpec(),
    endpoints: [addEndpoint('A'), addEndpoint('B')],
  };
  useSpecStore.setState({ spec: specWithAB });
  await pushTestEntry('A');
  await pushTestEntry('B');

  await useSpecStore.getState().deleteEndpoint('A');

  const spec = useSpecStore.getState().spec;
  expect(spec.endpoints.find((e) => e.id === 'A')).toBeUndefined();
  expect(spec.endpoints.find((e) => e.id === 'B')).toBeDefined();
  expect(await loadHistory('A')).toEqual([]);
  expect(await loadHistory('B')).toHaveLength(1);
});

test('deleteEndpoint clears selectedEndpointId when the selected endpoint is deleted', async () => {
  const specWithA = {
    ...emptySpec(),
    endpoints: [addEndpoint('A')],
  };
  useSpecStore.setState({ spec: specWithA });
  useSpecStore.getState().selectEndpoint('A');
  expect(useSpecStore.getState().selectedEndpointId).toBe('A');

  await useSpecStore.getState().deleteEndpoint('A');

  expect(useSpecStore.getState().selectedEndpointId).toBeNull();
});

test('replaceSpec reconciles: orphan bucket for removed endpoint is dropped', async () => {
  const specWithAB = {
    ...emptySpec(),
    endpoints: [addEndpoint('A'), addEndpoint('B')],
  };
  useSpecStore.setState({ spec: specWithAB });
  await pushTestEntry('A');
  await pushTestEntry('B');

  const specWithoutA = {
    ...specWithAB,
    endpoints: specWithAB.endpoints.filter((e) => e.id !== 'A'),
  };
  await useSpecStore.getState().replaceSpec(specWithoutA, null);

  expect(await loadHistory('A')).toEqual([]);
  expect(await loadHistory('B')).toHaveLength(1);
});

test('newSpec wipes all history', async () => {
  const specWithAB = {
    ...emptySpec(),
    endpoints: [addEndpoint('A'), addEndpoint('B')],
  };
  useSpecStore.setState({ spec: specWithAB });
  await pushTestEntry('A');
  await pushTestEntry('B');

  await useSpecStore.getState().newSpec();

  expect(await loadHistory('A')).toEqual([]);
  expect(await loadHistory('B')).toEqual([]);
});

test('discardDraft without file handle resets to emptySpec and wipes all history', async () => {
  const specWithAB = {
    ...emptySpec(),
    endpoints: [addEndpoint('A'), addEndpoint('B')],
  };
  useSpecStore.setState({ spec: specWithAB, fileHandle: null });
  await pushTestEntry('A');
  await pushTestEntry('B');

  const result = await useSpecStore.getState().discardDraft();

  expect(result.reloadedFromFile).toBe(false);
  expect(await loadHistory('A')).toEqual([]);
  expect(await loadHistory('B')).toEqual([]);
});
