import { expect, test, vi, beforeEach } from 'vitest';
import { sendRequest } from '../../src/runner/send';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

const ep: Endpoint = {
  id: 'e', method: 'GET', path: '/a', pathParams: [],
  requestBody: null, responses: [], auth: 'inherit', useProxy: true,
};

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => { throw new TypeError('fetch failed'); }) as any;
});

test('unreachable proxy produces actionable hint (explicit override)', async () => {
  const spec = { ...emptySpec(), useProxyDefault: false };
  const res = await sendRequest({
    spec, endpoint: ep, baseUrl: 'http://api', inputs: { path: {}, query: {}, headers: {}, body: undefined },
    secrets: {}, useProxy: true,
  });
  expect(res.ok).toBe(false);
  expect(res.error?.hint).toMatch(/npx zwaggen-proxy/);
});

test('endpoint-level useProxy:true routes through proxy without explicit override', async () => {
  const spec = { ...emptySpec(), useProxyDefault: false };
  const res = await sendRequest({
    spec, endpoint: ep, baseUrl: 'http://api', inputs: { path: {}, query: {}, headers: {}, body: undefined },
    secrets: {},
    // no useProxy override — must honor endpoint.useProxy === true
  });
  expect(res.ok).toBe(false);
  expect(res.error?.hint).toMatch(/npx zwaggen-proxy/);
});
