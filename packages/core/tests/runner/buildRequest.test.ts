import { expect, test } from 'vitest';
import { buildRequest } from '../../src/runner/send';
import { emptySpec } from '../../src/schema/defaults';
import type { Endpoint } from '../../src/schema/types';
import type { RunRequest } from '../../src/runner/send';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'e1',
    method: 'GET',
    path: '/users/{id}',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
    requestBody: null,
    responses: [],
    auth: 'inherit',
    useProxy: 'inherit',
    ...overrides,
  };
}

function makeReq(partial: Partial<RunRequest> = {}): RunRequest {
  return {
    spec: emptySpec(),
    endpoint: makeEndpoint(),
    baseUrl: 'http://api',
    inputs: { path: { id: '42' }, query: {}, headers: {}, body: undefined },
    secrets: {},
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// Path params
// ---------------------------------------------------------------------------

test('path params are substituted into the URL', () => {
  const built = buildRequest(makeReq({ inputs: { path: { id: '42' }, query: {}, headers: {}, body: undefined } }));
  expect(built.url).toMatch(/\/users\/42$/);
});

test('path params are URL-encoded', () => {
  const built = buildRequest(makeReq({ inputs: { path: { id: 'hello world' }, query: {}, headers: {}, body: undefined } }));
  expect(built.url).toMatch(/\/users\/hello%20world$/);
});

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

test('query params are appended to the URL', () => {
  const endpoint = makeEndpoint({
    path: '/search',
    pathParams: [],
    queryParams: { kind: 'object', fields: [{ name: 'q', required: false, type: { kind: 'string' } }] },
  });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: { q: 'hello' }, headers: {}, body: undefined },
  }));
  const url = new URL(built.url);
  expect(url.searchParams.get('q')).toBe('hello');
});

test('query param value containing & and space is properly encoded', () => {
  const endpoint = makeEndpoint({
    path: '/search',
    pathParams: [],
    queryParams: { kind: 'object', fields: [{ name: 'q', required: false, type: { kind: 'string' } }] },
  });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: { q: 'a & b' }, headers: {}, body: undefined },
  }));
  const url = new URL(built.url);
  expect(url.searchParams.get('q')).toBe('a & b');
  // raw serialization should not break other params
  expect(built.url).not.toMatch(/q=a & b/);
});

test('empty query param values are skipped', () => {
  const endpoint = makeEndpoint({
    path: '/search',
    pathParams: [],
    queryParams: { kind: 'object', fields: [{ name: 'q', required: false, type: { kind: 'string' } }] },
  });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: { q: '' }, headers: {}, body: undefined },
  }));
  const url = new URL(built.url);
  expect(url.searchParams.has('q')).toBe(false);
});

// ---------------------------------------------------------------------------
// {{var}} substitution
// ---------------------------------------------------------------------------

test('{{var}} substitution works in baseUrl', () => {
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'host', value: 'http://myapi', secret: false }] } },
    activeEnvironment: 'default',
  };
  const endpoint = makeEndpoint({ path: '/ping', pathParams: [] });
  const built = buildRequest(makeReq({ spec, endpoint, baseUrl: '{{host}}', inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.url).toMatch(/^http:\/\/myapi\/ping/);
});

test('{{var}} substitution works in query values', () => {
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'token', value: 'abc123', secret: false }] } },
    activeEnvironment: 'default',
  };
  const endpoint = makeEndpoint({
    path: '/search',
    pathParams: [],
    queryParams: { kind: 'object', fields: [{ name: 'key', required: false, type: { kind: 'string' } }] },
  });
  const built = buildRequest(makeReq({
    spec, endpoint,
    inputs: { path: {}, query: { key: '{{token}}' }, headers: {}, body: undefined },
  }));
  const url = new URL(built.url);
  expect(url.searchParams.get('key')).toBe('abc123');
});

