import { afterEach, expect, test, vi } from 'vitest';
import { isTransportRequest, handleHttp, handleReadFile, handleWriteFile, handleOpenByPath, __setHttpTimeoutMsForTests, __resetHttpTimeoutMsForTests } from '../ipc';
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

afterEach(() => vi.restoreAllMocks());

test('isTransportRequest accepts valid input', () => {
  expect(isTransportRequest({ method: 'GET', url: 'http://x/y', headers: {} })).toBe(true);
  expect(isTransportRequest({ method: 'POST', url: 'https://x/y', headers: { a: 'b' }, bodyText: '{}' })).toBe(true);
});

test('isTransportRequest rejects malformed input', () => {
  expect(isTransportRequest(null)).toBe(false);
  expect(isTransportRequest({})).toBe(false);
  expect(isTransportRequest({ method: 1, url: 'http://x', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'file:///etc/passwd', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'javascript:alert(1)', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'http://x', headers: null })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'http://x', headers: {}, bodyText: 5 })).toBe(false);
});

test('handleHttp rejects invalid payload', async () => {
  await expect(handleHttp({ bad: 'data' })).rejects.toThrow(/invalid http payload/);
});

test('handleHttp forwards to fetch with the right shape', async () => {
  const fetchSpy = vi.fn(async () => new Response('{"x":1}', {
    status: 201,
    statusText: 'Created',
    headers: { 'content-type': 'application/json', 'x-y': 'z' },
  }));
  globalThis.fetch = fetchSpy as any;

  const resp = await handleHttp({
    method: 'POST',
    url: 'https://example.com/x',
    headers: { 'content-type': 'application/json' },
    bodyText: '{"a":1}',
  });
  expect(fetchSpy).toHaveBeenCalledWith('https://example.com/x', expect.objectContaining({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"a":1}',
    signal: expect.any(AbortSignal),
  }));
  expect(resp.ok).toBe(true);
  expect(resp.status).toBe(201);
  expect(resp.statusText).toBe('Created');
  expect(resp.headers['content-type']).toBe('application/json');
  expect(resp.headers['x-y']).toBe('z');
  expect(resp.rawText).toBe('{"x":1}');
});

test('handleReadFile + handleWriteFile + handleOpenByPath round-trip via real fs', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'zwag-ipc-'));
  const p = join(dir, 'spec.zwag');
  try {
    await handleWriteFile(p, '{"hello":"world"}');
    expect(await readFile(p, 'utf8')).toBe('{"hello":"world"}');

    const r = await handleReadFile(p);
    expect(r).toEqual({ text: '{"hello":"world"}', name: 'spec.zwag' });

    const o = await handleOpenByPath(p);
    expect(o).toEqual({ handle: p, name: 'spec.zwag', text: '{"hello":"world"}' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('handleReadFile / handleWriteFile / handleOpenByPath reject non-string handles', async () => {
  await expect(handleReadFile(123)).rejects.toThrow(/invalid handle/);
  await expect(handleWriteFile(123, 'text')).rejects.toThrow(/invalid handle/);
  await expect(handleWriteFile('/p', 5 as any)).rejects.toThrow(/invalid text/);
  await expect(handleOpenByPath(123)).rejects.toThrow(/invalid path/);
});

test('isTransportRequest rejects cloud-metadata hosts', () => {
  expect(isTransportRequest({ method: 'GET', url: 'http://169.254.169.254/latest/meta-data/', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'http://100.100.100.200/latest/', headers: {} })).toBe(false);
  expect(isTransportRequest({ method: 'GET', url: 'http://metadata.google.internal/computeMetadata/v1/', headers: {} })).toBe(false);
  // case-insensitive
  expect(isTransportRequest({ method: 'GET', url: 'http://Metadata.Google.Internal/x', headers: {} })).toBe(false);
});

test('isTransportRequest still accepts non-blocked private LAN hosts', () => {
  // Slice 4 only blocks cloud-metadata IPs, NOT all private ranges
  expect(isTransportRequest({ method: 'GET', url: 'http://192.168.1.1/admin', headers: {} })).toBe(true);
  expect(isTransportRequest({ method: 'GET', url: 'http://10.0.0.1/x', headers: {} })).toBe(true);
});

test('isTransportRequest accepts a multipartFields payload', () => {
  expect(isTransportRequest({ method: 'POST', url: 'http://x/y', headers: {}, multipartFields: [['a', 'b']] })).toBe(true);
  expect(isTransportRequest({ method: 'POST', url: 'http://x/y', headers: {}, multipartFields: [] })).toBe(true);
});

test('isTransportRequest rejects malformed multipartFields', () => {
  expect(isTransportRequest({ method: 'POST', url: 'http://x/y', headers: {}, multipartFields: 'nope' })).toBe(false);
  expect(isTransportRequest({ method: 'POST', url: 'http://x/y', headers: {}, multipartFields: [['a']] })).toBe(false);
  expect(isTransportRequest({ method: 'POST', url: 'http://x/y', headers: {}, multipartFields: [[1, 'b']] as any })).toBe(false);
  expect(isTransportRequest({ method: 'POST', url: 'http://x/y', headers: {}, multipartFields: [['a', 2]] as any })).toBe(false);
});

test('handleHttp builds FormData from multipartFields and forwards to fetch', async () => {
  const fetchSpy = vi.fn(async () => new Response('{}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }));
  globalThis.fetch = fetchSpy as any;

  await handleHttp({
    method: 'POST',
    url: 'http://example.com/upload',
    headers: {},
    multipartFields: [['field', 'value'], ['name', 'a&b']],
  });
  const init = fetchSpy.mock.calls[0]![1] as RequestInit;
  expect(init.body).toBeInstanceOf(FormData);
  expect((init.body as FormData).get('field')).toBe('value');
  expect((init.body as FormData).get('name')).toBe('a&b');
});

test('handleHttp prefers multipartFields over bodyText when both are present', async () => {
  const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
  globalThis.fetch = fetchSpy as any;
  await handleHttp({
    method: 'POST',
    url: 'http://example.com/x',
    headers: {},
    bodyText: 'should=ignore',
    multipartFields: [['k', 'v']],
  });
  const init = fetchSpy.mock.calls[0]![1] as RequestInit;
  expect(init.body).toBeInstanceOf(FormData);
});

test('handleHttp aborts when the underlying fetch never resolves', async () => {
  const fetchSpy = vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal!.reason ?? new Error('aborted')));
  }));
  globalThis.fetch = fetchSpy as any;
  // AbortSignal.timeout uses Node's real scheduler and ignores vi.useFakeTimers
  // — shrink the timeout to a value small enough to wait on for real instead.
  __setHttpTimeoutMsForTests(20);
  try {
    await expect(
      handleHttp({ method: 'GET', url: 'http://example.com/slow', headers: {} }),
    ).rejects.toBeInstanceOf(Error);
  } finally {
    __resetHttpTimeoutMsForTests();
  }
});
