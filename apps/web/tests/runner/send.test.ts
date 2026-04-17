import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { sendRequest } from '../../src/runner/send';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';

const endpoint: Endpoint = {
  id: 'e1', method: 'GET', path: '/users/{id}',
  pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
  queryParams: [{ name: 'q', required: false, type: { kind: 'string' } }],
  headers: [], requestBody: null, responses: [{ status: 200, type: { kind: 'object', fields: [] } }],
  auth: 'inherit', useProxy: 'inherit',
};

beforeEach(() => {
  globalThis.fetch = vi.fn(async (_url: string) => new Response(JSON.stringify({}), {
    status: 200, headers: { 'content-type': 'application/json' },
  })) as any;
});
afterEach(() => vi.restoreAllMocks());

test('substitutes path params and query, returns typed result', async () => {
  const spec = { ...emptySpec(), environments: { default: { variables: [{ name: 'base', value: 'http://api', secret: false }] } }, activeEnvironment: 'default' };
  const res = await sendRequest({
    spec, endpoint, baseUrl: '{{base}}', inputs: { path: { id: '7' }, query: { q: 'hi' }, headers: {}, body: undefined },
    secrets: {},
  });
  expect((globalThis.fetch as any).mock.calls[0][0]).toBe('http://api/users/7?q=hi');
  expect(res.ok).toBe(true);
  expect(res.status).toBe(200);
});