test('{{var}} substitution works in headers', () => {
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'tok', value: 'secret', secret: false }] } },
    activeEnvironment: 'default',
  };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [] });
  const built = buildRequest(makeReq({
    spec, endpoint,
    inputs: { path: {}, query: {}, headers: { 'x-api': '{{tok}}' }, body: undefined },
  }));
  expect(built.headers['x-api']).toBe('secret');
});

test('{{var}} substitution works in body string leaves', () => {
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'msg', value: 'hello', secret: false }] } },
    activeEnvironment: 'default',
  };
  const endpoint = makeEndpoint({
    path: '/x',
    pathParams: [],
    method: 'POST',
    requestBody: { kind: 'object', fields: [{ name: 'note', required: true, type: { kind: 'string' } }] },
  });
  const built = buildRequest(makeReq({
    spec, endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { note: '{{msg}}' } },
  }));
  expect(built.bodyText).toBe(JSON.stringify({ note: 'hello' }));
});

test('static text unaffected by substitution', () => {
  const endpoint = makeEndpoint({ path: '/static', pathParams: [] });
  const built = buildRequest(makeReq({ endpoint, inputs: { path: {}, query: {}, headers: { 'accept': 'application/json' }, body: undefined } }));
  expect(built.headers['accept']).toBe('application/json');
  expect(built.url).toMatch(/\/static$/);
});

// ---------------------------------------------------------------------------
// Auth presets
// ---------------------------------------------------------------------------

test('auth bearer adds Authorization header', () => {
  const spec = { ...emptySpec(), auth: { type: 'bearer' as const, token: 'mytoken' } };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], auth: 'inherit' });
  const built = buildRequest(makeReq({ spec, endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.headers['Authorization']).toBe('Bearer mytoken');
});

test('auth basic adds Authorization header with base64', () => {
  const spec = { ...emptySpec(), auth: { type: 'basic' as const, username: 'user', password: 'pass' } };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], auth: 'inherit' });
  const built = buildRequest(makeReq({ spec, endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.headers['Authorization']).toBe(`Basic ${btoa('user:pass')}`);
});

test('auth apiKey in header adds named header', () => {
  const spec = { ...emptySpec(), auth: { type: 'apiKey' as const, in: 'header' as const, name: 'X-API-Key', value: 'key123' } };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], auth: 'inherit' });
  const built = buildRequest(makeReq({ spec, endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.headers['X-API-Key']).toBe('key123');
});

test('auth apiKey in query adds query param to URL', () => {
  const spec = { ...emptySpec(), auth: { type: 'apiKey' as const, in: 'query' as const, name: 'api_key', value: 'qval' } };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], auth: 'inherit' });
  const built = buildRequest(makeReq({ spec, endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  const url = new URL(built.url);
  expect(url.searchParams.get('api_key')).toBe('qval');
});

test('auth none adds no Authorization header', () => {
  const spec = { ...emptySpec(), auth: { type: 'none' as const } };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], auth: 'inherit' });
  const built = buildRequest(makeReq({ spec, endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.headers['Authorization']).toBeUndefined();
});

test('endpoint-level auth overrides spec auth', () => {
  const spec = { ...emptySpec(), auth: { type: 'bearer' as const, token: 'spectoken' } };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], auth: { type: 'none' as const } });
  const built = buildRequest(makeReq({ spec, endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.headers['Authorization']).toBeUndefined();
});

// ---------------------------------------------------------------------------
// requestBody / bodyText
// ---------------------------------------------------------------------------

test('requestBody present → content-type header set and bodyText is JSON', () => {
  const endpoint = makeEndpoint({
    path: '/x',
    pathParams: [],
    method: 'POST',
    requestBody: { kind: 'object', fields: [{ name: 'name', required: true, type: { kind: 'string' } }] },
  });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { name: 'Alice' } },
  }));
  expect(built.headers['content-type']).toBe('application/json');
  expect(built.bodyText).toBe(JSON.stringify({ name: 'Alice' }));
});

// ---------------------------------------------------------------------------
// urlencoded body
// ---------------------------------------------------------------------------

