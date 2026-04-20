import { expect, test } from 'vitest';
import { fromOpenApi } from '../../src/importers/openapi';

test('schemas with x-folder restore to folder-qualified internal keys', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: {
      schemas: {
        auth_User: { type: 'object', 'x-folder': 'auth', properties: { id: { type: 'string' } } },
        Order: { type: 'object', properties: {} },
        a_b_c_Deep: { type: 'object', 'x-folder': 'a/b/c', properties: {} },
      },
    },
  };
  const { spec } = fromOpenApi(doc);
  expect(spec.types['auth/User']).toBeDefined();
  expect(spec.types['Order']).toBeDefined();
  expect(spec.types['a/b/c/Deep']).toBeDefined();
});

test('$refs resolve through x-folder of the target schema', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: {
      schemas: {
        auth_User: { type: 'object', 'x-folder': 'auth', properties: {} },
        Wrapper: {
          type: 'object',
          properties: { user: { $ref: '#/components/schemas/auth_User' } },
        },
      },
    },
  };
  const { spec } = fromOpenApi(doc);
  const wrapper = spec.types['Wrapper']! as { kind: 'object'; fields: Array<{ type: { kind: string; ref?: string } }> };
  expect(wrapper.fields[0]!.type).toEqual({ kind: 'ref', ref: 'auth/User' });
});

test('endpoint x-folder populates endpoint.folder', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: { '/login': { post: { 'x-folder': 'auth/admin', responses: {} } } },
  };
  const { spec } = fromOpenApi(doc);
  expect(spec.endpoints[0]!.folder).toBe('auth/admin');
});

test('foreign imports (no x-folder) land flat at root — unchanged behavior', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: { schemas: { User: { type: 'object', properties: {} } } },
  };
  const { spec } = fromOpenApi(doc);
  expect(spec.types['User']).toBeDefined();
  expect(spec.types['auth/User']).toBeUndefined();
});
