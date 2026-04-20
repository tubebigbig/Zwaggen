import { expect, test } from 'vitest';
import { toJsonSchemaBundle } from '../../src/exporters/jsonschema';
import { emptySpec } from '../../src/schema/defaults';

test('$defs keys flatten with underscore, refs rewrite accordingly', () => {
  const spec = emptySpec();
  spec.types['auth/User'] = { kind: 'object', fields: [] };
  spec.types['Wrapper'] = { kind: 'object', fields: [
    { name: 'user', required: true, type: { kind: 'ref', ref: 'auth/User' } },
  ]};
  const bundle = toJsonSchemaBundle(spec);
  expect(bundle.$defs.auth_User).toBeDefined();
  expect(bundle.$defs.Wrapper.properties.user).toEqual({ $ref: '#/$defs/auth_User' });
});