test('urlencoded body → produces URLSearchParams string + correct Content-Type', () => {
  const endpoint = makeEndpoint({
    path: '/x',
    pathParams: [],
    method: 'POST',
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [
      { name: 'username', required: true, type: { kind: 'string' } },
      { name: 'password', required: true, type: { kind: 'string' } },
    ],
  });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { username: 'a', password: 'p&q' } },
  }));
  expect(built.bodyText).toBe('username=a&password=p%26q');
  expect(built.headers['content-type']).toBe('application/x-www-form-urlencoded');
  expect(built.bodyMultipart).toBeUndefined();
});

test('urlencoded body skips empty / null / undefined values', () => {
  const endpoint = makeEndpoint({
    path: '/x',
    pathParams: [],
    method: 'POST',
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [
      { name: 'a', required: false, type: { kind: 'string' } },
      { name: 'b', required: false, type: { kind: 'string' } },
      { name: 'c', required: false, type: { kind: 'string' } },
    ],
  });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { a: 'x', b: '', c: undefined } },
  }));
  expect(built.bodyText).toBe('a=x');
});

test('urlencoded body substitutes {{vars}} in field values', () => {
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'tok', value: 'secret', secret: false }] } },
    activeEnvironment: 'default',
  };
  const endpoint = makeEndpoint({
    path: '/x',
    pathParams: [],
    method: 'POST',
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [{ name: 'token', required: true, type: { kind: 'string' } }],
  });
  const built = buildRequest(makeReq({
    spec, endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { token: '{{tok}}' } },
  }));
  expect(built.bodyText).toBe('token=secret');
});

// ---------------------------------------------------------------------------
// multipart body
// ---------------------------------------------------------------------------

test('multipart body → produces FormData; Content-Type is NOT set', () => {
  const endpoint = makeEndpoint({
    path: '/x',
    pathParams: [],
    method: 'POST',
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [
      { name: 'field', required: true, type: { kind: 'string' } },
      { name: 'note', required: false, type: { kind: 'string' } },
    ],
  });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { field: 'value', note: 'hi' } },
  }));
  expect(built.bodyMultipart).toBeInstanceOf(FormData);
  expect(built.bodyMultipart!.get('field')).toBe('value');
  expect(built.bodyMultipart!.get('note')).toBe('hi');
  expect(built.headers['content-type']).toBeUndefined();
  expect(built.bodyText).toBeUndefined();
});

test('multipart body appends a File value preserving filename + type', () => {
  const endpoint = makeEndpoint({
    path: '/upload',
    pathParams: [],
    method: 'POST',
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [
      { name: 'note', required: true, type: { kind: 'string' } },
      { name: 'attachment', required: true, type: { kind: 'file' } },
    ],
  });
  const file = new File([new Uint8Array([1, 2, 3])], 'hello.txt', { type: 'text/plain' });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { note: 'hi', attachment: file } },
  }));
  expect(built.bodyMultipart).toBeInstanceOf(FormData);
  const fd = built.bodyMultipart!;
  expect(fd.get('note')).toBe('hi');
  const f = fd.get('attachment') as File;
  expect(f).toBeInstanceOf(File);
  expect(f.name).toBe('hello.txt');
  expect(f.type).toBe('text/plain');
});

test('multipart body skips empty/undefined file fields', () => {
  const endpoint = makeEndpoint({
    path: '/upload',
    pathParams: [],
    method: 'POST',
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [
      { name: 'note', required: true, type: { kind: 'string' } },
      { name: 'attachment', required: false, type: { kind: 'file' } },
    ],
  });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { note: 'hi', attachment: undefined } },
  }));
  const fd = built.bodyMultipart!;
  expect(fd.get('note')).toBe('hi');
  expect(fd.has('attachment')).toBe(false);
});

