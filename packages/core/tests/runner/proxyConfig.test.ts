import { afterEach, expect, test, vi } from 'vitest';
import { getProxyUrl, setProxyUrl, resetProxyUrl } from '../../src/runner/proxyConfig';
import { sendRequest } from '../../src/runner/send';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

afterEach(() => resetProxyUrl());

test('default is http://localhost:4801', () => {
  expect(getProxyUrl()).toBe('http://localhost:4801');
});

test('setProxyUrl swaps the active default', () => {
  setProxyUrl('/proxy');
  expect(getProxyUrl()).toBe('/proxy');
  resetProxyUrl();
  expect(getProxyUrl()).toBe('http://localhost:4801');
});

const ep: Endpoint = {
  id: 'e', method: 'GET', path: '/x', pathParams: [],
  requestBody: null, responses: [], auth: 'inherit', useProxy: true,
};

test('sendRequest uses the configured proxyUrl base when no per-request override', async () => {
  // proxyUrl is the BASE of the proxy server. send.ts appends "/proxy?url=…"
  // — empty string base = same-origin /proxy (the bundled-server case).
  setProxyUrl('');
  const captured: { url?: string } = {};
  globalThis.fetch = vi.fn(async (url: string) => {
    captured.url = url;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  await sendRequest({
    spec: { ...emptySpec(), useProxyDefault: false },
    endpoint: ep,
    baseUrl: 'http://api.example.com',
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
    secrets: {},
  });
  expect(captured.url).toBe('/proxy?url=' + encodeURIComponent('http://api.example.com/x'));
});

test('per-request proxyUrl still wins over the configured default', async () => {
  setProxyUrl('/proxy');
  const captured: { url?: string } = {};
  globalThis.fetch = vi.fn(async (url: string) => {
    captured.url = url;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  await sendRequest({
    spec: { ...emptySpec(), useProxyDefault: false },
    endpoint: ep,
    baseUrl: 'http://api.example.com',
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
    secrets: {},
    proxyUrl: 'http://other-host:9999',
  });
  expect(captured.url).toBe('http://other-host:9999/proxy?url=' + encodeURIComponent('http://api.example.com/x'));
});
