import { expect, test } from 'vitest';
import { toJsonSchemaBundle } from '../../src/exporters/jsonschema';
import { emptySpec } from '@zwaggen/core';

test('JSON Schema $defs emits allOf for extended types', () => {
  const spec = emptySpec();
  spec.types['Base'] = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  spec.types['User'] = {
    kind: 'object',
    extends: ['Base'],
    fields: [{ name: 'name', required: true, type: { kind: 'string' } }],
  };
  const bundle = toJsonSchemaBundle(spec);
  expect(bundle.$defs.User.allOf).toEqual([
    { $ref: '#/$defs/Base' },
    { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  ]);
});

test('JSON Schema $defs allOf uses flattened keys for folder-qualified parents', () => {
  const spec = emptySpec();
  spec.types['auth/Base'] = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  spec.types['auth/User'] = {
    kind: 'object',
    extends: ['auth/Base'],
    fields: [{ name: 'name', required: true, type: { kind: 'string' } }],
  };
  const bundle = toJsonSchemaBundle(spec);
  expect(bundle.$defs.auth_User.allOf[0]).toEqual({ $ref: '#/$defs/auth_Base' });
});

test('JSON Schema $defs emits allOf with only the $ref when child has no own fields', () => {
  const spec = emptySpec();
  spec.types['Base'] = {
    kind: 'object',
    fields: [{ name: 'id', required: true, type: { kind: 'string' } }],
  };
  spec.types['Alias'] = { kind: 'object', extends: ['Base'], fields: [] };
  const bundle = toJsonSchemaBundle(spec);
  expect(bundle.$defs.Alias.allOf).toEqual([{ $ref: '#/$defs/Base' }]);
});