test('multipart body appends a Blob without a filename', () => {
  const endpoint = makeEndpoint({
    path: '/upload',
    pathParams: [],
    method: 'POST',
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [{ name: 'attachment', required: true, type: { kind: 'file' } }],
  });
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/octet-stream' });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { attachment: blob } },
  }));
  const v = built.bodyMultipart!.get('attachment');
  // Blob entries surface as File (web FormData spec) but without our custom name.
  expect(v).toBeInstanceOf(Blob);
});

test('multipart body substitutes {{vars}} in field values', () => {
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'who', value: 'alice', secret: false }] } },
    activeEnvironment: 'default',
  };
  const endpoint = makeEndpoint({
    path: '/x',
    pathParams: [],
    method: 'POST',
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [{ name: 'name', required: true, type: { kind: 'string' } }],
  });
  const built = buildRequest(makeReq({
    spec, endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: { name: '{{who}}' } },
  }));
  expect(built.bodyMultipart!.get('name')).toBe('alice');
});

test('requestBody absent → bodyText is undefined and no auto content-type', () => {
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], requestBody: null });
  const built = buildRequest(makeReq({
    endpoint,
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
  }));
  expect(built.bodyText).toBeUndefined();
  expect(built.headers['content-type']).toBeUndefined();
});

// ---------------------------------------------------------------------------
// useProxy resolution
// ---------------------------------------------------------------------------

test('per-request useProxy override wins over spec default', () => {
  const spec = { ...emptySpec(), useProxyDefault: false };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], useProxy: 'inherit' });
  const built = buildRequest(makeReq({ spec, endpoint, useProxy: true, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.useProxy).toBe(true);
});

test('endpoint useProxy:true routes through proxy when no per-request override', () => {
  const spec = { ...emptySpec(), useProxyDefault: false };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], useProxy: true });
  const built = buildRequest(makeReq({ spec, endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.useProxy).toBe(true);
});

test('endpoint useProxy:inherit reads spec default (false)', () => {
  const spec = { ...emptySpec(), useProxyDefault: false };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], useProxy: 'inherit' });
  const built = buildRequest(makeReq({ spec, endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.useProxy).toBe(false);
});

test('endpoint useProxy:inherit reads spec default (true)', () => {
  const spec = { ...emptySpec(), useProxyDefault: true };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], useProxy: 'inherit' });
  const built = buildRequest(makeReq({ spec, endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.useProxy).toBe(true);
});

// ---------------------------------------------------------------------------
// missingVars
// ---------------------------------------------------------------------------

test('missingVars lists undefined {{var}} references', () => {
  // Use a valid base URL so new URL() does not throw;
  // reference missing vars only in query and header values.
  const endpoint = makeEndpoint({
    path: '/x',
    pathParams: [],
    queryParams: { kind: 'object', fields: [{ name: 'key', required: false, type: { kind: 'string' } }] },
  });
  const built = buildRequest(makeReq({
    endpoint,
    baseUrl: 'http://api',
    inputs: { path: {}, query: { key: '{{missingKey}}' }, headers: { 'x-token': '{{missingToken}}' }, body: undefined },
  }));
  expect(built.missingVars).toContain('missingKey');
  expect(built.missingVars).toContain('missingToken');
});

test('missingVars is empty when all vars are defined', () => {
  const spec = {
    ...emptySpec(),
    environments: { default: { variables: [{ name: 'host', value: 'http://api', secret: false }] } },
    activeEnvironment: 'default',
  };
  const endpoint = makeEndpoint({ path: '/x', pathParams: [] });
  const built = buildRequest(makeReq({
    spec, endpoint, baseUrl: '{{host}}',
    inputs: { path: {}, query: {}, headers: {}, body: undefined },
  }));
  expect(built.missingVars).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// method passthrough
// ---------------------------------------------------------------------------

test('method is passed through unchanged', () => {
  const endpoint = makeEndpoint({ path: '/x', pathParams: [], method: 'DELETE' });
  const built = buildRequest(makeReq({ endpoint, inputs: { path: {}, query: {}, headers: {}, body: undefined } }));
  expect(built.method).toBe('DELETE');
});
