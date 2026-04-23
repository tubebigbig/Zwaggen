import { afterEach, expect, test, vi } from 'vitest';
import { isTransportRequest, handleHttp, handleReadFile, handleWriteFile, handleOpenByPath } from '../ipc';
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
  expect(fetchSpy).toHaveBeenCalledWith('https://example.com/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"a":1}',
  });
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
