import { expect, test } from 'vitest';
import { renameType, collectBrokenRefs } from '../../src/schema/rename';
import { emptySpec } from '../../src/schema/defaults';

test('renames a type and updates refs deeply', () => {
  const spec = emptySpec();
  spec.types.User = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/u', pathParams: [],
    requestBody: null,
    responses: [{ status: 200, type: { kind: 'ref', ref: 'User' } }],
    auth: 'inherit', useProxy: 'inherit',
  });
  const next = renameType(spec, 'User', 'Account');
  expect(next.types.Account).toBeDefined();
  expect(next.types.User).toBeUndefined();
  expect(next.endpoints[0]!.responses[0]!.type).toEqual({ kind: 'ref', ref: 'Account' });
});

test('collectBrokenRefs finds dangling references', () => {
  const spec = emptySpec();
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/x', pathParams: [],
    requestBody: { kind: 'ref', ref: 'Missing' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  expect(collectBrokenRefs(spec)).toEqual([
    { location: 'endpoint:e1:requestBody', ref: 'Missing' },
  ]);
});

test('renameType rewrites extends[] entries that reference the old key', () => {
  const spec = emptySpec();
  spec.types.Base = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.types.User = { kind: 'object', extends: ['Base'], fields: [{ name: 'name', required: true, type: { kind: 'string' } }] };
  spec.types.Admin = { kind: 'object', extends: ['Base', 'User'], fields: [] };
  const next = renameType(spec, 'Base', 'BaseEntity');
  const user = next.types['User'] as { kind: 'object'; extends?: string[] };
  const admin = next.types['Admin'] as { kind: 'object'; extends?: string[] };
  expect(user.extends).toEqual(['BaseEntity']);
  expect(admin.extends).toEqual(['BaseEntity', 'User']);
  expect(next.types['BaseEntity']).toBeDefined();
  expect(next.types['Base']).toBeUndefined();
});
