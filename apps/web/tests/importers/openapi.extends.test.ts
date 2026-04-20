import { expect, test } from 'vitest';
import { fromOpenApi } from '../../src/importers/openapi';

test('allOf with one $ref and one inline → extends + own fields recovered', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: {
      schemas: {
        Base: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
        User: {
          allOf: [
            { $ref: '#/components/schemas/Base' },
            { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
          ],
        },
      },
    },
  };
  const { spec } = fromOpenApi(doc);
  const user = spec.types['User']! as { kind: 'object'; extends?: string[]; fields: Array<{ name: string }> };
  expect(user.extends).toEqual(['Base']);
  expect(user.fields.map((f) => f.name)).toEqual(['name']);
});

test('allOf with only $refs → extends, no own fields', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: {
      schemas: {
        A: { type: 'object', properties: {} },
        B: { type: 'object', properties: {} },
        Foo: { allOf: [{ $ref: '#/components/schemas/A' }, { $ref: '#/components/schemas/B' }] },
      },
    },
  };
  const { spec } = fromOpenApi(doc);
  const foo = spec.types['Foo']! as { kind: 'object'; extends?: string[]; fields: Array<unknown> };
  expect(foo.extends).toEqual(['A', 'B']);
  expect(foo.fields).toEqual([]);
});

test('allOf with multiple inline objects (no $refs) → flatten (back-compat)', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: {
      schemas: {
        Legacy: {
          allOf: [
            { type: 'object', properties: { x: { type: 'string' } }, required: ['x'] },
            { type: 'object', properties: { y: { type: 'integer' } }, required: ['y'] },
          ],
        },
      },
    },
  };
  const { spec } = fromOpenApi(doc);
  const legacy = spec.types['Legacy']! as { kind: 'object'; extends?: string[]; fields: Array<{ name: string }> };
  expect(legacy.extends).toBeUndefined();
  expect(legacy.fields.map((f) => f.name).sort()).toEqual(['x', 'y']);
});

test('allOf recovery honors x-folder mapping for the $ref target', () => {
  const doc = {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    paths: {},
    components: {
      schemas: {
        auth_Base: { type: 'object', 'x-folder': 'auth', properties: {} },
        auth_User: {
          'x-folder': 'auth',
          allOf: [{ $ref: '#/components/schemas/auth_Base' }],
        },
      },
    },
  };
  const { spec } = fromOpenApi(doc);
  const user = spec.types['auth/User']! as { kind: 'object'; extends?: string[] };
  expect(user.extends).toEqual(['auth/Base']);
});
