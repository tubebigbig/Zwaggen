import { expect, test } from 'vitest';
import { toOpenApi } from '../../src/exporters/openapi';
import { emptySpec, type Endpoint } from '@zwaggen/core';

test('types in a folder export with flattened key + x-folder', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.types['Order'] = { kind: 'object', fields: [] };
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.auth_User).toBeDefined();
  expect(doc.components.schemas.auth_User['x-folder']).toBe('auth');
  expect(doc.components.schemas.Order).toBeDefined();
  expect(doc.components.schemas.Order['x-folder']).toBeUndefined();
});

test('refs rewrite to the flattened schema key', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [] };
  spec.types['Wrapper'] = { kind: 'object', fields: [
    { name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } },
  ]};
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.Wrapper.properties.user).toEqual({ $ref: '#/components/schemas/auth_User' });
});

test('endpoint folder exports as x-folder on the operation', () => {
  const spec = emptySpec();
  const e: Endpoint = {
    id: 'a', method: 'POST', path: '/login', folder: 'auth/admin',
    pathParams: [],
    requestBody: null, responses: [], auth: 'inherit', useProxy: 'inherit',
  };
  spec.endpoints.push(e);
  const doc = toOpenApi(spec);
  expect(doc.paths['/login'].post['x-folder']).toBe('auth/admin');
});

test('multi-segment folder flattens all separators to underscore', () => {
  const spec = emptySpec();
  spec.types['a/b/c/Type'] = { kind: 'object', fields: [] };
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.a_b_c_Type).toBeDefined();
  expect(doc.components.schemas.a_b_c_Type['x-folder']).toBe('a/b/c');
});
