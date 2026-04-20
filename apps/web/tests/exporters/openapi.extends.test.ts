import { expect, test } from 'vitest';
import { toOpenApi } from '@zwaggen/core';
import { emptySpec } from '@zwaggen/core';

test('extends with one parent and no own fields → allOf with a single $ref', () => {
  const spec = emptySpec();
  spec.types['Base'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.types['User'] = { kind: 'object', extends: ['Base'], fields: [] };
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.User).toEqual({ allOf: [{ $ref: '#/components/schemas/Base' }] });
});

test('extends with two parents and child-own fields → allOf with both $refs + inline member', () => {
  const spec = emptySpec();
  spec.types['Base'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.types['Timestamped'] = { kind: 'object', fields: [{ name: 'createdAt', required: true, type: { kind: 'string' } }] };
  spec.types['User'] = {
    kind: 'object',
    extends: ['Base', 'Timestamped'],
    fields: [{ name: 'name', required: true, type: { kind: 'string' } }],
  };
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.User.allOf).toEqual([
    { $ref: '#/components/schemas/Base' },
    { $ref: '#/components/schemas/Timestamped' },
    {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  ]);
});

test('extends with folder-qualified parent uses flattened key in $ref', () => {
  const spec = emptySpec();
  spec.types['auth/Base'] = { kind: 'object', fields: [] };
  spec.types['auth/User'] = { kind: 'object', extends: ['auth/Base'], fields: [] };
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.auth_User.allOf).toEqual([{ $ref: '#/components/schemas/auth_Base' }]);
});

test('no extends → unchanged flat object schema (regression)', () => {
  const spec = emptySpec();
  spec.types['User'] = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  const doc = toOpenApi(spec);
  expect(doc.components.schemas.User).toEqual({
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  });
});
