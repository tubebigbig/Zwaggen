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

test('urlencoded endpoint sends form-encoded body with correct Content-Type', async () => {
  const formEndpoint: Endpoint = {
    id: 'e3', method: 'POST', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [{ name: 'a', required: true, type: { kind: 'string' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  };
  await sendRequest({
    spec: emptySpec(), endpoint: formEndpoint, baseUrl: 'http://api',
    inputs: { path: {}, query: {}, headers: {}, body: { a: 'hi' } },
    secrets: {},
  });
  const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
  expect(init.body).toBe('a=hi');
  expect((init.headers as any)['content-type']).toBe('application/x-www-form-urlencoded');
});

test('multipart endpoint sends FormData and omits explicit Content-Type', async () => {
  const fdEndpoint: Endpoint = {
    id: 'e4', method: 'POST', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [{ name: 'field', required: true, type: { kind: 'string' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  };
  await sendRequest({
    spec: emptySpec(), endpoint: fdEndpoint, baseUrl: 'http://api',
    inputs: { path: {}, query: {}, headers: {}, body: { field: 'value' } },
    secrets: {},
  });
  const init = (globalThis.fetch as any).mock.calls[0][1] as RequestInit;
  expect(init.body).toBeInstanceOf(FormData);
  expect((init.body as FormData).get('field')).toBe('value');
  expect((init.headers as any)['content-type']).toBeUndefined();
});

test('body substitution preserves JSON encoding when vars contain quotes or backslashes', async () => {
  const bodyEndpoint: Endpoint = {
    id: 'e2', method: 'POST', path: '/x',
    pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'object', fields: [{ name: 'note', required: true, type: { kind: 'string' } }] },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  };
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [
      { name: 'base', value: 'http://api', secret: false },
      { name: 'quote', value: 'he said "hi" \\', secret: false },
    ] } },
    activeEnvironment: 'default',
  };
  await sendRequest({
    spec, endpoint: bodyEndpoint, baseUrl: '{{base}}',
    inputs: { path: {}, query: {}, headers: {}, body: { note: '{{quote}}' } },
    secrets: {},
  });
  const sentBody = (globalThis.fetch as any).mock.calls[0][1].body as string;
  expect(JSON.parse(sentBody)).toEqual({ note: 'he said "hi" \\' });
});
