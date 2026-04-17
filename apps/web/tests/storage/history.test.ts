import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { del } from 'idb-keyval';
import {
  clearEndpointHistory,
  loadHistory,
  pushHistory,
  reconcileHistory,
  trimResult,
  type HistoryEntry,
} from '../../src/storage/history';
import type { RunResult } from '../../src/runner/send';

const HISTORY_KEY = 'zwaggen:history';

function makeEntry(endpointId: string, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
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

beforeEach(async () => {
  await del(HISTORY_KEY);
});

test('pushHistory appends newest-first: A, B, C → [C, B, A]', async () => {
  const a = makeEntry('ep1', { id: 'a' });
  const b = makeEntry('ep1', { id: 'b' });
  const c = makeEntry('ep1', { id: 'c' });
  await pushHistory(a);
  await pushHistory(b);
  await pushHistory(c);
  const entries = await loadHistory('ep1');
  expect(entries.map((e) => e.id)).toEqual(['c', 'b', 'a']);
});

test('pushHistory caps at 20, oldest dropped', async () => {
  for (let i = 0; i < 25; i++) {
    await pushHistory(makeEntry('ep1', { id: `entry-${i}`, at: i }));
  }
  const entries = await loadHistory('ep1');
  expect(entries).toHaveLength(20);
  // newest (entries 24..5) should be present; oldest (0..4) should be dropped
  expect(entries[0].id).toBe('entry-24');
  expect(entries[19].id).toBe('entry-5');
});

test('different endpoint IDs get separate buckets', async () => {
  const a = makeEntry('ep1', { id: 'a1' });
  const b = makeEntry('ep2', { id: 'b1' });
  await pushHistory(a);
  await pushHistory(b);
  const ep1 = await loadHistory('ep1');
  const ep2 = await loadHistory('ep2');
  expect(ep1).toHaveLength(1);
  expect(ep1[0].id).toBe('a1');
  expect(ep2).toHaveLength(1);
  expect(ep2[0].id).toBe('b1');
});

test('loadHistory returns [] for unknown endpoint', async () => {
  expect(await loadHistory('unknown-endpoint')).toEqual([]);
});

test('clearEndpointHistory removes only that endpoint bucket', async () => {
  await pushHistory(makeEntry('ep1', { id: 'a' }));
  await pushHistory(makeEntry('ep2', { id: 'b' }));
  await clearEndpointHistory('ep1');
  expect(await loadHistory('ep1')).toEqual([]);
  expect(await loadHistory('ep2')).toHaveLength(1);
});

test('reconcileHistory drops stale IDs but preserves valid IDs', async () => {
  await pushHistory(makeEntry('valid-id', { id: 'v1' }));
  await pushHistory(makeEntry('stale-id', { id: 's1' }));
  await reconcileHistory(new Set(['valid-id']));
  expect(await loadHistory('stale-id')).toEqual([]);
  expect(await loadHistory('valid-id')).toHaveLength(1);
});

describe('trimResult', () => {
  test('truncates rawText at 100 * 1024 when over limit', () => {
    const bigText = 'x'.repeat(200 * 1024);
    const r: RunResult = { ok: true, status: 200, rawText: bigText, missingVars: [] };
    const result = trimResult(r, []);
    expect(result.rawTruncated).toBe(true);
    expect(result.rawText!.length).toBe(100 * 1024);
  });

  test('does not truncate small rawText', () => {
    const smallText = 'hello world';
    const r: RunResult = { ok: true, status: 200, rawText: smallText, missingVars: [] };
    const result = trimResult(r, []);
    expect(result.rawTruncated).toBeFalsy();
    expect(result.rawText).toBe(smallText);
  });

  test('maps error.kind and error.hint', () => {
    const r: RunResult = {
      ok: false,
      error: { kind: 'cors', hint: 'enable cors' },
      missingVars: [],
    };
    const result = trimResult(r, []);
    expect(result.errorKind).toBe('cors');
    expect(result.errorHint).toBe('enable cors');
  });
});
