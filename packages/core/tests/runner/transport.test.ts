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

import { sendRequest } from '../../src/runner/send';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';
import type { Transport, TransportRequest } from '../../src/runner/transport';

const ep: Endpoint = {
  id: 'e1', method: 'GET', path: '/users/{id}',
  pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
  requestBody: null,
  responses: [{ status: 200, type: { kind: 'object', fields: [] } }],
  auth: 'inherit', useProxy: 'inherit',
};

test('sendRequest with custom transport uses it instead of fetch', async () => {
  const seen: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    seen.push(req);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      rawText: '{"id":7}',
    };
  };
  // fetch must NOT be called when a custom transport is supplied
  const fetchSpy = vi.fn();
  globalThis.fetch = fetchSpy as any;

  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  const res = await sendRequest({
    spec, endpoint: ep, baseUrl: '{{base}}',
    inputs: { path: { id: '7' }, query: {}, headers: {}, body: undefined },
    secrets: {},
  }, { transport });

  expect(fetchSpy).not.toHaveBeenCalled();
  expect(seen).toHaveLength(1);
  expect(seen[0]!.url).toBe('http://api/users/7');
  expect(seen[0]!.method).toBe('GET');
  expect(res.ok).toBe(true);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ id: 7 });
  expect(res.rawText).toBe('{"id":7}');
  expect(typeof res.latencyMs).toBe('number');
});

test('sendRequest classifies errors thrown from the custom transport', async () => {
  const transport: Transport = async () => { throw new TypeError('boom'); };
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  const res = await sendRequest({
    spec, endpoint: ep, baseUrl: '{{base}}',
    inputs: { path: { id: '1' }, query: {}, headers: {}, body: undefined },
    secrets: {},
  }, { transport });
  expect(res.ok).toBe(false);
  expect(res.error?.kind).toBe('cors-or-network');
  expect(typeof res.latencyMs).toBe('number');
});

test('sendRequest forwards proxy-wrapped URL to the custom transport', async () => {
  const seen: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    seen.push(req);
    return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' };
  };
  const proxyEp: Endpoint = { ...ep, useProxy: true };
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  await sendRequest({
    spec, endpoint: proxyEp, baseUrl: '{{base}}',
    inputs: { path: { id: '1' }, query: {}, headers: {}, body: undefined },
    secrets: {},
    proxyUrl: 'http://localhost:9999',
  }, { transport });
  expect(seen[0]!.url).toBe('http://localhost:9999/proxy?url=' + encodeURIComponent('http://api/users/1'));
});

import { setTransport, getTransport, resetTransport } from '../../src/runner/transport';

test('getTransport returns fetchTransport by default', () => {
  resetTransport();
  expect(getTransport()).toBe(fetchTransport);
});

test('setTransport overrides the singleton; resetTransport restores the default', async () => {
  const calls: TransportRequest[] = [];
  const stub: Transport = async (req) => {
    calls.push(req);
    return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' };
  };
  setTransport(stub);
  expect(getTransport()).toBe(stub);

  // sendRequest with no opts.transport should now use the stub
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  await sendRequest({
    spec, endpoint: ep, baseUrl: '{{base}}',
    inputs: { path: { id: '1' }, query: {}, headers: {}, body: undefined },
    secrets: {},
  });
  expect(calls).toHaveLength(1);

  resetTransport();
  expect(getTransport()).toBe(fetchTransport);
});

test('explicit opts.transport beats the singleton', async () => {
  const stubCalls: TransportRequest[] = [];
  const explicitCalls: TransportRequest[] = [];
  setTransport(async (req) => { stubCalls.push(req); return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' }; });
  const explicitTransport: Transport = async (req) => {
    explicitCalls.push(req);
    return { ok: true, status: 200, statusText: 'OK', headers: {}, rawText: '{}' };
  };
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  await sendRequest({
    spec, endpoint: ep, baseUrl: '{{base}}',
    inputs: { path: { id: '1' }, query: {}, headers: {}, body: undefined },
    secrets: {},
  }, { transport: explicitTransport });
  expect(stubCalls).toHaveLength(0);
  expect(explicitCalls).toHaveLength(1);
  resetTransport();
});
