import { expect, it, test } from 'vitest';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec, type Endpoint } from '@zwaggen/core';

function makeEndpoint(id: string, method: string, path: string, tags?: string[]): Endpoint {
  return {
    id, method: method as Endpoint['method'], path,
    tags,
    pathParams: [], queryParams: [], headers: [],
    requestBody: null, responses: [],
    auth: 'inherit', useProxy: 'inherit',
  };
}

it('emits servers[] when info.baseUrl is set', () => {
  const s = emptySpec();
  s.info.baseUrl = 'https://api.example.com';
  const out = toOpenApi(s);
  expect(out.servers).toEqual([{ url: 'https://api.example.com' }]);
});

it('omits servers when info.baseUrl is absent', () => {
  const out = toOpenApi(emptySpec());
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
    queryParams: [], headers: [], requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });
  const oas = toOpenApi(s);
  expect(oas.openapi).toBe('3.1.0');
  expect(oas.components.schemas.User).toBeDefined();
  expect(oas.paths['/users/{id}'].get.responses['200'].content['application/json'].schema.$ref)
    .toBe('#/components/schemas/User');
});

it('emits per-operation tags[] when endpoint.tags is set', () => {
  const s = emptySpec();
  s.endpoints.push({
    id: 'e1', method: 'GET', path: '/users', tags: ['users'],
    pathParams: [], queryParams: [], headers: [],
    requestBody: null, responses: [],
    auth: 'inherit', useProxy: 'inherit',
  });
  const out = toOpenApi(s);
  expect(out.paths['/users'].get.tags).toEqual(['users']);
});

it('emits top-level tags[] listing all unique tags sorted', () => {
  const s = emptySpec();
  s.endpoints.push(
    makeEndpoint('e1', 'GET', '/users', ['users']),
    makeEndpoint('e2', 'GET', '/admin', ['admin', 'users']),
  );
  const out = toOpenApi(s);
  expect(out.tags).toEqual([{ name: 'admin' }, { name: 'users' }]);
});

it('omits tags when no endpoint has tags', () => {
  const s = emptySpec();
  s.endpoints.push(makeEndpoint('e1', 'GET', '/x'));
  const out = toOpenApi(s);
  expect('tags' in out).toBe(false);
  expect('tags' in out.paths['/x'].get).toBe(false);
});

it('emits example on object schema when defined', () => {
  const s = emptySpec();
  s.types['User'] = { kind: 'object', fields: [], example: { id: 'u_1' } };
  const out = toOpenApi(s);
  expect(out.components.schemas.User.example).toEqual({ id: 'u_1' });
});

it('emits example on array schema when defined', () => {
  const s = emptySpec();
  s.types['Ids'] = { kind: 'array', element: { kind: 'string' }, example: ['a', 'b'] };
  const out = toOpenApi(s);
  expect(out.components.schemas.Ids.example).toEqual(['a', 'b']);
});

it('omits example on schema when undefined', () => {
  const s = emptySpec();
  s.types['User'] = { kind: 'object', fields: [] };
  const out = toOpenApi(s);
  expect('example' in out.components.schemas.User).toBe(false);
});
