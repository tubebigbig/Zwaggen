import { expect, test } from 'vitest';
import { toJsonSchemaBundle } from '../../src/exporters/jsonschema';
import { emptySpec } from '@zwaggen/core';

test('bundles named types under $defs', () => {
  const s = emptySpec('X');
  s.types.User = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  const j = toJsonSchemaBundle(s);
  expect(j.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  expect(j.$defs.User).toBeDefined();
});
