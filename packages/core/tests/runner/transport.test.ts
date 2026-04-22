import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fetchTransport } from '../../src/runner/transport';

beforeEach(() => {
  globalThis.fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(
    JSON.stringify({ hello: 'world' }),
    { status: 201, statusText: 'Created', headers: { 'content-type': 'application/json', 'x-custom': 'yes' } },
  )) as any;
});
afterEach(() => vi.restoreAllMocks());

test('fetchTransport calls global fetch with method/headers/body', async () => {
  const resp = await fetchTransport({
    method: 'POST',
    url: 'http://api.example/users',
    headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    bodyText: '{"name":"a"}',
  });
  const call = (globalThis.fetch as any).mock.calls[0];
  expect(call[0]).toBe('http://api.example/users');
  expect(call[1].method).toBe('POST');
  expect(call[1].headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer t' });
  expect(call[1].body).toBe('{"name":"a"}');
  expect(resp.ok).toBe(true);
  expect(resp.status).toBe(201);
  expect(resp.statusText).toBe('Created');
  expect(resp.headers['content-type']).toBe('application/json');
  expect(resp.headers['x-custom']).toBe('yes');
  expect(resp.rawText).toBe('{"hello":"world"}');
});

test('fetchTransport sends no body when bodyText is undefined', async () => {
  await fetchTransport({ method: 'GET', url: 'http://api.example/x', headers: {} });
  const call = (globalThis.fetch as any).mock.calls[0];
  expect(call[1].body).toBeUndefined();
});

test('fetchTransport propagates network errors', async () => {
  globalThis.fetch = vi.fn(async () => { throw new TypeError('fetch failed'); }) as any;
  await expect(fetchTransport({ method: 'GET', url: 'http://api.example/x', headers: {} }))
    .rejects.toBeInstanceOf(TypeError);
});
