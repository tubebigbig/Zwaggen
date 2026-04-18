import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { clear as clearIdb } from 'idb-keyval';
import { runAll, type BatchRow } from '../../src/runner/batch';
import { pushHistory } from '../../src/storage/history';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint, Spec } from '../../src/schema/types';
import type { HistoryEntry } from '../../src/storage/history';
import { loadHistory } from '../../src/storage/history';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEndpoint(id: string, overrides: Partial<Endpoint> = {}): Endpoint {
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
    ...overrides,
  };
}

function makeSpec(endpoints: Endpoint[]): Spec {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  s.endpoints = endpoints;
  return s;
}

function makeHistoryEntry(endpointId: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: crypto.randomUUID(),
    at: Date.now(),
    endpointId,
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
    baseUrlUsed: 'https://api.example.com',
    useProxyUsed: false,
    result: { ok: true, status: 200, statusText: 'OK', validationErrors: [] },
    ...overrides,
  };
}

function makeOkFetchResponse(body: unknown = {}, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await clearIdb();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Test 1: All endpoints skipped when no history
// ---------------------------------------------------------------------------

test('all endpoints skipped when no history', async () => {
  const spec = makeSpec([makeEndpoint('ep-a'), makeEndpoint('ep-b')]);
  const rows: BatchRow[] = [];
  const onRow = vi.fn((row: BatchRow) => rows.push({ ...row }));

  vi.stubGlobal('fetch', vi.fn());

  const handle = runAll(spec, undefined, onRow);
  await handle.done;

  const skipped = rows.filter((r) => r.status === 'skipped');
  expect(skipped).toHaveLength(2);
  expect(skipped[0]!.skippedReason).toBe('no history yet');
  expect(skipped[1]!.skippedReason).toBe('no history yet');
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// Test 2: One with history, one without
// ---------------------------------------------------------------------------

test('endpoint with history runs; endpoint without history is skipped', async () => {
  const epA = makeEndpoint('ep-a');
  const epB = makeEndpoint('ep-b');
  const spec = makeSpec([epA, epB]);

  // Seed history only for ep-a
  await pushHistory(makeHistoryEntry('ep-a'));

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse({ id: 'x' })));

  const rows: BatchRow[] = [];
  const onRow = vi.fn((row: BatchRow) => rows.push({ ...row }));

  const handle = runAll(spec, undefined, onRow);
  await handle.done;

  const doneRows = rows.filter((r) => r.endpointId === 'ep-a' && r.status === 'done');
  expect(doneRows).toHaveLength(1);

  const skippedRows = rows.filter((r) => r.endpointId === 'ep-b' && r.status === 'skipped');
  expect(skippedRows).toHaveLength(1);

  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
});

// ---------------------------------------------------------------------------
// Test 3: Passed vs failed validation
// ---------------------------------------------------------------------------

describe('passed vs failed', () => {
  const responseType = {
    kind: 'object' as const,
    fields: [{ name: 'id', required: true, type: { kind: 'string' as const } }],
  };

  const ep = makeEndpoint('ep-validate', {
    responses: [{ status: 200, type: responseType }],
  });

  test('passed: true when body matches response type', async () => {
    const spec = makeSpec([ep]);
    await pushHistory(makeHistoryEntry('ep-validate'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse({ id: 'x' })));

    const rows: BatchRow[] = [];
    const handle = runAll(spec, undefined, (row) => rows.push({ ...row }));
    await handle.done;

    const doneRow = rows.find((r) => r.status === 'done');
    expect(doneRow).toBeDefined();
    expect(doneRow!.passed).toBe(true);
    expect(doneRow!.validationErrors).toHaveLength(0);
  });

  test('passed: false when body has type mismatch (number instead of string)', async () => {
    const spec = makeSpec([ep]);
    await pushHistory(makeHistoryEntry('ep-validate'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse({ id: 42 })));

    const rows: BatchRow[] = [];
    const handle = runAll(spec, undefined, (row) => rows.push({ ...row }));
    await handle.done;

    const doneRow = rows.find((r) => r.status === 'done');
    expect(doneRow).toBeDefined();
    expect(doneRow!.passed).toBe(false);
    expect(doneRow!.validationErrors!.length).toBeGreaterThan(0);
  });

  test('passed: false when status is 500 (res.ok is false)', async () => {
    const spec = makeSpec([ep]);
    await pushHistory(makeHistoryEntry('ep-validate'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse({}, 500)));

    const rows: BatchRow[] = [];
    const handle = runAll(spec, undefined, (row) => rows.push({ ...row }));
    await handle.done;

    const doneRow = rows.find((r) => r.status === 'done');
    expect(doneRow).toBeDefined();
    expect(doneRow!.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Cancellation stops after in-flight request resolves
// ---------------------------------------------------------------------------

test('cancellation stops iteration after the first done row', async () => {
  const ep1 = makeEndpoint('ep-1');
  const ep2 = makeEndpoint('ep-2');
  const ep3 = makeEndpoint('ep-3');
  const spec = makeSpec([ep1, ep2, ep3]);

  await pushHistory(makeHistoryEntry('ep-1'));
  await pushHistory(makeHistoryEntry('ep-2'));
  await pushHistory(makeHistoryEntry('ep-3'));

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse({})));

  let handle: { cancel: () => void; done: Promise<void> };
  const emittedDone: string[] = [];

  const onRow = vi.fn((row: BatchRow) => {
    if (row.status === 'done') {
      emittedDone.push(row.endpointId);
      // Cancel after first done row emitted
      if (emittedDone.length === 1) {
        handle.cancel();
      }
    }
  });

  handle = runAll(spec, undefined, onRow);
  await handle.done;

  // Only the first endpoint should have reached 'done'
  expect(emittedDone).toHaveLength(1);
  expect(emittedDone[0]).toBe('ep-1');
});

// ---------------------------------------------------------------------------
// Test 5: History grows by one per completed row
// ---------------------------------------------------------------------------

test('history grows by one entry per completed endpoint', async () => {
  const ep = makeEndpoint('ep-grow');
  const spec = makeSpec([ep]);

  await pushHistory(makeHistoryEntry('ep-grow'));
  expect(await loadHistory('ep-grow')).toHaveLength(1);

  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeOkFetchResponse({})));

  const handle = runAll(spec, undefined, () => {});
  await handle.done;

  expect(await loadHistory('ep-grow')).toHaveLength(2);
});

// ---------------------------------------------------------------------------
// Test 6: Network error classified as errored
// ---------------------------------------------------------------------------

test('network error yields errored row with no passed/validationErrors', async () => {
  const ep = makeEndpoint('ep-err');
  const spec = makeSpec([ep]);

  await pushHistory(makeHistoryEntry('ep-err'));

  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

  const rows: BatchRow[] = [];
  const handle = runAll(spec, undefined, (row) => rows.push({ ...row }));
  await handle.done;

  const erroredRow = rows.find((r) => r.status === 'errored');
  expect(erroredRow).toBeDefined();
  // sendRequest catches network errors internally and returns ok:false with error set;
  // runAll emits status:'errored' and passed:false (not passed:true), no validationErrors
  expect(erroredRow!.passed).toBe(false);
  expect(erroredRow!.validationErrors).toHaveLength(0);
});
