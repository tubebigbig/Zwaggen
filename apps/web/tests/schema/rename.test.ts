import { expect, test } from 'vitest';
import { renameType, collectBrokenRefs } from '../../src/schema/rename';
import { emptySpec } from '../../src/schema/defaults';

test('renames a type and updates refs deeply', () => {
  const spec = emptySpec();
  spec.types.User = { kind: 'object', fields: [{ name: 'id', required: true, type: { kind: 'string' } }] };
  spec.endpoints.push({
    id: 'e1', method: 'GET', path: '/u', pathParams: [], queryParams: [], headers: [],
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
    id: 'e1', method: 'GET', path: '/x', pathParams: [], queryParams: [], headers: [],
    requestBody: { kind: 'ref', ref: 'Missing' },
    responses: [], auth: 'inherit', useProxy: 'inherit',
  });
  expect(collectBrokenRefs(spec)).toEqual([
    { location: 'endpoint:e1:requestBody', ref: 'Missing' },
  ]);
});
