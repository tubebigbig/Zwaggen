import { expect, it, test } from 'vitest';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec, type Endpoint } from '@zwaggen/core';

function makeEndpoint(id: string, method: string, path: string, tags?: string[]): Endpoint {
  return {
    id, method: method as Endpoint['method'], path,
    tags,
    pathParams: [],
    requestBody: null, responses: [],
    auth: 'inherit', useProxy: 'inherit',
  };
}

it('emits servers[] when info.baseUrl is set', () => {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  const out: any = toOpenApi(s);
  expect(out.servers).toEqual([{ url: 'https://api.example.com' }]);
});

it('omits servers when info.baseUrl is absent', () => {
  const out: any = toOpenApi(emptySpec());
  expect('servers' in out).toBe(false);
});

test('emits basic OpenAPI doc', () => {
  const s = emptySpec('MyAPI');
  s.types.User = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  s.endpoints.push({
    id: 'e1', method: 'GET', path: '/users/{id}',
    pathParams: [{ name: 'id', required: true, type: { kind: 'string' } }],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });
  const oas: any = toOpenApi(s);
  expect(oas.openapi).toBe('3.1.0');
  expect(oas.components.schemas.User).toBeDefined();
  expect(oas.paths['/users/{id}'].get.responses['200'].content['application/json'].schema.$ref)
    .toBe('#/components/schemas/User');
});

it('emits per-operation tags[] when endpoint.tags is set', () => {
  const s = emptySpec();
  s.endpoints.push({
    id: 'e1', method: 'GET', path: '/users', tags: ['users'],
    pathParams: [],
    requestBody: null, responses: [],
    auth: 'inherit', useProxy: 'inherit',
  });
  const out: any = toOpenApi(s);
  expect(out.paths['/users'].get.tags).toEqual(['users']);
});

it('emits top-level tags[] listing all unique tags sorted', () => {
  const s = emptySpec();
  s.endpoints.push(
    makeEndpoint('e1', 'GET', '/users', ['users']),
    makeEndpoint('e2', 'GET', '/admin', ['admin', 'users']),
  );
  const out: any = toOpenApi(s);
  expect(out.tags).toEqual([{ name: 'admin' }, { name: 'users' }]);
});

it('omits tags when no endpoint has tags', () => {
  const s = emptySpec();
  s.endpoints.push(makeEndpoint('e1', 'GET', '/x'));
  const out: any = toOpenApi(s);
  expect('tags' in out).toBe(false);
  expect('tags' in out.paths['/x'].get).toBe(false);
});

it('emits example on object schema when defined', () => {
  const s = emptySpec();
  s.types['User'] = { kind: 'object', fields: [], example: { id: 'u_1' } };
  const out: any = toOpenApi(s);
  expect(out.components.schemas.User.example).toEqual({ id: 'u_1' });
});

it('emits example on array schema when defined', () => {
  const s = emptySpec();
  s.types['Ids'] = { kind: 'array', element: { kind: 'string' }, example: ['a', 'b'] };
  const out: any = toOpenApi(s);
  expect(out.components.schemas.Ids.example).toEqual(['a', 'b']);
});

it('omits example on schema when undefined', () => {
  const s = emptySpec();
  s.types['User'] = { kind: 'object', fields: [] };
  const out: any = toOpenApi(s);
  expect('example' in out.components.schemas.User).toBe(false);
});

it('exports a multipart bodyForm file field as type:string format:binary', () => {
  const s = emptySpec();
  s.endpoints.push({
    id: 'upload', method: 'POST', path: '/upload',
    pathParams: [],
    requestBody: null,
    bodyContentType: 'multipart',
    bodyForm: [
      { name: 'note', required: true, type: { kind: 'string' } },
      { name: 'attachment', required: true, type: { kind: 'file', accept: 'image/*', maxBytes: 1024 } },
    ],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  const out: any = toOpenApi(s);
  const schema = out.paths['/upload'].post.requestBody.content['multipart/form-data'].schema;
  expect(schema.properties.note).toEqual({ type: 'string' });
  expect(schema.properties.attachment).toMatchObject({
    type: 'string',
    format: 'binary',
    'x-zwaggen-accept': 'image/*',
    'x-zwaggen-max-bytes': 1024,
  });
  expect(schema.required).toEqual(['note', 'attachment']);
});

it('throws when a file type appears outside multipart bodyForm', () => {
  const s = emptySpec();
  s.endpoints.push({
    id: 'login', method: 'POST', path: '/login',
    pathParams: [],
    requestBody: null,
    bodyContentType: 'urlencoded',
    bodyForm: [{ name: 'badFile', required: true, type: { kind: 'file' } }],
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  expect(() => toOpenApi(s)).toThrow(/illegal file type placements/i);
});

it('queryParams as a ref to a named ObjectType exports as one OpenAPI param entry per field', () => {
  const s = emptySpec();
  s.types.Filter = {
    kind: 'object',
    fields: [
      { name: 'status', required: true, type: { kind: 'string' } },
      { name: 'category', required: false, type: { kind: 'string' } },
    ],
  };
  s.endpoints.push({
    id: 'list', method: 'GET', path: '/items',
    pathParams: [],
    queryParams: { kind: 'ref', ref: 'Filter' },
    requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  const oapi: any = toOpenApi(s);
  const params = oapi.paths['/items'].get.parameters;
  expect(params.find((p: any) => p.name === 'status' && p.in === 'query')).toBeDefined();
  expect(params.find((p: any) => p.name === 'category' && p.in === 'query')).toBeDefined();
  // OpenAPI 3 default for query is `style=form, explode=true` — so we
  // intentionally do NOT set explode on query params.
  const statusParam = params.find((p: any) => p.name === 'status');
  expect(statusParam.explode).toBeUndefined();
  expect(statusParam.required).toBe(true);
  expect(params.find((p: any) => p.name === 'category').required).toBe(false);
});

it('headers as a ref to a named ObjectType exports each field with explode: true', () => {
  const s = emptySpec();
  s.types.Tracing = {
    kind: 'object',
    fields: [{ name: 'X-Request-Id', required: true, type: { kind: 'string' } }],
  };
  s.endpoints.push({
    id: 'ping', method: 'GET', path: '/ping',
    pathParams: [],
    headers: { kind: 'ref', ref: 'Tracing' },
    requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  const oapi: any = toOpenApi(s);
  const params = oapi.paths['/ping'].get.parameters;
  const xrid = params.find((p: any) => p.name === 'X-Request-Id' && p.in === 'header');
  expect(xrid).toBeDefined();
  expect(xrid.explode).toBe(true);
});

it('inline ObjectType query/header params emit one OpenAPI parameter per field', () => {
  const s = emptySpec();
  s.endpoints.push({
    id: 'list', method: 'GET', path: '/items',
    pathParams: [],
    queryParams: { kind: 'object', fields: [{ name: 'q', required: false, type: { kind: 'string' } }] },
    headers: { kind: 'object', fields: [{ name: 'X-Trace', required: false, type: { kind: 'string' } }] },
    requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  const oapi: any = toOpenApi(s);
  const params = oapi.paths['/items'].get.parameters;
  expect(params.find((p: any) => p.name === 'q' && p.in === 'query')).toBeDefined();
  expect(params.find((p: any) => p.name === 'X-Trace' && p.in === 'header')).toBeDefined();
});
